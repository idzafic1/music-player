import { Platform } from 'react-native';
import TrackPlayer, { State, Event, Capability, AppKilledPlaybackBehavior, useProgress } from 'react-native-track-player';
import { Howl } from 'howler';
import { Song, api, getFullStreamUrl } from './api';
import { getLocalUri } from './offlineStorage';

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
  _emitRemoteAction(action: 'next' | 'previous'): void;
}

abstract class BaseAudioEngine implements IAudioEngine {
  protected currentSong: Song | null = null;
  protected sourceContext = 'library';
  protected isEnginePlaying = false;
  protected lastPositionSec = 0;

  // 15-second qualifying play timer tracking
  protected secondsAccumulated = 0;
  protected hasFiredPlay = false;
  protected lastTickTime = 0;

  protected progressCallbacks = new Set<ProgressCallback>();
  protected stateCallbacks = new Set<StateCallback>();
  protected endCallbacks = new Set<EndCallback>();
  protected remoteActionCallbacks = new Set<RemoteActionCallback>();

  protected checkQualifyingPlay(isPlaying: boolean, positionSec: number) {
    const now = Date.now();
    if (this.lastTickTime > 0 && isPlaying) {
      const deltaSec = (now - this.lastTickTime) / 1000;
      if (deltaSec > 0 && deltaSec < 2) {
        this.secondsAccumulated += deltaSec;
      }
    }
    this.lastTickTime = isPlaying ? now : 0;

    if (this.secondsAccumulated >= 15 && !this.hasFiredPlay && this.currentSong) {
      this.hasFiredPlay = true;
      api.recordPlay(
        this.currentSong.id,
        Math.round(this.secondsAccumulated),
        this.sourceContext
      ).catch((err) => {
        console.warn('Failed to record qualifying play:', err);
      });
    }
  }

  abstract load(song: Song, sourceContext?: string): Promise<void>;
  abstract play(): Promise<void>;
  abstract pause(): Promise<void>;
  abstract seek(positionSec: number): Promise<void>;

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
    return this.lastPositionSec;
  }

  getDuration(): number {
    return this.currentSong?.durationSec || 0;
  }

  isPlaying(): boolean {
    return this.isEnginePlaying;
  }

  _emitRemoteAction(action: 'next' | 'previous') {
    this.remoteActionCallbacks.forEach(cb => cb(action));
  }
}

class NativeAudioEngine extends BaseAudioEngine {
  private isInitialized = false;
  private progressInterval: any = null;

  constructor() {
    super();
    this.initPlayer();
  }

