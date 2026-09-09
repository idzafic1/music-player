import { Platform } from 'react-native';
import { Song, api, getFullStreamUrl } from './api';

export type ProgressCallback = (positionSec: number, durationSec: number) => void;
export type StateCallback = (isPlaying: boolean) => void;
export type EndCallback = () => void;

export interface IAudioEngine {
  load(song: Song, sourceContext?: string): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(positionSec: number): Promise<void>;
  onProgress(cb: ProgressCallback): () => void;
  onStateChange(cb: StateCallback): () => void;
  onEnd(cb: EndCallback): () => void;
  getCurrentPosition(): number;
  getDuration(): number;
  isPlaying(): boolean;
}

class WebAudioEngine implements IAudioEngine {
  private audio: HTMLAudioElement | null = null;
  private currentSong: Song | null = null;
  private sourceContext = 'library';

  // 15-second qualifying play timer tracking
  private secondsAccumulated = 0;
  private hasFiredPlay = false;
  private lastTickTime = 0;

  private progressCallbacks = new Set<ProgressCallback>();
  private stateCallbacks = new Set<StateCallback>();
  private endCallbacks = new Set<EndCallback>();

  constructor() {
    if (typeof window !== 'undefined') {
      this.audio = new Audio();
      this.setupListeners();
    }
  }

  private setupListeners() {
    if (!this.audio) return;

    this.audio.addEventListener('timeupdate', () => {
      if (!this.audio || !this.currentSong) return;
      const pos = this.audio.currentTime || 0;
      const dur = this.audio.duration || this.currentSong.durationSec || 0;

      // Track accumulated listening time for the 15-second qualifying play
      const now = Date.now();
      if (this.lastTickTime > 0 && !this.audio.paused) {
        const deltaSec = (now - this.lastTickTime) / 1000;
        // Bound delta to prevent huge jumps from tab backgrounding/seeking
        if (deltaSec > 0 && deltaSec < 2) {
          this.secondsAccumulated += deltaSec;
        }
      }
      this.lastTickTime = now;

      // Fire 15-second play event once threshold reached
      if (this.secondsAccumulated >= 15 && !this.hasFiredPlay) {
        this.hasFiredPlay = true;
        api.recordPlay(
          this.currentSong.id,
          Math.round(this.secondsAccumulated),
          this.sourceContext
        ).catch((err) => {
          console.warn('Failed to record qualifying play:', err);
        });
      }

      this.progressCallbacks.forEach(cb => cb(pos, dur));
    });

    this.audio.addEventListener('play', () => {
      this.lastTickTime = Date.now();
      this.stateCallbacks.forEach(cb => cb(true));
    });

    this.audio.addEventListener('pause', () => {
      this.lastTickTime = 0;
      this.stateCallbacks.forEach(cb => cb(false));
    });

    this.audio.addEventListener('ended', () => {
      this.lastTickTime = 0;
      this.stateCallbacks.forEach(cb => cb(false));
      this.endCallbacks.forEach(cb => cb());
    });
  }

  async load(song: Song, sourceContext = 'library'): Promise<void> {
    if (!this.audio) {
      if (typeof window !== 'undefined') {
        this.audio = new Audio();
        this.setupListeners();
      } else {
        return;
      }
    }

    this.currentSong = song;
    this.sourceContext = sourceContext;

    // Reset 15s qualifying play tracking for new song
    this.secondsAccumulated = 0;
    this.hasFiredPlay = false;
    this.lastTickTime = 0;

    const streamUrl = getFullStreamUrl(song.id);
    this.audio.src = streamUrl;
    this.audio.load();
  }

  async play(): Promise<void> {
    if (!this.audio) return;
    try {
      this.lastTickTime = Date.now();
      await this.audio.play();
    } catch (err) {
      console.warn('Playback error (e.g. autoplay restriction):', err);
    }
  }

  async pause(): Promise<void> {
    if (!this.audio) return;
    this.audio.pause();
    this.lastTickTime = 0;
  }

  async seek(positionSec: number): Promise<void> {
    if (!this.audio) return;
    this.audio.currentTime = positionSec;
    // Seeking updates position, but does not reset secondsAccumulated
    this.lastTickTime = Date.now();
  }

  onProgress(cb: ProgressCallback): () => void {
    this.progressCallbacks.add(cb);
    return () => this.progressCallbacks.delete(cb);
  }

  onStateChange(cb: StateCallback): () => void {
    this.stateCallbacks.add(cb);
    return () => this.stateCallbacks.delete(cb);
  }

  onEnd(cb: EndCallback): () => void {
    this.endCallbacks.add(cb);
    return () => this.endCallbacks.delete(cb);
  }

  getCurrentPosition(): number {
    return this.audio?.currentTime || 0;
  }

  getDuration(): number {
    return this.audio?.duration || this.currentSong?.durationSec || 0;
  }

  isPlaying(): boolean {
    return !!this.audio && !this.audio.paused;
  }
}

// Fallback/Native engine using standard HTML5 Audio / web fallback
// Works on Web, and serves as seamless fallback on environments where track-player native module isn't loaded
export const audioEngine: IAudioEngine = new WebAudioEngine();
