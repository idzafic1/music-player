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
import { api, Artist, Song } from '../../services/api';
import { usePlayerStore } from '../../store/playerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { Colors } from '../../constants/theme';
import { SongListItem } from '../../components/SongListItem';
import { getLibrarySnapshot, hydrateLibrarySnapshot, formatSnapshotDate } from '../../services/librarySnapshot';

export default function ArtistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { playSong } = usePlayerStore();
  const { isBackendConnected } = useSettingsStore();

  const [artist, setArtist] = useState<Artist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [snapshotSavedAt, setSnapshotSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getArtist(id)
      .then((data) => {
        setArtist(data.artist);
        setSongs(data.songs);
      })
      .catch(async (err) => {
        console.warn('Failed to load artist from backend:', err);
        const snapshot = getLibrarySnapshot() || await hydrateLibrarySnapshot();
        const cachedArtist = snapshot?.artists.find((item) => item.id === id);
        if (cachedArtist) {
          setArtist(cachedArtist);
          setSongs((snapshot?.songs || []).filter((song) =>
            song.artistId === id || song.artistName === cachedArtist.name
          ));
          setSnapshotSavedAt(snapshot?.savedAt || null);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handlePlayAll = () => {
    if (songs.length > 0) {
      playSong(songs[0], songs, `artist:${artist?.id}`);
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
          {artist?.name || 'Artist'}
        </Text>
        <View style={{ width: 24 }} />
      </View>
      {!isBackendConnected && artist && (
        <View style={styles.snapshotBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={Colors.star} />
          <Text style={styles.snapshotBannerText}>
            {snapshotSavedAt
              ? `Showing library snapshot from ${formatSnapshotDate(snapshotSavedAt)} • Server unavailable`
              : 'Server unavailable • Showing cached library data'}
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : !artist ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>Artist not found</Text>
        </View>
      ) : (
        <ScrollView style={styles.content}>
          <View style={styles.banner}>
            <View style={styles.avatarBox}>
              <Ionicons name="person" size={54} color={Colors.primary} />
            </View>
            <Text style={styles.artistName}>{artist.name}</Text>
            <Text style={styles.artistMeta}>
              {songs.length} {songs.length === 1 ? 'song' : 'songs'} in your library
            </Text>

            {songs.length > 0 && (
              <TouchableOpacity
                style={styles.playAllBtn}
                onPress={handlePlayAll}
                activeOpacity={0.8}
              >
                <Ionicons name="play" size={20} color="#FFFFFF" />
                <Text style={styles.playAllText}>Play Artist</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.listContainer}>
            {songs.map((song) => (
              <SongListItem
                key={song.id}
                song={song}
                playlistContext={songs}
              />
            ))}
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
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  avatarBox: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  artistName: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  artistMeta: {
    fontSize: 13,
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
    marginTop: 18,
  },
  playAllText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  listContainer: {
    marginTop: 8,
    paddingBottom: 40,
  },
  snapshotBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  snapshotBannerText: {
    flex: 1,
    color: Colors.star,
    fontSize: 12,
  },
});
