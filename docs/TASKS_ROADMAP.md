# Build Roadmap

Work through these phases in order. Each phase should be a working, testable state
before moving to the next — don't build the recommendation engine before basic
playback works.

## Phase 0 — Setup
- Init backend (Node + TypeScript + Fastify/Express + `better-sqlite3`) inside
  `backend/`.
- Run the schema from `DATABASE_SCHEMA.md` via a migration script.
- Init frontend (Expo + Expo Router + TypeScript) inside `frontend/`.
- Confirm frontend can hit a backend `GET /health` over LAN from both a browser
  and an Android device/emulator (this catches networking/CORS issues early).
- Install system deps on Fedora: `ffmpeg` (via RPM Fusion) and `yt-dlp` (via pip/pipx)
  — see `DOWNLOADER_SERVICE.md`'s Fedora setup notes.

## Phase 1 — Backend core: library + file serving
- Implement `songs`, `artists` tables and their read endpoints.
- Implement `GET /songs/:id/stream` with proper HTTP Range support — test seeking
  works before moving on.
- Manually seed a couple of audio files + DB rows to test against (downloader
  comes next phase).

## Phase 2 — Downloader service
- Implement single-song download (`POST /downloads` + job polling) per
  `DOWNLOADER_SERVICE.md`.
- Implement YouTube playlist import.
- Verify: paste a real playlist URL, confirm songs land on disk with correct
  metadata/thumbnails and the DB rows are correct.

## Phase 3 — Frontend: basic playback
- Build the audio engine abstraction (native + web) per `FRONTEND_APP.md`.
- Library screen + mini-player + full player, playing songs downloaded in Phase 2.
- Get this working on **both** an Android build and a browser before adding more
  features — this is the riskiest cross-platform seam in the whole project.

## Phase 4 — Favorites, playlists, ratings
- Favorites and ratings endpoints + UI (star row, favorite toggle).
- Playlist CRUD + reordering, playlist detail screen.
- Playlist import UI (form + progress screen) wired to Phase 2's backend work.

## Phase 5 — Play tracking + Wrapped
- Implement the 15-second qualifying-play timer in the audio engine.
- `POST /plays`, `GET /stats/wrapped`.
- Wrapped screen with top 5 songs/artists/genres and a time-range picker.

## Phase 6 — Genres + recommendations
- Genre tagging (manual UI + auto-tag from YouTube Music metadata at download
  time, per `DOWNLOADER_SERVICE.md`).
- Genre-filtered browsing in the Library screen.
- Recommendations engine (`RECOMMENDATIONS_ENGINE.md`): daily cron job, Home
  screen recommendations list, genre-based on-demand recommendations.

## Phase 7 — Online search
- `GET /search/online` backend proxy.
- Search screen's "online" tab with per-result download button, online/offline
  detection and UI switching.

## Phase 8 — Polish / stretch goals
- PWA manifest + installability polish (icons, splash screen).
- Settings screen: backend host config, API token, manual recommendation refresh.
- Thumbnail caching robustness (placeholder fallback, `expo-image` disk cache).
- Operational note: keep `yt-dlp` updated (it breaks when YouTube changes
  things) — add a simple version-check or update reminder if this becomes
  annoying in practice.
- Stretch: true on-device offline audio caching (download-for-offline within the
  app, separate from the backend's own storage) — only tackle this once
  everything above is solid.

## Definition of done for v1

You can: import a YouTube playlist, browse/search your local library, play a song
with working seek/pause/skip on both Android and web, favorite/rate songs, build
and reorder playlists, see accurate top-5 Wrapped stats after some listening
history, and get a fresh batch of daily recommendations each morning.
