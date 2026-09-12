import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs';
import { getDb } from '../db/index.js';

export interface SongDetail {
  id: string;
  title: string;
  artistId: string | null;
  artistName: string | null;
  durationSec: number;
  filePath: string;
  thumbnailPath: string | null;
  thumbnailUrl: string | null;
  streamUrl: string;
  source: string;
  sourceId: string | null;
  sourceUrl: string | null;
  addedAt: number;
  genres: string[];
  rating: number | null;
  isFavorite: boolean;
  playCount: number;
}

export function formatSongRow(row: any): SongDetail {
  return {
    id: row.id,
    title: row.title,
    artistId: row.artist_id || null,
    artistName: row.artist_name || null,
    durationSec: row.duration_sec,
    filePath: row.file_path,
    thumbnailPath: row.thumbnail_path || null,
    thumbnailUrl: row.thumbnail_path ? `/thumbnails/${row.thumbnail_path.split('/').pop()}` : null,
    streamUrl: `/api/songs/${row.id}/stream`,
    source: row.source,
    sourceId: row.source_id || null,
    sourceUrl: row.source_url || null,
    addedAt: row.added_at,
    genres: row.genre_names ? row.genre_names.split(',').filter(Boolean) : [],
    rating: row.rating_stars !== null && row.rating_stars !== undefined ? row.rating_stars : null,
    isFavorite: Boolean(row.is_favorite),
    playCount: row.play_count || 0
  };
}

export function getOrCreateArtist(name: string): string {
  const db = getDb();
  const trimmed = name.trim();
  const existing = db.prepare('SELECT id FROM artists WHERE name = ?').get(trimmed) as { id: string } | undefined;
  if (existing) {
    return existing.id;
  }
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  db.prepare('INSERT INTO artists (id, name, thumbnail_path, created_at) VALUES (?, ?, ?, ?)').run(id, trimmed, null, now);
  return id;
}

export function getOrCreateGenre(name: string): string {
  const db = getDb();
  const trimmed = name.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM genres WHERE name = ?').get(trimmed) as { id: string } | undefined;
  if (existing) {
    return existing.id;
  }
  const id = uuidv4();
  db.prepare('INSERT INTO genres (id, name) VALUES (?, ?)').run(id, trimmed);
  return id;
}

export function setSongGenres(songId: string, genreNames: string[]) {
  const db = getDb();
  const setGenresTx = db.transaction((names: string[]) => {
    db.prepare('DELETE FROM song_genres WHERE song_id = ?').run(songId);
    for (const rawName of names) {
      const name = rawName.trim().toLowerCase();
      if (!name) continue;
      const genreId = getOrCreateGenre(name);
      db.prepare('INSERT OR IGNORE INTO song_genres (song_id, genre_id) VALUES (?, ?)').run(songId, genreId);
    }
  });
  setGenresTx(genreNames);
}

export function getSongById(id: string): SongDetail | null {
  const db = getDb();
  const query = `
    SELECT 
      s.*,
      a.name AS artist_name,
      r.stars AS rating_stars,
      (f.song_id IS NOT NULL) AS is_favorite,
      (SELECT COUNT(*) FROM plays p WHERE p.song_id = s.id) AS play_count,
      (
        SELECT GROUP_CONCAT(g.name, ',')
        FROM song_genres sg
        JOIN genres g ON g.id = sg.genre_id
        WHERE sg.song_id = s.id
      ) AS genre_names
    FROM songs s
    LEFT JOIN artists a ON a.id = s.artist_id
    LEFT JOIN ratings r ON r.song_id = s.id
    LEFT JOIN favorites f ON f.song_id = s.id
    WHERE s.id = ?
  `;
  const row = db.prepare(query).get(id);
  if (!row) return null;
  return formatSongRow(row);
}

