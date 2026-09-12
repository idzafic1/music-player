# Personal Music Player - Agentic Product Master Specification

Status: Planning and implementation brief
Audience: coding agents, human reviewers, and future maintainers
Scope: Android phone, Android emulator, web/PWA, local backend, offline playback,
library management, recommendations, and operational verification

This document describes the intended product and the exact discipline for future
agentic implementation work. It is deliberately more specific than a feature
wishlist. A future agent must use it as a decision record, a verification plan,
and a boundary map.

## 1. Product Intent

Personal Music is a private music library and playback system for one user. The
backend owns the permanent library. The Android app and web client provide the
library UI, playback controls, download controls, and discovery surfaces.

The product should feel like a quiet, fast personal tool rather than a social
network or a streaming-service clone. The core loop is:

1. Import or download music into the backend library.
2. Browse, search, filter, rate, favorite, and organize the library.
3. Play music with dependable pause, seek, queue, background playback, and
   interruption handling.
4. Mark selected songs available offline on the phone.
5. Use listening history, genres, and moods to discover music without losing
   control of the local collection.

The product must remain useful in two distinct states:

- Connected state: backend reachable, with full library synchronization, online
  search, streaming, recommendations, and downloads.
- Offline state: backend unavailable and/or internet unavailable, with local
  device downloads, cached artwork, cached in-memory state, and clear disabled
  actions for features that cannot work locally.

## 2. Non-Goals

Do not add these unless a later product decision explicitly authorizes them:

- Multi-user accounts, profiles, follows, comments, or social feeds.
- Public hosting, public sharing links, or unrestricted remote access.
- A general-purpose video downloader UI.
- A large, card-heavy marketing landing page.
- Automatic downloading of the entire library to every phone.
- Silent deletion of backend songs when a device download is deleted.
- A recommendation system that hides why an item was recommended.
- UI controls that imply an operation succeeded when it is still pending.

## 3. Existing System Boundaries

### 3.1 Backend

Location: `backend/`

Responsibilities:

- Fastify API and standard JSON error responses.
- SQLite persistence through `better-sqlite3`.
- Songs, artists, genres, playlists, favorites, ratings, plays, settings, and
  recommendation cache.
- Audio and thumbnail storage on backend disk.
- HTTP range streaming for seeking.
- `yt-dlp` and `ffmpeg` download/post-processing pipeline.
- Durable download job state and startup recovery.
- Online search proxy and recommendation generation.

The backend is the source of truth for the permanent library. The device cache
must never be treated as the authoritative copy of metadata or ownership.

### 3.2 Frontend

Location: `frontend/`

Responsibilities:

- Expo Router screens shared by Android and web where practical.
- Zustand state stores for player, settings, and offline state.
- Platform-neutral audio engine interface.
- Android playback through Track Player.
- Web playback through Howler/browser-compatible implementation.
- Device-local audio downloads and artwork caching.
- Connectivity and backend reachability state.
- Responsive rendering for narrow phones and wider desktop/web surfaces.

### 3.3 Development and verification

