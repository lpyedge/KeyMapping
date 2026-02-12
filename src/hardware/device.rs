use anyhow::{Result, bail};
use evdev::{Device, InputEvent};
use std::path::{Path, PathBuf};
use log::{info, debug};
use std::fs;

pub struct InputDeviceManager;

impl InputDeviceManager {
    /// Enumerate all input devices
    pub async fn enumerate_all_devices() -> Result<Vec<(PathBuf, String, String)>> {
        let mut devices = Vec::new();
        let input_dir = Path::new("/dev/input");
        
        if !input_dir.exists() {
            // For non-Linux/Android environments (dev/test), return empty or mock
            #[cfg(not(target_os = "linux"))]
            {
                debug!("Not on Linux, returning mock devices");
                return Ok(vec![]);
            }
            #[cfg(target_os = "linux")]
            bail!("/dev/input directory not found");
        }

        for entry in fs::read_dir(input_dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if let Some(fname) = path.file_name().and_then(|n| n.to_str()) {
                if fname.starts_with("event") {
                    match Device::open(&path) {
                        Ok(device) => {
                            let name = device.name().unwrap_or("Unknown").to_string();
                            // Attempt to get unique ID or physical path if available
                            let phys = device.physical_path().unwrap_or("Unknown").to_string();
                            devices.push((path, name, phys));
                        },
                        Err(e) => debug!("Failed to open device {:?}: {}", path, e),
                    }
                }
            }
        }

        Ok(devices)
    }

    /// Find device path by name
    pub async fn find_device_path(target_name: &str) -> Result<PathBuf> {
        let devices = Self::enumerate_all_devices().await?;
        
        for (path, name, _) in devices {
            if name == target_name {
                info!("Found device '{}' at {:?}", name, path);
                return Ok(path);
            }
        }
        
        bail!("Device '{}' not found", target_name)
    }
}
