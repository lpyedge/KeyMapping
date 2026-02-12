use anyhow::{Result, Context};
use evdev::{
    uinput::VirtualDevice,
    uinput::VirtualDeviceBuilder,
    AttributeSet,
    Key,
};
use log::info;

pub struct UinputHandler {
    device: VirtualDevice,
}

impl UinputHandler {
    pub fn new() -> Result<Self> {
        let mut keys = AttributeSet::<Key>::new();
        // Register common Android keys
        keys.insert(Key::KEY_POWER);
        keys.insert(Key::KEY_VOLUMEUP);
        keys.insert(Key::KEY_VOLUMEDOWN);
        keys.insert(Key::KEY_CAMERA);
        keys.insert(Key::KEY_BACK);
        keys.insert(Key::KEY_HOMEPAGE);
        keys.insert(Key::KEY_MENU);
        
        // Add more keys as needed or iterate 0..255
        for i in 0..255 {
             keys.insert(Key::new(i));
        }

        let device = VirtualDeviceBuilder::new()
            .name("Rust Keymapper Virtual Device")
            .with_keys(&keys)
            .build()
            .context("Failed to create uinput device")?;

        info!("Virtual uinput device created");
        Ok(Self { device })
    }

    pub fn send_key(&mut self, key_code: u16, value: i32) -> Result<()> {
        let key = Key::new(key_code);
        let event = evdev::InputEvent::new(evdev::EventType::KEY, key.code(), value);
        self.device.emit(&[event])?;
        Ok(())
    }
    
    pub fn sync(&mut self) -> Result<()> {
        // evdev emit might already sync, but explicit sync if needed
        // self.device.emit(&[evdev::InputEvent::new(evdev::EventType::SYNCHRONIZATION, 0, 0)])?;
        Ok(())
    }
}
