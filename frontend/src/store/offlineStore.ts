import { create } from 'zustand';
import { Song } from '../services/api';
import * as offlineStorage from '../services/offlineStorage';

let activePlaylistCancel: (() => Promise<void>) | null = null;

interface OfflineState {
  downloadedSongIds: Set<string>;
  downloadingIds: Set<string>;
  downloadProgress: Record<string, number>;
  failedDownloads: Record<string, { song: Song; error: string }>;
  playlistDownload: {
    playlistId: string;
    completed: number;
    total: number;
    progress: number;
    cancelling: boolean;
  } | null;
  lastError: string | null;

  hydrate: () => Promise<void>;
  download: (song: Song) => Promise<void>;
  downloadPlaylist: (playlistId: string, songs: Song[]) => Promise<void>;
  cancelPlaylistDownload: () => Promise<void>;
  retryFailedDownloads: () => Promise<void>;
  remove: (songId: string) => Promise<void>;
  isDownloaded: (songId: string) => boolean;
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
  downloadedSongIds: new Set(),
  downloadingIds: new Set(),
  downloadProgress: {},
  failedDownloads: {},
  playlistDownload: null,
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
          failedDownloads: Object.fromEntries(Object.entries(s.failedDownloads).filter(([id]) => id !== song.id)),
        };
      });
    } catch (err) {
      set((s) => {
        const downloading = new Set(s.downloadingIds);
        downloading.delete(song.id);
        const message = err instanceof Error ? err.message : 'Download failed';
        return {
          downloadingIds: downloading,
          failedDownloads: { ...s.failedDownloads, [song.id]: { song, error: message } },
          lastError: message,
        };
      });
      throw err;
    }
  },

  retryFailedDownloads: async () => {
    const failedSongs = Object.values(get().failedDownloads).map(({ song }) => song);
    for (const song of failedSongs) {
      try {
        await get().download(song);
      } catch {
      }
    }
  },

  downloadPlaylist: async (playlistId: string, songs: Song[]) => {
    if (get().playlistDownload) throw new Error('A playlist download is already in progress');
    if (songs.length === 0) return;

    const control = { cancelled: false, activeSongId: null as string | null };
    activePlaylistCancel = async () => {
      control.cancelled = true;
      if (control.activeSongId) await offlineStorage.cancelDownload(control.activeSongId);
    };
    set({
      playlistDownload: {
        playlistId,
        completed: 0,
        total: songs.length,
        progress: 0,
        cancelling: false,
      },
      lastError: null,
    });

    try {
      let completed = 0;
      for (const song of songs) {
        if (control.cancelled) break;
        if (get().downloadedSongIds.has(song.id)) {
          completed += 1;
          set((s) => ({
            playlistDownload: s.playlistDownload ? { ...s.playlistDownload, completed, progress: completed / songs.length } : null,
          }));
          continue;
        }

        control.activeSongId = song.id;
        set((s) => ({
          downloadingIds: new Set(s.downloadingIds).add(song.id),
          downloadProgress: { ...s.downloadProgress, [song.id]: 0 },
        }));
        let songSuccess = false;
        try {
          await offlineStorage.downloadSong(song, (songProgress) => {
            set((s) => ({
              downloadProgress: { ...s.downloadProgress, [song.id]: songProgress },
              playlistDownload: s.playlistDownload ? {
                ...s.playlistDownload,
                progress: (completed + songProgress) / songs.length,
              } : null,
            }));
          });
          songSuccess = true;
        } catch (err) {
          if (control.cancelled) break;
          const message = err instanceof Error ? err.message : 'Download failed';
          set((s) => ({
            failedDownloads: { ...s.failedDownloads, [song.id]: { song, error: message } },
            lastError: message,
          }));
        } finally {
          set((s) => {
            const downloading = new Set(s.downloadingIds);
            downloading.delete(song.id);
            return { downloadingIds: downloading };
          });
        }
        control.activeSongId = null;
        if (control.cancelled) break;

        if (songSuccess) {
          completed += 1;
          set((s) => ({
            downloadedSongIds: new Set(s.downloadedSongIds).add(song.id),
            playlistDownload: s.playlistDownload ? { ...s.playlistDownload, completed, progress: completed / songs.length } : null,
          }));
        }
      }
    } catch (err) {
      if (!control.cancelled) {
        set({ lastError: err instanceof Error ? err.message : 'Playlist download failed' });
        throw err;
      }
    } finally {
      activePlaylistCancel = null;
      set({ playlistDownload: null });
    }
  },

  cancelPlaylistDownload: async () => {
    const playlistDownload = get().playlistDownload;
    if (!playlistDownload || !activePlaylistCancel) return;
    set((s) => ({
      playlistDownload: s.playlistDownload ? { ...s.playlistDownload, cancelling: true } : null,
    }));
    await activePlaylistCancel();
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
