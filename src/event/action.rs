use crate::config::{Action, BuiltinCommand, BrightnessDirection, Config, IntentSpec, VolumeDirection};
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
                    if matches!(sub.as_ref(), Action::Macro { .. }) {
                        warn!("Nested macro is not executed to avoid recursion complexity");
                        continue;
                    }
                    Self::execute_non_macro(sub.as_ref(), uinput.clone(), config.clone(), config_path.clone())
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
                    Self::spawn_shell("am start -a android.intent.action.VOICE_ASSIST".to_string());
                }
                BuiltinCommand::OpenCamera => {
                    Self::spawn_shell("am start -a android.media.action.STILL_IMAGE_CAMERA".to_string());
                }
                BuiltinCommand::ToggleFlashlight => {
                    Self::spawn_shell(
                        "cmd statusbar click-tile com.android.systemui/.qs.tiles.FlashlightTile".to_string(),
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
                let cmd = if let Some(activity) = activity.as_ref() {
                    format!("am start -n {}/{}", package, activity)
                } else {
                    format!("monkey -p {} -c android.intent.category.LAUNCHER 1", package)
                };
                Self::spawn_shell(cmd);
            }
            Action::LaunchIntent { intent } => {
                if let Some(cmd) = build_intent_command(intent) {
                    Self::spawn_shell(cmd);
                } else {
                    warn!("Ignored launch_intent with empty intent payload");
                }
            }
            Action::ToggleScreen => {
                // KEY_SLEEP
                Self::send_click_key(&uinput, 223).await?;
            }
            Action::ToggleRule { rule_id } => {
                let mut cfg = config.write().await;
                let maybe_rule = cfg.rules.iter_mut().find(|r| r.id == *rule_id);
                if let Some(rule) = maybe_rule {
                    rule.enabled = !rule.enabled;
                    debug!("Rule '{}' toggled to enabled={}", rule_id, rule.enabled);
                    if let Some(path) = config_path.as_ref() {
                        cfg.save_to_file(path)?;
                    } else {
                        warn!("ToggleRule updated memory only because config_path is None");
                    }
                } else {
                    warn!("ToggleRule target not found: {}", rule_id);
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
                // Use Android keyevents as a best-effort implementation.
                let key_code = match direction {
                    BrightnessDirection::Up => 221,
                    BrightnessDirection::Down => 220,
                };
                Self::spawn_shell(format!("input keyevent {}", key_code));
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
}

fn build_intent_command(intent: &IntentSpec) -> Option<String> {
    let mut cmd = String::from("am start");
    let mut has_payload = false;

    if let Some(action) = intent.action.as_ref() {
        cmd.push_str(&format!(" -a {}", action));
        has_payload = true;
    }

    if let Some(data) = intent.data.as_ref() {
        cmd.push_str(&format!(" -d {}", shell_escape(data)));
        has_payload = true;
    }

    if let Some(pkg) = intent.package.as_ref() {
        has_payload = true;
        if let Some(class_name) = intent.class_name.as_ref() {
            cmd.push_str(&format!(" -n {}/{}", pkg, class_name));
        } else {
            cmd.push_str(&format!(" -p {}", pkg));
        }
    }

    for c in intent.category.iter() {
        cmd.push_str(&format!(" -c {}", c));
        has_payload = true;
    }

    if let Some(extras) = intent.extras.as_ref() {
        for (k, v) in extras {
            cmd.push_str(&format!(" --es {} {}", k, shell_escape(v)));
            has_payload = true;
        }
    }

    if has_payload {
        Some(cmd)
    } else {
        None
    }
}

fn shell_escape(val: &str) -> String {
    format!("'{}'", val.replace('\'', "'\\''"))
}
