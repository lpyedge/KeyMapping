use crate::config::{
    Action, BrightnessDirection, BuiltinCommand, Config, IntentSpec, VolumeDirection,
};
use crate::hardware::uinput::UinputHandler;
use anyhow::Result;
use log::{debug, error, info, warn};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::process::Command;
use tokio::sync::{Mutex, RwLock};

pub struct ActionExecutor;

impl ActionExecutor {
    pub async fn execute(
        action: &Action,
        uinput: Arc<Mutex<UinputHandler>>,
        config: Arc<RwLock<Config>>,
        config_path: Option<PathBuf>,
    ) -> Result<()> {
        match action {
            Action::Macro { actions } => {
                for sub in actions {
                    if matches!(sub, Action::Macro { .. }) {
                        warn!("Nested macro is not executed to avoid recursion complexity");
                        continue;
                    }
                    Self::execute_non_macro(
                        sub,
                        uinput.clone(),
                        config.clone(),
                        config_path.clone(),
                    )
                    .await?;
                }
                Ok(())
            }
            _ => Self::execute_non_macro(action, uinput, config, config_path).await,
        }
    }

    async fn execute_non_macro(
        action: &Action,
        uinput: Arc<Mutex<UinputHandler>>,
        config: Arc<RwLock<Config>>,
        config_path: Option<PathBuf>,
    ) -> Result<()> {
        match action {
            Action::Shell { cmd } => {
                info!("Executing shell command: {}", cmd);
                Self::spawn_shell(cmd.clone());
            }
            Action::BuiltinCommand { command } => match command {
                BuiltinCommand::MuteToggle => {
                    Self::send_click_key(&uinput, 113).await?;
                }
                BuiltinCommand::OpenVoiceAssistant => {
                    Self::spawn_process(
                        "am",
                        vec![
                            "start".to_string(),
                            "-a".to_string(),
                            "android.intent.action.VOICE_ASSIST".to_string(),
                        ],
                    );
                }
                BuiltinCommand::OpenCamera => {
                    Self::spawn_process(
                        "am",
                        vec![
                            "start".to_string(),
                            "-a".to_string(),
                            "android.media.action.STILL_IMAGE_CAMERA".to_string(),
                        ],
                    );
                }
                BuiltinCommand::ToggleFlashlight => {
                    Self::spawn_process(
                        "cmd",
                        vec![
                            "statusbar".to_string(),
                            "click-tile".to_string(),
                            "com.android.systemui/.qs.tiles.FlashlightTile".to_string(),
                        ],
                    );
                }
                BuiltinCommand::ToggleDoNotDisturb => {
                    Self::spawn_shell(
                        "mode=$(settings get global zen_mode 2>/dev/null); \
                         if [ \"$mode\" = \"0\" ] || [ -z \"$mode\" ]; then \
                           settings put global zen_mode 1; \
                         else \
                           settings put global zen_mode 0; \
                         fi"
                        .to_string(),
                    );
                }
            },
            Action::SendKey { key_code } => {
                Self::send_click_key(&uinput, *key_code).await?;
            }
            Action::MultiTap { codes, interval_ms } => {
                for code in codes {
                    Self::send_click_key(&uinput, *code).await?;
                    tokio::time::sleep(std::time::Duration::from_millis(*interval_ms as u64)).await;
                }
            }
            Action::LaunchApp { package, activity } => {
                if let Some(activity) = activity.as_ref() {
                    Self::spawn_process(
                        "am",
                        vec![
                            "start".to_string(),
                            "-n".to_string(),
                            format!("{}/{}", package, activity),
                        ],
                    );
                } else {
                    Self::spawn_process(
                        "monkey",
                        vec![
                            "-p".to_string(),
                            package.clone(),
                            "-c".to_string(),
                            "android.intent.category.LAUNCHER".to_string(),
                            "1".to_string(),
                        ],
                    );
                }
            }
            Action::LaunchIntent { intent } => {
                if let Some(args) = build_intent_args(intent) {
                    Self::spawn_process("am", args);
                } else {
                    warn!("Ignored launch_intent with empty intent payload");
                }
            }
            Action::ToggleScreen => {
                // KEY_SLEEP
                Self::send_click_key(&uinput, 223).await?;
            }
            Action::ToggleRule { rule_id } => {
                let save_needed = {
                    let mut cfg = config.write().await;
                    if let Some(rule) = cfg.rules.iter_mut().find(|r| r.id == *rule_id) {
                        rule.enabled = !rule.enabled;
                        debug!("Rule '{}' toggled to enabled={}", rule_id, rule.enabled);
                        true
                    } else {
                        warn!("ToggleRule target not found: {}", rule_id);
                        false
                    }
                }; // write lock released here
                if save_needed {
                    if let Some(path) = config_path.as_ref() {
                        let cfg = config.read().await;
                        if let Err(e) = cfg.save_to_file_async(path).await {
                            error!("Failed to persist ToggleRule: {}", e);
                        }
                    }
                }
            }
            Action::VolumeControl { direction } => {
                let key_code = match direction {
                    VolumeDirection::Up => 115,
                    VolumeDirection::Down => 114,
                };
                Self::send_click_key(&uinput, key_code).await?;
            }
            Action::BrightnessControl { direction } => {
                // Use uinput directly for brightness (much faster than shell)
                // KEY_BRIGHTNESSDOWN = 224
                // KEY_BRIGHTNESSUP = 225
                let key_code = match direction {
                    BrightnessDirection::Up => 225,
                    BrightnessDirection::Down => 224,
                };
                Self::send_click_key(&uinput, key_code).await?;
            }
            Action::Swipe { .. } => {
                warn!("Swipe action requires touchscreen injection support (not implemented)");
            }
            Action::Intercept => {
                debug!("Intercept action: event consumed without side effects");
            }
            Action::Macro { .. } => {
                warn!("Unexpected macro branch in execute_non_macro");
            }
        }
        Ok(())
    }

