use anyhow::{bail, Result};
use log::info;
use std::collections::HashMap;
use tokio::process::Command;

/// Cache for installed app package names and their display labels.
/// Pre-warmed at startup, then incrementally updated on each API call.
pub struct AppCache {
    /// package_name -> display_label
    cache: HashMap<String, String>,
}

use std::sync::Arc;
use tokio::sync::RwLock;

impl AppCache {
    pub fn new() -> Self {
        Self {
            cache: HashMap::new(),
        }
    }

    /// Get the cached app list as a sorted Vec.
    pub fn get_apps(&self) -> Vec<(String, String)> {
        let mut apps: Vec<(String, String)> = self
            .cache
            .iter()
            .map(|(pkg, name)| (pkg.clone(), name.clone()))
            .collect();
        apps.sort_by(|a, b| a.0.cmp(&b.0));
        apps
    }
}

/// Refresh the cache: fetch current package list, resolve labels only for
/// newly installed apps, and remove uninstalled apps from cache.
///
/// This function is optimized to minimize the duration of the write lock.
/// It performs the slow `pm dump` operations concurrently using `futures::stream`.
pub async fn update_app_cache(cache_arc: &Arc<RwLock<AppCache>>) -> Result<()> {
    use futures::StreamExt;

    // 1. Fetch current package list (IO, no lock)
    let current_packages = list_packages().await?;
    let current_set: std::collections::HashSet<_> = current_packages.iter().cloned().collect();

    // 2. Identify new packages (Read lock)
    let new_packages: Vec<String> = {
        let cache = cache_arc.read().await;
        current_packages
            .iter()
            .filter(|pkg| !cache.cache.contains_key(*pkg))
            .cloned()
            .collect()
    };

    // 3. Fetch labels for new packages (IO, no lock, parallel)
    let mut new_entries = Vec::new();
    if !new_packages.is_empty() {
        info!(
            "AppCache: fetching labels for {} new package(s)",
            new_packages.len()
        );

        // Limit concurrency to 10 to avoid overwhelming the system
        let mut stream = futures::stream::iter(new_packages)
            .map(|pkg| async move {
                let label = fetch_app_label(&pkg).await.unwrap_or_else(|| pkg.clone());
                (pkg, label)
            })
            .buffer_unordered(10);

        while let Some((pkg, label)) = stream.next().await {
            new_entries.push((pkg, label));
        }
    }

    // 4. Update cache (Write lock)
    {
        let mut cache = cache_arc.write().await;
        for (pkg, label) in new_entries {
            cache.cache.insert(pkg, label);
        }
        // Remove uninstalled
        cache.cache.retain(|pkg, _| current_set.contains(pkg));
        info!("AppCache: updated, total {} apps", cache.cache.len());
    }

    Ok(())
}

/// Run `pm list packages` and return a deduplicated list of package names.
async fn list_packages() -> Result<Vec<String>> {
    let output = Command::new("sh")
        .arg("-c")
        .arg("pm list packages 2>/dev/null")
        .output()
        .await?;

    if !output.status.success() {
        bail!(
            "pm list packages failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    let mut packages: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| line.strip_prefix("package:"))
        .map(|s| s.trim().to_string())
        .filter(|pkg| !pkg.is_empty())
        .collect();

    packages.sort();
    packages.dedup();
    Ok(packages)
}

/// Fetch the display label for a single package via `pm dump`.
async fn fetch_app_label(package: &str) -> Option<String> {
    let output = Command::new("pm")
        .arg("dump")
        .arg(package)
        .output()
        .await
        .ok()?;

    if !output.status.success() {
        return None;
    }

    for raw_line in String::from_utf8_lossy(&output.stdout).lines() {
        let line = raw_line.trim();
        if !line.starts_with("application-label") {
            continue;
        }
        let (_, value) = line.split_once(':')?;
        let label = value.trim().trim_matches('\'').trim();
        if !label.is_empty() {
            return Some(label.to_string());
        }
    }
    None
}
