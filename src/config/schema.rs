use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Main Config Structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    /// Device Name to listen on
    #[serde(default)]
    pub device_name: String,

    /// Hardware mapping: raw_keycode -> logical_name
    #[serde(default)]
    pub hardware_map: HashMap<u16, String>,

    /// List of rules
    #[serde(default)]
    pub rules: Vec<Rule>,

    /// Global settings
    #[serde(default)]
    pub settings: GlobalSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Rule {
    #[serde(default)]
    pub id: String,
    pub trigger: String,
    pub rule_type: RuleType,
    pub action: Action,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RuleType {
    Click,             // < 300ms, Release
    DoubleClick,       // < 300ms interval, 2nd Release
    ShortPress,        // >= 300ms, Hold
    LongPress,         // >= 800ms, Hold
    ComboClick,        // Combination + Click
    ComboShortPress,   // Combination + Hold >= 300ms
    ComboLongPress,    // Combination + Hold >= 800ms
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum Action {
    SendKey { key_code: u16 },
    #[serde(alias = "run_shell")]
    Shell { cmd: String },
    BuiltinCommand { command: BuiltinCommand },
    MultiTap { codes: Vec<u16>, #[serde(default = "default_tap_interval")] interval_ms: u32 },
    LaunchApp { package: String, #[serde(default)] activity: Option<String> },
    LaunchIntent { intent: IntentSpec },
    ToggleScreen,
    ToggleRule { rule_id: String },
    VolumeControl { direction: VolumeDirection },
    BrightnessControl { direction: BrightnessDirection },
    Swipe { dx: i32, dy: i32, duration_ms: u32 },
    Intercept,
    Macro { actions: Vec<Box<Action>> },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BuiltinCommand {
    MuteToggle,
    OpenVoiceAssistant,
    OpenCamera,
    ToggleFlashlight,
    ToggleDoNotDisturb,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(deny_unknown_fields)]
pub struct IntentSpec {
    #[serde(default)]
    pub action: Option<String>,
    #[serde(default)]
    pub package: Option<String>,
    #[serde(default, rename = "className")]
    pub class_name: Option<String>,
    #[serde(default)]
    pub data: Option<String>,
    #[serde(default)]
    pub category: Vec<String>,
    #[serde(default)]
    pub extras: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum VolumeDirection {
    Up,
    Down,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BrightnessDirection {
    Up,
    Down,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GlobalSettings {
    #[serde(default = "default_long_press_threshold")]
    pub long_press_threshold_ms: u32,
    #[serde(default = "default_short_press_threshold")]
    pub short_press_threshold_ms: u32,
    #[serde(default = "default_double_tap_interval")]
    pub double_tap_interval_ms: u32,
    #[serde(default = "default_combination_timeout")]
    pub combination_timeout_ms: u32,
    #[serde(default = "default_true")]
    pub enable_haptic: bool,
    #[serde(default = "default_true")]
    pub enable_wakelock: bool,
    #[serde(default = "default_log_level")]
    pub log_level: String,
    #[serde(default = "default_rule_timeout")]
    pub rule_timeout_ms: u32,
}

// Default helpers
fn default_true() -> bool { true }
fn default_long_press_threshold() -> u32 { 800 }
fn default_short_press_threshold() -> u32 { 300 }
fn default_double_tap_interval() -> u32 { 300 }
fn default_combination_timeout() -> u32 { 200 }
fn default_tap_interval() -> u32 { 50 }
fn default_log_level() -> String { "info".to_string() }
fn default_rule_timeout() -> u32 { 5000 }

impl Default for Config {
    fn default() -> Self {
        let mut hardware_map = HashMap::new();
        hardware_map.insert(115, "VOL_UP".to_string());
        hardware_map.insert(114, "VOL_DOWN".to_string());
        hardware_map.insert(116, "POWER".to_string());
        hardware_map.insert(102, "HOME".to_string());
        hardware_map.insert(139, "MENU".to_string());

        Self {
            device_name: "gpio-keys".to_string(),
            hardware_map,
            rules: Vec::new(),
            settings: GlobalSettings::default(),
        }
    }
}

impl Default for GlobalSettings {
    fn default() -> Self {
        Self {
            long_press_threshold_ms: default_long_press_threshold(),
            short_press_threshold_ms: default_short_press_threshold(),
            double_tap_interval_ms: default_double_tap_interval(),
            combination_timeout_ms: default_combination_timeout(),
            enable_haptic: default_true(),
            enable_wakelock: default_true(),
            log_level: default_log_level(),
            rule_timeout_ms: default_rule_timeout(),
        }
    }
}