export function listSongs(options: {
  q?: string;
  genre?: string;
  sort?: 'title' | 'added_at' | 'play_count';
  limit?: number;
  offset?: number;
}): { songs: SongDetail[]; total: number } {
  const db = getDb();
  const requestedLimit = options.limit || 50;
  const limit = options.sort === 'added_at'
    ? Math.min(requestedLimit, 5)
    : Math.max(1, Math.min(requestedLimit, 200));
  const offset = Math.max(0, options.offset || 0);

  let whereClauses: string[] = [];
  let params: any[] = [];

  if (options.q) {
    whereClauses.push('(s.title LIKE ? OR a.name LIKE ?)');
    const searchTerm = `%${options.q.trim()}%`;
    params.push(searchTerm, searchTerm);
  }

  if (options.genre) {
    whereClauses.push(`s.id IN (
      SELECT sg.song_id 
      FROM song_genres sg 
      JOIN genres g ON g.id = sg.genre_id 
      WHERE g.name = ?
    )`);
    params.push(options.genre.trim().toLowerCase());
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  let orderSql = 'ORDER BY s.added_at DESC';
  if (options.sort === 'title') {
    orderSql = 'ORDER BY s.title COLLATE NOCASE ASC';
  } else if (options.sort === 'play_count') {
    orderSql = 'ORDER BY play_count DESC, s.added_at DESC';
  } else if (options.sort === 'added_at') {
    orderSql = 'ORDER BY s.added_at DESC';
  }

  const countQuery = `
    SELECT COUNT(DISTINCT s.id) as count
    FROM songs s
    LEFT JOIN artists a ON a.id = s.artist_id
    ${whereSql}
  `;
  const countRow = db.prepare(countQuery).get(...params) as { count: number };
  const total = countRow ? countRow.count : 0;

  const dataQuery = `
    SELECT 
      s.*,
      a.name AS artist_name,
      r.stars AS rating_stars,
      (f.song_id IS NOT NULL) AS is_favorite,
      (SELECT COUNT(*) FROM plays p WHERE p.song_id = s.id) AS play_count,
      (
        SELECT GROUP_CONCAT(g.name, ',')
        FROM song_genres sg
        JOIN genres g ON g.id = sg.genre_id
        WHERE sg.song_id = s.id
      ) AS genre_names
    FROM songs s
    LEFT JOIN artists a ON a.id = s.artist_id
    LEFT JOIN ratings r ON r.song_id = s.id
    LEFT JOIN favorites f ON f.song_id = s.id
    ${whereSql}
    ${orderSql}
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(dataQuery).all(...params, limit, offset);
  return {
    songs: rows.map(formatSongRow),
    total
  };
}

export function updateSong(id: string, updates: { title?: string; artistName?: string; genreNames?: string[] }): SongDetail | null {
  const db = getDb();
  const existing = getSongById(id);
  if (!existing) return null;

  db.transaction(() => {
    if (updates.artistName !== undefined) {
      const artistId = updates.artistName.trim() ? getOrCreateArtist(updates.artistName) : null;
      db.prepare('UPDATE songs SET artist_id = ? WHERE id = ?').run(artistId, id);
    }
    if (updates.title !== undefined && updates.title.trim()) {
      db.prepare('UPDATE songs SET title = ? WHERE id = ?').run(updates.title.trim(), id);
    }
    if (updates.genreNames !== undefined) {
      setSongGenres(id, updates.genreNames);
    }
  })();

  return getSongById(id);
}

export function deleteSong(id: string): boolean {
  const db = getDb();
  const song = db.prepare('SELECT file_path, thumbnail_path FROM songs WHERE id = ?').get(id) as { file_path: string; thumbnail_path: string | null } | undefined;
  if (!song) return false;

  db.prepare('DELETE FROM songs WHERE id = ?').run(id);

  // Delete physical files
  try {
    if (song.file_path && fs.existsSync(song.file_path)) {
      fs.unlinkSync(song.file_path);
    }
  } catch (err) {
    console.error(`Failed to delete audio file: ${song.file_path}`, err);
  }

  try {
    if (song.thumbnail_path && fs.existsSync(song.thumbnail_path)) {
      fs.unlinkSync(song.thumbnail_path);
    }
  } catch (err) {
    console.error(`Failed to delete thumbnail file: ${song.thumbnail_path}`, err);
  }

  return true;
}

export function listArtists(limit = 50, offset = 0): { id: string; name: string; thumbnailPath: string | null; songCount: number }[] {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const safeOffset = Math.max(0, offset);
  const query = `
    SELECT 
      a.id, 
      a.name, 
      a.thumbnail_path, 
      COUNT(s.id) AS song_count
    FROM artists a
    LEFT JOIN songs s ON s.artist_id = a.id
    GROUP BY a.id
    ORDER BY song_count DESC, a.name COLLATE NOCASE ASC
    LIMIT ? OFFSET ?
  `;
  const rows = db.prepare(query).all(safeLimit, safeOffset) as any[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    thumbnailPath: r.thumbnail_path,
    songCount: r.song_count
  }));
}

export function getArtistById(id: string): { artist: { id: string; name: string; thumbnailPath: string | null; songCount: number }; songs: SongDetail[] } | null {
  const db = getDb();
  const artistRow = db.prepare(`
    SELECT a.id, a.name, a.thumbnail_path, COUNT(s.id) AS song_count
    FROM artists a
    LEFT JOIN songs s ON s.artist_id = a.id
    WHERE a.id = ?
    GROUP BY a.id
  `).get(id) as any;

  if (!artistRow) return null;

  const songRows = db.prepare(`
    SELECT 
      s.*,
      a.name AS artist_name,
      r.stars AS rating_stars,
      (f.song_id IS NOT NULL) AS is_favorite,
      (SELECT COUNT(*) FROM plays p WHERE p.song_id = s.id) AS play_count,
      (
        SELECT GROUP_CONCAT(g.name, ',')
        FROM song_genres sg
        JOIN genres g ON g.id = sg.genre_id
        WHERE sg.song_id = s.id
      ) AS genre_names
    FROM songs s
    LEFT JOIN artists a ON a.id = s.artist_id
    LEFT JOIN ratings r ON r.song_id = s.id
    LEFT JOIN favorites f ON f.song_id = s.id
    WHERE s.artist_id = ?
    ORDER BY s.added_at DESC
  `).all(id) as any[];

  return {
    artist: {
      id: artistRow.id,
      name: artistRow.name,
      thumbnailPath: artistRow.thumbnail_path,
      songCount: artistRow.song_count
    },
    songs: songRows.map(formatSongRow)
  };
}

// Genres
export function listGenres(limit = 50, offset = 0): { id: string; name: string; songCount: number; sampleThumbnailUrl: string | null }[] {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const safeOffset = Math.max(0, offset);
  const query = `
    SELECT
      g.id, g.name, COUNT(sg.song_id) AS song_count,
      (
        SELECT s.thumbnail_path FROM songs s
        JOIN song_genres sg2 ON sg2.song_id = s.id
        WHERE sg2.genre_id = g.id
        ORDER BY s.added_at DESC LIMIT 1
      ) AS sample_thumbnail_path
    FROM genres g
    LEFT JOIN song_genres sg ON sg.genre_id = g.id
    GROUP BY g.id
    ORDER BY song_count DESC, g.name ASC
    LIMIT ? OFFSET ?
  `;
  const rows = db.prepare(query).all(safeLimit, safeOffset) as any[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    songCount: r.song_count,
    sampleThumbnailUrl: r.sample_thumbnail_path ? `/thumbnails/${r.sample_thumbnail_path.split('/').pop()}` : null
  }));
}

export function getRecentlyPlayedSongs(limit = 10): SongDetail[] {
  const db = getDb();
  const query = `
    SELECT
      s.*,
      a.name AS artist_name,
      r.stars AS rating_stars,
      (f.song_id IS NOT NULL) AS is_favorite,
      (SELECT COUNT(*) FROM plays p2 WHERE p2.song_id = s.id) AS play_count,
      (
        SELECT GROUP_CONCAT(g.name, ',')
        FROM song_genres sg
        JOIN genres g ON g.id = sg.genre_id
        WHERE sg.song_id = s.id
      ) AS genre_names,
      lastPlay.last_played_at
    FROM songs s
    JOIN (
      SELECT song_id, MAX(played_at) AS last_played_at
      FROM plays
      GROUP BY song_id
    ) lastPlay ON lastPlay.song_id = s.id
    LEFT JOIN artists a ON a.id = s.artist_id
    LEFT JOIN ratings r ON r.song_id = s.id
    LEFT JOIN favorites f ON f.song_id = s.id
    ORDER BY lastPlay.last_played_at DESC
    LIMIT ?
  `;
  const rows = db.prepare(query).all(limit);
  return rows.map(formatSongRow);
}

// Favorites
export function listFavorites(limit = 50, offset = 0): { songs: SongDetail[]; total: number } {
  const db = getDb();
  const countRow = db.prepare('SELECT COUNT(*) as count FROM favorites').get() as { count: number };
  const total = countRow ? countRow.count : 0;

  const query = `
    SELECT 
      s.*,
      a.name AS artist_name,
      r.stars AS rating_stars,
      1 AS is_favorite,
      (SELECT COUNT(*) FROM plays p WHERE p.song_id = s.id) AS play_count,
      (
        SELECT GROUP_CONCAT(g.name, ',')
        FROM song_genres sg
        JOIN genres g ON g.id = sg.genre_id
        WHERE sg.song_id = s.id
      ) AS genre_names
    FROM favorites f
    JOIN songs s ON s.id = f.song_id
    LEFT JOIN artists a ON a.id = s.artist_id
    LEFT JOIN ratings r ON r.song_id = s.id
    ORDER BY f.favorited_at DESC
    LIMIT ? OFFSET ?
  `;
  const rows = db.prepare(query).all(limit, offset) as any[];
  return {
    songs: rows.map(formatSongRow),
    total
  };
}

export function setFavorite(songId: string): boolean {
  const db = getDb();
  const songExists = db.prepare('SELECT id FROM songs WHERE id = ?').get(songId);
  if (!songExists) return false;

  const now = Math.floor(Date.now() / 1000);
  db.prepare('INSERT OR REPLACE INTO favorites (song_id, favorited_at) VALUES (?, ?)').run(songId, now);
  return true;
}

export function removeFavorite(songId: string): boolean {
  const db = getDb();
  db.prepare('DELETE FROM favorites WHERE song_id = ?').run(songId);
  return true;
}

// Ratings
export function setRating(songId: string, stars: number): boolean {
  if (stars < 1 || stars > 5) return false;
  const db = getDb();
  const songExists = db.prepare('SELECT id FROM songs WHERE id = ?').get(songId);
  if (!songExists) return false;

  const now = Math.floor(Date.now() / 1000);
  db.prepare('INSERT OR REPLACE INTO ratings (song_id, stars, rated_at) VALUES (?, ?, ?)').run(songId, stars, now);
  return true;
}

export function removeRating(songId: string): boolean {
  const db = getDb();
  db.prepare('DELETE FROM ratings WHERE song_id = ?').run(songId);
  return true;
}

// Playlists
export interface PlaylistDetail {
  id: string;
  name: string;
  description: string | null;
  source: string;
  sourceUrl: string | null;
  createdAt: number;
  songCount: number;
  sampleThumbnailUrl?: string | null;
  songs?: SongDetail[];
}

export function listPlaylists(limit = 50, offset = 0): PlaylistDetail[] {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const safeOffset = Math.max(0, offset);
  const query = `
    SELECT 
      p.*,
      COUNT(ps.song_id) AS song_count,
      (
        SELECT s.thumbnail_path FROM songs s
        JOIN playlist_songs ps2 ON ps2.song_id = s.id
        WHERE ps2.playlist_id = p.id
        ORDER BY ps2.position ASC LIMIT 1
      ) AS sample_thumbnail_path
    FROM playlists p
    LEFT JOIN playlist_songs ps ON ps.playlist_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const rows = db.prepare(query).all(safeLimit, safeOffset) as any[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    source: r.source,
    sourceUrl: r.source_url,
    createdAt: r.created_at,
    songCount: r.song_count,
    sampleThumbnailUrl: r.sample_thumbnail_path ? `/thumbnails/${r.sample_thumbnail_path.split('/').pop()}` : null
  }));
}

