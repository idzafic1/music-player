# Antigravity Remaining Work Brief

This document is an engineering handoff for a future agent. It describes what
is already present, what still needs improvement, and where to look first. It
does not replace `docs/AGENTIC_PRODUCT_MASTER_SPEC.md`, which remains the
single governing product document.

## 1. Repository state

### Backend

The backend is a Fastify/TypeScript service under `backend/` using
`better-sqlite3`. It owns the permanent library, metadata, playlists, ratings,
favorites, plays, recommendation cache, audio files, thumbnails, and download
jobs.

Important owning modules:

- `backend/src/app.ts`: Fastify registration and route composition.
- `backend/src/db/schema.sql`: authoritative database structure.
- `backend/src/db/index.ts` and `backend/src/db/migrate.ts`: database setup.
- `backend/src/services/library.ts`: song, genre, playlist, and library queries.
- `backend/src/services/downloader.ts`: single/playlist downloads and durable
  job state.
- `backend/src/services/recommendations.ts`: mood mapping, refresh, cache
  replacement, and scheduled refresh.
- `backend/src/services/streaming.ts`: range-capable audio streaming.
- `backend/src/index.ts`: startup, scheduler, signal handling, and shutdown.

The backend has a working build and an existing API test entry point:

```bash
npm --prefix backend run build
npm --prefix backend test
```

Do not treat the backend database as a client-side cache. Device files and the
device index are convenience copies only.

### Frontend

The frontend is an Expo Router application under `frontend/src/`.

Important owning modules:

- `frontend/src/app/_layout.tsx`: splash, startup hydration, NetInfo, and
  Track Player registration.
- `frontend/src/app/(tabs)/index.tsx`: Home recommendations, playlists,
  recently played, favorites, refresh context, and recommendation downloads.
- `frontend/src/app/(tabs)/library.tsx`: local library, genre filters, sort,
  downloaded-only filtering, and playlist CRUD.
- `frontend/src/app/(tabs)/search.tsx`: debounced online search and mood chips.
- `frontend/src/app/playlist/[id].tsx`: playlist playback, reorder, and
  playlist offline download/cancellation controls.
- `frontend/src/store/offlineStore.ts`: device download state, playlist
  aggregate progress, cancellation, and retry queue.
- `frontend/src/services/offlineStorage.ts`: filesystem downloads,
  cancellation, index validation, and byte totals.
- `frontend/src/services/audioEngine.ts`: platform-neutral audio loading and
  local-URI-first resolution.
- `frontend/src/store/playerStore.ts`: queue and playback state.
- `frontend/src/store/settingsStore.ts`: backend URL, connectivity, and
  online state.
- `frontend/src/app/(tabs)/settings.tsx`: backend testing, recommendation
  refresh, storage summary, and failed-download retry.

The frontend commands are:

```bash
npm --prefix frontend run build
npm --prefix frontend run lint
cd frontend/android && ./gradlew assembleDebug --quiet
```

The web build currently exists. Lint may report baseline errors in existing
React effect/purity patterns and unused imports; agents must identify whether a
new change caused a failure instead of hiding it.

## 2. Feature-opportunity status

### Implemented in source

1. **Explicit mood chips**
   - Search contains four compact chips.
   - Selecting one populates a normal debounced online search query.
   - Chips are disabled while the app is offline.
   - Owner: `frontend/src/app/(tabs)/search.tsx`.

2. **Playlist-level offline download**
   - Playlist detail exposes Download all/Cancel.
   - Downloads run sequentially.
   - Already-downloaded songs count toward aggregate completion.
   - Progress includes completed songs plus current-song progress.
   - Cancellation calls the active resumable download cancellation method.
   - Owner: `frontend/src/app/playlist/[id].tsx`,
     `frontend/src/store/offlineStore.ts`, and
     `frontend/src/services/offlineStorage.ts`.

3. **Storage management summary**
   - Settings shows downloaded song count and total bytes.
   - Owner: `frontend/src/app/(tabs)/settings.tsx` and
     `offlineStorage.getTotalDownloadedBytes()`.

4. **Retry queue**
   - Failed device downloads retain the source `Song` and error message in
     process state.
   - Settings exposes retry when failures exist.
   - Owner: `offlineStore.ts` and `settings.tsx`.

5. **Recently played Home surface**
   - Backend has dedicated recent-play behavior and Home keeps it separate from
     Library's normal Recent sort.
   - Do not reintroduce a five-item cap into general library sorting.

6. **Consistent download status**
   - Rows/player use cloud/check semantics rather than implying backend
     ownership equals device availability.

7. **Recommendation context**
   - Home derives refresh date and an active mood from recommendation reasons.
   - Settings can manually regenerate recommendations.

8. **Server-unavailable mode with persistent library snapshot**
   - Retains full library state (`songs`, `genres`, `artists`, `playlists`,
     `playlistDetails`, `recommendations`, `recentlyPlayed`, `favorites`) in
     AsyncStorage key `offline_library_snapshot_v1`.
   - Surfaces display amber snapshot warning banner with formatted timestamp
     when backend is unreachable.
   - Non-downloaded audio streams trigger explicit 'Playback Unavailable' alerts.
   - Offline actions (create playlist, delete, edit, ratings, favorites) are
     disabled or explained.
   - Reconnecting to backend clears snapshot indicators and resumes live sync.
   - Owner: `frontend/src/services/librarySnapshot.ts`,
     `frontend/src/app/(tabs)/index.tsx`, `frontend/src/app/(tabs)/library.tsx`,
     `frontend/src/app/playlist/[id].tsx`, and `frontend/src/services/audioEngine.ts`.

