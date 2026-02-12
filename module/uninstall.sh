#!/system/bin/sh
MODDIR=${0%/*}

# Kill the daemon if running
pkill -f keymapper_d

# Clean up any leftover files if needed
rm -f /data/adb/modules/rust_keymapper/keymapper.log
