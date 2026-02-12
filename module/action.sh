#!/system/bin/sh

PORT=8888
URL="http://127.0.0.1:${PORT}"

# Open the local WebUI served by keymapper_d.
if command -v am >/dev/null 2>&1; then
  am start -a android.intent.action.VIEW -d "${URL}" >/dev/null 2>&1
fi

echo "${URL}"
