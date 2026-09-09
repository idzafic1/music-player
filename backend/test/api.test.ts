import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import { buildApp } from '../src/app.js';
import { getDb } from '../src/db/index.js';
import { AUDIO_DIR, THUMBNAILS_DIR } from '../src/config.js';
import { getOrCreateArtist } from '../src/services/library.js';

test('Backend API Suite', async (t) => {
  const app = await buildApp();
  const db = getDb();

  await t.test('1. Health Check', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.status, 'ok');

    const res2 = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(res2.statusCode, 200);
  });

  // Seed a test song with dedicated audio file
  const testArtistId = getOrCreateArtist('Test Artist');
  const testSongId = uuidv4();
  const testSourceId = 'test-' + uuidv4();
  const now = Math.floor(Date.now() / 1000);
  const testAudioPath = path.join(AUDIO_DIR, `test-tone-${testSongId}.m4a`);
  const testThumbPath = path.join(THUMBNAILS_DIR, `test-thumb-${testSongId}.jpg`);

  fs.writeFileSync(testAudioPath, Buffer.alloc(2048, 1));
  fs.writeFileSync(testThumbPath, Buffer.alloc(512, 1));

  db.prepare(`
    INSERT INTO songs (id, title, artist_id, duration_sec, file_path, thumbnail_path, source, source_id, source_url, added_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(testSongId, 'Test Track Sine', testArtistId, 20, testAudioPath, testThumbPath, 'manual', testSourceId, 'http://test', now);

  await t.test('2. Songs Library & Detail', async () => {
    const listRes = await app.inject({ method: 'GET', url: '/api/songs?q=Sine' });
    assert.equal(listRes.statusCode, 200);
    const listData = JSON.parse(listRes.body);
    assert.ok(listData.songs.length >= 1);
    const found = listData.songs.find((s: any) => s.id === testSongId);
    assert.ok(found);
    assert.equal(found.artistName, 'Test Artist');

    const detailRes = await app.inject({ method: 'GET', url: `/api/songs/${testSongId}` });
    assert.equal(detailRes.statusCode, 200);
    const detail = JSON.parse(detailRes.body);
    assert.equal(detail.title, 'Test Track Sine');
    assert.equal(detail.durationSec, 20);
    assert.equal(detail.isFavorite, false);
    assert.equal(detail.rating, null);
  });

  await t.test('3. Audio Streaming with HTTP Range', async () => {
    // Standard full stream
    const fullRes = await app.inject({ method: 'GET', url: `/api/songs/${testSongId}/stream` });
    assert.equal(fullRes.statusCode, 200);
    assert.equal(fullRes.headers['accept-ranges'], 'bytes');
    assert.ok(parseInt(fullRes.headers['content-length'] as string, 10) > 0);

    // Range stream
    const rangeRes = await app.inject({
      method: 'GET',
      url: `/api/songs/${testSongId}/stream`,
      headers: { range: 'bytes=0-499' }
    });
    assert.equal(rangeRes.statusCode, 206);
    assert.equal(rangeRes.headers['content-length'], '500');
    assert.ok((rangeRes.headers['content-range'] as string).startsWith('bytes 0-499/'));
  });

  await t.test('4. Song Metadata Update & Genres', async () => {
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/songs/${testSongId}`,
      payload: { title: 'Updated Test Track' }
    });
    assert.equal(patchRes.statusCode, 200);
    const updated = JSON.parse(patchRes.body);
    assert.equal(updated.title, 'Updated Test Track');

    const genreRes = await app.inject({
      method: 'PATCH',
      url: `/api/songs/${testSongId}/genres`,
      payload: { genreNames: ['electronic', 'synthwave'] }
    });
    assert.equal(genreRes.statusCode, 200);
    const withGenres = JSON.parse(genreRes.body);
    assert.deepEqual(withGenres.genres.sort(), ['electronic', 'synthwave']);

    const genresListRes = await app.inject({ method: 'GET', url: '/api/genres' });
    assert.equal(genresListRes.statusCode, 200);
    const genresList = JSON.parse(genresListRes.body);
    assert.ok(genresList.some((g: any) => g.name === 'electronic'));
  });

  await t.test('5. Favorites & Ratings', async () => {
    // Favorite
    const favRes = await app.inject({ method: 'PUT', url: `/api/favorites/${testSongId}` });
    assert.equal(favRes.statusCode, 200);

    const favList = await app.inject({ method: 'GET', url: '/api/favorites' });
    const favData = JSON.parse(favList.body);
    assert.ok(favData.songs.some((s: any) => s.id === testSongId));

    // Rate
    const rateRes = await app.inject({
      method: 'PUT',
      url: `/api/ratings/${testSongId}`,
      payload: { stars: 5 }
    });
    assert.equal(rateRes.statusCode, 200);

    const songRes = await app.inject({ method: 'GET', url: `/api/songs/${testSongId}` });
    const songData = JSON.parse(songRes.body);
    assert.equal(songData.isFavorite, true);
    assert.equal(songData.rating, 5);

    // Unfavorite & unrate
    await app.inject({ method: 'DELETE', url: `/api/favorites/${testSongId}` });
    await app.inject({ method: 'DELETE', url: `/api/ratings/${testSongId}` });

    const clearedRes = await app.inject({ method: 'GET', url: `/api/songs/${testSongId}` });
    const cleared = JSON.parse(clearedRes.body);
    assert.equal(cleared.isFavorite, false);
    assert.equal(cleared.rating, null);
  });

  await t.test('6. Playlists CRUD & Reorder', async () => {
    // Create
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/playlists',
      payload: { name: 'My Test Playlist', description: 'Testing' }
    });
    assert.equal(createRes.statusCode, 201);
    const playlist = JSON.parse(createRes.body);

    // Add song
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/playlists/${playlist.id}/songs`,
      payload: { songId: testSongId }
    });
    assert.equal(addRes.statusCode, 200);

    // Get playlist detail
    const getRes = await app.inject({ method: 'GET', url: `/api/playlists/${playlist.id}` });
    assert.equal(getRes.statusCode, 200);
    const detail = JSON.parse(getRes.body);
    assert.equal(detail.songs.length, 1);
    assert.equal(detail.songs[0].id, testSongId);

    // Reorder / Rename
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/playlists/${playlist.id}`,
      payload: { name: 'Renamed Playlist', songOrder: [testSongId] }
    });
    assert.equal(patchRes.statusCode, 200);
    assert.equal(JSON.parse(patchRes.body).name, 'Renamed Playlist');

    // Remove song
    const remRes = await app.inject({
      method: 'DELETE',
      url: `/api/playlists/${playlist.id}/songs/${testSongId}`
    });
    assert.equal(remRes.statusCode, 200);

    // Delete playlist
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/playlists/${playlist.id}`
    });
    assert.equal(delRes.statusCode, 200);
  });

  await t.test('7. Play Tracking & Wrapped Stats', async () => {
    // Non-qualifying play (< 15 seconds)
    const rejectRes = await app.inject({
      method: 'POST',
      url: '/api/plays',
      payload: { songId: testSongId, secondsPlayed: 10, sourceContext: 'library' }
    });
    assert.equal(rejectRes.statusCode, 400);

    // Qualifying play (>= 15 seconds)
    const acceptRes = await app.inject({
      method: 'POST',
      url: '/api/plays',
      payload: { songId: testSongId, secondsPlayed: 18, sourceContext: 'library' }
    });
    assert.equal(acceptRes.statusCode, 201);

    // Stats / Wrapped
    const statsRes = await app.inject({ method: 'GET', url: '/api/stats/wrapped' });
    assert.equal(statsRes.statusCode, 200);
    const stats = JSON.parse(statsRes.body);
    assert.ok(stats.totalQualifyingPlays >= 1);
    assert.ok(stats.topSongs.some((s: any) => s.songId === testSongId));
  });

  await t.test('8. Settings', async () => {
    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { theme: 'dark', audioQuality: 'high' }
    });
    assert.equal(patchRes.statusCode, 200);

    const getRes = await app.inject({ method: 'GET', url: '/api/settings' });
    assert.equal(getRes.statusCode, 200);
    const settings = JSON.parse(getRes.body);
    assert.equal(settings.theme, 'dark');
    assert.equal(settings.audioQuality, 'high');
  });

  // Cleanup test song
  await app.inject({ method: 'DELETE', url: `/api/songs/${testSongId}` });
  await app.close();
});
