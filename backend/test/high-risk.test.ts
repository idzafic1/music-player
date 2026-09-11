import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { getDb } from '../src/db/index.js';
import { AUDIO_DIR, THUMBNAILS_DIR } from '../src/config.js';
import { getOrCreateArtist } from '../src/services/library.js';
import { downloadSingleSong, importYouTubePlaylist, getJob } from '../src/services/downloader.js';
import { refreshDailyRecommendations, getDailyRecommendations } from '../src/services/recommendations.js';

function resetDb() {
  const db = getDb();
  for (const table of ['plays', 'song_genres', 'favorites', 'ratings', 'playlist_songs', 'playlists', 'songs', 'artists', 'genres', 'recommendations', 'download_jobs', 'settings']) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
}

function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('Timed out waiting for predicate'));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

function installStubCommands(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'music-player-stubs-'));

  const ytDlpScript = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const writeJson = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
if (args.includes('--flat-playlist')) {
  writeJson({ id: 'video-1', title: 'Playlist Track One', url: 'https://www.youtube.com/watch?v=video-1', playlist_title: 'Demo Playlist' });
  writeJson({ id: 'video-2', title: 'Playlist Track Two', url: 'https://www.youtube.com/watch?v=video-2', playlist_title: 'Demo Playlist' });
  process.exit(0);
}
if (args.includes('--dump-json')) {
  const target = args.find((arg) => arg.startsWith('https://') || arg.startsWith('ytsearch')) || 'https://www.youtube.com/watch?v=video-1';
  const sourceId = target.startsWith('ytsearch') ? 'video-1' : new URL(target).searchParams.get('v') || 'video-1';
  writeJson({
    id: sourceId,
    title: 'Generated Song',
    channel: 'Generated Artist',
    uploader: 'Generated Artist',
    duration: 180,
    webpage_url: 'https://www.youtube.com/watch?v=' + sourceId,
    categories: ['electronica', 'moody'],
    tags: ['ambient', 'late-night']
  });
  process.exit(0);
}
const outIndex = args.indexOf('-o');
if (outIndex >= 0) {
  const template = args[outIndex + 1];
  const sourceUrl = args[args.length - 1];
  const sourceId = new URL(sourceUrl).searchParams.get('v') || 'video-1';
  const audioPath = template.replace('%(id)s.%(ext)s', sourceId + '.m4a');
  const thumbPath = path.join(path.dirname(audioPath), sourceId + '.jpg');
  fs.mkdirSync(path.dirname(audioPath), { recursive: true });
  fs.writeFileSync(audioPath, Buffer.alloc(256, 5));
  fs.writeFileSync(thumbPath, Buffer.alloc(128, 7));
}
process.exit(0);
`;

  const ffmpegScript = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const outPath = args[args.length - 1];
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, Buffer.alloc(64, 9));
process.exit(0);
`;

  fs.writeFileSync(path.join(dir, 'yt-dlp'), ytDlpScript, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'ffmpeg'), ffmpegScript, { mode: 0o755 });
  process.env.PATH = `${dir}:${process.env.PATH || ''}`;
  return dir;
}

