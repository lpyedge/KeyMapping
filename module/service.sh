#!/system/bin/sh
MODDIR=${0%/*}
BIN=$MODDIR/keymapper_d

# Wait for boot to complete
while [ "$(getprop sys.boot_completed)" != "1" ]; do
  sleep 1
done

# Start the daemon
cd $MODDIR
# Use config.yaml if exists, else config.default.yaml (handle copying in install or here?)
# Simplest: Just use config.yaml. The install script should copy default to config.yaml if not exists.
# But for now, let's assume config.yaml is the active one.
if [ ! -f "config/config.yaml" ]; then
    cp config/config.default.yaml config/config.yaml
fi
nohup ./keymapper_d --config config/config.yaml > keymapper.log 2>&1 &
