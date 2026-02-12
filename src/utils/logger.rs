use anyhow::Result;
use std::path::Path;
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;

const WEBUI_LOG_PATH: &str = "/data/adb/modules/rust_keymapper/logs/webui.log";

pub async fn append_webui_log(message: &str) -> Result<()> {
    let path = Path::new(WEBUI_LOG_PATH);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await?;
    let ts = timestamp();
    file.write_all(format!("[{}] {}\n", ts, message).as_bytes()).await?;
    Ok(())
}

fn timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(d) => format!("{}", d.as_secs()),
        Err(_) => "0".to_string(),
    }
}
