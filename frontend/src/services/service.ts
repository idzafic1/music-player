import TrackPlayer, { Event } from 'react-native-track-player';
import { audioEngine } from './audioEngine';

export default async function() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    audioEngine.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    audioEngine.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    (audioEngine as any)._emitRemoteAction('next');
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    (audioEngine as any)._emitRemoteAction('previous');
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, (event) => {
    audioEngine.seek(event.position);
  });
}
