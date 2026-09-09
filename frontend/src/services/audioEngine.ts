import { Platform } from 'react-native';
import { Song, api, getFullStreamUrl, getFullThumbnailUrl } from './api';

export type ProgressCallback = (positionSec: number, durationSec: number) => void;
export type StateCallback = (isPlaying: boolean) => void;
export type EndCallback = () => void;
export type RemoteActionCallback = (action: 'next' | 'previous') => void;

export interface IAudioEngine {
  load(song: Song, sourceContext?: string): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(positionSec: number): Promise<void>;
  onProgress(cb: ProgressCallback): () => void;
  onStateChange(cb: StateCallback): () => void;
  onEnd(cb: EndCallback): () => void;
  onRemoteAction(cb: RemoteActionCallback): () => void;
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

  // Stall recovery tracking
  private lastPositionSec = 0;
  private stallCheckInterval: any = null;
  private consecutiveStalls = 0;

  private progressCallbacks = new Set<ProgressCallback>();
  private stateCallbacks = new Set<StateCallback>();
  private endCallbacks = new Set<EndCallback>();
  private remoteActionCallbacks = new Set<RemoteActionCallback>();

  constructor() {
    if (typeof window !== 'undefined') {
      this.audio = new Audio();
      this.setupListeners();
      this.setupStallDetection();
    }
  }

  private setupListeners() {
    if (!this.audio) return;

    this.audio.addEventListener('timeupdate', () => {
      if (!this.audio || !this.currentSong) return;
      const pos = this.audio.currentTime || 0;
      const dur = this.audio.duration || this.currentSong.durationSec || 0;
      this.lastPositionSec = pos;
      this.consecutiveStalls = 0;

      // Track accumulated listening time for 15-second qualifying play
      const now = Date.now();
      if (this.lastTickTime > 0 && !this.audio.paused) {
        const deltaSec = (now - this.lastTickTime) / 1000;
        if (deltaSec > 0 && deltaSec < 2) {
          this.secondsAccumulated += deltaSec;
        }
      }
      this.lastTickTime = now;

      // Fire 15-second play threshold
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
      this.updateMediaSessionState('playing');
    });

    this.audio.addEventListener('pause', () => {
      this.lastTickTime = 0;
      this.stateCallbacks.forEach(cb => cb(false));
      this.updateMediaSessionState('paused');
    });

    this.audio.addEventListener('ended', () => {
      this.lastTickTime = 0;
      this.stateCallbacks.forEach(cb => cb(false));
      this.updateMediaSessionState('none');
      this.endCallbacks.forEach(cb => cb());
    });

    this.audio.addEventListener('error', (e) => {
      console.warn('Audio element error, attempting auto-recovery...', e);
      this.attemptRecovery();
    });
  }

  private setupStallDetection() {
    if (typeof window === 'undefined') return;
    this.stallCheckInterval = setInterval(() => {
      if (!this.audio || this.audio.paused || !this.currentSong) return;
      // If playing but position hasn't changed across checks
      const currentPos = this.audio.currentTime || 0;
      if (currentPos > 0 && currentPos === this.lastPositionSec && this.audio.readyState < 3) {
        this.consecutiveStalls++;
        if (this.consecutiveStalls >= 2) {
          console.warn('Playback stall detected (>3s with no progress). Recovering stream...');
          this.attemptRecovery();
        }
      } else {
        this.consecutiveStalls = 0;
      }
      this.lastPositionSec = currentPos;
    }, 2000);
  }

  private attemptRecovery() {
    if (!this.audio || !this.currentSong) return;
    const resumePos = this.audio.currentTime || 0;
    try {
      this.audio.load();
      this.audio.currentTime = resumePos;
      this.audio.play().catch(err => console.warn('Recovery play failed:', err));
    } catch (err) {
      console.error('Audio recovery exception:', err);
    }
  }

  private updateMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !this.currentSong) return;
    try {
      const thumb = getFullThumbnailUrl(this.currentSong.thumbnailUrl || this.currentSong.thumbnailPath);
      navigator.mediaSession.metadata = new MediaMetadata({
        title: this.currentSong.title,
        artist: this.currentSong.artistName || 'Unknown Artist',
        album: 'Personal Library',
        artwork: thumb ? [{ src: thumb, sizes: '512x512', type: 'image/jpeg' }] : []
      });

      navigator.mediaSession.setActionHandler('play', () => this.play());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          this.seek(details.seekTime);
        }
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        this.remoteActionCallbacks.forEach(cb => cb('previous'));
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        this.remoteActionCallbacks.forEach(cb => cb('next'));
      });
    } catch {
      // Ignore media session errors in environments without full support
    }
  }

  private updateMediaSessionState(state: 'playing' | 'paused' | 'none') {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state;
    }
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

    // Reset 15s qualifying play tracking
    this.secondsAccumulated = 0;
    this.hasFiredPlay = false;
    this.lastTickTime = 0;
    this.consecutiveStalls = 0;

    const streamUrl = getFullStreamUrl(song.id);
    this.audio.src = streamUrl;
    this.audio.load();
    this.updateMediaSession();
  }

  async play(): Promise<void> {
    if (!this.audio) return;
    try {
      this.lastTickTime = Date.now();
      await this.audio.play();
    } catch (err) {
      console.warn('Playback error:', err);
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

  onRemoteAction(cb: RemoteActionCallback): () => void {
    this.remoteActionCallbacks.add(cb);
    return () => this.remoteActionCallbacks.delete(cb);
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

export const audioEngine: IAudioEngine = new WebAudioEngine();
