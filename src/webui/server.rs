use anyhow::Result;
use axum::{
    routing::get,
    Router,
};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::config::Config;
use tower_http::services::ServeDir;
use log::info;

pub struct WebServer;
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<RwLock<Config>>,
    pub config_path: Arc<PathBuf>,
}

impl WebServer {
    pub async fn run(config: Arc<RwLock<Config>>, config_path: PathBuf, port: u16) -> Result<()> {
        let state = AppState {
            config,
            config_path: Arc::new(config_path),
        };

        let app = Router::new()
            .route("/api/config", get(super::handlers::get_config).post(super::handlers::save_config))
            .route("/api/apps", get(super::handlers::list_apps))
            .with_state(state)
            .nest_service("/", ServeDir::new("webroot"));

        let addr = SocketAddr::from(([0, 0, 0, 0], port));
        info!("WebUI listening on {}", addr);
        
        // hyper::server::Server::bind(&addr) // Axum 0.7 uses serve
        let listener = tokio::net::TcpListener::bind(addr).await?;
        axum::serve(listener, app).await?;

        Ok(())
    }
}