export function createPlaylist(name: string, description?: string, source = 'manual', sourceUrl?: string): PlaylistDetail {
  const db = getDb();
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  db.prepare('INSERT INTO playlists (id, name, description, source, source_url, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name.trim(), description?.trim() || null, source, sourceUrl || null, now);
  
  return {
    id,
    name: name.trim(),
    description: description?.trim() || null,
    source,
    sourceUrl: sourceUrl || null,
    createdAt: now,
    songCount: 0,
    songs: []
  };
}

export function getPlaylistById(id: string): PlaylistDetail | null {
  const db = getDb();
  const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(id) as any;
  if (!playlist) return null;

  const songRows = db.prepare(`
    SELECT 
      s.*,
      a.name AS artist_name,
      r.stars AS rating_stars,
      (f.song_id IS NOT NULL) AS is_favorite,
      (SELECT COUNT(*) FROM plays p WHERE p.song_id = s.id) AS play_count,
      (
        SELECT GROUP_CONCAT(g.name, ',')
        FROM song_genres sg
        JOIN genres g ON g.id = sg.genre_id
        WHERE sg.song_id = s.id
      ) AS genre_names
    FROM playlist_songs ps
    JOIN songs s ON s.id = ps.song_id
    LEFT JOIN artists a ON a.id = s.artist_id
    LEFT JOIN ratings r ON r.song_id = s.id
    LEFT JOIN favorites f ON f.song_id = s.id
    WHERE ps.playlist_id = ?
    ORDER BY ps.position ASC
  `).all(id) as any[];

  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    source: playlist.source,
    sourceUrl: playlist.source_url,
    createdAt: playlist.created_at,
    songCount: songRows.length,
    songs: songRows.map(formatSongRow)
  };
}

