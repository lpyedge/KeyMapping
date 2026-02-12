use anyhow::Result;
use std::sync::Arc;
use tokio::sync::{RwLock, Mutex};
use std::path::PathBuf;
use crate::config::Config;
use crate::event::state_machine::StateMachine;
use crate::event::action::ActionExecutor;
use crate::hardware::uinput::UinputHandler;
use log::{info, warn, debug, error};
use std::time::Duration;

pub struct EventProcessor {
    config: Arc<RwLock<Config>>,
    device_path: PathBuf,
    debug_mode: bool,
}

impl EventProcessor {
    pub async fn new(
        config: Arc<RwLock<Config>>,
        device_path: PathBuf,
        debug: bool,
    ) -> Result<Self> {
        Ok(Self {
            config,
            device_path,
            debug_mode: debug,
        })
    }

    pub async fn run(&mut self) -> Result<()> {
        info!("Starting Event Processor on {:?}", self.device_path);

        // Initialize Uinput
        let uinput = Arc::new(Mutex::new(UinputHandler::new()?));

        // Initialize StateMachine
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

        #[cfg(target_os = "linux")]
        {
            use evdev::{Device, InputEvent, InputEventKind};
            use futures::stream::StreamExt;
            
            let mut device = Device::open(&self.device_path)?;
            
            // Grab the device to intercept events
            if let Err(e) = device.grab() {
                warn!("Failed to grab device: {}. Events will not be intercepted.", e);
            } else {
                info!("Device grabbed successfully.");
            }

            let mut events = device.into_event_stream()?;
            let mut tick = tokio::time::interval(Duration::from_millis(50));
            // Check for config refresh every 5 seconds
            let mut config_check = tokio::time::interval(Duration::from_secs(5));
            
            // To detect changes, we might need a version number or hash. 
            // For now, let's just re-create StateMachine if we suspect changes?
            // Expensive.
            // Better: use a notify channel. But `save_config` is in another module.
            // Let's implement a simple version check if Config has it, or just rely on reboot for now?
            // User requirement: "WebUI保存结果可能不会被守护进程使用".
            // Since we use Arc<RwLock<Config>>, the in-memory config IS shared.
            // The issue is StateMachine HAS A COPY.
            // We should re-create StateMachine periodically or on event.
            // Let's re-create on each tick? No, too slow.
            // Let's check a "version" atomic in Config? Config doesn't have it.
            // I'll make StateMachine take a REFERENCE to rules? No, lifetime hell.
            
            // Final decision: Re-create StateMachine every 1s for this fix to ensure consistency without channel overhead complexity
            // (or when a special event happens). 
            // Actually, let's just do it on config_check tick.
            
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

                                    if state_machine.is_mapped(code) {
                                        // Process mapped key
                                        let actions = state_machine.handle_key(code, value);
                                        for action in actions {
                                            ActionExecutor::execute(&action, uinput.clone(), self.config.clone()).await?;
                                        }
                                    } else {
                                        // Pass through unmapped key
                                        uinput.lock().await.send_key(code, value)?;
                                        uinput.lock().await.sync()?;
                                    }
                                } else {
                                     if event.kind() == InputEventKind::Synchronization(evdev::Synchronization::SYN_REPORT) {
                                        uinput.lock().await.sync()?;
                                     }
                                }
                            }
                            Err(e) => {
                                warn!("Error reading event: {}", e);
                                break;
                            }
                        }
                    }
                    _ = tick.tick() => {
                        let actions = state_machine.tick();
                        for action in actions {
                            ActionExecutor::execute(&action, uinput.clone(), self.config.clone()).await?;
                        }
                    }
                    _ = config_check.tick() => {
                        // Refresh StateMachine rules from Config (in case of WebUI update or ToggleRule)
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

        #[cfg(not(target_os = "linux"))]
        {
            warn!("Not on Linux, EventProcessor loop is disabled.");
            tokio::time::sleep(tokio::time::Duration::from_secs(3600)).await;
        }

        Ok(())
    }
}
