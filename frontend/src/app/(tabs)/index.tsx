import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api, RecommendationItem, Song, Playlist, getFullThumbnailUrl, getApiBaseUrl } from '../../services/api';
import { usePlayerStore } from '../../store/playerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { Colors } from '../../constants/theme';
import { SongListItem } from '../../components/SongListItem';

export default function HomeScreen() {
  const router = useRouter();
  const { playSong } = usePlayerStore();
  const { isBackendConnected, checkBackendConnection } = useSettingsStore();

  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Song[]>([]);
  const [favorites, setFavorites] = useState<Song[]>([]);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isMenuVisible, setIsMenuVisible] = useState(false);

  const loadData = async () => {
    try {
      checkBackendConnection();
      const [recs, pls, recent, favs] = await Promise.allSettled([
        api.getDailyRecommendations(),
        api.getPlaylists(),
        api.getRecentlyPlayed(5),
        api.getFavorites(5)
      ]);

      if (recs.status === 'fulfilled') setRecommendations(recs.value);
      if (pls.status === 'fulfilled') setPlaylists(pls.value);
      if (recent.status === 'fulfilled') setRecentlyPlayed(recent.value);
      if (favs.status === 'fulfilled') setFavorites(favs.value.songs);
    } catch (err) {
      console.error('Error loading home data:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handlePlayRecommendation = (item: RecommendationItem) => {
    const previewSong: Song = {
      id: `preview-${item.sourceId}`,
      title: item.title,
      artistId: null,
      artistName: item.artistName,
      durationSec: 0,
      filePath: '',
      thumbnailPath: null,
      thumbnailUrl: item.thumbnailUrl,
      streamUrl: `${getApiBaseUrl()}/api/search/online/stream?url=${encodeURIComponent(item.sourceUrl)}`,
      source: 'online',
      sourceId: item.sourceId,
      sourceUrl: item.sourceUrl,
      addedAt: 0,
      genres: [],
      rating: null,
      isFavorite: false,
      playCount: 0,
    };
    playSong(previewSong, [], 'recommendation');
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const handleDownloadRecommendation = async (item: RecommendationItem) => {
    setDownloadingIds(prev => new Set(prev).add(item.sourceId));
    try {
      const { jobId } = await api.startDownload(item.sourceUrl);
      // Poll until done
      const interval = setInterval(async () => {
        try {
          const status = await api.getJobStatus(jobId);
          if (status.status === 'done' || status.status === 'failed') {
            clearInterval(interval);
            setDownloadingIds(prev => {
              const next = new Set(prev);
              next.delete(item.sourceId);
              return next;
            });
            if (status.status === 'done') {
              loadData(); // reload library
            }
          }
        } catch {
          clearInterval(interval);
          setDownloadingIds(prev => {
            const next = new Set(prev);
            next.delete(item.sourceId);
            return next;
          });
        }
      }, 1500);
    } catch (err) {
      console.error('Download failed:', err);
      setDownloadingIds(prev => {
        const next = new Set(prev);
        next.delete(item.sourceId);
        return next;
      });
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greetingSubtitle}>Welcome back</Text>
            <Text style={styles.greetingTitle}>Your Music</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              style={styles.menuBtn}
              onPress={() => setIsMenuVisible(true)}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.importBtn}
              onPress={() => router.push('/import')}
            >
              <Ionicons name="cloud-download-outline" size={20} color="#FFFFFF" />
              <Text style={styles.importBtnText}>Import</Text>
            </TouchableOpacity>
          </View>
        </View>

        {!isBackendConnected && (
          <View style={styles.banner}>
            <Ionicons name="warning-outline" size={18} color={Colors.star} />
            <Text style={styles.bannerText}>
              Backend unreachable. Check your Settings or local server.
            </Text>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <>
            {/* Daily Recommendations */}
            {recommendations.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Daily Recommendations</Text>
                  <Text style={styles.sectionSubtitle}>Handpicked for your taste</Text>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.recsScroll}
                >
                  {recommendations.map((item) => {
                    const isDownloading = downloadingIds.has(item.sourceId);
                    return (
                      <View key={item.id || item.sourceId} style={styles.recCard}>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => handlePlayRecommendation(item)}
                        >
                          <View style={styles.recThumbContainer}>
                            {item.thumbnailUrl ? (
                              <Image
                                source={{ uri: item.thumbnailUrl }}
                                style={styles.recThumb}
                                contentFit="cover"
                              />
                            ) : (
                              <View style={styles.placeholderThumb}>
                                <Ionicons name="musical-note" size={24} color={Colors.textMuted} />
                              </View>
                            )}
                            <TouchableOpacity
                              style={[styles.downloadPill, isDownloading && styles.downloadPillActive]}
                              disabled={isDownloading}
                              onPress={() => handleDownloadRecommendation(item)}
                              accessibilityLabel={isDownloading ? 'Downloading' : 'Download recommendation'}
                            >
                              {isDownloading
                                ? <ActivityIndicator size="small" color="#FFFFFF" />
                                : <Ionicons name="download-outline" size={16} color="#FFFFFF" />}
                            </TouchableOpacity>
                          </View>

                          <Text numberOfLines={1} style={styles.recTitle}>
                            {item.title}
                          </Text>
                          <Text numberOfLines={1} style={styles.recArtist}>
                            {item.artistName}
                          </Text>
                          <Text numberOfLines={1} style={styles.recReason}>
                            {item.reason}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* My Playlists */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>My Playlists</Text>
              </View>
              {playlists.length === 0 ? (
                <View style={styles.emptyInlineContainer}>
                  <TouchableOpacity
                    style={styles.emptyInlineCard}
                    onPress={() => router.push('/(tabs)/library')}
                  >
                    <Ionicons name="add-circle-outline" size={24} color={Colors.primary} />
                    <Text style={styles.emptyInlineText}>Create a playlist in Library</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.recsScroll}
                >
                  {playlists.map((pl) => {
                    const thumb = pl.sampleThumbnailUrl ? getFullThumbnailUrl(pl.sampleThumbnailUrl) : null;
                    return (
                      <TouchableOpacity
                        key={pl.id}
                        style={styles.playlistCard}
                        activeOpacity={0.8}
                        onPress={() => router.push(`/playlist/${pl.id}` as any)}
                      >
                        <View style={styles.playlistThumbContainer}>
                          {thumb ? (
                            <Image
                              source={{ uri: thumb }}
                              style={styles.playlistThumb}
                              contentFit="cover"
                            />
                          ) : (
                            <Ionicons name="musical-notes" size={32} color={Colors.accent} />
                          )}
                        </View>
                        <Text numberOfLines={1} style={styles.playlistCardTitle}>
                          {pl.name}
                        </Text>
                        <Text numberOfLines={1} style={styles.playlistCardCount}>
                          {pl.songCount} {pl.songCount === 1 ? 'song' : 'songs'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {/* Recently Played */}
            {recentlyPlayed.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Recently Played</Text>
                </View>
                {recentlyPlayed.map((song) => (
                  <SongListItem
                    key={`recent-${song.id}`}
                    song={song}
                    playlistContext={recentlyPlayed}
                  />
                ))}
              </View>
            )}

            {/* Quick Favorites */}
            {favorites.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Favorites</Text>
                </View>
                {favorites.slice(0, 5).map((song) => (
                  <SongListItem
                    key={song.id}
                    song={song}
                    playlistContext={favorites}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Menu Modal */}
      <Modal
        visible={isMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={() => setIsMenuVisible(false)}
        >
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>Menu</Text>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setIsMenuVisible(false);
                router.push('/wrapped' as any);
              }}
            >
              <Ionicons name="stats-chart-outline" size={22} color={Colors.primary} />
              <Text style={styles.menuItemText}>Your Wrapped Stats</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  greetingSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  greetingTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 6,
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  importBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  menuCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    gap: 12,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    gap: 10,
  },
  bannerText: {
    color: Colors.star,
    fontSize: 12,
    flex: 1,
    fontWeight: '500',
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  section: {
    marginTop: 18,
    marginBottom: 8,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  recsScroll: {
    paddingLeft: 20,
    paddingRight: 10,
    gap: 14,
  },
  recCard: {
    width: 140,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  recThumbContainer: {
    width: '100%',
    height: 140,
    position: 'relative',
    backgroundColor: Colors.surfaceBorder,
  },
  recThumb: {
    width: '100%',
    height: '100%',
  },
  placeholderThumb: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadPill: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    width: 34,
    height: 34,
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  downloadPillActive: {
    backgroundColor: Colors.surfaceBorder,
  },
  recTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 8,
    paddingHorizontal: 10,
  },
  recArtist: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
    paddingHorizontal: 10,
  },
  recReason: {
    fontSize: 10,
    color: Colors.primaryLight,
    marginTop: 4,
    fontStyle: 'italic',
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 32,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 12,
  },
  emptyStateSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  playlistCard: {
    width: 140,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  playlistThumbContainer: {
    width: '100%',
    height: 140,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistThumb: {
    width: '100%',
    height: '100%',
  },
  playlistCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    paddingHorizontal: 10,
    marginTop: 8,
  },
  playlistCardCount: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  emptyInlineContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  emptyInlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 10,
  },
  emptyInlineText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
});
