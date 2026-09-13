import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api, WrappedStats } from '../services/api';
import { Colors } from '../constants/theme';
import { useSettingsStore } from '../store/settingsStore';

export default function WrappedScreen() {
  const router = useRouter();
  const { isBackendConnected } = useSettingsStore();
  const [range, setRange] = useState<'30d' | 'year' | 'all'>('30d');
  const [stats, setStats] = useState<WrappedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadStats = async () => {
    const now = Math.floor(Date.now() / 1000);
    let from: number | undefined;

    if (range === '30d') {
      from = now - 30 * 24 * 3600;
    } else if (range === 'year') {
      from = now - 365 * 24 * 3600;
    } else {
      from = 0; // all time
    }

    if (!isBackendConnected) {
      setStats(null);
      setLoading(false);
      setIsRefreshing(false);
      return;
    }
    try {
      const data = await api.getWrapped(from, now);
      setStats(data);
    } catch (err) {
      console.error('Failed to load wrapped stats:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadStats();
  }, [range, isBackendConnected]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadStats();
  };

  const getRankBadgeColor = (rank: number) => {
    switch (rank) {
      case 1:
        return '#F59E0B'; // Gold
      case 2:
        return '#94A3B8'; // Silver
      case 3:
        return '#B45309'; // Bronze
      default:
        return Colors.surfaceBorder;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Wrapped Stats</Text>
          <View style={{ width: 24 }} />
        </View>
        <Text style={styles.subtitle}>Your listening habits and top favorites</Text>
        {!isBackendConnected && (
          <View style={styles.unavailableBox}>
            <Ionicons name="cloud-offline-outline" size={16} color={Colors.star} />
            <Text style={styles.unavailableText}>
              Wrapped stats require a connection to the music server.
            </Text>
          </View>
        )}

        {/* Time Range Selector */}
        <View style={styles.rangeSelector}>
          {[
            { id: '30d', label: 'Last 30 Days' },
            { id: 'year', label: 'Past Year' },
            { id: 'all', label: 'All Time' },
          ].map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.rangeBtn, range === item.id && styles.rangeBtnActive]}
              onPress={() => setRange(item.id as any)}
            >
              <Text style={[styles.rangeText, range === item.id && styles.rangeTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {!isBackendConnected ? (
          <View style={styles.centerBox}>
            <Ionicons name="cloud-offline-outline" size={56} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Stats unavailable</Text>
            <Text style={styles.emptySubTitle}>Reconnect to load your listening history.</Text>
          </View>
        ) : loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : !stats || stats.totalQualifyingPlays === 0 ? (
          <View style={styles.centerBox}>
            <Ionicons name="bar-chart-outline" size={56} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No qualifying plays yet</Text>
            <Text style={styles.emptySubTitle}>
              Listen to songs for at least 15 seconds to start building your Wrapped stats!
            </Text>
          </View>
        ) : (
          <View style={styles.statsContainer}>
            {/* KPI Cards */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}>
                <Ionicons name="time-outline" size={24} color={Colors.primary} />
                <Text style={styles.kpiValue}>
                  {stats.totalMinutesListened} <Text style={styles.kpiUnit}>mins</Text>
                </Text>
                <Text style={styles.kpiLabel}>Time Listened</Text>
              </View>

              <View style={styles.kpiCard}>
                <Ionicons name="play-circle-outline" size={24} color={Colors.accent} />
                <Text style={styles.kpiValue}>{stats.totalQualifyingPlays}</Text>
                <Text style={styles.kpiLabel}>Qualifying Plays</Text>
              </View>
            </View>

            {/* Top 5 Songs */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top 5 Songs</Text>
              {stats.topSongs.map((song, index) => (
                <View key={song.songId || index} style={styles.rankItem}>
                  <View
                    style={[
                      styles.rankBadge,
                      { backgroundColor: getRankBadgeColor(index + 1) },
                    ]}
                  >
                    <Text style={styles.rankBadgeText}>{index + 1}</Text>
                  </View>

                  <View style={styles.rankInfo}>
                    <Text numberOfLines={1} style={styles.rankTitle}>
                      {song.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.rankSub}>
                      {song.artistName}
                    </Text>
                  </View>

                  <View style={styles.playCountBox}>
                    <Text style={styles.playCountNum}>{song.playCount}</Text>
                    <Text style={styles.playCountLabel}>plays</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Top 5 Artists */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top 5 Artists</Text>
              {stats.topArtists.map((artist, index) => (
                <View key={artist.artistId || index} style={styles.rankItem}>
                  <View
                    style={[
                      styles.rankBadge,
                      { backgroundColor: getRankBadgeColor(index + 1) },
                    ]}
                  >
                    <Text style={styles.rankBadgeText}>{index + 1}</Text>
                  </View>

                  <View style={styles.rankInfo}>
                    <Text numberOfLines={1} style={styles.rankTitle}>
                      {artist.name}
                    </Text>
                  </View>

                  <View style={styles.playCountBox}>
                    <Text style={styles.playCountNum}>{artist.playCount}</Text>
                    <Text style={styles.playCountLabel}>plays</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Top 5 Genres */}
            {stats.topGenres.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Top Genres</Text>
                {stats.topGenres.map((g, index) => (
                  <View key={g.genre || index} style={styles.rankItem}>
                    <View
                      style={[
                        styles.rankBadge,
                        { backgroundColor: getRankBadgeColor(index + 1) },
                      ]}
                    >
                      <Text style={styles.rankBadgeText}>{index + 1}</Text>
                    </View>

                    <View style={styles.rankInfo}>
                      <Text numberOfLines={1} style={[styles.rankTitle, { textTransform: 'capitalize' }]}>
                        {g.genre}
                      </Text>
                    </View>

                    <View style={styles.playCountBox}>
                      <Text style={styles.playCountNum}>{g.playCount}</Text>
                      <Text style={styles.playCountLabel}>plays</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
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
  unavailableBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  unavailableText: {
    flex: 1,
    color: Colors.star,
    fontSize: 12,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  backBtn: {
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  rangeSelector: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 3,
    marginTop: 14,
  },
  rangeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
  },
  rangeBtnActive: {
    backgroundColor: Colors.primary,
  },
  rangeText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  rangeTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  centerBox: {
    paddingVertical: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 16,
  },
  emptySubTitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  statsContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 8,
  },
  kpiUnit: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  kpiLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
    marginLeft: 4,
  },
  rankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankBadgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  rankInfo: {
    flex: 1,
    marginLeft: 12,
  },
  rankTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  rankSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  playCountBox: {
    alignItems: 'flex-end',
  },
  playCountNum: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.primary,
  },
  playCountLabel: {
    fontSize: 10,
    color: Colors.textMuted,
  },
});
