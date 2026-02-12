use crate::config::{Action, BuiltinCommand, Config, IntentSpec, VolumeDirection};
use crate::hardware::uinput::UinputHandler;
use anyhow::Result;
use log::{info, error, debug, warn};
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tokio::process::Command;

pub struct ActionExecutor;

impl ActionExecutor {
    pub async fn execute(
        action: &Action,
        uinput: Arc<Mutex<UinputHandler>>,
        config: Arc<RwLock<Config>>,
    ) -> Result<()> {
        match action {
            Action::Shell { cmd } => {
                info!("Executing shell command: {}", cmd);
                Self::spawn_shell(cmd.clone());
            }
            Action::BuiltinCommand { command } => match command {
                BuiltinCommand::MuteToggle => {
                    let mut device = uinput.lock().await;
                    // Linux input KEY_MUTE
                    device.send_key(113, 1)?;
                    device.sync()?;
                    device.send_key(113, 0)?;
                    device.sync()?;
                }
                BuiltinCommand::OpenVoiceAssistant => {
                    Self::spawn_shell("am start -a android.intent.action.VOICE_ASSIST".to_string());
                }
                BuiltinCommand::OpenCamera => {
                    Self::spawn_shell("am start -a android.media.action.STILL_IMAGE_CAMERA".to_string());
                }
                BuiltinCommand::ToggleFlashlight => {
                    Self::spawn_shell(
                        "cmd statusbar click-tile com.android.systemui/.qs.tiles.FlashlightTile"
                            .to_string(),
                    );
                }
                BuiltinCommand::ToggleDoNotDisturb => {
                    // Toggle zen mode between 0 (off) and 1 (important interruptions)
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
                info!("Sending key: {}", key_code);
                let mut device = uinput.lock().await;
                device.send_key(*key_code, 1)?; 
                device.sync()?;
                device.send_key(*key_code, 0)?; 
                device.sync()?;
            }
            Action::LaunchApp { package, activity } => {
                let mut cmd = format!("monkey -p {} -c android.intent.category.LAUNCHER 1", package);
                if let Some(act) = activity {
                    cmd = format!("am start -n {}/{}", package, act);
                }
                info!("Launching app: {}", cmd);
                // Recursively call Shell action
                // Note: We create a new Action::Shell, so no recursion depth issue
                let _ = ActionExecutor::execute(&Action::Shell { cmd }, uinput, config).await;
            }
            Action::LaunchIntent { intent } => {
                match build_intent_command(intent) {
                    Some(cmd) => {
                        info!("Launching intent: {}", cmd);
                        let _ = ActionExecutor::execute(&Action::Shell { cmd }, uinput, config).await;
                    }
                    None => warn!("Invalid intent spec, skip launch"),
                }
            }
            Action::Macro { actions } => {
                for act in actions {
                    Box::pin(ActionExecutor::execute(act, uinput.clone(), config.clone())).await?;
                    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                }
            }
            Action::Intercept => {
                debug!("Key event intercepted");
            }
            Action::VolumeControl { direction } => {
                let key = match direction {
                    VolumeDirection::Up => 115, 
                    VolumeDirection::Down => 114, 
                };
                let mut device = uinput.lock().await;
                device.send_key(key, 1)?;
                device.sync()?;
                device.send_key(key, 0)?;
                device.sync()?;
            }
            Action::ToggleScreen => {
                let mut device = uinput.lock().await;
                device.send_key(116, 1)?;
                device.sync()?;
                device.send_key(116, 0)?;
                device.sync()?;
            }
            Action::BrightnessControl { direction } => {
                let key = match direction {
                    crate::config::BrightnessDirection::Up => 225,   // KEY_BRIGHTNESSUP
                    crate::config::BrightnessDirection::Down => 224, // KEY_BRIGHTNESSDOWN
                };
                let mut device = uinput.lock().await;
                device.send_key(key, 1)?;
                device.sync()?;
                device.send_key(key, 0)?;
                device.sync()?;
            }
            Action::ToggleRule { rule_id } => {
                info!("Toggling rule: {}", rule_id);
                let mut cfg = config.write().await;
                if let Some(rule) = cfg.rules.iter_mut().find(|r| &r.id == rule_id) {
                    rule.enabled = !rule.enabled;
                    info!("Rule {} enabled: {}", rule_id, rule.enabled);
                    // NOTE: This change is in memory. Persistence requires saving.
                    // Also EventProcessor needs to know to reload StateMachine? 
                    // Since ActionExecutor holds the lock, the change is instant in Config.
                    // But StateMachine in EventProcessor has a COPY of rules.
                    // We need to signal EventProcessor.
                } else {
                    warn!("Rule not found: {}", rule_id);
                }
            }
            Action::MultiTap { codes, interval_ms } => {
                for code in codes {
                    {
                        let mut device = uinput.lock().await;
                        device.send_key(*code, 1)?;
                        device.sync()?;
                        device.send_key(*code, 0)?;
                        device.sync()?;
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(*interval_ms as u64)).await;
                }
            }
            Action::Swipe { .. } => {
                 warn!("Swipe action requires a Touchscreen virtual device (Feature Pending).");
            }
            _ => {
                warn!("Action not fully implemented yet: {:?}", action);
            }
        }
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
                Err(e) => error!("Failed to execute command: {}", e),
            }
        });
    }
}

fn build_intent_command(intent: &IntentSpec) -> Option<String> {
    let mut cmd = String::from("am start");

    if let Some(action) = intent.action.as_ref() {
        cmd.push_str(&format!(" -a {}", action));
    }

    if let Some(data) = intent.data.as_ref() {
        cmd.push_str(&format!(" -d {}", shell_escape(data)));
    }

    if let Some(pkg) = intent.package.as_ref() {
        if let Some(class_name) = intent.class_name.as_ref() {
            cmd.push_str(&format!(" -n {}/{}", pkg, class_name));
        } else {
            cmd.push_str(&format!(" -p {}", pkg));
        }
    }

    for c in intent.category.iter() {
        cmd.push_str(&format!(" -c {}", c));
    }

    if let Some(extras) = intent.extras.as_ref() {
        for (k, v) in extras {
            cmd.push_str(&format!(" --es {} {}", k, shell_escape(v)));
        }
    }

    Some(cmd)
}

fn shell_escape(val: &str) -> String {
    format!("'{}'", val.replace("'", "'\\''"))
}
