use anyhow::Result;

#[cfg(any(target_os = "linux", target_os = "android"))]
use anyhow::Context;
#[cfg(any(target_os = "linux", target_os = "android"))]
use evdev::{uinput::VirtualDevice, uinput::VirtualDeviceBuilder, AttributeSet, Key};
#[cfg(not(any(target_os = "linux", target_os = "android")))]
use log::debug;
#[cfg(any(target_os = "linux", target_os = "android"))]
use log::info;

#[cfg(any(target_os = "linux", target_os = "android"))]
pub struct UinputHandler {
    device: VirtualDevice,
}

#[cfg(not(any(target_os = "linux", target_os = "android")))]
pub struct UinputHandler;

#[cfg_attr(not(any(target_os = "linux", target_os = "android")), allow(dead_code))]
impl UinputHandler {
    pub fn new() -> Result<Self> {
        #[cfg(any(target_os = "linux", target_os = "android"))]
        {
            let mut keys = AttributeSet::<Key>::new();
            // Cover Linux input keycode range (0..=767 includes all common keys)
            for i in 0..=767 {
                keys.insert(Key::new(i));
            }

            let device = VirtualDeviceBuilder::new()?
                .name("Rust Keymapper Virtual Device")
                .with_keys(&keys)
                .build()
                .context("Failed to create uinput device")?;

            info!("Virtual uinput device created");
            Ok(Self { device })
        }

        #[cfg(not(any(target_os = "linux", target_os = "android")))]
        {
            debug!("uinput is disabled on non-Linux targets");
            Ok(Self)
        }
    }

    pub fn send_key(&mut self, key_code: u16, value: i32) -> Result<()> {
        #[cfg(any(target_os = "linux", target_os = "android"))]
        {
            let key = Key::new(key_code);
            let event = evdev::InputEvent::new(evdev::EventType::KEY, key.code(), value);
            self.device.emit(&[event])?;
            Ok(())
        }

        #[cfg(not(any(target_os = "linux", target_os = "android")))]
        {
            let _ = (key_code, value);
            Ok(())
        }
    }

    pub fn sync(&mut self) -> Result<()> {
        #[cfg(any(target_os = "linux", target_os = "android"))]
        {
            use evdev::EventType;
            let syn = evdev::InputEvent::new(EventType::SYNCHRONIZATION, 0, 0);
            self.device.emit(&[syn])?;
        }
        Ok(())
    }
}