export function updatePlaylist(id: string, updates: { name?: string; description?: string; songOrder?: string[] }): PlaylistDetail | null {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM playlists WHERE id = ?').get(id);
  if (!existing) return null;

  db.transaction(() => {
    if (updates.name !== undefined && updates.name.trim()) {
      db.prepare('UPDATE playlists SET name = ? WHERE id = ?').run(updates.name.trim(), id);
    }
    if (updates.description !== undefined) {
      db.prepare('UPDATE playlists SET description = ? WHERE id = ?').run(updates.description.trim() || null, id);
    }
    if (updates.songOrder && Array.isArray(updates.songOrder)) {
      // Re-assign positions based on songOrder array
      updates.songOrder.forEach((songId, index) => {
        db.prepare('UPDATE playlist_songs SET position = ? WHERE playlist_id = ? AND song_id = ?')
          .run(index, id, songId);
      });
    }
  })();

  return getPlaylistById(id);
}

export function deletePlaylist(id: string): boolean {
  const db = getDb();
  const res = db.prepare('DELETE FROM playlists WHERE id = ?').run(id);
  return res.changes > 0;
}

export function addSongToPlaylist(playlistId: string, songId: string): boolean {
  const db = getDb();
  const playlist = db.prepare('SELECT id FROM playlists WHERE id = ?').get(playlistId);
  const song = db.prepare('SELECT id FROM songs WHERE id = ?').get(songId);
  if (!playlist || !song) return false;

  const maxPosRow = db.prepare('SELECT MAX(position) as max_pos FROM playlist_songs WHERE playlist_id = ?').get(playlistId) as { max_pos: number | null };
  const nextPos = (maxPosRow && maxPosRow.max_pos !== null) ? maxPosRow.max_pos + 1 : 0;
  const now = Math.floor(Date.now() / 1000);

  db.prepare('INSERT OR REPLACE INTO playlist_songs (playlist_id, song_id, position, added_at) VALUES (?, ?, ?, ?)')
    .run(playlistId, songId, nextPos, now);
  return true;
}

export function removeSongFromPlaylist(playlistId: string, songId: string): boolean {
  const db = getDb();
  const res = db.prepare('DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?').run(playlistId, songId);
  return res.changes > 0;
}
