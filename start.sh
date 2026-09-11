#!/usr/bin/env bash

# NOTE: intentionally no "set -e" — we handle errors manually so adb failures
# don't abort the script mid-boot-wait.

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
EMULATOR_BIN="$ANDROID_SDK/emulator/emulator"
ADB_BIN="$ANDROID_SDK/platform-tools/adb"
AVD_NAME="personal_music_api36"

echo "==============================================="
echo "🎵  Starting Personal Music Player Environment"
echo "==============================================="

# ── 1. Cleanup ───────────────────────────────────────────────────────────────
echo "--> Cleaning up old servers and freeing ports (8081, 8082, 3001)..."
fuser -k -9 8081/tcp 8082/tcp 3001/tcp 3000/tcp 2>/dev/null || true
pkill -9 -f "expo start"  2>/dev/null || true
pkill -9 -f "tsx watch"   2>/dev/null || true
# Kill any leftover emulator / qemu processes so we don't hit the
# "multiple emulators with the same AVD" fatal error on next launch
pkill -9 -f "avd $AVD_NAME"     2>/dev/null || true
pkill -9 -f "qemu-system-x86_64" 2>/dev/null || true
sleep 2
# Remove stale AVD lock files/directories left by killed emulator processes
rm -rf "$HOME/.android/avd/${AVD_NAME}.avd/"*.lock 2>/dev/null || true
rm -rf /run/user/1000/avd/running/ 2>/dev/null || true

# ── 2. Backend ───────────────────────────────────────────────────────────────
echo "--> Starting fresh backend service on port 3001..."
cd "$PROJECT_ROOT/backend"
npm run dev > /tmp/music_backend.log 2>&1 &
BACKEND_PID=$!
echo "    Backend started (PID: $BACKEND_PID, logs: /tmp/music_backend.log)."

# Wait up to 8 seconds for backend to come up
for i in {1..8}; do
  sleep 1
  if curl -sf http://127.0.0.1:3001/api/health > /dev/null 2>&1 || curl -sf http://127.0.0.1:3001/health > /dev/null 2>&1; then
    echo "    Backend health check PASSED!"
    break
  fi
  if [ "$i" = "8" ]; then
    echo "    Backend still initializing (check /tmp/music_backend.log if needed)."
  fi
done

# ── 3. Emulator ──────────────────────────────────────────────────────────────
echo "--> Checking Android emulator..."
"$ADB_BIN" start-server > /dev/null 2>&1 || true

# Check if an emulator is already running and fully booted
ACTIVE_DEV=""
CANDIDATE=$("$ADB_BIN" devices 2>/dev/null | grep "emulator-" | head -n1 | awk '{print $1}')
if [ -n "$CANDIDATE" ]; then
  BOOT=$("$ADB_BIN" -s "$CANDIDATE" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
  if [ "$BOOT" = "1" ]; then
    ACTIVE_DEV="$CANDIDATE"
    echo "    Found running emulator: $ACTIVE_DEV"
  fi
fi

if [ -z "$ACTIVE_DEV" ]; then
  echo "    Starting emulator '$AVD_NAME'..."
  "$EMULATOR_BIN" -avd "$AVD_NAME" > /tmp/music_emulator.log 2>&1 &

  echo "    Waiting for emulator to boot (up to 120 s)..."
  BOOTED=0
  for i in {1..60}; do
    sleep 2
    # Refresh device list each iteration
    CANDIDATE=$("$ADB_BIN" devices 2>/dev/null | grep "emulator-" | head -n1 | awk '{print $1}')
    if [ -z "$CANDIDATE" ]; then
      "$ADB_BIN" connect 127.0.0.1:5555 > /dev/null 2>&1 || true
      CANDIDATE=$("$ADB_BIN" devices 2>/dev/null | grep "emulator-" | head -n1 | awk '{print $1}')
    fi
    if [ -n "$CANDIDATE" ]; then
      BOOT=$("$ADB_BIN" -s "$CANDIDATE" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
      if [ "$BOOT" = "1" ]; then
        ACTIVE_DEV="$CANDIDATE"
        BOOTED=1
        echo "    Emulator $ACTIVE_DEV booted successfully!"
        break
      fi
    fi
  done

  if [ "$BOOTED" = "0" ]; then
    echo "    ERROR: Emulator did not boot within 120 s."
    echo "    Check /tmp/music_emulator.log for details."
    echo "    You can still start Metro manually with: cd frontend && npx expo start --dev-client"
    exit 1
  fi
fi

# ── 4. Install APK if needed & launch app ───────────────────────────────────
echo "--> Launching Standalone App on $ACTIVE_DEV..."
cd "$PROJECT_ROOT/frontend"

INSTALLED=$("$ADB_BIN" -s "$ACTIVE_DEV" shell pm list packages 2>/dev/null | grep "com.spiki.personalmusic" || true)
if [ -z "$INSTALLED" ]; then
  APK_PATH="$PROJECT_ROOT/frontend/android/app/build/outputs/apk/debug/app-debug.apk"
  if [ -f "$APK_PATH" ]; then
    echo "    Installing native debug APK onto emulator..."
    "$ADB_BIN" -s "$ACTIVE_DEV" install -r "$APK_PATH"
  else
    echo "    APK not found at $APK_PATH — skipping install."
    echo "    If this is the first run, build first: cd frontend/android && ./gradlew assembleDebug"
  fi
fi

# Launch the standalone activity (ignore failure — Metro will open it via dev-client)
"$ADB_BIN" -s "$ACTIVE_DEV" shell am start -n com.spiki.personalmusic/.MainActivity > /dev/null 2>&1 || true

# ── 5. Metro ─────────────────────────────────────────────────────────────────
echo "--> Starting Expo Metro dev server (dev-client mode, port 8081)..."
echo "==============================================="
echo " App: com.spiki.personalmusic on $ACTIVE_DEV"
echo " Press 'a' in Metro terminal to re-open on Android."
echo " Press Ctrl+C anytime to stop everything."
echo "==============================================="

npx expo start --dev-client --clear
