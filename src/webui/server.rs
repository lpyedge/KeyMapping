use anyhow::Result;
use axum::{
    routing::{get, post},
    Router,
};
use crate::config::Config;
use crate::webui::learn::LearnState;
use log::info;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::RwLock;
use tower_http::services::ServeDir;

pub struct WebServer;
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<RwLock<Config>>,
    pub config_path: Arc<PathBuf>,
    pub learn_state: Arc<Mutex<LearnState>>,
}

impl WebServer {
    pub async fn run(
        config: Arc<RwLock<Config>>, 
        config_path: PathBuf, 
        port: u16,
        learn_state: Arc<Mutex<LearnState>>
    ) -> Result<()> {
        let state = AppState {
            config,
            config_path: Arc::new(config_path),
            learn_state,
        };

        let app = Router::new()
            .route("/api/config", get(super::handlers::get_config).post(super::handlers::save_config))
            .route("/api/apps", get(super::handlers::list_apps))
            .route("/api/system/learn-start", post(super::handlers::start_learning))
            .route("/api/system/learn-result", get(super::handlers::get_learn_result))
            .nest_service("/", ServeDir::new("webroot"))
            .with_state(state);

        let addr = SocketAddr::from(([0, 0, 0, 0], port));
        info!("WebUI listening on {}", addr);
        
        // hyper::server::Server::bind(&addr) // Axum 0.7 uses serve
        let listener = tokio::net::TcpListener::bind(addr).await?;
        axum::serve(listener, app).await?;

        Ok(())
    }
}
