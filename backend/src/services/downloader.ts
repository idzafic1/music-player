import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';
import { AUDIO_DIR, THUMBNAILS_DIR } from '../config.js';
import { getOrCreateArtist, setSongGenres, createPlaylist, addSongToPlaylist } from './library.js';

export type JobStatus = 'pending' | 'downloading' | 'tagging' | 'done' | 'failed';

export interface DownloadJob {
  id: string;
  type: 'single' | 'playlist';
  status: JobStatus;
  url?: string;
  query?: string;
  songId?: string;
  playlistId?: string;
  title?: string;
  artistName?: string;
  thumbnailUrl?: string;
  error?: string;
  completedCount?: number;
  totalCount?: number;
  failedVideos?: { id?: string; title?: string; error: string }[];
  createdAt: number;
}

const jobs = new Map<string, DownloadJob>();
const queue: (() => Promise<void>)[] = [];
let isProcessingQueue = false;

// Initialize and clean up orphaned jobs on startup
export function initDownloader() {
  try {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      UPDATE download_jobs
      SET status = 'failed', error = 'Server restarted during processing', updated_at = ?
      WHERE status IN ('pending', 'downloading', 'tagging')
    `).run(now);
  } catch (err) {
    console.error('Failed to clean up stale download jobs:', err);
  }
}

function saveJob(job: DownloadJob) {
  jobs.set(job.id, job);
  try {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      INSERT INTO download_jobs (
        id, type, status, url, query, song_id, playlist_id, title, artist_name,
        error, completed_count, total_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        song_id = excluded.song_id,
        playlist_id = excluded.playlist_id,
        title = excluded.title,
        artist_name = excluded.artist_name,
        error = excluded.error,
        completed_count = excluded.completed_count,
        total_count = excluded.total_count,
        updated_at = excluded.updated_at
    `).run(
      job.id,
      job.type,
      job.status,
      job.url || null,
      job.query || null,
      job.songId || null,
      job.playlistId || null,
      job.title || null,
      job.artistName || null,
      job.error || null,
      job.completedCount || 0,
      job.totalCount || 0,
      job.createdAt,
      now
    );
  } catch (err) {
    console.error(`Failed to persist job ${job.id} to SQLite:`, err);
  }
}

export function getJob(jobId: string): DownloadJob | undefined {
  if (jobs.has(jobId)) {
    return jobs.get(jobId);
  }

  try {
    const db = getDb();
    const row = db.prepare('SELECT * FROM download_jobs WHERE id = ?').get(jobId) as any;
    if (row) {
      const job: DownloadJob = {
        id: row.id,
        type: row.type,
        status: row.status,
        url: row.url || undefined,
        query: row.query || undefined,
        songId: row.song_id || undefined,
        playlistId: row.playlist_id || undefined,
        title: row.title || undefined,
        artistName: row.artist_name || undefined,
        error: row.error || undefined,
        completedCount: row.completed_count,
        totalCount: row.total_count,
        createdAt: row.created_at
      };
      jobs.set(job.id, job);
      return job;
    }
  } catch (err) {
    console.error('Error fetching job from db:', err);
  }

  return undefined;
}

function enqueue(task: () => Promise<void>) {
  queue.push(task);
  processQueue();
}

async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (queue.length > 0) {
    const task = queue.shift();
    if (task) {
      try {
        await task();
      } catch (err) {
        console.error('Download queue task error:', err);
      }
    }
  }

  isProcessingQueue = false;
}

function getYtDlpBaseArgs(): string[] {
  const args = ['--js-runtimes', 'node:node', '--no-warnings'];
  const cookiesPath = process.env.COOKIES_PATH;
  if (cookiesPath && fs.existsSync(cookiesPath)) {
    args.push('--cookies', cookiesPath);
  }
  return args;
}

function runCommand(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
    child.on('error', (err) => {
      resolve({ stdout, stderr: err.message, code: 1 });
    });
  });
}

export async function fetchVideoMetadata(target: string): Promise<any | null> {
  const isQuery = !target.startsWith('http://') && !target.startsWith('https://');
  const arg = isQuery ? `ytsearch1:${target}` : target;

  const res = await runCommand('yt-dlp', [
    ...getYtDlpBaseArgs(),
    arg,
    '--dump-json',
    '--no-playlist'
  ]);

  if (res.code !== 0 || !res.stdout.trim()) {
    return null;
  }

  try {
    return JSON.parse(res.stdout.trim().split('\n')[0]);
  } catch {
    return null;
  }
}

