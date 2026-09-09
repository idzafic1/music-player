# Personal Music Player — Project Docs

This is a **single-user, self-hosted music app**: a Node.js/TypeScript backend that
downloads and serves audio, plus a single Expo (React Native + react-native-web)
frontend that runs as an Android app and a browser PWA from one codebase.

No accounts, no multi-tenancy. Everything is scoped to one listener.

## Stack

| Layer        | Choice                                                              |
|--------------|----------------------------------------------------------------------|
| Backend      | Node.js + TypeScript, Fastify (or Express), REST API                |
| Database     | SQLite (via `better-sqlite3` or `Prisma` with the sqlite provider)  |
| Downloader   | `yt-dlp` (shelled out to) + `ffmpeg` for audio extraction/transcoding |
| Metadata tags| `music-metadata` / `node-id3` for writing ID3 tags on downloaded files |
| Frontend     | Expo (React Native + react-native-web), Expo Router                 |
| Audio playback| `react-native-track-player` (native) — see `FRONTEND_APP.md` for the web fallback note |
| State mgmt   | Zustand |
| Storage      | Local filesystem for audio files + thumbnails; SQLite for metadata  |

## Doc index — read in this order

1. `ARCHITECTURE.md` — components, how they talk to each other, data flow
2. `DATABASE_SCHEMA.md` — every table, column, and index
3. `API_SPEC.md` — every REST endpoint, request/response shapes
4. `DOWNLOADER_SERVICE.md` — how downloading/importing from YouTube works
5. `RECOMMENDATIONS_ENGINE.md` — daily recommendations + genre/mood logic
6. `FRONTEND_APP.md` — screens, playback engine, offline/online behavior
7. `TASKS_ROADMAP.md` — the build order an agent should follow, phase by phase

## Ground rules for coding agents

- This app is for **one user's personal library**. Don't add auth/accounts/multi-user
  logic anywhere — it's wasted complexity. A single optional API key/token for the
  backend (see `API_SPEC.md`) is enough if it's ever exposed outside localhost.
- Prefer boring, debuggable code over cleverness — this has to be maintained by one
  person occasionally poking at it.
- Every feature doc below assumes SQLite and the schema in `DATABASE_SCHEMA.md`.
  If an agent deviates from the schema, it must update `DATABASE_SCHEMA.md` in the
  same change.
- Downloading audio for personal use from YouTube sits in a legal/ToS gray area
  depending on jurisdiction and content licensing — this is noted once in
  `DOWNLOADER_SERVICE.md` and not repeated elsewhere. It's the user's call; the
  agent's job is just to build the feature as specified.
