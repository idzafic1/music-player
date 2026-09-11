# Frontend App (Expo — Android + Web/PWA, one codebase)

## Project setup

- `npx create-expo-app` with Expo Router (file-based routing) so the same route
  tree drives both the Android build and the web export.
- `app.json`: configure `web.output = "static"` (or `"single"`) and add a PWA
  manifest (name, icons, `display: "standalone"`) so it's installable from a
  browser on Android/desktop.
- State management: Zustand store(s) for `player` (current queue, position,
  playing/paused) and `library` (cached lists from the API).

## Audio playback

- **Native (Android)**: `react-native-track-player` — gives you background
  playback, lock-screen/notification controls, and queue management for free.
- **Web**: `react-native-track-player` does not support web. Build a thin
  playback abstraction (`services/audioEngine.ts`) with a single interface
  (`load`, `play`, `pause`, `seek`, `onProgress`, `onEnd`) with two
  implementations selected via `Platform.OS`:
  - native → wraps `react-native-track-player`
  - web → wraps the native browser `Audio` element (or `howler.js` for
    convenience)
  Every screen/component talks to the abstraction, never to the underlying
  library directly — this is the key seam that keeps one codebase working on
  both targets.

## The 15-second "qualifying play" timer

Implement this inside the playback abstraction so it's automatic everywhere audio
plays (mini-player, full player, autoplay from a playlist):

1. On `load()` of a new song, reset a `secondsAccumulated = 0` counter and a
   `hasFiredPlay = false` flag.
2. On each progress tick (native: track-player's progress event; web: `timeupdate`),
   if playing, add elapsed time to `secondsAccumulated`.
3. **Do not** reset the counter on pause/resume — a play that's paused and
   resumed still accumulates toward 15s (matches "hit the 15s mark" from the
   spec, not "15 continuous seconds").
4. The moment `secondsAccumulated >= 15` and `!hasFiredPlay`: set
   `hasFiredPlay = true` and call `POST /plays` with `{ songId, secondsPlayed:
   Math.round(secondsAccumulated), sourceContext }`.
5. Reset both on `load()` of the *next* song (skipping, queue advance, etc.) —
   one qualifying play max per song per listening instance.

## Screens

- **Home** — daily recommendations (from `GET /recommendations/daily`), quick
  access to favorites/recently played.
- **Search** — local library search by default; when online, a toggle/tab to
  search YouTube Music (`GET /search/online`) with a per-result "Download" button.
- **Library** — browsable by song/artist/playlist, with genre filter chips.
- **Playlist detail** — ordered song list, drag-to-reorder (calls `PATCH
  /playlists/:id` with `songOrder`), remove-song swipe action.
- **Now Playing (full player)** — art, title/artist, scrub bar (seek via the
  audio engine), rating stars (1-5, `PUT /ratings/:songId`), favorite toggle
  (`PUT/DELETE /favorites/:songId`), queue view.
- **Mini-player** — persistent bar above the tab bar, visible whenever something
  is loaded, tappable to expand to the full player.
- **Wrapped / Stats** — calls `GET /stats/wrapped`, shows top 5 songs/artists/
  genres, total minutes listened, with a time-range picker (last 30 days / this
  year / all time).
- **Playlist import** — a simple form: paste a YouTube playlist URL, shows import
  progress (poll `GET /downloads/:jobId`).
- **Settings** — backend URL/host config (important since this isn't a hosted
  service — the app needs to know where the user's backend lives), API token if
  set, manual "refresh recommendations" button.

## Icons / thumbnails, online vs offline

- Every song/artist/playlist thumbnail is served from the backend
  (`/thumbnails/...` static route or embedded in the song detail response as a
  URL). Use Expo Image (`expo-image`) for disk caching so thumbnails already seen
  once still render offline.
- When offline (use `@react-native-community/netinfo` for connectivity state):
  - Hide/disable the "online search" tab.
  - Library/playlists/favorites/ratings/local playback all continue to work
    normally, since they only depend on the backend being reachable on the LAN —
    note the distinction in-app between "no internet" and "backend unreachable"
    if you want extra polish, but a single "offline" banner covering both is
    fine for v1.
  - Fall back to a generic placeholder icon for any thumbnail not yet cached.

## Rating system UI

- Simple 5-star row on the full player screen and in library list rows (small,
  tap-to-rate without opening the player). Optimistic UI update on tap, `PUT
  /ratings/:songId`, revert on failure.

## Offline-first playback caching

This is core v1 functionality, not a stretch goal — see `docs/OFFLINE_DOWNLOADS.md`
for the full spec (new `offlineStorage.ts` service, `offlineStore.ts` Zustand
store, and the exact changes needed in `audioEngine.ts`). Any song the user has
explicitly downloaded to-device must keep playing with zero backend
connectivity; only streaming of non-downloaded songs and online search require
the backend to be reachable.
