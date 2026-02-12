use anyhow::{bail, Result};
use log::debug;
#[cfg(any(target_os = "linux", target_os = "android"))]
use log::info;
use std::path::PathBuf;

pub struct InputDeviceManager;

#[cfg(any(target_os = "linux", target_os = "android"))]
impl InputDeviceManager {
    /// Enumerate all input devices
    pub async fn enumerate_all_devices() -> Result<Vec<(PathBuf, String, String)>> {
        use evdev::Device;
        use std::fs;
        use std::path::Path;

        let mut devices = Vec::new();
        let input_dir = Path::new("/dev/input");

        if !input_dir.exists() {
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
                        }
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

#[cfg(not(any(target_os = "linux", target_os = "android")))]
impl InputDeviceManager {
    /// Non-Linux host build/test path: device discovery is intentionally disabled.
    pub async fn enumerate_all_devices() -> Result<Vec<(PathBuf, String, String)>> {
        debug!("Input device enumeration is disabled on non-Linux targets");
        Ok(Vec::new())
    }

    pub async fn find_device_path(target_name: &str) -> Result<PathBuf> {
        bail!(
            "Input device '{}' is unavailable on this target; run on Linux/Android for evdev",
            target_name
        )
    }
}
