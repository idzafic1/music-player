import { Alert } from 'react-native';
import { create } from 'zustand';
import { Song, api } from '../services/api';
import { audioEngine } from '../services/audioEngine';

interface PlayerState {
  currentSong: Song | null;
  isPlaying: boolean;
  positionSec: number;
  durationSec: number;
  queue: Song[];
  queueIndex: number;
  isFullPlayerVisible: boolean;
  isShuffle: boolean;
  repeatMode: 'off' | 'all' | 'one';

  // Actions
  playSong: (song: Song, queue?: Song[], context?: string) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seekTo: (sec: number) => Promise<void>;
  nextTrack: () => Promise<void>;
  prevTrack: () => Promise<void>;
  setFullPlayerVisible: (visible: boolean) => void;
  toggleShuffle: () => void;
  cycleRepeatMode: () => void;
  toggleFavorite: (songId: string) => Promise<void>;
  setRating: (songId: string, stars: number) => Promise<void>;
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  // Wire audio engine events into the Zustand store
  audioEngine.onProgress((pos, dur) => {
    set({ positionSec: pos, durationSec: dur > 0 ? dur : (get().currentSong?.durationSec || 0) });
  });

  audioEngine.onStateChange((playing) => {
    set({ isPlaying: playing });
  });

  audioEngine.onEnd(() => {
    const { repeatMode, currentSong } = get();
    if (repeatMode === 'one' && currentSong) {
      audioEngine.seek(0);
      audioEngine.play();
    } else {
      get().nextTrack();
    }
  });

  audioEngine.onRemoteAction((action) => {
    if (action === 'next') {
      get().nextTrack();
    } else if (action === 'previous') {
      get().prevTrack();
    }
  });

  return {
    currentSong: null,
    isPlaying: false,
    positionSec: 0,
    durationSec: 0,
    queue: [],
    queueIndex: 0,
    isFullPlayerVisible: false,
    isShuffle: false,
    repeatMode: 'off',

    playSong: async (song: Song, queueList?: Song[], context = 'library') => {
      const activeQueue = queueList && queueList.length > 0 ? queueList : [song];
      const idx = activeQueue.findIndex(s => s.id === song.id);

      set({
        currentSong: song,
        queue: activeQueue,
        queueIndex: idx !== -1 ? idx : 0,
        positionSec: 0,
        durationSec: song.durationSec,
        isPlaying: false,
      });

      try {
        await audioEngine.load(song, context);
        await audioEngine.play();
      } catch (err: unknown) {
        set({ isPlaying: false });
        const message = err instanceof Error ? err.message : 'Playback failed';
        Alert.alert('Playback Unavailable', message);
      }
    },

    togglePlayPause: async () => {
      const { isPlaying, currentSong } = get();
      if (!currentSong) return;

      if (isPlaying) {
        await audioEngine.pause();
      } else {
        try {
          await audioEngine.play();
        } catch (err: unknown) {
          set({ isPlaying: false });
          const message = err instanceof Error ? err.message : 'Playback failed';
          Alert.alert('Playback Unavailable', message);
        }
      }
    },

    seekTo: async (sec: number) => {
      set({ positionSec: sec });
      await audioEngine.seek(sec);
    },

    nextTrack: async () => {
      const { queue, queueIndex, isShuffle, repeatMode } = get();
      if (queue.length === 0) return;

      let nextIdx = queueIndex + 1;
      if (isShuffle) {
        nextIdx = Math.floor(Math.random() * queue.length);
      } else if (nextIdx >= queue.length) {
        if (repeatMode === 'all') {
          nextIdx = 0;
        } else {
          // Stop at end of queue
          await audioEngine.pause();
          await audioEngine.seek(0);
          set({ isPlaying: false, positionSec: 0 });
          return;
        }
      }

      const nextSong = queue[nextIdx];
      if (nextSong) {
        set({
          currentSong: nextSong,
          queueIndex: nextIdx,
          positionSec: 0,
          durationSec: nextSong.durationSec,
        });
        try {
          await audioEngine.load(nextSong);
          await audioEngine.play();
        } catch (err: unknown) {
          set({ isPlaying: false });
          const message = err instanceof Error ? err.message : 'Playback failed';
          Alert.alert('Playback Unavailable', message);
        }
      }
    },

    prevTrack: async () => {
      const { queue, queueIndex, positionSec } = get();
      if (queue.length === 0) return;

      // If more than 3 seconds in, restart the song
      if (positionSec > 3) {
        await audioEngine.seek(0);
        set({ positionSec: 0 });
        return;
      }

      const prevIdx = queueIndex - 1;
      if (prevIdx >= 0) {
        const prevSong = queue[prevIdx];
        set({
          currentSong: prevSong,
          queueIndex: prevIdx,
          positionSec: 0,
          durationSec: prevSong.durationSec,
        });
        try {
          await audioEngine.load(prevSong);
          await audioEngine.play();
        } catch (err: unknown) {
          set({ isPlaying: false });
          const message = err instanceof Error ? err.message : 'Playback failed';
          Alert.alert('Playback Unavailable', message);
        }
      } else {
        await audioEngine.seek(0);
      }
    },

    setFullPlayerVisible: (visible: boolean) => {
      set({ isFullPlayerVisible: visible });
    },

    toggleShuffle: () => {
      set(state => ({ isShuffle: !state.isShuffle }));
    },

    cycleRepeatMode: () => {
      set(state => {
        const modes: ('off' | 'all' | 'one')[] = ['off', 'all', 'one'];
        const nextIdx = (modes.indexOf(state.repeatMode) + 1) % modes.length;
        return { repeatMode: modes[nextIdx] };
      });
    },

    toggleFavorite: async (songId: string) => {
      const { currentSong, queue } = get();
      const isFav = currentSong?.id === songId ? currentSong.isFavorite : false;
      const newFav = !isFav;

      // Optimistic update
      if (currentSong && currentSong.id === songId) {
        set({ currentSong: { ...currentSong, isFavorite: newFav } });
      }
      set({
        queue: queue.map(s => s.id === songId ? { ...s, isFavorite: newFav } : s)
      });

      try {
        if (newFav) {
          await api.setFavorite(songId);
        } else {
          await api.removeFavorite(songId);
        }
      } catch (err) {
        // Revert on failure
        if (currentSong && currentSong.id === songId) {
          set({ currentSong: { ...currentSong, isFavorite: isFav } });
        }
        set({
          queue: queue.map(s => s.id === songId ? { ...s, isFavorite: isFav } : s)
        });
      }
    },

    setRating: async (songId: string, stars: number) => {
      const { currentSong, queue } = get();
      const oldRating = currentSong?.id === songId ? currentSong.rating : null;
      const newRating = oldRating === stars ? null : stars; // toggle off if tapped same star

      if (currentSong && currentSong.id === songId) {
        set({ currentSong: { ...currentSong, rating: newRating } });
      }
      set({
        queue: queue.map(s => s.id === songId ? { ...s, rating: newRating } : s)
      });

      try {
        if (newRating === null) {
          await api.removeRating(songId);
        } else {
          await api.setRating(songId, newRating);
        }
      } catch (err) {
        // Revert on failure
        if (currentSong && currentSong.id === songId) {
          set({ currentSong: { ...currentSong, rating: oldRating } });
        }
        set({
          queue: queue.map(s => s.id === songId ? { ...s, rating: oldRating } : s)
        });
      }
    }
  };
});
