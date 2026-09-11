import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api, RecommendationItem, Song, getFullThumbnailUrl } from '../../services/api';
import { usePlayerStore } from '../../store/playerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { Colors } from '../../constants/theme';
import { SongListItem } from '../../components/SongListItem';

export default function HomeScreen() {
  const router = useRouter();
  const { playSong } = usePlayerStore();
  const { isBackendConnected, checkBackendConnection } = useSettingsStore();

  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [favorites, setFavorites] = useState<Song[]>([]);
  const [recentSongs, setRecentSongs] = useState<Song[]>([]);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      await checkBackendConnection();
      const [recs, favs, songsRes] = await Promise.allSettled([
        api.getDailyRecommendations(),
        api.getFavorites(10),
        api.getSongs({ sort: 'added_at', limit: 10 })
      ]);

      if (recs.status === 'fulfilled') setRecommendations(recs.value);
      if (favs.status === 'fulfilled') setFavorites(favs.value.songs);
      if (songsRes.status === 'fulfilled') setRecentSongs(songsRes.value.songs);
    } catch (err) {
      console.error('Error loading home data:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
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
          <TouchableOpacity
            style={styles.importBtn}
            onPress={() => router.push('/import')}
          >
            <Ionicons name="cloud-download-outline" size={20} color="#FFFFFF" />
            <Text style={styles.importBtnText}>Import</Text>
          </TouchableOpacity>
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
                          >
                            {isDownloading ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <>
                                <Ionicons name="arrow-down" size={14} color="#FFFFFF" />
                                <Text style={styles.downloadPillText}>Get</Text>
                              </>
                            )}
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
                      </View>
                    );
                  })}
                </ScrollView>
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

            {/* Recently Added */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recently Added</Text>
              </View>
              {recentSongs.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="disc-outline" size={48} color={Colors.textMuted} />
                  <Text style={styles.emptyStateTitle}>Your library is empty</Text>
                  <Text style={styles.emptyStateSubtitle}>
                    Tap "Import" above or search YouTube to download songs.
                  </Text>
                </View>
              ) : (
                recentSongs.map((song) => (
                  <SongListItem
                    key={song.id}
                    song={song}
                    playlistContext={recentSongs}
                  />
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
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
  importBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
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
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  recThumbContainer: {
    width: 120,
    height: 120,
    borderRadius: 10,
    overflow: 'hidden',
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
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4,
  },
  downloadPillActive: {
    backgroundColor: Colors.surfaceBorder,
  },
  downloadPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  recTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 8,
  },
  recArtist: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  recReason: {
    fontSize: 10,
    color: Colors.primaryLight,
    marginTop: 4,
    fontStyle: 'italic',
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
});
