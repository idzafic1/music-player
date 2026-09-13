import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Song, getFullStreamUrl } from './api';
import { createProgressReporter } from './playbackLogic';

const INDEX_KEY = 'offline_downloads_index';
const DOWNLOAD_DIR = FileSystem.documentDirectory + 'downloads/';

type IndexEntry = { localUri: string; downloadedAt: number; sizeBytes: number };
type Index = Record<string, IndexEntry>;
let cachedIndex: Index | null = null;
const activeDownloads = new Map<string, { cancelAsync: () => Promise<unknown> }>();
const activeDownloadPromises = new Map<string, Promise<void>>();

async function readIndex(): Promise<Index> {
  if (cachedIndex) return cachedIndex;
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  if (!raw) {
    cachedIndex = {};
    return cachedIndex;
  }

  let parsed: Index;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await AsyncStorage.removeItem(INDEX_KEY);
    cachedIndex = {};
    return cachedIndex;
  }

  const validEntries = await Promise.all(
    Object.entries(parsed).map(async ([songId, entry]) => {
      const fileInfo = await FileSystem.getInfoAsync(entry.localUri);
      return fileInfo.exists ? [songId, entry] as const : null;
    })
  );
  const validIndex = Object.fromEntries(validEntries.filter(Boolean) as [string, IndexEntry][]);
  if (Object.keys(validIndex).length !== Object.keys(parsed).length) {
    await writeIndex(validIndex);
  }
  cachedIndex = validIndex;
  return validIndex;
}

async function writeIndex(index: Index): Promise<void> {
  cachedIndex = index;
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

async function ensureDirExists(): Promise<void> {
  const info = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true });
  }
}

export async function downloadSong(
  song: Song,
  onProgress?: (pct: number) => void
): Promise<void> {
  const existing = activeDownloadPromises.get(song.id);
  if (existing) return existing;

  const promise = downloadSongInternal(song, onProgress);
  activeDownloadPromises.set(song.id, promise);
  try {
    await promise;
  } finally {
    if (activeDownloadPromises.get(song.id) === promise) {
      activeDownloadPromises.delete(song.id);
    }
  }
}

async function downloadSongInternal(
  song: Song,
  onProgress?: (pct: number) => void
): Promise<void> {
  await ensureDirExists();
  const localUri = DOWNLOAD_DIR + song.id + '.m4a';
  const partialUri = `${localUri}.part`;
  await FileSystem.deleteAsync(partialUri, { idempotent: true });
  let expectedBytes = 0;
  let lastReportedAt = 0;
  onProgress?.(0);

  try {
    const headResponse = await fetch(getFullStreamUrl(song.id), { method: 'HEAD' });
    const contentLength = headResponse.headers.get('content-length');
    expectedBytes = contentLength ? Number(contentLength) : 0;
  } catch {
    expectedBytes = 0;
  }

  const reportProgress = createProgressReporter((pct) => {
    const now = Date.now();
    if (onProgress && Number.isFinite(pct) && (pct >= 1 || now - lastReportedAt >= 100)) {
      lastReportedAt = now;
      onProgress(pct);
    }
  });

  const downloadResumable = FileSystem.createDownloadResumable(
    getFullStreamUrl(song.id),
    partialUri,
    {},
    (progressEvent) => {
      if (progressEvent.totalBytesExpectedToWrite > 0) {
        expectedBytes = progressEvent.totalBytesExpectedToWrite;
        reportProgress(progressEvent.totalBytesWritten / expectedBytes);
      }
    }
  );
  activeDownloads.set(song.id, downloadResumable);

  const progressInterval = setInterval(async () => {
    if (!expectedBytes) return;
    const fileInfo = await FileSystem.getInfoAsync(partialUri);
    if (fileInfo.exists && 'size' in fileInfo) {
      reportProgress(fileInfo.size / expectedBytes);
    }
  }, 200);

  let result;
  try {
    result = await downloadResumable.downloadAsync();
    if (!result) throw new Error('Download failed: no result');
    await FileSystem.moveAsync({ from: result.uri, to: localUri });
  } catch (error) {
    await FileSystem.deleteAsync(partialUri, { idempotent: true });
    throw error;
  } finally {
    clearInterval(progressInterval);
    activeDownloads.delete(song.id);
  }
  const fileInfo = await FileSystem.getInfoAsync(localUri);
  const sizeBytes = fileInfo.exists && 'size' in fileInfo ? fileInfo.size : 0;

  const index = await readIndex();
  index[song.id] = { localUri, downloadedAt: Date.now(), sizeBytes };
  await writeIndex(index);
  reportProgress(1);
}

export async function cancelDownload(songId: string): Promise<void> {
  const download = activeDownloads.get(songId);
  if (!download) return;

  try {
    await download.cancelAsync();
  } finally {
    await FileSystem.deleteAsync(`${DOWNLOAD_DIR + songId}.m4a.part`, { idempotent: true });
  }
}

export async function deleteDownload(songId: string): Promise<void> {
  const index = await readIndex();
  const entry = index[songId];
  if (entry) {
    await FileSystem.deleteAsync(entry.localUri, { idempotent: true });
    delete index[songId];
    await writeIndex(index);
  }
}

export async function getLocalUri(songId: string): Promise<string | null> {
  const index = await readIndex();
  return index[songId]?.localUri ?? null;
}

export async function isDownloaded(songId: string): Promise<boolean> {
  return (await getLocalUri(songId)) !== null;
}

export async function listDownloadedIds(): Promise<string[]> {
  return Object.keys(await readIndex());
}

export async function getTotalDownloadedBytes(): Promise<number> {
  const index = await readIndex();
  return Object.values(index).reduce((sum, e) => sum + (e.sizeBytes || 0), 0);
}
