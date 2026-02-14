use anyhow::{Context, Result};
use clap::Parser;
use log::{error, info, warn};
use std::path::PathBuf;
use std::sync::Arc;
use parking_lot::Mutex;
use tokio::sync::RwLock;

mod config;
mod event;
mod hardware;
mod utils;
mod webui;

use config::Config;
use event::EventProcessor;
use hardware::InputDeviceManager;
use webui::app_cache::AppCache;
use webui::learn::LearnState;
use webui::WebServer;

#[derive(Parser, Debug)]
#[command(
    name = "Keymapper",
    version = "0.5.0",
    about = "System-level key remapping daemon for Android"
)]
struct Args {
    /// Config file path
    #[arg(
        short,
        long,
        default_value = "/data/adb/modules/rust_keymapper/config/config.yaml"
    )]
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

    env_logger::Builder::new()
        .parse_filters(&args.log_level)
        .init();

    info!("Keymapper Daemon v0.5.0 Starting");
    info!("Config file: {:?}", args.config);

    let config = if args.config.exists() {
        Config::load_from_file(&args.config)
            .with_context(|| format!("Failed to load config from {:?}", args.config))?
    } else {
        warn!("Config file not found, using default");
        Config::default()
    };

    if let Err(e) = config.validate() {
        error!("Config validation failed: {}", e);
        return Err(e);
    }

    let config = Arc::new(RwLock::new(config));
    let learn_state = Arc::new(Mutex::new(LearnState::default()));
    let app_cache = Arc::new(tokio::sync::RwLock::new(AppCache::new()));

    let device_path = if let Some(path) = args.device {
        path
    } else {
        let cfg = config.read().await;
        let target_name = &cfg.device_name;
        if target_name.is_empty() {
            warn!("No device_name configured. Listing all devices:");
            let devices = InputDeviceManager::enumerate_all_devices().await?;
            for (path, name, _) in devices {
                info!("Device: {} ({:?})", name, path);
            }
            anyhow::bail!("Please configure 'device_name' in config.yaml");
        }

        info!("Looking for device: {}", target_name);
        InputDeviceManager::find_device_path(target_name).await?
    };

    info!("Target input device: {:?}", device_path);

    let config_for_web = config.clone();
    let web_config_path = args.config.clone();
    let web_port = args.webui_port;
    let learn_state_for_web = learn_state.clone();
    let app_cache_for_web = app_cache.clone();
    tokio::spawn(async move {
        if let Err(e) = WebServer::run(
            config_for_web,
            web_config_path,
            web_port,
            learn_state_for_web,
            app_cache_for_web,
        )
        .await
        {
            error!("WebUI server failed: {}", e);
        }
    });

    let debug_mode = args.log_level.eq_ignore_ascii_case("debug")
        || args.log_level.eq_ignore_ascii_case("trace");
    let mut processor = EventProcessor::new(
        config.clone(),
        args.config.clone(),
        device_path,
        debug_mode,
        learn_state,
    )
    .await?;

    match processor.run().await {
        Ok(_) => info!("Event processor terminated normally"),
        Err(e) => {
            error!("Event processor crashed: {}", e);
            return Err(e);
        }
    }

    Ok(())
}
