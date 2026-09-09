---
name: android-build-installer
description: >-
  Use this skill when building, configuring, or installing the native Android app
  version of the music player onto an emulator or physical device.
---

# Android Build & Installer Skill

This skill guides the agent in configuring native permissions, running the build pipeline, and installing the APK to an Android device.

## Core Procedures

1. **Configure Native Permissions**:
   - Open `frontend/app.json`.
   - Verify that `android.permissions` includes:
     - `android.permission.INTERNET`
     - `android.permission.FOREGROUND_SERVICE`
     - `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK`
     - `android.permission.WAKE_LOCK`
     - `android.permission.POST_NOTIFICATIONS`
   - Ensure `usesCleartextTraffic: true` is configured for LAN HTTP streaming.

2. **Run the Installer Script**:
   - Execute the project installer script:
     ```bash
     ./scripts/install-android.sh
     ```
   - Or manually compile debug APK:
     ```bash
     cd frontend
     npx expo prebuild --platform android --clean
     cd android && ./gradlew assembleDebug
     ```

3. **Install & Launch via ADB**:
   - Check device connection: `adb devices`
   - Install APK: `adb install -r frontend/android/app/build/outputs/apk/debug/app-debug.apk`
   - Launch app: `adb shell am start -n com.spiki.personalmusic/.MainActivity`
