const fs = require('fs');
const path = require('path');

// ── Patch 1: MusicModule.kt – TurboModule return-type void + nullability fixes ──
const moduleFile = path.join(__dirname, '../node_modules/react-native-track-player/android/src/main/java/com/doublesymmetry/trackplayer/module/MusicModule.kt');

if (!fs.existsSync(moduleFile)) {
  console.log('[patch-track-player] MusicModule.kt not found, skipping');
} else {
  let content = fs.readFileSync(moduleFile, 'utf8');

  // 1a. Fix Kotlin 2.x strict nullability for originalItem (first occurrence)
  if (content.includes('callback.resolve(Arguments.fromBundle(musicService.tracks[index].originalItem))')) {
    content = content.replace(
      'callback.resolve(Arguments.fromBundle(musicService.tracks[index].originalItem))',
      'val item = musicService.tracks[index].originalItem\n            callback.resolve(item?.let { Arguments.fromBundle(it) })'
    );
  }

  // 1b. Fix nullability for getCurrentTrackIndex variant
  if (content.includes('else Arguments.fromBundle(\n                musicService.tracks[musicService.getCurrentTrackIndex()].originalItem\n            )')) {
    content = content.replace(
      'else Arguments.fromBundle(\n                musicService.tracks[musicService.getCurrentTrackIndex()].originalItem\n            )',
      'else {\n                val item = musicService.tracks[musicService.getCurrentTrackIndex()].originalItem\n                item?.let { Arguments.fromBundle(it) }\n            }'
    );
  }

  // 2. Normalize multi-line `= scope.launch {` onto the same line as `fun ...`
  content = content.replace(/\s*=\s*\n\s*scope\.launch\s*\{/g, ' = scope.launch {');

  // 3. Convert expression-body `@ReactMethod fun foo(...) = scope.launch { ... }`
  // to block-body `fun foo(...) { scope.launch { ... } }` so the TurboModule interop
  // bytecode return type is `void` (Unit) instead of `Job`.
  const lines = content.split('\n');
  const newLines = [];
  let pendingReactMethod = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (line.includes('@ReactMethod')) {
      pendingReactMethod = true;
      newLines.push(line);
      continue;
    }

    if (pendingReactMethod && line.includes('= scope.launch {')) {
      const indent = line.match(/^\s*/)[0];
      const funcHeader = line.replace(' = scope.launch {', ' {');
      newLines.push(funcHeader);
      newLines.push(`${indent}    scope.launch {`);

      let depth = 1;
      i++;
      while (i < lines.length && depth > 0) {
        let currentLine = lines[i];
        for (const char of currentLine) {
          if (char === '{') depth++;
          if (char === '}') depth--;
        }
        newLines.push(currentLine);
        if (depth === 0) {
          newLines.push(`${indent}}`);
          break;
        }
        i++;
      }
      pendingReactMethod = false;
      continue;
    }

    if (line.trim().length > 0 && !line.includes('@Deprecated')) {
      pendingReactMethod = false;
    }

    newLines.push(line);
  }

  const patchedContent = newLines.join('\n');
  fs.writeFileSync(moduleFile, patchedContent, 'utf8');
  console.log('[patch-track-player] MusicModule.kt: applied TurboModule returnType void patch & nullability fixes');
}

// ── Patch 2: MusicService.kt – Guard startAndStopEmptyNotificationToAvoidANR() ──
// On Android 12+ (API 31+) calling startForeground() from the background throws
// ForegroundServiceStartNotAllowedException. The ANR-workaround in MusicService
// has no try-catch, which crashes the app on startup. We wrap the two risky lines
// in a try-catch so the service gracefully continues instead of crashing.
const serviceFile = path.join(__dirname, '../node_modules/react-native-track-player/android/src/main/java/com/doublesymmetry/trackplayer/service/MusicService.kt');

