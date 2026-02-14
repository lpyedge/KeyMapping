use anyhow::{anyhow, bail, Result};
use axum::{extract::State, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

use crate::config::{
    Action, BrightnessDirection, BuiltinCommand, Config, IntentSpec, Rule, RuleType,
    VolumeDirection,
};
use crate::utils::logger::append_webui_log;
use crate::webui::learn::LearnResultSnapshot;
use crate::webui::learn::LearnStatus;
use crate::webui::server::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LearnResultDto {
    status: String, // "learning", "captured", "timeout", "idle"
    key_code: Option<u16>,
    remaining_ms: Option<u32>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebUiConfigDto {
    version: u32,
    #[serde(default)]
    device_name: String,
    #[serde(default)]
    hardware_map: BTreeMap<u16, String>,
    double_press_interval_ms: u32,
    long_press_min_ms: u32,
    short_press_min_ms: u32,
    #[serde(default = "default_combination_timeout_ms")]
    combination_timeout_ms: u32,
    #[serde(default = "default_rule_timeout_ms")]
    rule_timeout_ms: u32,
    #[serde(default)]
    rules: Vec<WebUiRuleDto>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WebUiRuleDto {
    #[serde(default)]
    id: Option<String>,
    #[serde(default = "default_true_bool")]
    enabled: bool,
    #[serde(default)]
    description: String,
    /// "and" or "or" — reserved for phase 2 multi-condition logic
    #[serde(default = "default_condition_logic")]
    condition_logic: String,
    /// V1: exactly 1 condition of type "key_event"
    conditions: Vec<WebUiConditionDto>,
    /// Multiple actions executed sequentially
    actions: Vec<WebUiActionDto>,
}

/// Extensible condition type — V1 only implements key_event
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum WebUiConditionDto {
    KeyEvent {
        #[serde(default)]
        key_code: Option<u16>,
        #[serde(default)]
        combo_key_code: Option<u16>,
        behavior: WebUiBehaviorDto,
    },
    // Phase 2 stubs — currently rejected by save_config
    // Geofence { lat: f64, lon: f64, radius_m: f64 },
    // TimeRange { start: String, end: String },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum WebUiBehaviorDto {
    Click,
    ShortPress,
    LongPress,
    DoubleClick,
    ComboClick,
    ComboShortPress,
    ComboLongPress,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum WebUiActionDto {
    RunShell {
        command: String,
    },
    SendKey {
        #[serde(rename = "keyCode")]
        key_code: u16,
    },
    BuiltinCommand {
        command: WebUiBuiltinCommandDto,
    },
    LaunchApp {
        package: String,
        #[serde(default)]
        activity: Option<String>,
    },
    LaunchIntent {
        intent: WebUiIntentDto,
    },
    MultiTap {
        codes: Vec<u16>,
        #[serde(default = "default_multitap_interval_ms")]
        interval_ms: u32,
    },
    ToggleScreen,
    ToggleRule {
        rule_id: String,
    },
    VolumeControl {
        direction: WebUiVolumeDirectionDto,
    },
    BrightnessControl {
        direction: WebUiBrightnessDirectionDto,
    },
    Swipe {
        dx: i32,
        dy: i32,
        duration_ms: u32,
    },
    Intercept,
    Macro {
        actions: Vec<WebUiActionDto>,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum WebUiBuiltinCommandDto {
    MuteToggle,
    OpenVoiceAssistant,
    OpenCamera,
    ToggleFlashlight,
    ToggleDoNotDisturb,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum WebUiVolumeDirectionDto {
    Up,
    Down,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum WebUiBrightnessDirectionDto {
    Up,
    Down,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WebUiIntentDto {
    #[serde(default)]
    action: Option<String>,
    #[serde(default)]
    package: Option<String>,
    #[serde(default)]
    class_name: Option<String>,
    #[serde(default)]
    data: Option<String>,
    #[serde(default)]
    category: Vec<String>,
    #[serde(default)]
    extras: std::collections::HashMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppItemDto {
    package: String,
    name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppListDto {
    apps: Vec<AppItemDto>,
}

fn default_true_bool() -> bool {
    true
}

fn default_multitap_interval_ms() -> u32 {
    50
}

fn default_combination_timeout_ms() -> u32 {
    200
}

fn default_rule_timeout_ms() -> u32 {
    5000
}

fn default_condition_logic() -> String {
    "and".to_string()
}

impl WebUiBehaviorDto {
    fn from_rule_type(t: RuleType) -> Self {
        match t {
            RuleType::Click => Self::Click,
            RuleType::ShortPress => Self::ShortPress,
            RuleType::LongPress => Self::LongPress,
            RuleType::DoubleClick => Self::DoubleClick,
            RuleType::ComboClick => Self::ComboClick,
            RuleType::ComboShortPress => Self::ComboShortPress,
            RuleType::ComboLongPress => Self::ComboLongPress,
        }
    }

    fn into_rule_type(self) -> RuleType {
        match self {
            Self::Click => RuleType::Click,
            Self::ShortPress => RuleType::ShortPress,
            Self::LongPress => RuleType::LongPress,
            Self::DoubleClick => RuleType::DoubleClick,
            Self::ComboClick => RuleType::ComboClick,
            Self::ComboShortPress => RuleType::ComboShortPress,
            Self::ComboLongPress => RuleType::ComboLongPress,
        }
    }

    fn is_combo(self) -> bool {
        matches!(
            self,
            Self::ComboClick | Self::ComboShortPress | Self::ComboLongPress
        )
    }
}

impl From<&IntentSpec> for WebUiIntentDto {
    fn from(value: &IntentSpec) -> Self {
        Self {
            action: value.action.clone(),
            package: value.package.clone(),
            class_name: value.class_name.clone(),
            data: value.data.clone(),
            category: value.category.clone(),
            extras: value.extras.clone().unwrap_or_default(),
        }
    }
}

impl From<WebUiIntentDto> for IntentSpec {
    fn from(value: WebUiIntentDto) -> Self {
        let extras = if value.extras.is_empty() {
            None
        } else {
            Some(value.extras)
        };

        Self {
            action: value.action,
            package: value.package,
            class_name: value.class_name,
            data: value.data,
            category: value.category,
            extras,
        }
    }
}

impl From<WebUiBuiltinCommandDto> for BuiltinCommand {
    fn from(value: WebUiBuiltinCommandDto) -> Self {
        match value {
            WebUiBuiltinCommandDto::MuteToggle => BuiltinCommand::MuteToggle,
            WebUiBuiltinCommandDto::OpenVoiceAssistant => BuiltinCommand::OpenVoiceAssistant,
            WebUiBuiltinCommandDto::OpenCamera => BuiltinCommand::OpenCamera,
            WebUiBuiltinCommandDto::ToggleFlashlight => BuiltinCommand::ToggleFlashlight,
            WebUiBuiltinCommandDto::ToggleDoNotDisturb => BuiltinCommand::ToggleDoNotDisturb,
        }
    }
}

impl From<BuiltinCommand> for WebUiBuiltinCommandDto {
    fn from(value: BuiltinCommand) -> Self {
        match value {
            BuiltinCommand::MuteToggle => WebUiBuiltinCommandDto::MuteToggle,
            BuiltinCommand::OpenVoiceAssistant => WebUiBuiltinCommandDto::OpenVoiceAssistant,
            BuiltinCommand::OpenCamera => WebUiBuiltinCommandDto::OpenCamera,
            BuiltinCommand::ToggleFlashlight => WebUiBuiltinCommandDto::ToggleFlashlight,
            BuiltinCommand::ToggleDoNotDisturb => WebUiBuiltinCommandDto::ToggleDoNotDisturb,
        }
    }
}

impl From<WebUiVolumeDirectionDto> for VolumeDirection {
    fn from(value: WebUiVolumeDirectionDto) -> Self {
        match value {
            WebUiVolumeDirectionDto::Up => VolumeDirection::Up,
            WebUiVolumeDirectionDto::Down => VolumeDirection::Down,
        }
    }
}

impl From<VolumeDirection> for WebUiVolumeDirectionDto {
    fn from(value: VolumeDirection) -> Self {
        match value {
            VolumeDirection::Up => WebUiVolumeDirectionDto::Up,
            VolumeDirection::Down => WebUiVolumeDirectionDto::Down,
        }
    }
}

impl From<WebUiBrightnessDirectionDto> for BrightnessDirection {
    fn from(value: WebUiBrightnessDirectionDto) -> Self {
        match value {
            WebUiBrightnessDirectionDto::Up => BrightnessDirection::Up,
            WebUiBrightnessDirectionDto::Down => BrightnessDirection::Down,
        }
    }
}

impl From<BrightnessDirection> for WebUiBrightnessDirectionDto {
    fn from(value: BrightnessDirection) -> Self {
        match value {
            BrightnessDirection::Up => WebUiBrightnessDirectionDto::Up,
            BrightnessDirection::Down => WebUiBrightnessDirectionDto::Down,
        }
    }
}

fn action_to_webui_dto(action: &Action) -> WebUiActionDto {
    match action {
        Action::Shell { cmd } => WebUiActionDto::RunShell {
            command: cmd.clone(),
        },
        Action::SendKey { key_code } => WebUiActionDto::SendKey {
            key_code: *key_code,
        },
        Action::BuiltinCommand { command } => WebUiActionDto::BuiltinCommand {
            command: (*command).into(),
        },
        Action::LaunchApp { package, activity } => WebUiActionDto::LaunchApp {
            package: package.clone(),
            activity: activity.clone(),
        },
        Action::LaunchIntent { intent } => WebUiActionDto::LaunchIntent {
            intent: intent.into(),
        },
        Action::MultiTap { codes, interval_ms } => WebUiActionDto::MultiTap {
            codes: codes.clone(),
            interval_ms: *interval_ms,
        },
        Action::ToggleScreen => WebUiActionDto::ToggleScreen,
        Action::ToggleRule { rule_id } => WebUiActionDto::ToggleRule {
            rule_id: rule_id.clone(),
        },
        Action::VolumeControl { direction } => WebUiActionDto::VolumeControl {
            direction: (*direction).into(),
        },
        Action::BrightnessControl { direction } => WebUiActionDto::BrightnessControl {
            direction: (*direction).into(),
        },
        Action::Swipe {
            dx,
            dy,
            duration_ms,
        } => WebUiActionDto::Swipe {
            dx: *dx,
            dy: *dy,
            duration_ms: *duration_ms,
        },
        Action::Intercept => WebUiActionDto::Intercept,
        Action::Macro { actions } => WebUiActionDto::Macro {
            actions: actions.iter().map(action_to_webui_dto).collect(),
        },
    }
}

impl From<WebUiActionDto> for Action {
    fn from(value: WebUiActionDto) -> Self {
        match value {
            WebUiActionDto::RunShell { command } => Action::Shell { cmd: command },
            WebUiActionDto::SendKey { key_code } => Action::SendKey { key_code },
            WebUiActionDto::BuiltinCommand { command } => Action::BuiltinCommand {
                command: command.into(),
            },
            WebUiActionDto::LaunchApp { package, activity } => {
                Action::LaunchApp { package, activity }
            }
            WebUiActionDto::LaunchIntent { intent } => Action::LaunchIntent {
                intent: intent.into(),
            },
            WebUiActionDto::MultiTap { codes, interval_ms } => {
                Action::MultiTap { codes, interval_ms }
            }
            WebUiActionDto::ToggleScreen => Action::ToggleScreen,
            WebUiActionDto::ToggleRule { rule_id } => Action::ToggleRule { rule_id },
            WebUiActionDto::VolumeControl { direction } => Action::VolumeControl {
                direction: direction.into(),
            },
            WebUiActionDto::BrightnessControl { direction } => Action::BrightnessControl {
                direction: direction.into(),
            },
            WebUiActionDto::Swipe {
                dx,
                dy,
                duration_ms,
            } => Action::Swipe {
                dx,
                dy,
                duration_ms,
            },
            WebUiActionDto::Intercept => Action::Intercept,
            WebUiActionDto::Macro { actions } => Action::Macro {
                actions: actions.into_iter().map(Into::into).collect(),
            },
        }
    }
}

fn parse_token_to_code(
    token: &str,
    name_to_code: &std::collections::HashMap<String, u16>,
) -> Option<u16> {
    if let Ok(v) = token.parse::<u16>() {
        Some(v)
    } else {
        name_to_code.get(token).copied()
    }
}

/// Build a condition DTO from an internal Rule's trigger + rule_type
fn condition_from_rule(
    trigger: &str,
    rule_type: RuleType,
    name_to_code: &std::collections::HashMap<String, u16>,
) -> WebUiConditionDto {
    let behavior = WebUiBehaviorDto::from_rule_type(rule_type);
    if behavior.is_combo() {
        if let Some((left, right)) = trigger.split_once('+') {
            let key_code = parse_token_to_code(left.trim(), name_to_code);
            let combo_key_code = parse_token_to_code(right.trim(), name_to_code);
            return WebUiConditionDto::KeyEvent { key_code, combo_key_code, behavior };
        }
    }
    let key_code = parse_token_to_code(trigger.trim(), name_to_code);
    WebUiConditionDto::KeyEvent { key_code, combo_key_code: None, behavior }
}

/// Convert a condition DTO back to (trigger_string, RuleType)
fn condition_to_trigger(cond: &WebUiConditionDto) -> Result<(String, RuleType)> {
    match cond {
        WebUiConditionDto::KeyEvent { key_code, combo_key_code, behavior } => {
            let rule_type = behavior.into_rule_type();
            if behavior.is_combo() {
                let k1 = key_code.ok_or_else(|| anyhow!("combo rule requires keyCode"))?;
                let k2 = combo_key_code.ok_or_else(|| anyhow!("combo rule requires comboKeyCode"))?;
                if k1 == k2 {
                    bail!("combo key codes cannot be identical");
                }
                Ok((format!("{}+{}", k1, k2), rule_type))
            } else {
                if combo_key_code.is_some() {
                    bail!("comboKeyCode is only valid for combo rules");
                }
                let k = key_code.ok_or_else(|| anyhow!("rule requires keyCode"))?;
                Ok((k.to_string(), rule_type))
            }
        }
    }
}

/// Convert internal action to DTO action list (unwraps Macro into flat list)
fn action_to_dto_list(action: &Action) -> Vec<WebUiActionDto> {
    match action {
        Action::Macro { actions } => actions.iter().map(action_to_webui_dto).collect(),
        other => vec![action_to_webui_dto(other)],
    }
}

/// Convert a DTO action list to a single internal Action (wraps multiple into Macro)
fn dto_list_to_action(actions: Vec<WebUiActionDto>) -> Result<Action> {
    if actions.is_empty() {
        bail!("rule must have at least one action");
    }
    if actions.len() == 1 {
        Ok(actions.into_iter().next().unwrap().into())
    } else {
        Ok(Action::Macro {
            actions: actions.into_iter().map(Into::into).collect(),
        })
    }
}

fn config_to_webui_dto(cfg: &Config) -> WebUiConfigDto {
    let name_to_code: std::collections::HashMap<String, u16> = cfg
        .hardware_map
        .iter()
        .map(|(code, name)| (name.clone(), *code))
        .collect();

    let mut rules = Vec::with_capacity(cfg.rules.len());
    for r in &cfg.rules {
        let condition = condition_from_rule(&r.trigger, r.rule_type, &name_to_code);
        let actions = action_to_dto_list(&r.action);

        rules.push(WebUiRuleDto {
            id: Some(r.id.clone()),
            enabled: r.enabled,
            description: r.description.clone(),
            condition_logic: "and".to_string(),
            conditions: vec![condition],
            actions,
        });
    }

    WebUiConfigDto {
        version: 1,
        device_name: cfg.device_name.clone(),
        hardware_map: cfg
            .hardware_map
            .iter()
            .map(|(code, name)| (*code, name.clone()))
            .collect(),
        double_press_interval_ms: cfg.settings.double_tap_interval_ms,
        long_press_min_ms: cfg.settings.long_press_threshold_ms,
        short_press_min_ms: cfg.settings.short_press_threshold_ms,
        combination_timeout_ms: cfg.settings.combination_timeout_ms,
        rule_timeout_ms: cfg.settings.rule_timeout_ms,
        rules,
    }
}

pub async fn get_config(State(state): State<AppState>) -> impl IntoResponse {
    let cfg = state.config.read().await;
    Json(config_to_webui_dto(&cfg)).into_response()
}

pub async fn save_config(
    State(state): State<AppState>,
    Json(dto): Json<WebUiConfigDto>,
) -> impl IntoResponse {
    if dto.version != 1 {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            format!("Unsupported config version: {}", dto.version),
        )
            .into_response();
    }

    let mut new_config = {
        let existing = state.config.read().await;
        existing.clone()
    };

    if !dto.device_name.trim().is_empty() {
        new_config.device_name = dto.device_name.trim().to_string();
    }
    if !dto.hardware_map.is_empty() {
        new_config.hardware_map = dto
            .hardware_map
            .iter()
            .map(|(k, v)| (*k, v.clone()))
            .collect();
    }

    new_config.settings.double_tap_interval_ms = dto.double_press_interval_ms;
    new_config.settings.long_press_threshold_ms = dto.long_press_min_ms;
    new_config.settings.short_press_threshold_ms = dto.short_press_min_ms;
    new_config.settings.combination_timeout_ms = dto.combination_timeout_ms;
    new_config.settings.rule_timeout_ms = dto.rule_timeout_ms;
    new_config.rules.clear();

    for r in dto.rules {
        // V1: exactly 1 condition of type key_event
        if r.conditions.len() != 1 {
            return (
                axum::http::StatusCode::BAD_REQUEST,
                format!("Rule {:?}: V1 requires exactly 1 condition, got {}", r.id, r.conditions.len()),
            )
                .into_response();
        }

        let (trigger, rule_type) = match condition_to_trigger(&r.conditions[0]) {
            Ok(v) => v,
            Err(e) => {
                return (
                    axum::http::StatusCode::BAD_REQUEST,
                    format!("Invalid condition for rule {:?}: {}", r.id, e),
                )
                    .into_response();
            }
        };

        let action = match dto_list_to_action(r.actions) {
            Ok(v) => v,
            Err(e) => {
                return (
                    axum::http::StatusCode::BAD_REQUEST,
                    format!("Invalid action for rule {:?}: {}", r.id, e),
                )
                    .into_response();
            }
        };

        let id =
            r.id.clone()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| format!("{}_{}", Uuid::new_v4(), trigger));

        new_config.rules.push(Rule {
            id,
            trigger,
            rule_type,
            action,
            enabled: r.enabled,
            description: r.description,
        });
    }

    if let Err(e) = new_config.validate() {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            format!("Invalid config: {}", e),
        )
            .into_response();
    }

    {
        let mut cfg = state.config.write().await;
        *cfg = new_config.clone();
    }
    if let Err(e) = new_config.save_to_file_async(state.config_path.as_ref()).await {
        log::error!("Config saved to memory but file write failed: {}", e);
        return (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to save {}: {}", state.config_path.display(), e),
        )
            .into_response();
    }

    let cfg = state.config.read().await;

    let log_msg = format!(
        "save_config ok: path={}, rules={}, long_press_ms={}, short_press_ms={}, double_tap_ms={}, combination_timeout_ms={}, rule_timeout_ms={}",
        state.config_path.display(),
        cfg.rules.len(),
        cfg.settings.long_press_threshold_ms,
        cfg.settings.short_press_threshold_ms,
        cfg.settings.double_tap_interval_ms,
        cfg.settings.combination_timeout_ms,
        cfg.settings.rule_timeout_ms,
    );
    let _ = append_webui_log(&log_msg).await;

    (axum::http::StatusCode::OK, "Saved").into_response()
}

pub async fn list_apps(State(state): State<AppState>) -> impl IntoResponse {
    use crate::webui::app_cache::update_app_cache;
    if let Err(e) = update_app_cache(&state.app_cache).await {
        return (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to list apps: {}", e),
        )
            .into_response();
    }

    let cache = state.app_cache.read().await;
    let apps: Vec<AppItemDto> = cache
        .get_apps()
        .into_iter()
        .map(|(package, name)| AppItemDto { package, name })
        .collect();
    Json(AppListDto { apps }).into_response()
}

pub async fn start_learning(State(state): State<AppState>) -> impl IntoResponse {
    let mut learn = state.learn_state.lock();
    learn.start();
    (axum::http::StatusCode::OK, "Learning started")
}

pub async fn get_learn_result(State(state): State<AppState>) -> impl IntoResponse {
    let mut learn = state.learn_state.lock();
    let LearnResultSnapshot {
        status,
        remaining_ms,
    } = learn.snapshot();

    let (status_str, code) = match status {
        LearnStatus::Idle => ("idle", None),
        LearnStatus::Learning { .. } => ("learning", None),
        LearnStatus::Captured { key_code } => ("captured", Some(key_code)),
        LearnStatus::Timeout => ("timeout", None),
    };

    Json(LearnResultDto {
        status: status_str.to_string(),
        key_code: code,
        remaining_ms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{Action, RuleType};
    use std::collections::HashMap;

    #[test]
    fn condition_conversion_combo_roundtrip() {
        let mut map = HashMap::new();
        map.insert("VOL_UP".to_string(), 115);
        map.insert("VOL_DOWN".to_string(), 114);

        // 1. Rule -> DTO
        let trigger = "115+114";
        let rule_type = RuleType::ComboShortPress;
        let dto = condition_from_rule(trigger, rule_type, &map);

        match dto {
            WebUiConditionDto::KeyEvent { key_code, combo_key_code, behavior } => {
                assert_eq!(key_code, Some(115));
                assert_eq!(combo_key_code, Some(114));
                assert!(behavior.is_combo());
            }
        }

        // 2. DTO -> Rule
        let (out_trigger, out_type) = condition_to_trigger(&dto).expect("conversion failed");
        assert_eq!(out_trigger, "115+114");
        assert_eq!(out_type, RuleType::ComboShortPress);
    }

    #[test]
    fn condition_conversion_single_roundtrip() {
        let map = HashMap::new();
        let trigger = "115";
        let rule_type = RuleType::LongPress;
        let dto = condition_from_rule(trigger, rule_type, &map);

        match dto {
            WebUiConditionDto::KeyEvent { key_code, combo_key_code, behavior } => {
                assert_eq!(key_code, Some(115));
                assert_eq!(combo_key_code, None);
                assert!(!behavior.is_combo());
            }
        }

        let (out_trigger, out_type) = condition_to_trigger(&dto).expect("conversion failed");
        assert_eq!(out_trigger, "115");
        assert_eq!(out_type, RuleType::LongPress);
    }

    #[test]
    fn action_list_macro_roundtrip() {
        let original = Action::Macro {
            actions: vec![
                Action::SendKey { key_code: 1 },
                Action::SendKey { key_code: 2 },
            ],
        };

        let dtos = action_to_dto_list(&original);
        assert_eq!(dtos.len(), 2);

        let restored = dto_list_to_action(dtos).expect("conversion failed");
        match restored {
            Action::Macro { actions } => {
                assert_eq!(actions.len(), 2);
                match &actions[0] {
                    Action::SendKey { key_code } => assert_eq!(*key_code, 1),
                    _ => panic!("wrong action type"),
                }
            }
            _ => panic!("expected macro"),
        }
    }

    #[test]
    fn action_list_single_unwrap() {
        let original = Action::SendKey { key_code: 42 };
        let dtos = action_to_dto_list(&original);
        assert_eq!(dtos.len(), 1);

        let restored = dto_list_to_action(dtos).expect("conversion failed");
        match restored {
            Action::SendKey { key_code } => assert_eq!(key_code, 42),
            _ => panic!("should unwrap to single action"),
        }
    }
}
