#!/system/bin/sh
MODDIR=${0%/*}
BIN=$MODDIR/keymapper_d

# Wait for boot to complete
while [ "$(getprop sys.boot_completed)" != "1" ]; do
  sleep 1
done
# Smart Wait: Wait for User 0 to unlock (CE storage available)
# This ensures users can input PIN/Pattern without daemon interference.
# If the property doesn't exist (old Android), we fall back to a fixed delay.
MAX_WAIT=60
waited=0
while [ "$(getprop sys.user.0.ce_available)" != "true" ]; do
  sleep 1
  waited=$((waited + 1))
  if [ "$waited" -ge "$MAX_WAIT" ]; then
    break # Fallback if property never sets (e.g. non-FBE device)
  fi
done

# Small buffer for Launcher to settle
sleep 3

# Start the daemon
cd $MODDIR
# Use config.yaml if exists, else config.default.yaml (handle copying in install or here?)
# Simplest: Just use config.yaml. The install script should copy default to config.yaml if not exists.
# But for now, let's assume config.yaml is the active one.
if [ ! -f "config/config.yaml" ]; then
    cp config/config.default.yaml config/config.yaml
fi
nohup ./keymapper_d --config config/config.yaml > keymapper.log 2>&1 &
