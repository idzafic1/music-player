# Database Schema (SQLite)

All timestamps are stored as Unix epoch seconds (INTEGER). All IDs are TEXT UUIDs
unless noted. Use `PRAGMA foreign_keys = ON;` at connection time.

```sql
-- Artists
CREATE TABLE artists (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  thumbnail_path TEXT,             -- local file path, nullable
  created_at    INTEGER NOT NULL
);

-- Songs (the core entity — one row per downloaded audio file)
CREATE TABLE songs (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  artist_id       TEXT REFERENCES artists(id),
  duration_sec    INTEGER NOT NULL,
  file_path       TEXT NOT NULL,        -- local path to audio file
  thumbnail_path  TEXT,                 -- local path to cached thumbnail/icon
  source          TEXT NOT NULL,        -- 'youtube' | 'youtube_music' | 'manual'
  source_id       TEXT,                 -- original YouTube video id, for de-dup
  source_url      TEXT,
  added_at        INTEGER NOT NULL,
  UNIQUE(source, source_id)
);
CREATE INDEX idx_songs_artist ON songs(artist_id);
CREATE INDEX idx_songs_title ON songs(title);

-- Genres (a song can have multiple genre/mood tags)
CREATE TABLE genres (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE       -- e.g. 'lofi', 'moody', 'depressive', 'upbeat'
);

CREATE TABLE song_genres (
  song_id   TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  genre_id  TEXT NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (song_id, genre_id)
);

-- Playlists (user-created, or generated from a YouTube playlist import)
CREATE TABLE playlists (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  source       TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'youtube_import'
  source_url   TEXT,
  created_at   INTEGER NOT NULL
);

CREATE TABLE playlist_songs (
  playlist_id  TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  song_id      TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,        -- ordering within playlist
  added_at     INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, song_id)
);
CREATE INDEX idx_playlist_songs_playlist ON playlist_songs(playlist_id, position);

-- Favorites (simple boolean-style join table, one row = favorited)
CREATE TABLE favorites (
  song_id      TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
  favorited_at INTEGER NOT NULL
);

-- Ratings (e.g. 1-5 stars; one rating per song, overwritable)
CREATE TABLE ratings (
  song_id    TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
  stars      INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  rated_at   INTEGER NOT NULL
);

-- Plays (the "Wrapped" ledger — one row per QUALIFYING play, i.e. listened >=15s)
CREATE TABLE plays (
  id            TEXT PRIMARY KEY,
  song_id       TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  played_at     INTEGER NOT NULL,       -- when the qualifying threshold was hit
  seconds_played INTEGER NOT NULL,      -- how much of the song was actually heard
                                         -- (informational only — the row existing
                                         --  already means the >=15s threshold passed)
  source_context TEXT                   -- 'library' | 'playlist:<id>' | 'search' | 'recommendation'
);
CREATE INDEX idx_plays_song ON plays(song_id);
CREATE INDEX idx_plays_played_at ON plays(played_at);

-- Recommendations cache (rewritten daily by the cron job)
CREATE TABLE recommendations (
  id            TEXT PRIMARY KEY,
  generated_at  INTEGER NOT NULL,
  reason        TEXT NOT NULL,          -- e.g. 'because you listen to <artist>', 'moody genre pick'
  source_id     TEXT NOT NULL,          -- YouTube video id (not yet downloaded)
  title         TEXT NOT NULL,
  artist_name   TEXT NOT NULL,
  thumbnail_url TEXT,
  source_url    TEXT NOT NULL
);
CREATE INDEX idx_recommendations_generated_at ON recommendations(generated_at);

-- Settings (single-row key/value config table)
CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- Download Jobs (durable task ledger across restarts)
CREATE TABLE download_jobs (
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
CREATE INDEX idx_download_jobs_status ON download_jobs(status);
```

## Derived stats (computed, not stored)

"Wrapped"-style stats are **computed on read** from the `plays` table, not
pre-aggregated — the personal library is small enough that this is fast. Example
queries an agent will need for `GET /stats/wrapped`:

```sql
-- Top songs in a time range
SELECT song_id, COUNT(*) AS play_count
FROM plays
WHERE played_at BETWEEN :from AND :to
GROUP BY song_id
ORDER BY play_count DESC
LIMIT 5;

-- Top artists in a time range
SELECT s.artist_id, COUNT(*) AS play_count
FROM plays p
JOIN songs s ON s.id = p.song_id
WHERE p.played_at BETWEEN :from AND :to
GROUP BY s.artist_id
ORDER BY play_count DESC
LIMIT 5;

-- Top genres in a time range
SELECT g.name, COUNT(*) AS play_count
FROM plays p
JOIN song_genres sg ON sg.song_id = p.song_id
JOIN genres g ON g.id = sg.genre_id
WHERE p.played_at BETWEEN :from AND :to
GROUP BY g.name
ORDER BY play_count DESC
LIMIT 5;
```

## Notes for the agent

- Use a migrations tool (hand-rolled migration runner on top of `better-sqlite3`,
  or Prisma Migrate if Prisma is chosen). Never hand-edit the SQLite file directly
  in code paths.
- `seconds_played` in `plays` is informational; the **existence** of a row is what
  the 15-second rule produces — see `API_SPEC.md`'s `POST /plays` for exactly when
  the client should fire this.
- Genres can be assigned automatically (from YouTube Music metadata/tags at
  download time) or manually edited later — both write to `song_genres`.
