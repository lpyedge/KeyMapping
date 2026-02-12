use anyhow::Result;
use log::{info, warn};
#[cfg(any(target_os = "linux", target_os = "android"))]
use log::debug;
use std::path::PathBuf;
use std::sync::{Arc, Mutex as StdMutex};
#[cfg(any(target_os = "linux", target_os = "android"))]
use std::time::Duration;
use tokio::sync::RwLock;
#[cfg(any(target_os = "linux", target_os = "android"))]
use tokio::sync::Mutex;

use crate::config::Config;
#[cfg(any(target_os = "linux", target_os = "android"))]
use crate::event::action::ActionExecutor;
#[cfg(any(target_os = "linux", target_os = "android"))]
use crate::event::state_machine::StateMachine;
#[cfg(any(target_os = "linux", target_os = "android"))]
use crate::hardware::uinput::UinputHandler;
use crate::webui::learn::LearnState;

pub struct EventProcessor {
    config: Arc<RwLock<Config>>,
    config_path: PathBuf,
    device_path: PathBuf,
    debug_mode: bool,
    learn_state: Arc<StdMutex<LearnState>>,
}

impl EventProcessor {
    pub async fn new(
        config: Arc<RwLock<Config>>,
        config_path: PathBuf,
        device_path: PathBuf,
        debug: bool,
        learn_state: Arc<StdMutex<LearnState>>,
    ) -> Result<Self> {
        Ok(Self {
            config,
            config_path,
            device_path,
            debug_mode: debug,
            learn_state,
        })
    }

    pub async fn run(&mut self) -> Result<()> {
        info!("Starting Event Processor on {:?}", self.device_path);

        #[cfg(any(target_os = "linux", target_os = "android"))]
        {
            use evdev::{Device, InputEventKind, Synchronization};
            use futures::stream::StreamExt;

            let uinput = Arc::new(Mutex::new(UinputHandler::new()?));

            let (rules, settings, hw_map) = {
                let cfg = self.config.read().await;
                (cfg.rules.clone(), cfg.settings.clone(), cfg.hardware_map.clone())
            };

            let mut state_machine = StateMachine::new(
                rules,
                hw_map,
                settings.long_press_threshold_ms as u64,
                settings.short_press_threshold_ms as u64,
                settings.double_tap_interval_ms as u64,
                settings.combination_timeout_ms as u64,
            );

            let mut device = Device::open(&self.device_path)?;

            if let Err(e) = device.grab() {
                warn!("Failed to grab device: {}. Events will not be intercepted.", e);
            } else {
                info!("Device grabbed successfully.");
            }

            let mut events = device.into_event_stream()?;
            let mut tick = tokio::time::interval(Duration::from_millis(50));
            let mut config_check = tokio::time::interval(Duration::from_secs(5));

            loop {
                tokio::select! {
                    Some(ev_res) = events.next() => {
                        match ev_res {
                            Ok(event) => {
                                if self.debug_mode {
                                    debug!("Event: {:?}", event);
                                }

                                if let InputEventKind::Key(key) = event.kind() {
                                    let code = key.code();
                                    let value = event.value(); // 0=UP, 1=DOWN, 2=REPEAT

                                    {
                                        let mut learn_guard = self.learn_state.lock().unwrap();
                                        if learn_guard.consume_event(code, value) {
                                            if self.debug_mode {
                                                debug!("Learn mode consumed key event code={} value={}", code, value);
                                            }
                                            continue;
                                        }
                                    }

                                    if state_machine.is_mapped(code) {
                                        let actions = state_machine.handle_key(code, value);
                                        for action in actions {
                                            ActionExecutor::execute(
                                                &action,
                                                uinput.clone(),
                                                self.config.clone(),
                                                Some(self.config_path.clone()),
                                            )
                                            .await?;
                                        }
                                    } else {
                                        let mut dev = uinput.lock().await;
                                        dev.send_key(code, value)?;
                                        dev.sync()?;
                                    }
                                } else if event.kind() == InputEventKind::Synchronization(Synchronization::SYN_REPORT) {
                                    uinput.lock().await.sync()?;
                                }
                            }
                            Err(e) => {
                                warn!("Error reading event: {}", e);
                                break;
                            }
                        }
                    }
                    _ = tick.tick() => {
                        {
                            let mut learn_guard = self.learn_state.lock().unwrap();
                            learn_guard.refresh_timeout();
                        }

                        let actions = state_machine.tick();
                        for action in actions {
                            ActionExecutor::execute(
                                &action,
                                uinput.clone(),
                                self.config.clone(),
                                Some(self.config_path.clone()),
                            )
                            .await?;
                        }
                    }
                    _ = config_check.tick() => {
                        let (rules, settings, hw_map) = {
                            let cfg = self.config.read().await;
                            (cfg.rules.clone(), cfg.settings.clone(), cfg.hardware_map.clone())
                        };
                        state_machine.update_rules(rules, hw_map);
                        state_machine.update_settings(&settings);
                    }
                }
            }
        }

        #[cfg(not(any(target_os = "linux", target_os = "android")))]
        {
            let _ = (&self.config, &self.config_path, self.debug_mode, &self.learn_state);
            warn!("Not on Linux/Android, EventProcessor loop is disabled.");
            tokio::time::sleep(tokio::time::Duration::from_secs(3600)).await;
        }

        Ok(())
    }
}
