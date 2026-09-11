import { create } from 'zustand';
import { Song } from '../services/api';
import * as offlineStorage from '../services/offlineStorage';

interface OfflineState {
  downloadedSongIds: Set<string>;
  downloadingIds: Set<string>;
  downloadProgress: Record<string, number>;

  hydrate: () => Promise<void>;
  download: (song: Song) => Promise<void>;
  remove: (songId: string) => Promise<void>;
  isDownloaded: (songId: string) => boolean;
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
  downloadedSongIds: new Set(),
  downloadingIds: new Set(),
  downloadProgress: {},

  hydrate: async () => {
    const ids = await offlineStorage.listDownloadedIds();
    set({ downloadedSongIds: new Set(ids) });
  },

  download: async (song: Song) => {
    set((s) => ({ downloadingIds: new Set(s.downloadingIds).add(song.id) }));
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
        };
      });
    } catch (err) {
      set((s) => {
        const downloading = new Set(s.downloadingIds);
        downloading.delete(song.id);
        return { downloadingIds: downloading };
      });
      throw err;
    }
  },

  remove: async (songId: string) => {
    await offlineStorage.deleteDownload(songId);
    set((s) => {
      const ids = new Set(s.downloadedSongIds);
      ids.delete(songId);
      return { downloadedSongIds: ids };
    });
  },

  isDownloaded: (songId: string) => get().downloadedSongIds.has(songId),
}));