Preferred physical-device path:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
adb devices -l
adb -s <device> reverse tcp:8081 tcp:8081
adb -s <device> reverse tcp:3001 tcp:3001
```

Use the repository's `start.sh` only for its intended emulator workflow. It
currently kills and starts the configured AVD, so it must not be used blindly
when a physical phone is the active verification target.

For a phone dev client:

```bash
cd frontend
npx expo start --dev-client --localhost
```

The agent must verify that Metro is actually listening before launching the app.
The phone must show as `device`, not `unauthorized` or `offline`.

## 4. Source-of-Truth Rules

Use these rules whenever requirements conflict:

1. Runtime behavior and tests outrank stale prose in older docs.
2. The newest explicit user requirement outranks older product assumptions.
3. The backend database is authoritative for the permanent library.
4. The device offline index is authoritative only for local file availability.
5. A UI state must reflect the actual async state, not merely the fact that an
   operation was requested.
6. Existing public API shapes should be preserved unless a migration is planned.
7. A future agent must inspect the current source before editing any item from
   this document. Already-correct work must be marked implemented and skipped.

## 5. Core User Journeys

### 5.1 First launch

Expected sequence:

1. Render the app shell and navigation quickly.
2. Hydrate the offline index without blocking the whole UI.
3. Subscribe to NetInfo once.
4. Start a backend health check independently of content requests.
5. Load Home sections concurrently, with independent success/failure handling.
6. Hide the splash screen after a short maximum bound even if the backend is
   unavailable.
7. Show a compact connection state, not an endless spinner.

The UI must never wait indefinitely for a health check before rendering local or
already-cached content.

### 5.2 Play a local library song

1. User taps a song row or card.
2. Player store sets the current song and queue immediately.
3. Audio engine resolves a device-local URI first.
4. If no local URI exists, audio engine resolves the backend stream URL.
5. Player state shows loading/paused state while the engine loads.
6. Playback begins, and progress events update the mini-player and full player.
7. After 15 cumulative seconds of actual playback, exactly one qualifying play
   is submitted.
8. Switching songs resets the qualifying-play accumulator for the new song.
9. The previous song remains rendered with its artwork and metadata. It must not
   become an empty tile merely because it is no longer current.

### 5.3 Download a song to the phone

1. User opens the song action menu.
2. The action changes to an in-progress state immediately.
3. Progress starts at 0, updates monotonically, and reaches 1 only after the
   file is complete and indexed.
4. The UI shows numeric progress and a visual progress track.
5. Concurrent duplicate downloads for the same song are prevented.
6. On success, the file is verified, indexed, and the downloaded badge appears.
7. On failure, the temporary/incomplete file is not indexed and the user sees a
   clear recoverable error.
8. Removing a device download deletes only the device copy and index entry.

### 5.4 Use the app without the backend

The app must remain navigable. It should:

- Show hydrated downloaded songs and cached artwork where available.
- Play downloaded songs from local URIs.
- Keep the player controls usable for local songs.
- Disable or explain backend-dependent actions.
- Avoid an endless global loading state.
- Preserve the last known library state where it is already in memory.

It must not pretend that online search, backend metadata changes, streaming of a
non-downloaded song, or server-side imports succeeded.

### 5.5 Search for music

Search has two conceptual sources:

- Local library search: available when the backend can answer library requests,
  with cached/in-memory fallback where implemented.
- Online discovery search: requires backend reachability and internet access.

The screen title is `Search for music`. Search input must be debounced. A query
must not trigger a network request for every keystroke.

Online results must show:

- Thumbnail or deliberate placeholder.
- Title, artist, and duration.
- Play-preview action.
- Download action with non-edge-to-edge spacing.

## 6. UI Design Contract

### 6.1 Visual direction

- Dark, restrained, music-focused interface.
- Emerald primary action color with cyan secondary accent.
- Strong text hierarchy and generous but controlled spacing.
- No oversized marketing hero sections.
- No nested decorative cards.
- Repeated items may use cards/rows; page sections should remain unframed.
- Controls should communicate state through familiar icons and concise labels.

### 6.2 Thumbnail rules

For every real thumbnail:

- Vertical cards: image touches the card's top, left, and right edges.
- Horizontal rows: image touches the row's left, top, and bottom edges.
- The outer card/row owns clipping and corner radius.
- Text and action padding must not wrap the image.
- A horizontal row must have a bounded height. Never use an unresolved
  percentage-height image inside an auto-height row.
- The current implementation uses a compact bounded row with a larger thumbnail.
  Future agents must preserve this behavior while testing narrow phones.

Decorative artist/playlist icon circles are not thumbnails and should not be made
edge-to-edge.

### 6.3 Download controls

Recommendation download controls should be compact icon-first buttons. They must
not dominate the artwork or become a large pill containing redundant text.

The full player offline badge should use cloud semantics:

- Downloaded: positive cloud/check visual, primary color.
- Not downloaded: muted cloud-download visual.
- Downloading: progress or active cloud visual.

Never show a checkmark for a song merely because it exists in the backend library.

### 6.4 Empty and unavailable states

Every async surface needs distinct states:

- Initial loading.
- Loaded with results.
- Loaded empty.
- Retrying.
- Backend unavailable.
- Internet unavailable.
- Operation failed.
- Operation succeeded.

Do not collapse all of these into a generic spinner or a blank surface.

## 7. Data and API Contracts

### 7.1 Song identity

- `songs.id`: internal stable UUID.
- `songs.source_id`: external source identity when available.
- `songs.file_path`: backend file path only; never send it to a phone as a local
  device URI.
- `songs.thumbnail_path`: backend path; frontend converts it to a backend URL.
- `streamUrl`: backend API route, not a permanent public URL.

### 7.2 Pagination

All list APIs should accept `limit` and `offset`, with server-side clamps.

Special product rule:

- A `sort=added_at` or Recent view must return no more than five songs for the
  compact recent surface. This is a product limit, not a general library limit.
- The full library may still support larger page sizes for other sorting modes.

### 7.3 Error shape

Use:

```json
{
  "error": {
    "code": "STABLE_MACHINE_CODE",
    "message": "Human-readable explanation"
  }
}
```

The frontend must preserve useful server messages and translate them into a
visible, non-blocking error state.

## 8. Offline Storage Specification

### 8.1 Index

Storage key: `offline_downloads_index`

Shape:

```ts
type OfflineEntry = {
  localUri: string;
  downloadedAt: number;
  sizeBytes: number;
};