    async fn send_click_key(uinput: &Arc<Mutex<UinputHandler>>, key_code: u16) -> Result<()> {
        let mut device = uinput.lock().await;
        device.send_key(key_code, 1)?;
        device.sync()?;
        device.send_key(key_code, 0)?;
        device.sync()?;
        Ok(())
    }

    fn spawn_shell(cmd_str: String) {
        tokio::spawn(async move {
            let output = Command::new("sh").arg("-c").arg(&cmd_str).output().await;

            match output {
                Ok(out) => {
                    if !out.status.success() {
                        error!(
                            "Command '{}' failed: {}",
                            cmd_str,
                            String::from_utf8_lossy(&out.stderr)
                        );
                    }
                }
                Err(e) => error!("Failed to execute command '{}': {}", cmd_str, e),
            }
        });
    }

    fn spawn_process(program: &str, args: Vec<String>) {
        let program = program.to_string();
        tokio::spawn(async move {
            let output = Command::new(&program).args(&args).output().await;
            match output {
                Ok(out) => {
                    if !out.status.success() {
                        error!(
                            "Command '{} {:?}' failed: {}",
                            program,
                            args,
                            String::from_utf8_lossy(&out.stderr)
                        );
                    }
                }
                Err(e) => error!("Failed to execute command '{} {:?}': {}", program, args, e),
            }
        });
    }
}

fn build_intent_args(intent: &IntentSpec) -> Option<Vec<String>> {
    let mut args = vec!["start".to_string()];
    let mut has_payload = false;

    if let Some(action) = intent.action.as_ref() {
        args.push("-a".to_string());
        args.push(action.clone());
        has_payload = true;
    }

    if let Some(data) = intent.data.as_ref() {
        args.push("-d".to_string());
        args.push(data.clone());
        has_payload = true;
    }

    if let Some(pkg) = intent.package.as_ref() {
        has_payload = true;
        if let Some(class_name) = intent.class_name.as_ref() {
            args.push("-n".to_string());
            args.push(format!("{}/{}", pkg, class_name));
        } else {
            args.push("-p".to_string());
            args.push(pkg.clone());
        }
    }

    for c in intent.category.iter() {
        args.push("-c".to_string());
        args.push(c.clone());
        has_payload = true;
    }

    if let Some(extras) = intent.extras.as_ref() {
        for (k, v) in extras {
            if v.parse::<bool>().is_ok() {
                args.push("--ez".to_string());
                args.push(k.clone());
                args.push(v.clone());
            } else if v.parse::<i32>().is_ok() {
                args.push("--ei".to_string());
                args.push(k.clone());
                args.push(v.clone());
            } else {
                args.push("--es".to_string());
                args.push(k.clone());
                args.push(v.clone());
            }
            has_payload = true;
        }
    }

    if has_payload {
        Some(args)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn build_intent_args_should_infer_types() {
        let mut extras = HashMap::new();
        // Insert as Strings, simulating DTO/WebUI input
        extras.insert("my_bool".to_string(), "true".to_string());
        extras.insert("my_int".to_string(), "123".to_string());
        extras.insert("my_string".to_string(), "hello".to_string());

        let intent = IntentSpec {
            action: Some("android.intent.action.VIEW".to_string()),
            package: None,
            class_name: None,
            data: None,
            category: vec![],
            extras: Some(extras),
        };

        let args = build_intent_args(&intent).expect("should return args");
        
        // Helper to find flag index and check next two values
        let check_arg = |flag: &str, key: &str, val: &str| {
            // Find triplet [flag, key, val]
            let found = args.windows(3).any(|w| w[0] == flag && w[1] == key && w[2] == val);
            assert!(found, "Expected sequence [{}, {}, {}] not found in args: {:?}", flag, key, val, args);
        };
        
        check_arg("--ez", "my_bool", "true");
        check_arg("--ei", "my_int", "123");
        check_arg("--es", "my_string", "hello");
    }
}
