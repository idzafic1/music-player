#!/usr/bin/env bash

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
EMULATOR_BIN="$ANDROID_SDK/emulator/emulator"
ADB_BIN="$ANDROID_SDK/platform-tools/adb"
AVD_NAME="personal_music_api36"

echo "==============================================="
echo "🎵  Starting Personal Music Player Environment"
echo "==============================================="

# 1. Clean up old processes and free occupied ports
echo "--> Cleaning up old servers and freeing ports (8081, 8082, 3001)..."

# Kill anything listening on Metro (8081, 8082) or Backend (3001, 3000)
fuser -k -9 8081/tcp 8082/tcp 3001/tcp 3000/tcp 2>/dev/null || true

# Kill any lingering node processes for Metro / TSX watch
pkill -9 -f "expo start" 2>/dev/null || true
pkill -9 -f "tsx watch" 2>/dev/null || true

# Give OS a brief moment to release sockets
sleep 1

# 2. Start Fresh Backend
echo "--> Starting fresh backend service on port 3001..."
cd "$PROJECT_ROOT/backend"
npm run dev > /tmp/music_backend.log 2>&1 &
BACKEND_PID=$!
echo "    Backend started (PID: $BACKEND_PID, logs: /tmp/music_backend.log)."

# Wait briefly to confirm backend status
sleep 2
if curl -s http://127.0.0.1:3001/health > /dev/null 2>&1; then
  echo "    Backend health check PASSED!"
else
  echo "    Backend initializing..."
fi

# 3. Check / Start Emulator
echo "--> Checking Android emulator..."
"$ADB_BIN" start-server > /dev/null 2>&1 || true

ACTIVE_DEV=$("$ADB_BIN" devices | grep "emulator-" | head -n 1 | awk '{print $1}' || true)

if [ -n "$ACTIVE_DEV" ]; then
  echo "    Found running emulator: $ACTIVE_DEV"
else
  echo "    Starting emulator '$AVD_NAME'..."
  "$EMULATOR_BIN" -avd "$AVD_NAME" > /tmp/music_emulator.log 2>&1 &
  
  echo "    Waiting for emulator to boot up..."
  for i in {1..60}; do
    ACTIVE_DEV=$("$ADB_BIN" devices | grep "emulator-" | head -n 1 | awk '{print $1}' || true)
    if [ -n "$ACTIVE_DEV" ]; then
      BOOT_STATUS=$("$ADB_BIN" -s "$ACTIVE_DEV" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
      if [ "$BOOT_STATUS" = "1" ]; then
        echo "    Emulator $ACTIVE_DEV booted successfully!"
        break
      fi
    fi
    sleep 2
  done
fi

# 4. Launch App on Emulator & Start Metro
echo "--> Launching App on $ACTIVE_DEV..."
cd "$PROJECT_ROOT/frontend"

# Launch main activity if app is installed
if "$ADB_BIN" -s "$ACTIVE_DEV" shell pm list packages | grep -q "com.spiki.personalmusic"; then
  "$ADB_BIN" -s "$ACTIVE_DEV" shell am start -n com.spiki.personalmusic/.MainActivity > /dev/null 2>&1 || true
fi

echo "--> Starting fresh Expo Metro dev server on port 8081..."
echo "==============================================="
echo " Press 'a' in the Metro terminal to re-open on Android if needed."
echo " Press Ctrl+C anytime to stop."
echo "==============================================="

npx expo start --clear --android
