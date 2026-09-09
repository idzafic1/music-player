# Android Mobile Deployment & Native Setup

This document specifies the exact steps, permissions, and automated scripts to build, bundle, and install the personal music player on Android devices as a native app with full background playback support.

---

## 1. Native Permissions & Configuration

In `frontend/app.json`, configure the Android manifest properties required for background audio playback and network streaming:

```json
{
  "expo": {
    "name": "Personal Music",
    "slug": "personal-music",
    "version": "1.0.0",
    "android": {
      "package": "com.spiki.personalmusic",
      "permissions": [
        "android.permission.INTERNET",
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
        "android.permission.WAKE_LOCK",
        "android.permission.POST_NOTIFICATIONS"
      ]
    },
    "plugins": [
      [
        "expo-build-properties",
        {
          "android": {
            "usesCleartextTraffic": true
          }
        }
      ]
    ]
  }
}
```

- `usesCleartextTraffic: true`: Allows the app to connect to LAN IP HTTP backends (e.g. `http://192.168.1.50:3001`) without needing local SSL certificates.
- `FOREGROUND_SERVICE_MEDIA_PLAYBACK`: Required on Android 14+ for background audio playback without getting killed by the OS.

---

## 2. Background Audio & Lock Screen Controls

### Implementation Options
1. **`react-native-track-player`**:
   Provides Android `MediaSessionCompat` integration:
   - Persistent notification in Android notification drawer with artwork, title, artist, seek bar, play/pause, prev/next.
   - Lock screen media widget.
   - Bluetooth headset button controls.
2. **`expo-av` with Background Audio Mode**:
   Alternative lightweight option:
   ```typescript
   import { Audio } from 'expo-av';
   await Audio.setAudioModeAsync({
     staysActiveInBackground: true,
     playsInSilentModeIOS: true,
     shouldDuckAndroid: true,
     playThroughEarpieceAndroid: false
   });
   ```

---

## 3. Automated Build & Installation Workflow

### Prerequisites
- Node.js & npm (installed)
- Android SDK & Platform Tools (`adb`)
- Java JDK 17+
- Either an Android emulator running or a physical device connected via USB with Developer Mode & USB Debugging enabled.

### Build Modes
1. **Local Prebuild & Gradle APK**:
   ```bash
   cd frontend
   npx expo prebuild --platform android --clean
   cd android && ./gradlew assembleDebug
   ```
   Outputs: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`
2. **One-Step ADB Installation**:
   ```bash
   adb devices
   adb install -r frontend/android/app/build/outputs/apk/debug/app-debug.apk
   ```
3. **EAS Local Build** (Alternative):
   ```bash
   npx eas-cli build --platform android --profile preview --local
   ```
