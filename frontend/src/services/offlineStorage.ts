import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Song, getFullStreamUrl } from './api';

const INDEX_KEY = 'offline_downloads_index';
const DOWNLOAD_DIR = FileSystem.documentDirectory + 'downloads/';

type IndexEntry = { localUri: string; downloadedAt: number; sizeBytes: number };
type Index = Record<string, IndexEntry>;

async function readIndex(): Promise<Index> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  return raw ? JSON.parse(raw) : {};
}

async function writeIndex(index: Index): Promise<void> {
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
  await ensureDirExists();
  const localUri = DOWNLOAD_DIR + song.id + '.m4a';

  const downloadResumable = FileSystem.createDownloadResumable(
    getFullStreamUrl(song.id),
    localUri,
    {},
    (progressEvent) => {
      if (onProgress && progressEvent.totalBytesExpectedToWrite > 0) {
        onProgress(progressEvent.totalBytesWritten / progressEvent.totalBytesExpectedToWrite);
      }
    }
  );

  const result = await downloadResumable.downloadAsync();
  if (!result) throw new Error('Download failed: no result');

  const fileInfo = await FileSystem.getInfoAsync(result.uri);
  const sizeBytes = fileInfo.exists && 'size' in fileInfo ? fileInfo.size : 0;

  const index = await readIndex();
  index[song.id] = { localUri: result.uri, downloadedAt: Date.now(), sizeBytes };
  await writeIndex(index);
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