type OfflineIndex = Record<string, OfflineEntry>;
```

Requirements:

- One AsyncStorage key for the index.
- Local files under the app document directory.
- Index entries are validated against the filesystem at hydration or cache
  refresh, not on every player tick.
- Invalid/missing files are removed from the index.
- Successful download writes the index only after the file exists.
- A process-local index cache may be used to avoid repeated filesystem scans.
- Cache invalidation is required after add, remove, corruption recovery, or
  explicit refresh.

### 8.2 Progress contract

Progress is a normalized number from 0 through 1.

Required behavior:

- Emit 0 immediately after the operation begins.
- Prefer the native expected-byte value when available.
- Use HTTP `Content-Length` as a fallback when available.
- Poll file size only as a fallback and at a bounded interval.
- Throttle state updates to avoid rendering on every byte callback.
- Clamp values to `[0, 1]`.
- Never report 1 before download completion and index persistence.
- Always report 1 on successful completion.
- Clear or retain completed progress intentionally; do not leave stale active
  progress for an unrelated future download.

### 8.3 Offline playback

Resolution order:

1. Valid local URI for the song.
2. Explicit absolute `streamUrl` if supplied.
3. Backend stream URL derived from song id.

When a local URI exists, playback must not contact the backend.

## 9. Playback State Machine

States:

- `idle`
- `loading`
- `ready`
- `playing`
- `paused`
- `stalled`
- `ended`
- `error`

Transitions must be explicit and observable. A song switch must cancel or ignore
stale callbacks from the previous source. A stale progress event must never
overwrite the current song's position.

The engine must support:

- Play, pause, seek, next, previous.
- Queue and repeat behavior.
- Background/native media controls.
- Web Media Session where supported.
- Audio interruptions and becoming-noisy/headphone disconnect behavior.
- Stall detection and recovery without resetting the user to zero.
- One qualifying play event per listening instance.

## 10. Recommendation Design

### 10.1 Recommendation inputs

Use weighted signals from:

- Plays in the last 30 days.
- Top artists.
- Top songs.
- Tagged genres.
- Mood inferred from genres and explicit mood queries.

Mood is not a diagnosis or a claim about the user's mental health. It is a music
discovery label such as melancholic, calm, cheerful, or energetic.

### 10.2 Mood mapping

Initial deterministic mappings:

- Melancholic: sad, depressive, melancholic, emo, ambient, dark.
- Cheerful: happy, pop, dance, disco, funk, summer.
- Calm: chill, calm, sleep, lofi, classical, acoustic.
- Energetic: rock, metal, punk, techno, edm, workout.

The mapping must be easy to extend and must not require a schema migration for a
new query phrase.

### 10.3 Generation algorithm

1. Read owned source ids.
2. Read top artists, top songs, top genres.
3. Derive a small set of unique mood seeds.
4. Always use fallback moods when there are no usable genre signals.
5. Query the isolated YouTube Music service with bounded result counts.
6. Deduplicate by external source id.
7. Exclude owned songs.
8. Assign an explainable reason, for example `for a calm mood` or `more like X`.
9. Cap the final batch at 25.
10. Replace the previous cached batch transactionally.

The recommendation service must tolerate one failed external query and continue
with other seeds. It must not expose external URLs as trusted local file paths.

## 11. Performance Rules

### 11.1 Network

- Run independent requests with `Promise.allSettled` where partial results are
  useful.
- Do not await a health check before rendering content.
- Debounce text search.
- Poll download jobs with cleanup on unmount or completion.
- Never create an interval without a clear completion/error path.
- Use request timeouts and avoid duplicate in-flight requests where possible.

### 11.2 React and Zustand

- Subscribe components to the smallest state slice they need.
- Avoid selecting entire stores in high-frequency components.
- Do not update Zustand on every audio tick unless the UI needs that frequency.
- Throttle download progress updates.
- Do not create new derived arrays repeatedly in deeply repeated rows without a
  reason.
- Use stable keys based on song identity.
- Preserve list virtualization when lists grow beyond the compact Home surfaces.

### 11.3 Images

- Use `expo-image` for caching and transitions.
- Normalize backend absolute paths and relative thumbnail routes consistently.
- Use deliberate placeholder artwork when loading fails.
- Do not make image dimensions depend on unresolved parent height.

### 11.4 Backend

- Bound every list query.
- Add indexes for frequent filters and joins when measurements justify them.
- Keep external process concurrency bounded.
- Use transactions for recommendation replacement and related multi-row writes.
- Avoid doing filesystem validation on every playback progress event.

## 12. Feature Opportunities for Later Review

These are candidates, not automatic requirements:

1. Explicit mood chips on Home or Search: Calm, Melancholic, Cheerful,
   Energetic. Keep them optional and compact.
2. Playlist-level offline download with aggregate progress and cancellation.
3. Storage management screen showing downloaded count and total bytes.
4. Retry queue for failed device downloads.
5. Server-unavailable mode that preserves the last successful library snapshot.
6. Recently played as a fixed five-item surface with a separate full history view
   only if the user asks for it.
7. Download status on every relevant row, using one consistent visual language.
8. Recommendation refresh timestamp and a small explanation of the active mood.
9. Background refresh only when the device/network policy allows it.
10. Automated frontend tests for progress monotonicity, song switching, and
    offline URI resolution.

Do not implement all candidates in one pass. Each candidate requires a decision,
an owning module, a test plan, and a phone verification step.

## 13. Agentic Implementation Protocol

For every future task:

1. Read the relevant document and current source.
2. State one local falsifiable hypothesis about the behavior.
3. Name one cheap check that could disprove it.
4. Inspect the nearest owning abstraction, not the entire repository.
5. Skip items already correctly implemented.
6. Make the smallest coherent edit.
7. Immediately run the narrowest available validation.
8. If validation fails, repair the same slice before expanding scope.
9. Build or bundle the affected platform.
10. Verify on the physical Android phone when the device is connected.
11. Capture screenshots for visual changes and logcat for runtime behavior.
12. Report what was verified, what was not, and why.

Never:

- Run `git push`.
- Reset or discard user changes.
- Claim emulator or phone verification without actual evidence.
- Replace a real error with a silent fallback.
- Add a broad abstraction when a local existing pattern is sufficient.
- Increase list limits or memory use without a measured reason.

## 14. Verification Matrix

### Backend checks

```bash
npm --prefix backend run build
npm --prefix backend test
```

Verify:

- Health endpoints.
- Songs list/detail/update/delete.
- Recent sort never returns more than five.
- Range streaming and seeking.
- Download job lifecycle.
- Recommendation refresh and mood reasons.
- Owned-track exclusion.
- Pagination bounds.
- Graceful shutdown and startup recovery.

### Frontend checks

```bash
npm --prefix frontend run build
npm --prefix frontend run lint
```

Verify:

- Search title and debounce.
- Five-item recent surface.
- Previously played thumbnails after song switching.
- Compact recommendation download control.
- Downloaded/not-downloaded badge semantics.
- Progress starts at 0, changes during transfer, and ends at 100.
- Local URI playback with backend disconnected.
- Graceful error for non-downloaded playback offline.

### Physical Android checks

1. Confirm `adb devices` shows the phone as `device`.
2. Forward Metro and backend ports.
3. Launch the app.
4. Capture Home, Library, Search, and full-player screens.
5. Play song A, then song B; confirm A retains artwork.
6. Confirm recent view contains at most five rows.
7. Start a device download and observe at least one intermediate progress state.
8. Disconnect network/backend and play the downloaded file.
9. Attempt a non-downloaded song and confirm a visible failure state.
10. Reconnect and confirm streaming resumes.
11. Review logcat for app-specific fatal exceptions.

## 15. Definition of Done for the Future Product

The product is ready for a release candidate when:

- A user can import and organize a personal library.
- Local playback is reliable on Android and web.
- Playback survives normal interruptions and supports seek.
- Exactly one qualifying play is recorded per listening instance.
- The Home screen loads partial content without being blocked by health checks.
- Recent surfaces are intentionally capped at five.
- Thumbnails never disappear after song switching.
- Offline downloads have truthful progress and durable local indexes.
- Downloaded songs play without any backend connection.
- Online-only actions are clearly unavailable offline.
- Recommendations include artist, song, genre, and mood reasoning.
- Backend and frontend tests pass.
- The physical Android phone has been used for final visual and behavioral QA.