test('backend API contract: streaming + favorites + playlists + play tracking + wrapped stats', async (t) => {
  resetDb();
  const app = await buildApp();
  t.after(async () => {
    await app.close();
    resetDb();
  });

  const artistId = getOrCreateArtist('Contract Artist');
  const songId = 'song-contract-1';
  const audioPath = path.join(AUDIO_DIR, `${songId}.m4a`);
  const thumbPath = path.join(THUMBNAILS_DIR, `${songId}.jpg`);
  fs.writeFileSync(audioPath, Buffer.alloc(2048, 1));
  fs.writeFileSync(thumbPath, Buffer.alloc(512, 2));
  getDb().prepare(`
    INSERT INTO songs (id, title, artist_id, duration_sec, file_path, thumbnail_path, source, source_id, source_url, added_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(songId, 'Range Test Track', artistId, 120, audioPath, thumbPath, 'manual', 'range-1', 'https://example.com/range-1', Math.floor(Date.now() / 1000));

  const listRes = await app.inject({ method: 'GET', url: '/api/songs?q=Range' });
  assert.equal(listRes.statusCode, 200);
  const listBody = JSON.parse(listRes.body);
  assert.ok(listBody.songs.some((song: any) => song.id === songId));

  const streamRes = await app.inject({ method: 'GET', url: `/api/songs/${songId}/stream` });
  assert.equal(streamRes.statusCode, 200);
  assert.equal(streamRes.headers['accept-ranges'], 'bytes');

  const rangeRes = await app.inject({
    method: 'GET',
    url: `/api/songs/${songId}/stream`,
    headers: { range: 'bytes=0-511' }
  });
  assert.equal(rangeRes.statusCode, 206);
  assert.equal(rangeRes.headers['content-length'], '512');
  assert.match(String(rangeRes.headers['content-range']), /^bytes 0-511\/2048$/);

  const favoriteRes = await app.inject({ method: 'PUT', url: `/api/favorites/${songId}` });
  assert.equal(favoriteRes.statusCode, 200);

  const ratingRes = await app.inject({
    method: 'PUT',
    url: `/api/ratings/${songId}`,
    payload: { stars: 5 }
  });
  assert.equal(ratingRes.statusCode, 200);

  const playlistRes = await app.inject({
    method: 'POST',
    url: '/api/playlists',
    payload: { name: 'Queue Test', description: 'contract' }
  });
  assert.equal(playlistRes.statusCode, 201);
  const playlist = JSON.parse(playlistRes.body);
  const addSongRes = await app.inject({
    method: 'POST',
    url: `/api/playlists/${playlist.id}/songs`,
    payload: { songId }
  });
  assert.equal(addSongRes.statusCode, 200);

  const rejectPlayRes = await app.inject({
    method: 'POST',
    url: '/api/plays',
    payload: { songId, secondsPlayed: 10, sourceContext: 'library' }
  });
  assert.equal(rejectPlayRes.statusCode, 400);

  const acceptPlayRes = await app.inject({
    method: 'POST',
    url: '/api/plays',
    payload: { songId, secondsPlayed: 17, sourceContext: 'playlist:queue' }
  });
  assert.equal(acceptPlayRes.statusCode, 201);

  const statsRes = await app.inject({ method: 'GET', url: '/api/stats/wrapped' });
  assert.equal(statsRes.statusCode, 200);
  const stats = JSON.parse(statsRes.body);
  assert.equal(stats.totalQualifyingPlays, 1);
  assert.equal(stats.topSongs[0].songId, songId);
});

test('download jobs, playlist import, and recommendation cache follow the documented lifecycle', async (t) => {
  const stubDir = installStubCommands();
  t.after(() => {
    process.env.PATH = process.env.PATH?.replace(`${stubDir}:`, '').replace(stubDir, '') || '';
    resetDb();
  });

  resetDb();
  const singleJobId = await downloadSingleSong('https://www.youtube.com/watch?v=video-1');
  await waitFor(() => getJob(singleJobId)?.status === 'done', 5000);
  const singleJob = getJob(singleJobId)!;
  assert.equal(singleJob.status, 'done');
  assert.ok(singleJob.songId);

  const playlistJobId = await importYouTubePlaylist('https://www.youtube.com/playlist?list=demo-list', 'Demo Playlist');
  await waitFor(() => getJob(playlistJobId)?.status === 'done', 5000);
  const playlistJob = getJob(playlistJobId)!;
  assert.equal(playlistJob.status, 'done');
  assert.equal(playlistJob.totalCount, 2);
  assert.equal(playlistJob.completedCount, 2);

  const db = getDb();
  db.prepare('INSERT INTO artists (id, name, thumbnail_path, created_at) VALUES (?, ?, ?, ?)')
    .run('artist-rec', 'Top Artist', null, Math.floor(Date.now() / 1000));
  db.prepare('INSERT INTO songs (id, title, artist_id, duration_sec, file_path, thumbnail_path, source, source_id, source_url, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('song-rec', 'Top Song', 'artist-rec', 180, '/tmp/rec.m4a', null, 'manual', 'rec-source', 'https://example.com/rec', Math.floor(Date.now() / 1000));
  db.prepare('INSERT INTO plays (id, song_id, played_at, seconds_played, source_context) VALUES (?, ?, ?, ?, ?)')
    .run('play-rec-1', 'song-rec', Math.floor(Date.now() / 1000), 30, 'library');
  db.prepare('INSERT INTO genres (id, name) VALUES (?, ?)').run('genre-rec-id', 'moody');
  db.prepare('INSERT INTO song_genres (song_id, genre_id) VALUES (?, ?)').run('song-rec', 'genre-rec-id');

  const refreshed = await refreshDailyRecommendations();
  assert.ok(refreshed.length >= 1);
  const cached = getDailyRecommendations();
  assert.equal(cached.length, refreshed.length);
});

test('frontend audio engine: qualifying play timer suppresses duplicate firing and resets across tracks', async (t) => {
  const originalWindow = (globalThis as any).window;
  const originalNavigator = (globalThis as any).navigator;
  const originalLocalStorage = (globalThis as any).localStorage;
  const originalAudio = (globalThis as any).Audio;
  const originalDateNow = Date.now;

  class FakeAudio {
    currentTime = 0;
    duration = 100;
    paused = true;
    src = '';
    readyState = 4;
    private listeners: Record<string, Array<() => void>> = {};

    addEventListener(type: string, cb: () => void) {
      this.listeners[type] ??= [];
      this.listeners[type].push(cb);
    }

    dispatch(type: string) {
      for (const cb of this.listeners[type] ?? []) cb();
    }

    load() {
      this.paused = false;
    }

    async play() {
      this.paused = false;
      this.dispatch('play');
    }

    pause() {
      this.paused = true;
      this.dispatch('pause');
    }
  }

  const fakeStorage = { getItem: () => null, setItem: () => undefined };
  Object.defineProperty(globalThis, 'window', {
    value: { location: { hostname: 'localhost' }, localStorage: fakeStorage },
    configurable: true,
    writable: true
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: fakeStorage,
    configurable: true,
    writable: true
  });
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      mediaSession: {
        playbackState: 'none',
        metadata: null,
        setActionHandler: () => undefined
      }
    },
    configurable: true,
    writable: true
  });
  (globalThis as any).Audio = FakeAudio;

  let nowMs = 0;
  Date.now = () => nowMs;

  try {
    const { audioEngine } = await import('../../frontend/src/services/audioEngine.ts');
    const { api } = await import('../../frontend/src/services/api.ts');
    const calls: Array<[string, number, string]> = [];
    const originalRecordPlay = api.recordPlay;
    api.recordPlay = async (songId: string, secondsPlayed: number, sourceContext: string) => {
      calls.push([songId, secondsPlayed, sourceContext]);
      return { ok: true };
    };

    t.after(() => {
      api.recordPlay = originalRecordPlay;
      Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true, writable: true });
      Object.defineProperty(globalThis, 'localStorage', { value: originalLocalStorage, configurable: true, writable: true });
      Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true, writable: true });
      (globalThis as any).Audio = originalAudio;
      Date.now = originalDateNow;
    });

    const songA = {
      id: 'fe-song-a',
      title: 'Front End Song A',
      artistId: null,
      artistName: 'Front End Artist',
      durationSec: 120,
      filePath: '/tmp/a.mp3',
      thumbnailPath: null,
      thumbnailUrl: null,
      streamUrl: '/api/songs/fe-song-a/stream',
      source: 'manual',
      sourceId: 'fe-a',
      sourceUrl: 'https://example.com/fe-a',
      addedAt: 0,
      genres: [],
      rating: null,
      isFavorite: false,
      playCount: 0
    };

    await audioEngine.load(songA, 'library');
    const fakePlayer = (audioEngine as any).audio as FakeAudio;
    fakePlayer.paused = false;

    nowMs = 1000;
    fakePlayer.currentTime = 5;
    fakePlayer.dispatch('timeupdate');

    nowMs = 9000;
    fakePlayer.currentTime = 12;
    fakePlayer.dispatch('timeupdate');

    nowMs = 17000;
    fakePlayer.currentTime = 20;
    fakePlayer.dispatch('timeupdate');

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], ['fe-song-a', 16, 'library']);

    nowMs = 25000;
    fakePlayer.currentTime = 25;
    fakePlayer.dispatch('timeupdate');
    assert.equal(calls.length, 1);

    const songB = { ...songA, id: 'fe-song-b', title: 'Front End Song B' };
    await audioEngine.load(songB, 'library');
    assert.equal((audioEngine as any).secondsAccumulated, 0);
    assert.equal((audioEngine as any).hasFiredPlay, false);
  } finally {
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: originalLocalStorage, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true, writable: true });
    (globalThis as any).Audio = originalAudio;
    Date.now = originalDateNow;
  }
});