if (!fs.existsSync(serviceFile)) {
  console.log('[patch-track-player] MusicService.kt not found, skipping');
} else {
  let content = fs.readFileSync(serviceFile, 'utf8');

  const ORIGINAL_ANR_LINES =
    '        val notification = notificationBuilder.build()\n' +
    '        startForeground(EMPTY_NOTIFICATION_ID, notification)\n' +
    '        @Suppress("DEPRECATION")\n' +
    '        stopForeground(true)';

  const PATCHED_ANR_LINES =
    '        val notification = notificationBuilder.build()\n' +
    '        try {\n' +
    '            startForeground(EMPTY_NOTIFICATION_ID, notification)\n' +
    '            @Suppress("DEPRECATION")\n' +
    '            stopForeground(true)\n' +
    '        } catch (e: Exception) {\n' +
    '            // ForegroundServiceStartNotAllowedException on Android 12+ when started from background.\n' +
    '            // Safe to ignore – the real notification is posted later when the app is foregrounded.\n' +
    '            android.util.Log.w("MusicService", "startForeground in ANR workaround blocked: ${e.message}")\n' +
    '        }';

  if (content.includes(ORIGINAL_ANR_LINES)) {
    content = content.replace(ORIGINAL_ANR_LINES, PATCHED_ANR_LINES);
    console.log('[patch-track-player] MusicService.kt: wrapped startAndStopEmptyNotificationToAvoidANR() in try-catch');
  } else if (content.includes(PATCHED_ANR_LINES)) {
    console.log('[patch-track-player] MusicService.kt: ANR try-catch already applied, skipping');
  } else {
    console.log('[patch-track-player] MusicService.kt: could not find ANR startForeground block — manual check needed');
  }

  // ── Patch 2b: New Architecture emit crash ──
  // In the New Architecture, `reactNativeHost` throws RuntimeException.
  // Replace emit() and emitList() to get ReactContext from ReactHost instead.

  // Add ReactHost import if missing
  if (!content.includes('import com.facebook.react.ReactApplication')) {
    content = content.replace(
      'import com.facebook.react.HeadlessJsTaskService',
      'import com.facebook.react.HeadlessJsTaskService\nimport com.facebook.react.ReactApplication'
    );
  }

  const ORIGINAL_EMIT =
    '    @MainThread\n' +
    '    private fun emit(event: String, data: Bundle? = null) {\n' +
    '        reactNativeHost.reactInstanceManager.currentReactContext\n' +
    '            ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)\n' +
    '            ?.emit(event, data?.let { Arguments.fromBundle(it) })\n' +
    '    }';

  const PATCHED_EMIT =
    '    private fun resolveReactContext(): com.facebook.react.bridge.ReactContext? {\n' +
    '        val app = applicationContext as? ReactApplication ?: return null\n' +
    '        return try {\n' +
    '            app.reactHost?.currentReactContext\n' +
    '        } catch (_: Exception) {\n' +
    '            @Suppress("DEPRECATION")\n' +
    '            try { app.reactNativeHost.reactInstanceManager.currentReactContext } catch (_: Exception) { null }\n' +
    '        }\n' +
    '    }\n' +
    '\n' +
    '    @MainThread\n' +
    '    private fun emit(event: String, data: Bundle? = null) {\n' +
    '        resolveReactContext()\n' +
    '            ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)\n' +
    '            ?.emit(event, data?.let { Arguments.fromBundle(it) })\n' +
    '    }';

  if (content.includes(ORIGINAL_EMIT)) {
    content = content.replace(ORIGINAL_EMIT, PATCHED_EMIT);
    console.log('[patch-track-player] MusicService.kt: patched emit() for New Architecture');
  } else if (content.includes('resolveReactContext()')) {
    console.log('[patch-track-player] MusicService.kt: emit() already patched for New Architecture');
  } else {
    console.log('[patch-track-player] MusicService.kt: could not find emit() to patch — manual check needed');
  }

  const ORIGINAL_EMIT_LIST =
    '    @MainThread\n' +
    '    private fun emitList(event: String, data: List<Bundle> = emptyList()) {\n' +
    '        val payload = Arguments.createArray()\n' +
    '        data.forEach { payload.pushMap(Arguments.fromBundle(it)) }\n' +
    '\n' +
    '        reactNativeHost.reactInstanceManager.currentReactContext\n' +
    '            ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)\n' +
    '            ?.emit(event, payload)\n' +
    '    }';

  const PATCHED_EMIT_LIST =
    '    @MainThread\n' +
    '    private fun emitList(event: String, data: List<Bundle> = emptyList()) {\n' +
    '        val payload = Arguments.createArray()\n' +
    '        data.forEach { payload.pushMap(Arguments.fromBundle(it)) }\n' +
    '\n' +
    '        resolveReactContext()\n' +
    '            ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)\n' +
    '            ?.emit(event, payload)\n' +
    '    }';

  if (content.includes(ORIGINAL_EMIT_LIST)) {
    content = content.replace(ORIGINAL_EMIT_LIST, PATCHED_EMIT_LIST);
    console.log('[patch-track-player] MusicService.kt: patched emitList() for New Architecture');
  } else if (!content.includes('reactNativeHost.reactInstanceManager.currentReactContext')) {
    console.log('[patch-track-player] MusicService.kt: emitList() already patched for New Architecture');
  } else {
    console.log('[patch-track-player] MusicService.kt: could not find emitList() to patch — manual check needed');
  }

  fs.writeFileSync(serviceFile, content, 'utf8');
}
