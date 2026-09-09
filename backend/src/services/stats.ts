import { getDb } from '../db/index.js';

export interface WrappedStats {
  topSongs: { songId: string; title: string; artistName: string; playCount: number }[];
  topArtists: { artistId: string; name: string; playCount: number }[];
  topGenres: { genre: string; playCount: number }[];
  totalQualifyingPlays: number;
  totalMinutesListened: number;
}

export function getWrappedStats(fromSec?: number, toSec?: number): WrappedStats {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const from = fromSec || (now - 365 * 24 * 3600);
  const to = toSec || now;

  // Top 5 songs
  const topSongsQuery = `
    SELECT 
      p.song_id AS songId, 
      s.title, 
      COALESCE(a.name, 'Unknown Artist') AS artistName, 
      COUNT(*) AS playCount
    FROM plays p
    JOIN songs s ON s.id = p.song_id
    LEFT JOIN artists a ON a.id = s.artist_id
    WHERE p.played_at BETWEEN ? AND ?
    GROUP BY p.song_id
    ORDER BY playCount DESC, s.title ASC
    LIMIT 5
  `;
  const topSongs = db.prepare(topSongsQuery).all(from, to) as any[];

  // Top 5 artists
  const topArtistsQuery = `
    SELECT 
      s.artist_id AS artistId, 
      a.name, 
      COUNT(*) AS playCount
    FROM plays p
    JOIN songs s ON s.id = p.song_id
    JOIN artists a ON a.id = s.artist_id
    WHERE p.played_at BETWEEN ? AND ?
    GROUP BY s.artist_id
    ORDER BY playCount DESC, a.name ASC
    LIMIT 5
  `;
  const topArtists = db.prepare(topArtistsQuery).all(from, to) as any[];

  // Top 5 genres
  const topGenresQuery = `
    SELECT 
      g.name AS genre, 
      COUNT(*) AS playCount
    FROM plays p
    JOIN song_genres sg ON sg.song_id = p.song_id
    JOIN genres g ON g.id = sg.genre_id
    WHERE p.played_at BETWEEN ? AND ?
    GROUP BY g.name
    ORDER BY playCount DESC, g.name ASC
    LIMIT 5
  `;
  const topGenres = db.prepare(topGenresQuery).all(from, to) as any[];

  // Aggregate totals
  const totalsQuery = `
    SELECT 
      COUNT(*) AS totalQualifyingPlays,
      COALESCE(SUM(seconds_played), 0) AS totalSeconds
    FROM plays
    WHERE played_at BETWEEN ? AND ?
  `;
  const totals = db.prepare(totalsQuery).get(from, to) as any;

  return {
    topSongs,
    topArtists,
    topGenres,
    totalQualifyingPlays: totals ? totals.totalQualifyingPlays : 0,
    totalMinutesListened: totals ? Math.round(totals.totalSeconds / 60) : 0
  };
}
