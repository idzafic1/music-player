---
name: app-stabilizer
description: >-
  Use this skill when tasked with stabilizing the backend or frontend, making download
  jobs durable across restarts, preventing bot blocks, or handling audio stream stalls.
---

# App Stabilizer Skill

This skill guides the agent in making the personal music player robust against network drops, server restarts, and playback stalls.

## Core Procedures

1. **Durable Download Jobs in SQLite**:
   - In `backend/src/db/schema.sql`, add the `download_jobs` table.
   - Refactor `backend/src/services/downloader.ts` to persist job states (`pending`, `downloading`, `tagging`, `done`, `failed`) directly in SQLite.
   - On server start, clean up orphaned in-flight jobs.

2. **Rate Limiting & Anti-Bot Measures**:
   - Implement jittered delays (1-3 seconds) between consecutive video downloads in playlist imports.
   - Support optional `COOKIES_PATH` environment variable for `yt-dlp --cookies`.

3. **Audio Engine Stall Recovery**:
   - In `frontend/src/services/audioEngine.ts`:
     - Monitor `audio.currentTime`. If playing state is true but currentTime does not advance for > 3s, reload and seek to the current position.
     - Integrate `navigator.mediaSession` on web and audio focus listeners on native.

4. **Graceful Shutdown**:
   - In `backend/src/index.ts`, catch `SIGTERM` and `SIGINT` to close Fastify and the SQLite database cleanly before process exit.
