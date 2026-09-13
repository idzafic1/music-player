---
name: visual-regression-loop
description: >-
  Use this skill for any change to a screen's visual layout, spacing,
  thumbnails, or component structure — anything where "the code looks right"
  is not sufficient evidence that it actually renders correctly.
---

# Visual Regression Loop Skill

This skill exists because layout bugs in this codebase have repeatedly passed
build/lint and looked correct in source, only to be visibly broken on an
actual device (stretched rows, non-edge-to-edge thumbnails, overlapping
elements). Code review is not verification for this category of change.

## Core Procedures

1. **Capture a "before" screenshot** of the affected screen before making any
   change, using the emulator:
   ```bash
   export ANDROID_HOME="$HOME/Android/Sdk"
   A="$ANDROID_HOME/platform-tools/adb -s emulator-5554"
   $A exec-out screencap -p > /tmp/before-<screen-name>.png
   ```

2. **Make the smallest coherent change** for the item being worked on.

3. **Rebuild and reinstall**:
   ```bash
   cd frontend/android && ./gradlew assembleDebug --quiet
   export ANDROID_HOME="$HOME/Android/Sdk"
   "$ANDROID_HOME/platform-tools/adb" -s emulator-5554 install -r \
     app/build/outputs/apk/debug/app-debug.apk
   "$ANDROID_HOME/platform-tools/adb" -s emulator-5554 shell am force-stop com.spiki.personalmusic
   "$ANDROID_HOME/platform-tools/adb" -s emulator-5554 shell am start -n com.spiki.personalmusic/.MainActivity
   ```

4. **Capture an "after" screenshot** of the same screen, same navigation path:
   ```bash
   sleep 3
   $A exec-out screencap -p > /tmp/after-<screen-name>.png
   ```

5. **Actually look at both images** before reporting anything as done. Check
   specifically for: elements overlapping, images not filling their intended
   bounds, rows with inconsistent or unbounded height, text clipping, and
   anything the specific task was meant to fix.

6. **Check logcat for the same window** for any fatal exception introduced by
   the change:
   ```bash
   "$ANDROID_HOME/platform-tools/adb" -s emulator-5554 logcat -d -t 300 | \
     grep -E 'FATAL EXCEPTION|AndroidRuntime|com.spiki.personalmusic'
   ```

7. **Only report a visual change as complete after steps 4-6 pass.** "Built
   successfully" and "matches the code in the doc" are necessary but not
   sufficient — the screenshot is the actual evidence.
