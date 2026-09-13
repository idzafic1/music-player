import AsyncStorage from '@react-native-async-storage/async-storage';
import { Song, Genre, Artist, Playlist, RecommendationItem } from './api';

export const SNAPSHOT_STORAGE_KEY = 'offline_library_snapshot_v1';

export interface LibrarySnapshot {
  savedAt: number; // Unix epoch ms
  songs: Song[];
  genres: Genre[];
  artists: Artist[];
  playlists: Playlist[];
  playlistDetails?: Record<string, Playlist>;
  recommendations?: RecommendationItem[];
  recentlyPlayed?: Song[];
  favorites?: Song[];
}

let cachedSnapshot: LibrarySnapshot | null = null;
let hydrationPromise: Promise<LibrarySnapshot | null> | null = null;

function isLibrarySnapshot(value: unknown): value is LibrarySnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<LibrarySnapshot>;
  return typeof snapshot.savedAt === 'number' &&
    Array.isArray(snapshot.songs) &&
    Array.isArray(snapshot.genres) &&
    Array.isArray(snapshot.artists) &&
    Array.isArray(snapshot.playlists) &&
    (snapshot.playlistDetails === undefined || typeof snapshot.playlistDetails === 'object') &&
    (snapshot.recommendations === undefined || Array.isArray(snapshot.recommendations)) &&
    (snapshot.recentlyPlayed === undefined || Array.isArray(snapshot.recentlyPlayed)) &&
    (snapshot.favorites === undefined || Array.isArray(snapshot.favorites));
}

/**
 * Hydrate library snapshot from AsyncStorage into memory.
 */
export async function hydrateLibrarySnapshot(): Promise<LibrarySnapshot | null> {
  if (cachedSnapshot) return cachedSnapshot;
  if (!hydrationPromise) {
    hydrationPromise = AsyncStorage.getItem(SNAPSHOT_STORAGE_KEY)
      .then((raw) => {
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (isLibrarySnapshot(parsed)) {
          cachedSnapshot = parsed;
          return parsed;
        }
        console.warn('Stored library snapshot has an invalid shape; ignoring it.');
        return null;
      })
      .catch((err) => {
        console.warn('Failed to parse library snapshot from storage:', err);
        return null;
      });
  }
  return hydrationPromise;
}

/**
 * Synchronous getter for in-memory snapshot.
 */
export function getLibrarySnapshot(): LibrarySnapshot | null {
  return cachedSnapshot;
}

/**
 * Persist an updated snapshot only on successful responses.
 * Never replaces non-empty valid collections with empty ones.
 */
export async function saveLibrarySnapshot(update: Partial<LibrarySnapshot>): Promise<void> {
  try {
    const existing = cachedSnapshot || (await hydrateLibrarySnapshot()) || {
      savedAt: 0,
      songs: [],
      genres: [],
      artists: [],
      playlists: [],
      playlistDetails: {},
      recommendations: [],
      recentlyPlayed: [],
      favorites: [],
    };

    const next: LibrarySnapshot = {
      savedAt: Date.now(),
      // An empty collection is a valid successful response. Failed requests do
      // not call this function, so omitted fields retain their last success.
      songs: update.songs ?? existing.songs,
      genres: update.genres ?? existing.genres,
      artists: update.artists ?? existing.artists,
      playlists: update.playlists ?? existing.playlists,
      playlistDetails: {
        ...(existing.playlistDetails || {}),
        ...(update.playlistDetails || {}),
      },
      recommendations: update.recommendations ?? existing.recommendations ?? [],
      recentlyPlayed: update.recentlyPlayed ?? existing.recentlyPlayed ?? [],
      favorites: update.favorites ?? existing.favorites ?? [],
    };

    cachedSnapshot = next;
    await AsyncStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('Failed to save library snapshot:', err);
  }
}

/**
 * Format snapshot timestamp for user display.
 */
export function formatSnapshotDate(timestamp: number): string {
  if (!timestamp) return 'Unknown date';
  const d = new Date(timestamp);
  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} at ${timeStr}`;
}