### Not yet complete or not sufficiently verified

#### A. Server-unavailable mode with a last successful snapshot (Completed & Verified)

Implemented via `librarySnapshot.ts` and verified on real Android emulator
(online fetch -> snapshot persisted -> backend stopped -> app cold restart ->
snapshot rendered -> offline play alert verified -> backend reconnected -> live
data resumed).

#### B. Policy-aware background refresh (Completed & Verified)

Implemented policy-aware foreground refresh with metered-network and staleness
gating via `frontend/src/services/refreshPolicy.ts`, wired into NetInfo's
`isConnectionExpensive` Android metered state, AppState lifecycle listener, and
Home screen data loading with coalesced events and failure preservation:
- Rejects automatic refreshes when offline (`offline`).
- Rejects automatic refreshes on metered connections (`metered_connection`), while
  allowing manual pull-to-refresh (`manual`).
- Rejects automatic refreshes when app is in background/inactive (`app_not_active`).
- Throttles automatic refreshes to minimum 15-minute interval (`throttled`).
- Coalesces reconnect and foreground-active events with debounce to prevent stampedes.
- Retains last-successful payload and snapshot state on backend timeout or 503 error;
  never wipes good data with empty arrays.
- Verified on real Android emulator:
  - Online load and manual pull-to-refresh (`27_home_online_refresh.png`, `28_pull_to_refresh.png`).
  - Rapid background/foreground switches throttled (`29_foregrounded_no_stampede.png`).
  - Backend kill preserved snapshot and displayed formatted warning banner (`30_offline_retained_snapshot.png`).
  - Backend restart restored online state without disruption (`31_online_restored.png`).
  - 14 automated frontend unit tests passing in `refreshPolicy.test.ts` & `offlineStore.test.ts`.

#### C. Automated frontend tests

The backend has an existing test command; the frontend does not yet have a
clearly established focused test suite for the highest-risk client behavior.

Add tests for the smallest valuable seams:

- `offlineStorage` progress and index persistence.
- `offlineStore` duplicate prevention, failure retention, retry, and playlist
  aggregate progress/cancellation.
- `audioEngine` local URI priority and stale callback/song-switch behavior.
- qualifying-play accumulation across pause/resume and reset on song switch.

Do not test implementation details that make a future refactor impossible.
Prefer deterministic fake clocks, fake filesystem/download handles, and fake
audio engines. Do not call YouTube, `yt-dlp`, `ffmpeg`, or a live backend from
unit tests.

First inspect `package.json`, lockfile, existing test files, and installed
dependencies. If a test runner is absent, select the smallest maintainable
option and explain the dependency change before making it.

## 3. Hardening review of completed work

This is not permission for unrelated cleanup. Only fix issues directly coupled
to a work item:

- `offlineStore.retryFailedDownloads()` intentionally continues after one
  failure, but the final UI must still expose remaining failures.
- Playlist cancellation must not index an incomplete file.
- A cancelled current download must be removed from active maps and temporary
  storage.
- Duplicate individual and playlist downloads must not race on the same song.
- Home recommendation polling must always clear its interval on completion,
  error, and unmount.
- Async callbacks from a previous song or screen must not overwrite current
  state.
- Every row thumbnail must follow the absolute-fill layout pattern when its
  height comes from sibling text.
- A downloaded badge must reflect the device index, not backend presence.

## 4. Documentation conflicts and stale references

These conflicts must be called out to future agents:

1. `docs/TASKS_ROADMAP.md` describes true on-device offline caching as a
   stretch goal. `docs/OFFLINE_DOWNLOADS.md` and the master spec establish it
   as core behavior. Treat the master spec and scoped offline document as
   authoritative.
2. `docs/QA_ENGINEER_BRIEF.md` references `docs/UI_DESIGN.md`, but that file is
   absent in this workspace. Use the master spec, the existing UI docs, and
   actual source; do not block solely on the missing file.
3. Older genre/downloader wording may suggest automatic YouTube tags are
   reliable genres. The current scoped polish work removes that assumption:
   uncontrolled tags are not a genre taxonomy.
4. The general Library Recent sort and Home Recently Played are separate
   surfaces. Never merge their limits or endpoints.
5. The previous master spec contradiction regarding Library `sort=added_at`
   versus "Recent sort never returns more than five" was resolved directly in
   `docs/AGENTIC_PRODUCT_MASTER_SPEC.md` (commit `98ff9cf`): Library's own Recent
   sort (`sort=added_at`) is uncapped (up to normal server limits), while Home's
   dedicated Recently Played surface is a separate bounded endpoint. Agents must
   preserve the uncapped Library behavior.

Do not silently “fix” these conflicts by rewriting unrelated documents during
feature work. Report them and update only directly relevant documentation.

## 5. Definition of a complete future item

A future item is complete only when:

- Source and tests implement the stated behavior.
- API/schema docs are updated if their contracts changed.
- Backend build/tests pass.
- Frontend build/lint results are recorded, including baseline failures.
- Android build succeeds when client code changed.
- Visual changes have before/after screenshots that were actually inspected.
- App-specific logcat has no introduced fatal exception.
- Offline and failure states were exercised where relevant.
- The commit contains one coherent item and the required co-author trailer.
