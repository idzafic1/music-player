#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$PROJECT_ROOT/frontend/android"

KNOWN_SDK_DIRS=(
  "/usr/lib/sdk"
  "/opt/android-sdk"
  "/usr/local/android-sdk"
  "/usr/lib/android-sdk"
  "$HOME/Android/Sdk"
)

SDK_DIR=""
for dir in "${KNOWN_SDK_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    if [ -d "$dir/platforms" ] || [ -d "$dir/cmdline-tools" ] || [ -d "$dir/build-tools" ]; then
      SDK_DIR="$dir"
      break
    fi
  fi
done

if [ -z "$SDK_DIR" ]; then
  echo "Android SDK not found in the usual locations."
  if command -v dnf >/dev/null 2>&1; then
    echo "Attempting Fedora package install for Android tools..."
    sudo dnf install -y android-tools || true
  elif command -v apt-get >/dev/null 2>&1; then
    echo "Attempting Debian package install for Android tools..."
    sudo apt-get update
    sudo apt-get install -y android-sdk-platform-tools-common android-sdk || true
  fi

  for dir in "${KNOWN_SDK_DIRS[@]}"; do
    if [ -d "$dir" ]; then
      if [ -d "$dir/platforms" ] || [ -d "$dir/cmdline-tools" ] || [ -d "$dir/build-tools" ]; then
        SDK_DIR="$dir"
        break
      fi
    fi
  done
fi

if [ -z "$SDK_DIR" ]; then
  echo "Still no valid Android SDK was found."
  echo "Install Android SDK command-line tools or Android Studio, then rerun this script."
  echo "Typical Fedora command:"
  echo "  sudo dnf install -y android-tools"
  echo "Typical Android command-line tools setup:"
  echo "  mkdir -p ~/Android/Sdk"
  echo "  unzip commandlinetools-linux-*.zip -d ~/Android/Sdk"
  echo "  ~/Android/Sdk/cmdline-tools/latest/bin/sdkmanager --install \"platform-tools\" \"platforms;android-36\" \"build-tools;36.0.0\" \"ndk;27.1.12297006\""
  exit 1
fi

mkdir -p "$ANDROID_DIR"
printf 'sdk.dir=%s\n' "$SDK_DIR" > "$ANDROID_DIR/local.properties"

export ANDROID_HOME="$SDK_DIR"
export ANDROID_SDK_ROOT="$SDK_DIR"
export PATH="$SDK_DIR/platform-tools:$PATH"

echo "Android SDK resolved to: $SDK_DIR"
echo "local.properties written to: $ANDROID_DIR/local.properties"

echo ""
echo "You can now run:"
echo "  cd $ANDROID_DIR && ./gradlew assembleDebug"
echo "  adb devices"

echo "  adb install -r $ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