  private async initPlayer() {
    if (this.isInitialized) return;
    if (!TrackPlayer || !Capability) return;
    try {
      await TrackPlayer.setupPlayer();
      await TrackPlayer.updateOptions({
        android: {
          appKilledPlaybackBehavior: AppKilledPlaybackBehavior?.StopPlaybackAndRemoveNotification ?? 1,
        },
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.SeekTo,
        ].filter(Boolean),
        compactCapabilities: [Capability.Play, Capability.Pause].filter(Boolean),
      });
      this.isInitialized = true;

      if (Event?.PlaybackState && State?.Playing) {
        TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
          const playing = event.state === State.Playing;
          if (this.isEnginePlaying !== playing) {
            this.isEnginePlaying = playing;
            this.stateCallbacks.forEach(cb => cb(playing));
            this.lastTickTime = playing ? Date.now() : 0;
          }
        });
      }

      TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
        this.isEnginePlaying = false;
        this.endCallbacks.forEach(cb => cb());
      });

      TrackPlayer.addEventListener(Event.PlaybackTrackChanged, (event) => {
        if (event.nextTrack == null) {
          this.isEnginePlaying = false;
          this.endCallbacks.forEach(cb => cb());
        }
      });

      // Polling progress manually for consistent API with howler
      this.progressInterval = setInterval(async () => {
        if (!this.isInitialized) return;
        try {
          const position = await TrackPlayer.getPosition();
          const duration = await TrackPlayer.getDuration();
          this.lastPositionSec = position;
          this.checkQualifyingPlay(this.isEnginePlaying, position);
          this.progressCallbacks.forEach(cb => cb(position, duration));
        } catch (e) {}
      }, 250);

    } catch (e) {
      console.warn('TrackPlayer init error', e);
    }
  }

  async load(song: Song, sourceContext = 'library'): Promise<void> {
    await this.initPlayer();
    this.currentSong = song;
    this.sourceContext = sourceContext;
    this.secondsAccumulated = 0;
    this.hasFiredPlay = false;
    this.lastTickTime = 0;
    this.lastPositionSec = 0;
    this.isEnginePlaying = false;

    const localUri = await getLocalUri(song.id);
    const url = localUri || getFullStreamUrl(song.id);

    await TrackPlayer.reset();
    await TrackPlayer.add({
      id: song.id,
      url,
      title: song.title,
      artist: song.artistName || 'Unknown Artist',
    });
    this.stateCallbacks.forEach(cb => cb(false));
  }

  async play(): Promise<void> {
    await this.initPlayer();
    this.lastTickTime = Date.now();
    await TrackPlayer.play();
  }

  async pause(): Promise<void> {
    await this.initPlayer();
    this.lastTickTime = 0;
    await TrackPlayer.pause();
  }

  async seek(positionSec: number): Promise<void> {
    await this.initPlayer();
    await TrackPlayer.seekTo(positionSec);
    this.lastTickTime = Date.now();
  }
}

class WebAudioEngine extends BaseAudioEngine {
  private sound: Howl | null = null;
  private progressInterval: number | null = null;

  async load(song: Song, sourceContext = 'library'): Promise<void> {
    this.currentSong = song;
    this.sourceContext = sourceContext;
    this.secondsAccumulated = 0;
    this.hasFiredPlay = false;
    this.lastTickTime = 0;
    this.lastPositionSec = 0;
    this.isEnginePlaying = false;

    if (this.sound) {
      this.sound.unload();
      this.sound = null;
    }

    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }

    const localUri = await getLocalUri(song.id);
    const url = localUri || getFullStreamUrl(song.id);

    this.sound = new Howl({
      src: [url],
      html5: true,
      onplay: () => {
        this.isEnginePlaying = true;
        this.lastTickTime = Date.now();
        this.stateCallbacks.forEach(cb => cb(true));
      },
      onpause: () => {
        this.isEnginePlaying = false;
        this.lastTickTime = 0;
        this.stateCallbacks.forEach(cb => cb(false));
      },
      onend: () => {
        this.isEnginePlaying = false;
        this.lastTickTime = 0;
        this.stateCallbacks.forEach(cb => cb(false));
        this.endCallbacks.forEach(cb => cb());
      },
      onstop: () => {
        this.isEnginePlaying = false;
        this.lastTickTime = 0;
        this.stateCallbacks.forEach(cb => cb(false));
      }
    });

    this.progressInterval = setInterval(() => {
      if (!this.sound) return;
      const position = this.sound.seek() as number;
      const duration = this.sound.duration();
      this.lastPositionSec = position;
      this.checkQualifyingPlay(this.isEnginePlaying, position);
      this.progressCallbacks.forEach(cb => cb(position, duration));
    }, 250) as unknown as number;

    this.stateCallbacks.forEach(cb => cb(false));
  }

  async play(): Promise<void> {
    if (this.sound) {
      this.sound.play();
    }
  }

  async pause(): Promise<void> {
    if (this.sound) {
      this.sound.pause();
    }
  }

  async seek(positionSec: number): Promise<void> {
    if (this.sound) {
      this.sound.seek(positionSec);
      this.lastTickTime = Date.now();
    }
  }
}

export const audioEngine: IAudioEngine = (Platform.OS === 'web' || !TrackPlayer || !Capability) ? new WebAudioEngine() : new NativeAudioEngine();