export async function downloadSingleSong(target: string, existingJobId?: string): Promise<string> {
  const jobId = existingJobId || uuidv4();
  const job: DownloadJob = {
    id: jobId,
    type: 'single',
    status: 'pending',
    createdAt: Math.floor(Date.now() / 1000)
  };
  if (target.startsWith('http://') || target.startsWith('https://')) {
    job.url = target;
  } else {
    job.query = target;
  }
  saveJob(job);

  enqueue(async () => {
    try {
      job.status = 'downloading';
      saveJob(job);

      // 1. Resolve metadata
      const meta = await fetchVideoMetadata(target);
      if (!meta || !meta.id) {
        job.status = 'failed';
        job.error = 'Could not resolve YouTube video metadata';
        saveJob(job);
        return;
      }

      const sourceId = meta.id;
      const sourceUrl = meta.webpage_url || `https://www.youtube.com/watch?v=${sourceId}`;

      // Check DB for existing song (de-dupe)
      const db = getDb();
      const existing = db.prepare('SELECT id FROM songs WHERE source = ? AND source_id = ?').get('youtube', sourceId) as { id: string } | undefined;
      if (existing) {
        db.prepare('DELETE FROM recommendations WHERE source_id = ?').run(sourceId);
        job.status = 'done';
        job.songId = existing.id;
        job.title = meta.title;
        saveJob(job);
        return;
      }

      // 2. Prepare temp directory
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'music-dl-'));
      const outputTemplate = path.join(tmpDir, '%(id)s.%(ext)s');

      // 3. Download audio with optimal format selector
      const dlRes = await runCommand('yt-dlp', [
        ...getYtDlpBaseArgs(),
        '-f', 'bestaudio[ext=m4a]/bestaudio/best',
        '-x',
        '--audio-format', 'm4a',
        '--audio-quality', '0',
        '--embed-thumbnail',
        '--add-metadata',
        '--write-thumbnail',
        '-o', outputTemplate,
        sourceUrl
      ]);

      if (dlRes.code !== 0) {
        job.status = 'failed';
        job.error = `yt-dlp download failed: ${dlRes.stderr.slice(0, 300)}`;
        saveJob(job);
        fs.rmSync(tmpDir, { recursive: true, force: true });
        return;
      }

      job.status = 'tagging';
      saveJob(job);

      // 4. Move files to permanent storage with EBU R128 Loudness Normalization
      const songId = uuidv4();
      const audioSourceFile = path.join(tmpDir, `${sourceId}.m4a`);
      const targetAudioPath = path.join(AUDIO_DIR, `${songId}.m4a`);

      let rawAudioPath = audioSourceFile;
      if (!fs.existsSync(audioSourceFile)) {
        const files = fs.readdirSync(tmpDir);
        const audioFile = files.find(f => f.startsWith(sourceId) && !f.endsWith('.webp') && !f.endsWith('.jpg') && !f.endsWith('.png'));
        if (audioFile) {
          rawAudioPath = path.join(tmpDir, audioFile);
        } else {
          job.status = 'failed';
          job.error = 'Downloaded audio file was not found';
          saveJob(job);
          fs.rmSync(tmpDir, { recursive: true, force: true });
          return;
        }
      }

      // Apply EBU R128 loudnorm filter (I=-16 LUFS, TP=-1.5 dB, LRA=11)
      const normalizedTemp = path.join(tmpDir, `${sourceId}-normalized.m4a`);
      const normRes = await runCommand('ffmpeg', [
        '-y',
        '-i', rawAudioPath,
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-c:a', 'aac',
        '-b:a', '256k',
        normalizedTemp
      ]);

      if (normRes.code === 0 && fs.existsSync(normalizedTemp)) {
        fs.copyFileSync(normalizedTemp, targetAudioPath);
      } else {
        // Fallback to raw audio if loudnorm transcode fails
        fs.copyFileSync(rawAudioPath, targetAudioPath);
      }

      // 5. Handle thumbnail: center crop to 600x600 square JPEG
      let targetThumbPath: string | null = null;
      const thumbCandidates = fs.readdirSync(tmpDir).filter(f => f.startsWith(sourceId) && (f.endsWith('.jpg') || f.endsWith('.webp') || f.endsWith('.png')));
      if (thumbCandidates.length > 0) {
        const thumbSource = path.join(tmpDir, thumbCandidates[0]);
        targetThumbPath = path.join(THUMBNAILS_DIR, `${songId}.jpg`);
        // Crop centered square and scale to 600x600
        await runCommand('ffmpeg', [
          '-y',
          '-i', thumbSource,
          '-vf', "crop='min(iw,ih)':'min(iw,ih)',scale=600:600",
          targetThumbPath
        ]);
        if (!fs.existsSync(targetThumbPath)) {
          fs.copyFileSync(thumbSource, targetThumbPath);
        }
      }

      fs.rmSync(tmpDir, { recursive: true, force: true });

      // 6. Parse title, artist, genres
      let title = (meta.title || 'Unknown Title').trim();
      let artistName = (meta.channel || meta.uploader || 'Unknown Artist').replace(/ - Topic$/i, '').trim();

      title = title
        .replace(/\s*\((Official Video|Official Audio|Lyric Video|Audio|Lyrics|Official Music Video|Music Video)\)\s*$/i, '')
        .replace(/\s*\[(Official Video|Official Audio|Lyric Video|Audio|Lyrics|Official Music Video|Music Video)\]\s*$/i, '')
        .trim();

      if (title.includes(' - ')) {
        const parts = title.split(' - ');
        if (parts.length >= 2) {
          artistName = parts[0].trim();
          title = parts.slice(1).join(' - ').trim();
        }
      }

      const artistId = getOrCreateArtist(artistName);
      const durationSec = Math.round(meta.duration || 0);
      const now = Math.floor(Date.now() / 1000);

      // Insert song
      db.prepare(`
        INSERT INTO songs (id, title, artist_id, duration_sec, file_path, thumbnail_path, source, source_id, source_url, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        songId,
        title,
        artistId,
        durationSec,
        targetAudioPath,
        targetThumbPath,
        'youtube',
        sourceId,
        sourceUrl,
        now
      );

      // Tags/genres
      const genresToInsert: string[] = [];
      if (Array.isArray(meta.categories)) {
        for (const cat of meta.categories) {
          if (cat && cat !== 'Music') genresToInsert.push(cat);
        }
      }
      if (genresToInsert.length > 0) {
        setSongGenres(songId, genresToInsert);
      }

      db.prepare('DELETE FROM recommendations WHERE source_id = ?').run(sourceId);

      job.status = 'done';
      job.songId = songId;
      job.title = title;
      job.artistName = artistName;
      saveJob(job);
    } catch (err: any) {
      job.status = 'failed';
      job.error = err.message || 'Unknown download error';
      saveJob(job);
    }
  });

  return jobId;
}

export async function importYouTubePlaylist(playlistUrl: string, playlistNameOverride?: string): Promise<string> {
  const jobId = uuidv4();
  const job: DownloadJob = {
    id: jobId,
    type: 'playlist',
    status: 'pending',
    url: playlistUrl,
    completedCount: 0,
    totalCount: 0,
    failedVideos: [],
    createdAt: Math.floor(Date.now() / 1000)
  };
  saveJob(job);

  enqueue(async () => {
    try {
      job.status = 'downloading';
      saveJob(job);

      // 1. Enumerate playlist videos
      const listRes = await runCommand('yt-dlp', [
        ...getYtDlpBaseArgs(),
        '--flat-playlist',
        '--dump-json',
        playlistUrl
      ]);

      if (listRes.code !== 0 || !listRes.stdout.trim()) {
        job.status = 'failed';
        job.error = 'Failed to fetch playlist contents from YouTube';
        saveJob(job);
        return;
      }

      const lines = listRes.stdout.trim().split('\n');
      const items: { id: string; title: string; url: string }[] = [];
      let detectedPlaylistTitle: string | null = null;

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.id) {
            items.push({
              id: parsed.id,
              title: parsed.title || 'Untitled',
              url: parsed.url || `https://www.youtube.com/watch?v=${parsed.id}`
            });
          }
          if (parsed.playlist_title && !detectedPlaylistTitle) {
            detectedPlaylistTitle = parsed.playlist_title;
          }
        } catch {
          // ignore
        }
      }

      job.totalCount = items.length;
      const finalPlaylistName = (playlistNameOverride || detectedPlaylistTitle || 'YouTube Import').trim();
      const playlist = createPlaylist(finalPlaylistName, `Imported from ${playlistUrl}`, 'youtube_import', playlistUrl);
      job.playlistId = playlist.id;
      saveJob(job);

      // 2. Download each video sequentially with anti-bot jitter delay
      for (const item of items) {
        try {
          // Random 1-2.5s jitter delay between items to avoid IP blocks
          await new Promise(res => setTimeout(res, 1000 + Math.random() * 1500));

          const singleJobId = await downloadSingleSong(item.url);
          // Wait for single job to complete
          await new Promise<void>((resolve) => {
            const checkInterval = setInterval(() => {
              const currentSingle = getJob(singleJobId);
              if (currentSingle && (currentSingle.status === 'done' || currentSingle.status === 'failed')) {
                clearInterval(checkInterval);
                if (currentSingle.status === 'done' && currentSingle.songId) {
                  addSongToPlaylist(playlist.id, currentSingle.songId);
                } else if (currentSingle.status === 'failed') {
                  job.failedVideos?.push({ id: item.id, title: item.title, error: currentSingle.error || 'Failed' });
                }
                resolve();
              }
            }, 500);
          });
        } catch (err: any) {
          job.failedVideos?.push({ id: item.id, title: item.title, error: err.message || 'Error' });
        }
        job.completedCount = (job.completedCount || 0) + 1;
        saveJob(job);
      }

      job.status = 'done';
      saveJob(job);
    } catch (err: any) {
      job.status = 'failed';
      job.error = err.message || 'Playlist import failed';
      saveJob(job);
    }
  });

  return jobId;
}
