#!/usr/bin/env bash
set -e

echo "========================================================="
echo "   Personal Music Player — Android Native Installer     "
echo "========================================================="

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${PROJECT_DIR}/frontend"

echo "→ Checking prerequisites..."

if ! command -v adb &> /dev/null; then
  echo "⚠️  'adb' command not found in PATH."
  echo "   Please install Android Platform Tools or add it to PATH."
  echo "   On Fedora: sudo dnf install android-tools"
  echo "   On Ubuntu/Debian: sudo apt install adb"
fi

if ! command -v java &> /dev/null; then
  echo "⚠️  'java' (JDK 17+) not found. Building APK locally requires Java."
fi

# Check connected devices
echo "→ Checking for connected Android devices via adb..."
if command -v adb &> /dev/null; then
  DEVICES=$(adb devices | grep -v "List of devices" | grep "device$" || true)
  if [ -z "$DEVICES" ]; then
    echo "⚠️  No Android device/emulator detected."
    echo "   Ensure USB Debugging is enabled on your phone and plugged in,"
    echo "   or start an Android Virtual Device (AVD)."
    echo "   To connect wirelessly: adb connect <phone-ip>:5555"
  else
    echo "✅ Found connected device(s):"
    echo "$DEVICES"
  fi
fi

# Build APK options
echo ""
echo "Choose an action:"
echo "  1) Run Expo Android in development mode (npx expo run:android)"
echo "  2) Build standalone APK via Expo prebuild + Gradle"
echo "  3) Build standalone APK via EAS CLI"
echo "  4) Install existing APK from file"
echo "  5) Exit"
echo ""

read -p "Select option [1-5] (default: 1): " OPTION
OPTION=${OPTION:-1}

case $OPTION in
  1)
    echo "→ Starting Expo native Android runner..."
    cd "${FRONTEND_DIR}"
    npx expo run:android
    ;;
  2)
    echo "→ Prebuilding native Android project..."
    cd "${FRONTEND_DIR}"
    npx expo prebuild --platform android --clean
    echo "→ Compiling debug APK via Gradle..."
    cd android
    ./gradlew assembleDebug
    APK_PATH="${FRONTEND_DIR}/android/app/build/outputs/apk/debug/app-debug.apk"
    if [ -f "$APK_PATH" ]; then
      echo "✅ APK generated at: ${APK_PATH}"
      if command -v adb &> /dev/null && [ -n "$(adb devices | grep -v 'List' | grep 'device$')" ]; then
        echo "→ Installing APK to connected device..."
        adb install -r "${APK_PATH}"
        echo "→ Launching Personal Music Player..."
        adb shell am start -n com.spiki.personalmusic/.MainActivity || true
        echo "🎉 Successfully installed and launched on Android!"
      else
        echo "ℹ️  Device not ready for auto-install. Copy ${APK_PATH} to your phone to install manually."
      fi
    else
      echo "❌ Gradle build did not produce expected APK."
    fi
    ;;
  3)
    echo "→ Building via EAS local build..."
    cd "${FRONTEND_DIR}"
    npx eas-cli build --platform android --profile preview --local
    ;;
  4)
    read -p "Enter path to .apk file: " CUSTOM_APK
    if [ -f "$CUSTOM_APK" ]; then
      echo "→ Installing ${CUSTOM_APK}..."
      adb install -r "$CUSTOM_APK"
      echo "✅ Installed!"
    else
      echo "❌ File not found: ${CUSTOM_APK}"
    fi
    ;;
  *)
    echo "Exiting."
    exit 0
    ;;
esac
