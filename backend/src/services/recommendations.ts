import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';
import { search, getSimilar, OnlineSearchResult } from './youtubeMusic.js';

export interface RecommendationItem {
  id: string;
  sourceId: string;
  title: string;
  artistName: string;
  thumbnailUrl: string | null;
  sourceUrl: string;
  reason: string;
  generatedAt: number;
}

export function getDailyRecommendations(): RecommendationItem[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM recommendations
    ORDER BY generated_at DESC, rowid ASC
  `).all() as any[];

  return rows.map(r => ({
    id: r.id,
    sourceId: r.source_id,
    title: r.title,
    artistName: r.artist_name,
    thumbnailUrl: r.thumbnail_url,
    sourceUrl: r.source_url,
    reason: r.reason,
    generatedAt: r.generated_at
  }));
}

export async function refreshDailyRecommendations(): Promise<RecommendationItem[]> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const thirtyDaysAgo = now - 30 * 24 * 3600;

  // 1. Get existing song source_ids for de-duping
  const existingSongs = db.prepare('SELECT source_id FROM songs WHERE source_id IS NOT NULL').all() as { source_id: string }[];
  const existingSourceIds = new Set<string>(existingSongs.map(s => s.source_id));

  // 2. Top artists in last 30 days (or all time if library is young)
  let topArtists = db.prepare(`
    SELECT a.name, COUNT(*) AS plays
    FROM plays p
    JOIN songs s ON s.id = p.song_id
    JOIN artists a ON a.id = s.artist_id
    WHERE p.played_at >= ?
    GROUP BY a.id
    ORDER BY plays DESC
    LIMIT 5
  `).all(thirtyDaysAgo) as { name: string }[];

  if (topArtists.length === 0) {
    // Fall back to all artists in library
    topArtists = db.prepare(`
      SELECT a.name, COUNT(s.id) as plays
      FROM artists a
      JOIN songs s ON s.artist_id = a.id
      GROUP BY a.id
      ORDER BY plays DESC
      LIMIT 5
    `).all() as { name: string }[];
  }

  // 3. Top songs
  const topSongs = db.prepare(`
    SELECT s.title, a.name AS artist_name, COUNT(*) AS plays
    FROM plays p
    JOIN songs s ON s.id = p.song_id
    LEFT JOIN artists a ON a.id = s.artist_id
    WHERE p.played_at >= ?
    GROUP BY s.id
    ORDER BY plays DESC
    LIMIT 3
  `).all(thirtyDaysAgo) as { title: string; artist_name: string }[];

  const gathered: { item: OnlineSearchResult; reason: string }[] = [];
  const seenIds = new Set<string>();

  // Gather recommendations for top artists
  for (const artist of topArtists) {
    try {
      const results = await search(`${artist.name} music`, 5);
      for (const res of results) {
        if (!existingSourceIds.has(res.sourceId) && !seenIds.has(res.sourceId)) {
          seenIds.add(res.sourceId);
          gathered.push({ item: res, reason: `because you listen to ${artist.name}` });
        }
      }
    } catch {
      // Continue on error
    }
  }

  // Gather recommendations for top songs
  for (const song of topSongs) {
    try {
      const results = await getSimilar(song.title, song.artist_name || '', 4);
      for (const res of results) {
        if (!existingSourceIds.has(res.sourceId) && !seenIds.has(res.sourceId)) {
          seenIds.add(res.sourceId);
          gathered.push({ item: res, reason: `more like ${song.title}` });
        }
      }
    } catch {
      // Continue on error
    }
  }

  // If still empty (e.g. empty library initially), add general trending / chill mix
  if (gathered.length === 0) {
    try {
      const fallback = await search('chill melodic electronic music mix', 10);
      for (const res of fallback) {
        if (!existingSourceIds.has(res.sourceId) && !seenIds.has(res.sourceId)) {
          seenIds.add(res.sourceId);
          gathered.push({ item: res, reason: 'recommended starter pick' });
        }
      }
    } catch {
      // ignore
    }
  }

  // Cap at 25 items total
  const finalBatch = gathered.slice(0, 25);

  // Clear previous batch and insert new batch
  db.transaction(() => {
    db.prepare('DELETE FROM recommendations').run();
    const insertStmt = db.prepare(`
      INSERT INTO recommendations (id, generated_at, reason, source_id, title, artist_name, thumbnail_url, source_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const entry of finalBatch) {
      insertStmt.run(
        uuidv4(),
        now,
        entry.reason,
        entry.item.sourceId,
        entry.item.title,
        entry.item.artistName,
        entry.item.thumbnailUrl,
        entry.item.sourceUrl
      );
    }
  })();

  return getDailyRecommendations();
}

export async function getGenreRecommendations(genreName: string): Promise<{ sourceId: string; title: string; artistName: string; thumbnailUrl: string | null; reason: string; sourceUrl: string }[]> {
  const db = getDb();
  // Find a song in library with this genre for seed
  const sample = db.prepare(`
    SELECT s.title, a.name AS artist_name
    FROM songs s
    JOIN song_genres sg ON sg.song_id = s.id
    JOIN genres g ON g.id = sg.genre_id
    LEFT JOIN artists a ON a.id = s.artist_id
    WHERE g.name = ?
    LIMIT 1
  `).get(genreName.trim().toLowerCase()) as { title: string; artist_name: string } | undefined;

  let query = `${genreName} music playlist`;
  if (sample) {
    query = `${sample.artist_name || ''} ${genreName} music`;
  }

  const results = await search(query, 15);
  return results.map(r => ({
    sourceId: r.sourceId,
    title: r.title,
    artistName: r.artistName,
    thumbnailUrl: r.thumbnailUrl,
    sourceUrl: r.sourceUrl,
    reason: `tagged: ${genreName}`
  }));
}

export function initRecommendationsScheduler() {
  // Run once daily at 6:00 AM
  cron.schedule('0 6 * * *', async () => {
    console.log('[Recommendations] Running scheduled daily recommendations refresh...');
    try {
      await refreshDailyRecommendations();
      console.log('[Recommendations] Daily recommendations refresh complete.');
    } catch (err) {
      console.error('[Recommendations] Daily recommendations refresh failed:', err);
    }
  });

  // Check on server startup: if empty or > 24 hours old, run in background
  const db = getDb();
  const latestRow = db.prepare('SELECT MAX(generated_at) AS latest FROM recommendations').get() as { latest: number | null };
  const now = Math.floor(Date.now() / 1000);
  if (!latestRow || !latestRow.latest || (now - latestRow.latest) > 24 * 3600) {
    console.log('[Recommendations] Recommendations are stale or missing, triggering initial background refresh...');
    refreshDailyRecommendations().catch(err => console.error('[Recommendations] Startup refresh failed:', err));
  }
}
