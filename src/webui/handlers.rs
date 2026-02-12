use anyhow::{anyhow, bail, Result};
use axum::{
    extract::State,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use tokio::process::Command;
use uuid::Uuid;

use crate::config::{
    Action, BuiltinCommand, Config, IntentSpec, Rule, RuleType,
};
use crate::utils::logger::append_webui_log;
use crate::webui::server::AppState;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
struct WebUiConfigDto {
    version: u32,
    #[serde(default)]
    device_name: String,
    #[serde(default)]
    hardware_map: BTreeMap<u16, String>,
    double_press_interval_ms: u32,
    long_press_min_ms: u32,
    short_press_min_ms: u32,
    #[serde(default)]
    rules: Vec<WebUiRuleDto>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
struct WebUiRuleDto {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    trigger: Option<String>,
    #[serde(default)]
    key_code: Option<u16>,
    behavior: WebUiBehaviorDto,
    #[serde(default)]
    combo_key_code: Option<u16>,
    action: WebUiActionDto,
    #[serde(default = "default_true_bool")]
    enabled: bool,
    #[serde(default)]
    description: String,
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
#[serde(deny_unknown_fields)]
enum WebUiActionDto {
    RunShell { command: String },
    SendKey {
        #[serde(rename = "keyCode")]
        key_code: u16,
    },
    BuiltinCommand { command: WebUiBuiltinCommandDto },
    LaunchApp {
        package: String,
        #[serde(default)]
        activity: Option<String>,
    },
    LaunchIntent { intent: WebUiIntentDto },
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
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

fn action_to_webui_dto(action: &Action) -> Result<WebUiActionDto> {
    match action {
        Action::Shell { cmd } => Ok(WebUiActionDto::RunShell {
            command: cmd.clone(),
        }),
        Action::SendKey { key_code } => Ok(WebUiActionDto::SendKey {
            key_code: *key_code,
        }),
        Action::BuiltinCommand { command } => Ok(WebUiActionDto::BuiltinCommand {
            command: (*command).into(),
        }),
        Action::LaunchApp { package, activity } => Ok(WebUiActionDto::LaunchApp {
            package: package.clone(),
            activity: activity.clone(),
        }),
        Action::LaunchIntent { intent } => Ok(WebUiActionDto::LaunchIntent {
            intent: intent.into(),
        }),
        _ => bail!("unsupported action in strict WebUI mode: {:?}", action),
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
            WebUiActionDto::LaunchApp { package, activity } => Action::LaunchApp { package, activity },
            WebUiActionDto::LaunchIntent { intent } => Action::LaunchIntent {
                intent: intent.into(),
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

fn parse_trigger_to_dto(
    trigger: &str,
    rule_type: RuleType,
    name_to_code: &std::collections::HashMap<String, u16>,
) -> (Option<u16>, Option<u16>, Option<String>) {
    if matches!(
        rule_type,
        RuleType::ComboClick | RuleType::ComboShortPress | RuleType::ComboLongPress
    ) {
        if let Some((left, right)) = trigger.split_once('+') {
            let key_code = parse_token_to_code(left.trim(), name_to_code);
            let combo_key_code = parse_token_to_code(right.trim(), name_to_code);
            return (key_code, combo_key_code, Some(trigger.to_string()));
        }
        return (None, None, Some(trigger.to_string()));
    }

    let key_code = parse_token_to_code(trigger.trim(), name_to_code);
    (key_code, None, Some(trigger.to_string()))
}

fn build_trigger(
    behavior: WebUiBehaviorDto,
    trigger: Option<String>,
    key_code: Option<u16>,
    combo_key_code: Option<u16>,
) -> Result<String> {
    if behavior.is_combo() {
        let k1 = key_code.ok_or_else(|| anyhow!("combo rule requires keyCode"))?;
        let k2 = combo_key_code.ok_or_else(|| anyhow!("combo rule requires comboKeyCode"))?;
        if k1 == k2 {
            bail!("combo key codes cannot be identical");
        }
        let built = format!("{}+{}", k1, k2);
        if let Some(raw) = trigger {
            let t = raw.trim();
            if !t.is_empty() && t != built {
                bail!("trigger does not match keyCode/comboKeyCode");
            }
        }
        return Ok(built);
    }

    if combo_key_code.is_some() {
        bail!("comboKeyCode is only valid for combo rules");
    }
    let k = key_code.ok_or_else(|| anyhow!("rule requires keyCode"))?;
    let built = k.to_string();
    if let Some(raw) = trigger {
        let t = raw.trim();
        if !t.is_empty() && t != built {
            bail!("trigger does not match keyCode");
        }
    }
    Ok(built)
}

fn config_to_webui_dto(cfg: &Config) -> Result<WebUiConfigDto> {
    let name_to_code: std::collections::HashMap<String, u16> = cfg
        .hardware_map
        .iter()
        .map(|(code, name)| (name.clone(), *code))
        .collect();

    let mut rules = Vec::with_capacity(cfg.rules.len());
    for r in &cfg.rules {
        let action = action_to_webui_dto(&r.action)?;
        let (key_code, combo_key_code, trigger) =
            parse_trigger_to_dto(&r.trigger, r.rule_type, &name_to_code);

        rules.push(WebUiRuleDto {
            id: Some(r.id.clone()),
            trigger,
            key_code,
            behavior: WebUiBehaviorDto::from_rule_type(r.rule_type),
            combo_key_code,
            action,
            enabled: r.enabled,
            description: r.description.clone(),
        });
    }

    Ok(WebUiConfigDto {
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
        rules,
    })
}

pub async fn get_config(State(state): State<AppState>) -> impl IntoResponse {
    let cfg = state.config.read().await;
    match config_to_webui_dto(&cfg) {
        Ok(dto) => Json(dto).into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to serialize config for WebUI: {}", e),
        )
            .into_response(),
    }
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
        new_config.hardware_map = dto.hardware_map.iter().map(|(k, v)| (*k, v.clone())).collect();
    }

    new_config.settings.double_tap_interval_ms = dto.double_press_interval_ms;
    new_config.settings.long_press_threshold_ms = dto.long_press_min_ms;
    new_config.settings.short_press_threshold_ms = dto.short_press_min_ms;
    new_config.rules.clear();

    for r in dto.rules {
        let rule_type = r.behavior.into_rule_type();
        let trigger = match build_trigger(r.behavior, r.trigger.clone(), r.key_code, r.combo_key_code) {
            Ok(v) => v,
            Err(e) => {
                return (
                    axum::http::StatusCode::BAD_REQUEST,
                    format!("Invalid trigger for rule {:?}: {}", r.id, e),
                )
                    .into_response();
            }
        };

        let action: Action = r.action.clone().into();

        let id = r
            .id
            .clone()
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

    let mut cfg = state.config.write().await;
    *cfg = new_config;

    if let Err(e) = cfg.save_to_file(state.config_path.as_ref()) {
        return (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to save {}: {}", state.config_path.display(), e),
        )
            .into_response();
    }

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

pub async fn list_apps() -> impl IntoResponse {
    match fetch_installed_apps().await {
        Ok(apps) => Json(AppListDto { apps }).into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to list apps: {}", e),
        )
            .into_response(),
    }
}

async fn fetch_installed_apps() -> Result<Vec<AppItemDto>> {
    let output = Command::new("sh")
        .arg("-c")
        .arg("pm list packages")
        .output()
        .await?;

    if !output.status.success() {
        bail!(
            "pm list packages failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    let mut packages: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| line.strip_prefix("package:"))
        .map(|s| s.trim().to_string())
        .filter(|pkg| !pkg.is_empty())
        .collect();

    packages.sort();
    packages.dedup();

    let mut apps = Vec::with_capacity(packages.len());
    for package in packages {
        let name = fetch_app_label(&package).await.unwrap_or_else(|| package.clone());
        apps.push(AppItemDto { package, name });
    }
    Ok(apps)
}

async fn fetch_app_label(package: &str) -> Option<String> {
    let output = Command::new("pm").arg("dump").arg(package).output().await.ok()?;
    if !output.status.success() {
        return None;
    }

    for raw_line in String::from_utf8_lossy(&output.stdout).lines() {
        let line = raw_line.trim();
        if !line.starts_with("application-label") {
            continue;
        }
        let (_, value) = line.split_once(':')?;
        let label = value.trim().trim_matches('\'').trim();
        if !label.is_empty() {
            return Some(label.to_string());
        }
    }
    None
}

