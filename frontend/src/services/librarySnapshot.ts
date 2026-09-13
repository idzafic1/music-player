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
let isHydrating = false;

/**
 * Hydrate library snapshot from AsyncStorage into memory.
 */
export async function hydrateLibrarySnapshot(): Promise<LibrarySnapshot | null> {
  if (cachedSnapshot) return cachedSnapshot;
  if (isHydrating) {
    // Wait briefly if hydration is already in progress
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (cachedSnapshot) return cachedSnapshot;
  }

  isHydrating = true;
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) {
      cachedSnapshot = null;
      return null;
    }
    const parsed: LibrarySnapshot = JSON.parse(raw);
    if (parsed && typeof parsed.savedAt === 'number') {
      cachedSnapshot = parsed;
      return cachedSnapshot;
    }
    return null;
  } catch (err) {
    console.warn('Failed to parse library snapshot from storage:', err);
    return null;
  } finally {
    isHydrating = false;
  }
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
      songs: update.songs !== undefined && update.songs.length > 0
        ? update.songs
        : (update.songs !== undefined && existing.songs.length === 0 ? update.songs : existing.songs),
      genres: update.genres !== undefined && update.genres.length > 0
        ? update.genres
        : (update.genres !== undefined && existing.genres.length === 0 ? update.genres : existing.genres),
      artists: update.artists !== undefined && update.artists.length > 0
        ? update.artists
        : (update.artists !== undefined && existing.artists.length === 0 ? update.artists : existing.artists),
      playlists: update.playlists !== undefined && update.playlists.length > 0
        ? update.playlists
        : (update.playlists !== undefined && existing.playlists.length === 0 ? update.playlists : existing.playlists),
      playlistDetails: {
        ...(existing.playlistDetails || {}),
        ...(update.playlistDetails || {}),
      },
      recommendations: update.recommendations !== undefined && update.recommendations.length > 0
        ? update.recommendations
        : (update.recommendations !== undefined && (!existing.recommendations || existing.recommendations.length === 0)
            ? update.recommendations
            : existing.recommendations || []),
      recentlyPlayed: update.recentlyPlayed !== undefined && update.recentlyPlayed.length > 0
        ? update.recentlyPlayed
        : (update.recentlyPlayed !== undefined && (!existing.recentlyPlayed || existing.recentlyPlayed.length === 0)
            ? update.recentlyPlayed
            : existing.recentlyPlayed || []),
      favorites: update.favorites !== undefined && update.favorites.length > 0
        ? update.favorites
        : (update.favorites !== undefined && (!existing.favorites || existing.favorites.length === 0)
            ? update.favorites
            : existing.favorites || []),
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
