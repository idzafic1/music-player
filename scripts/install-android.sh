#!/usr/bin/env bash
set -uo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${PROJECT_ROOT}/frontend"
ANDROID_DIR="${FRONTEND_DIR}/android"

warn() {
  printf '\n[android-fix] %s\n' "$*" >&2
}

resolve_android_sdk() {
  local candidate
  for candidate in \
    "${ANDROID_HOME:-}" \
    "${ANDROID_SDK_ROOT:-}" \
    "$HOME/Android/Sdk" \
    "$HOME/Android/sdk" \
    "$HOME/android-sdk" \
    "/home/spiki/Android/Sdk" \
    "/sdcard/Android/Sdk" \
    "/opt/android-sdk" \
    "/usr/local/android-sdk" \
    "/usr/lib/android-sdk"; do
    if [ -n "$candidate" ] && [ -d "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

resolve_java_home() {
  local candidate
  local jbin

  if command -v java >/dev/null 2>&1; then
    jbin="$(command -v java)"
    candidate="${jbin%/bin/java}"
    if [ -n "$candidate" ] && [ -x "$candidate/bin/java" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  fi

  for candidate in \
    "/usr/lib/jvm/java-27" \
    "/usr/lib/jvm/java-27-openjdk" \
    "/usr/lib/jvm/java-latest-openjdk" \
    "/usr/lib/jvm/java-25" \
    "/usr/lib/jvm/java-25-openjdk" \
    "/usr/lib/jvm/java" \
    "/usr/lib/jvm/java-openjdk"; do
    if [ -n "$candidate" ] && [ -x "$candidate/bin/java" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

install_java_with_fedora_fallback() {
  if resolve_java_home >/dev/null 2>&1; then
    return 0
  fi

  warn "Java not found. Trying the Fedora-compatible JDKs..."

  if command -v sudo >/dev/null 2>&1; then
    sudo -n dnf install -y java-27-openjdk-devel || \
      sudo -n dnf install -y java-25-openjdk-devel || \
      sudo -n dnf install -y java-openjdk-devel || true
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y java-27-openjdk-devel || \
      dnf install -y java-25-openjdk-devel || \
      dnf install -y java-openjdk-devel || true
  fi

  if resolve_java_home >/dev/null 2>&1; then
    return 0
  fi

  warn "Java is still unavailable. Use one of these exact commands on Fedora:"
  warn "  sudo dnf install -y java-27-openjdk-devel"
  warn "  export JAVA_HOME=/usr/lib/jvm/java-27"
  warn "  export PATH=\"\$JAVA_HOME/bin:\$PATH\""
  return 1
}

prepare_android_tools() {
  local sdk_dir
  sdk_dir="$(resolve_android_sdk || true)"
  if [ -n "$sdk_dir" ] && [ -d "$sdk_dir" ]; then
    export ANDROID_HOME="$sdk_dir"
    export ANDROID_SDK_ROOT="$sdk_dir"
    export PATH="$sdk_dir/platform-tools:$PATH"
    return 0
  fi

  warn "Android SDK not found. The script will try to continue only if the Android SDK is already installed."
  return 1
}

write_local_properties() {
  local sdk_dir="$1"
  mkdir -p "$ANDROID_DIR"
  printf 'sdk.dir=%s\n' "$sdk_dir" > "$ANDROID_DIR/local.properties"
}

sanitize_gradle_properties() {
  local gradle_file="$ANDROID_DIR/gradle.properties"
  if [ ! -f "$gradle_file" ]; then
    return 0
  fi

  if grep -Eq '^[[:space:]]*newArchEnabled=' "$gradle_file"; then
    sed -i '/^[[:space:]]*newArchEnabled=/d' "$gradle_file"
  fi

  if ! grep -q 'newArchEnabled=' "$gradle_file"; then
    printf '\n# Compatibility setting for this Expo/React Native stack\nnewArchEnabled=false\n' >> "$gradle_file"
  fi
}

build_android_app() {
  cd "$FRONTEND_DIR"

  warn "Running Expo prebuild with a clean Android project..."
  npx expo prebuild --platform android --clean || return 1

  # Purge stale codegen/build caches from node_modules BEFORE Gradle runs.
  # This avoids the race condition where `clean` tasks try to delete files
  # while codegen tasks are simultaneously writing to the same directories.
  warn "Stopping running Gradle daemons..."
  (cd "$ANDROID_DIR" && ./gradlew --stop) 2>/dev/null || true

  warn "Purging stale native build caches..."
  rm -rf "$ANDROID_DIR/app/build" "$ANDROID_DIR/.gradle"
  find "$FRONTEND_DIR/node_modules" -maxdepth 4 -path "*/android/build" -type d -exec rm -rf {} + 2>/dev/null || true

  warn "Building the debug APK..."
  cd "$ANDROID_DIR"
  # Do NOT use `clean` here — expo prebuild --clean already gave us a fresh
  # android/ directory, and running gradle clean causes race conditions with
  # codegen tasks that operate inside node_modules/*/android/build/.
  ORG_GRADLE_PROJECT_reactNativeArchitectures=x86_64 ./gradlew assembleDebug --no-daemon || return 1
}

install_and_launch() {
  local apk_path="$1"
  if command -v adb >/dev/null 2>&1; then
    warn "Waiting for the Android device/emulator to finish booting..."
    adb wait-for-device >/dev/null 2>&1 || true

    local attempt=0
    local max_attempts=120
    while [[ "$attempt" -lt "$max_attempts" ]]; do
      if adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' | grep -q '^1$'; then
        warn "Android device is ready."
        break
      fi

      attempt=$((attempt + 1))
      sleep 5
    done

    adb install -r "$apk_path"
    adb reverse tcp:8081 tcp:8081 || true
    warn "Starting Metro in the background..."
    (cd "$FRONTEND_DIR" && nohup npx expo start --dev-client --clear >/tmp/personal-music-metro.log 2>&1 &) || true
    adb shell am start -n com.spiki.personalmusic/.MainActivity || true
    warn "Install and launch complete. Metro log: /tmp/personal-music-metro.log"
    return 0
  fi

  warn "ADB is not on PATH. APK built successfully at $apk_path"
  return 0
}

main() {
  echo "========================================================="
  echo "   Personal Music Player — self-healing Android setup    "
  echo "========================================================="

  if ! install_java_with_fedora_fallback; then
    exit 1
  fi

  JAVA_HOME="$(resolve_java_home)"
  export JAVA_HOME
  export PATH="$JAVA_HOME/bin:$PATH"

  if ! prepare_android_tools; then
    warn "Android SDK is missing. The script cannot complete without it."
    warn "If the SDK exists in another path, set ANDROID_HOME or place it under $HOME/Android/Sdk"
    exit 1
  fi

  local sdk_dir
  sdk_dir="$(resolve_android_sdk)"
  write_local_properties "$sdk_dir"
  sanitize_gradle_properties

  # Run the build — do NOT capture via $() since Gradle prints thousands of
  # lines to stdout and that would turn apk_path into a giant garbage string.
  build_android_app || {
    warn "Build failed. This usually means the Android SDK or JDK is still not valid."
    exit 1
  }

  # Locate the APK on disk after Gradle finishes.
  local apk_path
  apk_path="$(find "$ANDROID_DIR/app/build/outputs/apk/debug" -name '*.apk' -type f | head -n 1)"

  if [[ -z "$apk_path" || ! -f "$apk_path" ]]; then
    warn "ERROR: no APK found under $ANDROID_DIR/app/build/outputs/apk/debug"
    exit 1
  fi

  warn "Built APK: $apk_path"
  ls -la "$apk_path"

  install_and_launch "$apk_path"
}

main "$@"
