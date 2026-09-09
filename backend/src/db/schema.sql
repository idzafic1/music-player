-- Artists
CREATE TABLE IF NOT EXISTS artists (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  thumbnail_path TEXT,
  created_at    INTEGER NOT NULL
);

-- Songs
CREATE TABLE IF NOT EXISTS songs (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  artist_id       TEXT REFERENCES artists(id),
  duration_sec    INTEGER NOT NULL,
  file_path       TEXT NOT NULL,
  thumbnail_path  TEXT,
  source          TEXT NOT NULL,
  source_id       TEXT,
  source_url      TEXT,
  added_at        INTEGER NOT NULL,
  UNIQUE(source, source_id)
);
CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist_id);
CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);

-- Genres
CREATE TABLE IF NOT EXISTS genres (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS song_genres (
  song_id   TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  genre_id  TEXT NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (song_id, genre_id)
);

-- Playlists
CREATE TABLE IF NOT EXISTS playlists (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  source       TEXT NOT NULL DEFAULT 'manual',
  source_url   TEXT,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_songs (
  playlist_id  TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  song_id      TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  added_at     INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, song_id)
);
CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist ON playlist_songs(playlist_id, position);

-- Favorites
CREATE TABLE IF NOT EXISTS favorites (
  song_id      TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
  favorited_at INTEGER NOT NULL
);

-- Ratings
CREATE TABLE IF NOT EXISTS ratings (
  song_id    TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
  stars      INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  rated_at   INTEGER NOT NULL
);

-- Plays
CREATE TABLE IF NOT EXISTS plays (
  id            TEXT PRIMARY KEY,
  song_id       TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  played_at     INTEGER NOT NULL,
  seconds_played INTEGER NOT NULL,
  source_context TEXT
);
CREATE INDEX IF NOT EXISTS idx_plays_song ON plays(song_id);
CREATE INDEX IF NOT EXISTS idx_plays_played_at ON plays(played_at);

-- Recommendations cache
CREATE TABLE IF NOT EXISTS recommendations (
  id            TEXT PRIMARY KEY,
  generated_at  INTEGER NOT NULL,
  reason        TEXT NOT NULL,
  source_id     TEXT NOT NULL,
  title         TEXT NOT NULL,
  artist_name   TEXT NOT NULL,
  thumbnail_url TEXT,
  source_url    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recommendations_generated_at ON recommendations(generated_at);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- Download Jobs
CREATE TABLE IF NOT EXISTS download_jobs (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,
  status          TEXT NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_download_jobs_status ON download_jobs(status);

