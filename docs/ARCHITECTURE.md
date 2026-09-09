# Architecture

## Components

```
┌─────────────────────────────┐
│        Frontend (Expo)      │
│  Android app  +  Web (PWA)  │
│  react-native-web, one repo │
└───────────────┬─────────────┘
                │ REST (HTTP/JSON) + range-request audio streaming
                ▼
┌─────────────────────────────┐
│        Backend API          │
│   Node.js + TypeScript      │
│   Fastify/Express server    │
│                              │
│  ┌────────────┐ ┌──────────┐│
│  │ Downloader │ │ Recs job ││
│  │  service   │ │ (cron)   ││
│  └─────┬──────┘ └────┬─────┘│
└────────┼─────────────┼──────┘
         ▼             ▼
   yt-dlp/ffmpeg   YT Music search
         │             │
         ▼             ▼
┌──────────────┐  ┌──────────────┐
│ Local disk    │  │  SQLite DB   │
│ /audio /thumbs│  │  metadata,   │
└──────────────┘  │  plays,      │
                   │  ratings…    │
                   └──────────────┘
```

## Backend responsibilities

1. **Library API** — CRUD over songs/artists/playlists/favorites/ratings, backed by SQLite.
2. **File serving** — streams audio files to the frontend with HTTP range support
   (required for seeking/scrubbing).
3. **Downloader service** — wraps `yt-dlp` to pull audio from a YouTube URL or search
   query, transcodes with `ffmpeg`, writes ID3 tags + thumbnail, inserts a `songs` row.
4. **Playlist import** — takes a YouTube playlist URL, enumerates videos, downloads
   each as a song, creates a `playlists` row + `playlist_songs` rows.
5. **Online search proxy** — when the client is online and wants to search beyond the
   local library, the backend proxies a YouTube Music search and returns lightweight
   result objects (title/artist/thumbnail/external id) that the client can preview or
   download.
6. **Play tracking** — accepts play events from the client (`POST /plays`) once a song
   has been listened to for ≥15 seconds; writes one row per qualifying play.
7. **Stats/Wrapped** — aggregates the `plays` table into top songs/artists/genres over
   a given time window.
8. **Recommendations job** — a scheduled task (node-cron, runs once/day) that reads
   recent listening history, derives top artists/genres, queries YouTube Music for
   similar tracks, and writes results into a `recommendations` cache table for the
   frontend to read instantly.

## Frontend responsibilities

1. Render the library (songs/albums/artists/playlists), search bar, and now-playing
   mini-player + full player screen.
2. Talk to the backend for everything — the frontend never talks to YouTube directly.
3. Detect online/offline state and switch UI affordances (online search visible only
   when online; otherwise library is local-only).
4. Own actual audio playback (backend just serves bytes).
5. Send play-progress heartbeats so the backend can log the 15-second qualifying play.
6. Cache thumbnails locally for offline display (see `DOWNLOADER_SERVICE.md` for
   thumbnail storage, `FRONTEND_APP.md` for the client-side cache strategy).

## Networking notes

- Backend and frontend are assumed to run on the same local network (e.g., backend on
  a home server/NAS or the user's PC, frontend hitting it via LAN IP or a tunnel like
  Tailscale). Docs don't assume a public internet deployment, but nothing here blocks
  one later — see the API key note in `API_SPEC.md` if it's ever exposed publicly.
- All audio files live on the backend's disk; the frontend never stores full audio
  files itself except via normal browser/OS HTTP caching. (True offline-on-device
  caching is a stretch goal, not in scope for v1 — see `TASKS_ROADMAP.md`.)
