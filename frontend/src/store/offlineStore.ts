import { create } from 'zustand';
import { Song } from '../services/api';
import * as offlineStorage from '../services/offlineStorage';

interface OfflineState {
  downloadedSongIds: Set<string>;
  downloadingIds: Set<string>;
  downloadProgress: Record<string, number>;
  lastError: string | null;

  hydrate: () => Promise<void>;
  download: (song: Song) => Promise<void>;
  remove: (songId: string) => Promise<void>;
  isDownloaded: (songId: string) => boolean;
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
  downloadedSongIds: new Set(),
  downloadingIds: new Set(),
  downloadProgress: {},
  lastError: null,

  hydrate: async () => {
    const ids = await offlineStorage.listDownloadedIds();
    set({ downloadedSongIds: new Set(ids), lastError: null });
  },

  download: async (song: Song) => {
    set((s) => ({ downloadingIds: new Set(s.downloadingIds).add(song.id) }));
    set({ lastError: null });
    try {
      await offlineStorage.downloadSong(song, (pct) => {
        set((s) => ({ downloadProgress: { ...s.downloadProgress, [song.id]: pct } }));
      });
      set((s) => {
        const downloading = new Set(s.downloadingIds);
        downloading.delete(song.id);
        return {
          downloadedSongIds: new Set(s.downloadedSongIds).add(song.id),
          downloadingIds: downloading,
          downloadProgress: { ...s.downloadProgress, [song.id]: 1 },
        };
      });
    } catch (err) {
      set((s) => {
        const downloading = new Set(s.downloadingIds);
        downloading.delete(song.id);
        return { downloadingIds: downloading, lastError: err instanceof Error ? err.message : 'Download failed' };
      });
      throw err;
    }
  },

  remove: async (songId: string) => {
    try {
      await offlineStorage.deleteDownload(songId);
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : 'Removing download failed' });
      throw err;
    }
    set((s) => {
      const ids = new Set(s.downloadedSongIds);
      ids.delete(songId);
      return { downloadedSongIds: ids, lastError: null };
    });
  },

  isDownloaded: (songId: string) => get().downloadedSongIds.has(songId),
}));
