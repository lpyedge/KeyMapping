use super::Config;
use anyhow::Result;
use std::path::Path;

impl Config {
    pub fn load_from_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path = path.as_ref();
        ensure_yaml_path(path)?;
        let content = std::fs::read_to_string(path)?;
        let config: Config = serde_yaml::from_str(&content)?;
        Ok(config)
    }

    #[allow(dead_code)]
    pub fn save_to_file<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        let path = path.as_ref();
        ensure_yaml_path(path)?;
        let content = serde_yaml::to_string(self)?;
        let tmp = path.with_extension("yaml.tmp");
        std::fs::write(&tmp, &content)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }

    pub async fn save_to_file_async<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        let path = path.as_ref();
        ensure_yaml_path(path)?;
        let content = serde_yaml::to_string(self)?;
        let tmp = path.with_extension("yaml.tmp");
        tokio::fs::write(&tmp, &content).await?;
        tokio::fs::rename(&tmp, path).await?;
        Ok(())
    }
}

fn ensure_yaml_path(path: &Path) -> Result<()> {
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase());

    match ext.as_deref() {
        Some("yaml") | Some("yml") => Ok(()),
        _ => anyhow::bail!(
            "config file must use .yaml or .yml extension: {}",
            path.display()
        ),
    }
}

#[cfg(test)]
mod tests {
    use crate::config::Config;

    #[test]
    fn load_from_file_should_reject_non_yaml_extension() {
        let err = Config::load_from_file("config.json").unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains(".yaml or .yml"), "unexpected error: {}", msg);
    }

    #[test]
    fn save_to_file_should_reject_non_yaml_extension() {
        let cfg = Config::default();
        let err = cfg.save_to_file("config.json").unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains(".yaml or .yml"), "unexpected error: {}", msg);
    }
}
