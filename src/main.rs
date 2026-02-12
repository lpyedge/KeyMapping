use anyhow::{Result, Context};
use clap::Parser;
use log::{info, error, warn};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

mod config;
mod event;
mod hardware;
mod safety;
mod utils;
mod webui;

use config::Config;
use event::EventProcessor;
use hardware::InputDeviceManager;
use webui::WebServer;
// use safety::ResourceGuard; // To be implemented/uncommented

#[derive(Parser, Debug)]
#[command(
    name = "Keymapper",
    version = "0.5.0",
    about = "System-level key remapping daemon for Android"
)]
struct Args {
    /// Config file path
    #[arg(short, long, default_value = "/data/adb/modules/rust_keymapper/config/config.yaml")]
    config: PathBuf,

    /// WebUI port
    #[arg(short, long, default_value = "8888")]
    webui_port: u16,

    /// Log level
    #[arg(short, long, default_value = "info")]
    log_level: String,
    
    /// Input device path (skip auto-discovery)
    #[arg(long)]
    device: Option<PathBuf>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    
    // Initialize logger (simple env_logger for now)
    std::env::set_var("RUST_LOG", &args.log_level);
    env_logger::init();

    info!("Keymapper Daemon v0.5.0 Starting");
    info!("Config file: {:?}", args.config);

    // 1. Load Config
    let config = if args.config.exists() {
        Config::load_from_file(&args.config)
            .with_context(|| format!("Failed to load config from {:?}", args.config))?
    } else {
        warn!("Config file not found, using default");
        Config::default()
    };
    
    // Validate config logic
    if let Err(e) = config.validate() {
        error!("Config validation failed: {}", e);
        return Err(e.into());
    }

    // Wrap in Arc<RwLock> for sharing
    let config = Arc::new(RwLock::new(config));

    // 2. Hardware Initialization
    let device_path = if let Some(path) = args.device {
        path
    } else {
        // Auto-discover
        let cfg = config.read().await;
        let target_name = &cfg.device_name;
        if target_name.is_empty() {
            // If no device name configured, try to find a reasonable default or fail
            // For safety, let's list devices and warn
            warn!("No device_name configured. Listing all devices:");
            let devices = InputDeviceManager::enumerate_all_devices().await?;
            for (p, n, _) in devices {
                info!("Device: {} ({:?})", n, p);
            }
            anyhow::bail!("Please configure 'device_name' in config.yaml");
        }
        
        info!("Looking for device: {}", target_name);
        InputDeviceManager::find_device_path(target_name).await?
    };
    
    info!("Target input device: {:?}", device_path);

    // 3. Start WebUI Server
    let config_for_web = config.clone();
    let web_config_path = args.config.clone();
    let web_port = args.webui_port;
    tokio::spawn(async move {
        if let Err(e) = WebServer::run(config_for_web, web_config_path, web_port).await {
            error!("WebUI server failed: {}", e);
        }
    });

    // 4. Start Event Processor (Main Loop)
    // Pass 'true' for debug if log level is debug/trace?
    let debug_mode = args.log_level.to_lowercase() == "debug" || args.log_level.to_lowercase() == "trace";
    let mut processor = EventProcessor::new(config.clone(), device_path, debug_mode).await?;
    
    match processor.run().await {
        Ok(_) => info!("Event processor terminated normally"),
        Err(e) => {
            error!("Event processor crashed: {}", e);
            return Err(e);
        }
    }

    Ok(())
}
