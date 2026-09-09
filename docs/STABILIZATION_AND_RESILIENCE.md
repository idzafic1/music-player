# Stabilization & Resilience Architecture

This document specifies architectural and operational improvements to ensure the backend and frontend run reliably 24/7 without memory leaks, hung downloads, or dropped playback.

---

## 1. Durable Download Jobs (SQLite-Backed)

### Current Limitation
Download jobs currently live in an in-memory JavaScript `Map<string, DownloadJob>`. If the backend restarts or crashes during a 50-song playlist import, progress is lost.

### Improvement
Create a `download_jobs` table in `music.db`:
```sql
CREATE TABLE IF NOT EXISTS download_jobs (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,          -- 'single' | 'playlist'
  status          TEXT NOT NULL,          -- 'pending' | 'downloading' | 'tagging' | 'done' | 'failed'
  url             TEXT,
  query           TEXT,
  song_id         TEXT,
  playlist_id     TEXT,
  title           TEXT,
  artist_name     TEXT,
  error           TEXT,
  completed_count INTEGER DEFAULT 0,
  total_count     INTEGER DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
```
- On server startup, any job left in `downloading` or `pending` can be safely marked as `failed` with `"Server restarted during processing"` or automatically resumed.

---

## 2. Rate-Limiting & YouTube Anti-Bot Avoidance

### Politeness Strategy
- **Sequential queue**: Never spawn concurrent `yt-dlp` download processes.
- **Sleep interval**: In playlist imports, add a random 1-3 second delay between track requests:
  ```typescript
  await new Promise(res => setTimeout(res, 1000 + Math.random() * 2000));
  ```
- **Cookie Support**: Add optional `COOKIES_PATH` environment variable pointing to a Netscape format `cookies.txt` file passed as `--cookies <path>` to `yt-dlp` to bypass age-restricted or bot detection checks.

---

## 3. Backend Error Boundaries & Process Lifecycle

### Graceful Shutdown
Handle `SIGINT` and `SIGTERM` signals properly:
```typescript
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
signals.forEach((sig) => {
  process.on(sig, async () => {
    console.log(`Received ${sig}, closing server gracefully...`);
    await app.close();
    getDb().close();
    process.exit(0);
  });
});
```

### Unhandled Rejection Guard
Add global process error hooks to prevent unexpected exit:
```typescript
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
```

---

## 4. Audio Engine Resilience (Frontend)

### Auto-Recovery from Stalls & Disconnections
In `frontend/src/services/audioEngine.ts`:
1. **Stall Detection**: If playback is active but `audio.currentTime` does not advance for > 3 seconds, fire `audio.load()` and resume from the saved timestamp.
2. **Audio Focus & Interruption Handling**:
   - Web: Listen to `navigator.mediaSession` events (`pause`, `play`, `previoustrack`, `nexttrack`, `seekto`).
   - Native: Integrate Android `AudioManager` audio focus requests (auto-ducking / pausing when phone rings or navigation speaks).
3. **Headphone Unplug Detection**: Pause playback automatically when audio output route disconnects (`becoming noisy` intent).

---

## 5. Offline Caching (Stretch Roadmap Phase 8)

### Client-Side Cache Strategy
- Use Expo FileSystem (`expo-file-system`) on Android or Cache API on Web.
- When the user taps "Make available offline" on a playlist or favorite track:
  - Download audio stream to device sandbox: `${FileSystem.documentDirectory}/offline/${songId}.m4a`.
  - Point `audioEngine.load()` to the local file URI if present, falling back to streaming over LAN when not cached.
