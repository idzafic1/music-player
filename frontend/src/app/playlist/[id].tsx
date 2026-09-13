import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, Playlist, Song } from '../../services/api';
import { usePlayerStore } from '../../store/playerStore';
import { Colors } from '../../constants/theme';
import { SongListItem } from '../../components/SongListItem';
import { useOfflineStore } from '../../store/offlineStore';

export default function PlaylistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { playSong } = usePlayerStore();
  const { playlistDownload, downloadPlaylist, cancelPlaylistDownload } = useOfflineStore();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPlaylist = async () => {
    if (!id) return;
    try {
      const data = await api.getPlaylist(id);
      setPlaylist(data);
    } catch (err) {
      console.error('Failed to load playlist:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlaylist();
  }, [id]);

  const handlePlayAll = () => {
    if (playlist?.songs && playlist.songs.length > 0) {
      playSong(playlist.songs[0], playlist.songs, `playlist:${playlist.id}`);
    }
  };

  const handlePlaylistDownload = async () => {
    if (!playlist?.songs) return;
    try {
      await downloadPlaylist(playlist.id, playlist.songs);
    } catch (err) {
      console.error('Failed to download playlist:', err);
    }
  };

  const handleRemoveSong = async (song: Song) => {
    if (!playlist) return;
    try {
      await api.removeSongFromPlaylist(playlist.id, song.id);
      setPlaylist(prev => {
        if (!prev) return prev;
        const filtered = (prev.songs || []).filter(s => s.id !== song.id);
        return { ...prev, songs: filtered, songCount: filtered.length };
      });
    } catch (err) {
      console.error('Failed to remove song:', err);
    }
  };

  const handleMoveSong = async (fromIdx: number, direction: 'up' | 'down') => {
    if (!playlist || !playlist.songs) return;
    const toIdx = direction === 'up' ? fromIdx - 1 : fromIdx + 1;
    if (toIdx < 0 || toIdx >= playlist.songs.length) return;

    const newSongs = [...playlist.songs];
    const [moved] = newSongs.splice(fromIdx, 1);
    newSongs.splice(toIdx, 0, moved);

    setPlaylist(prev => prev ? { ...prev, songs: newSongs } : prev);

    try {
      await api.updatePlaylist(playlist.id, {
        songOrder: newSongs.map(s => s.id)
      });
    } catch (err) {
      console.error('Failed to update song order:', err);
      loadPlaylist();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {playlist?.name || 'Playlist'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : !playlist ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>Playlist not found</Text>
        </View>
      ) : (
        <ScrollView style={styles.content}>
          {/* Banner */}
          <View style={styles.banner}>
            <View style={styles.coverBox}>
              <Ionicons name="musical-notes" size={48} color={Colors.accent} />
            </View>
            <Text style={styles.playlistName}>{playlist.name}</Text>
            {playlist.description && (
              <Text style={styles.playlistDesc}>{playlist.description}</Text>
            )}
            <Text style={styles.playlistMeta}>
              {playlist.songCount} {playlist.songCount === 1 ? 'track' : 'tracks'}
              {playlist.source === 'youtube_import' ? ' • YouTube Import' : ''}
            </Text>

            {playlist.songs && playlist.songs.length > 0 && (
              <TouchableOpacity
                style={styles.playAllBtn}
                onPress={handlePlayAll}
                activeOpacity={0.8}
              >
                <Ionicons name="play" size={20} color="#FFFFFF" />
                <Text style={styles.playAllText}>Play All</Text>
              </TouchableOpacity>
            )}
            {playlist.songs && playlist.songs.length > 0 && (
              <TouchableOpacity
                style={styles.downloadPlaylistBtn}
                onPress={playlistDownload ? cancelPlaylistDownload : handlePlaylistDownload}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={playlistDownload?.cancelling ? 'hourglass-outline' : playlistDownload ? 'close-circle-outline' : 'cloud-download-outline'}
                  size={18}
                  color={playlistDownload ? Colors.textSecondary : Colors.accent}
                />
                <Text style={styles.downloadPlaylistText}>
                  {playlistDownload
                    ? `${playlistDownload.cancelling ? 'Cancelling' : 'Cancel'} ${playlistDownload.completed}/${playlistDownload.total} (${Math.round(playlistDownload.progress * 100)}%)`
                    : 'Download all'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Song list */}
          <View style={styles.listContainer}>
            {(!playlist.songs || playlist.songs.length === 0) ? (
              <View style={styles.centerBox}>
                <Ionicons name="disc-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No songs in this playlist</Text>
              </View>
            ) : (
              playlist.songs.map((song, idx) => (
                <View key={`${song.id}-${idx}`} style={styles.songRow}>
                  {/* Move up / down controls */}
                  <View style={styles.reorderControls}>
                    <TouchableOpacity
                      disabled={idx === 0}
                      onPress={() => handleMoveSong(idx, 'up')}
                      style={[styles.reorderBtn, idx === 0 && styles.reorderDisabled]}
                    >
                      <Ionicons name="chevron-up" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={idx === (playlist.songs?.length || 0) - 1}
                      onPress={() => handleMoveSong(idx, 'down')}
                      style={[
                        styles.reorderBtn,
                        idx === (playlist.songs?.length || 0) - 1 && styles.reorderDisabled
                      ]}
                    >
                      <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  <View style={{ flex: 1 }}>
                    <SongListItem
                      song={song}
                      playlistContext={playlist.songs}
                      onDelete={() => handleRemoveSong(song)}
                    />
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  content: {
    flex: 1,
  },
  centerBox: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginTop: 12,
  },
  banner: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  coverBox: {
    width: 120,
    height: 120,
    borderRadius: 20,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  playlistName: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  playlistDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  playlistMeta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
  playAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 8,
    marginTop: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  playAllText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  downloadPlaylistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 18,
  },
  downloadPlaylistText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  listContainer: {
    marginTop: 8,
    paddingBottom: 40,
  },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reorderControls: {
    paddingLeft: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderBtn: {
    padding: 4,
  },
  reorderDisabled: {
    opacity: 0.2,
  },
});
