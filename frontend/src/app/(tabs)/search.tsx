import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { api, Song, OnlineSearchResult, getApiBaseUrl } from '../../services/api';
import { Colors } from '../../constants/theme';
import { useSettingsStore } from '../../store/settingsStore';
import { usePlayerStore } from '../../store/playerStore';

const MOOD_CHIPS = [
  { label: 'Calm', query: 'calm peaceful music' },
  { label: 'Melancholic', query: 'melancholic atmospheric music' },
  { label: 'Cheerful', query: 'cheerful uplifting music' },
  { label: 'Energetic', query: 'energetic workout music' },
] as const;

function formatDuration(sec: number): string {
  const mins = Math.floor(sec / 60);
  const remSec = Math.floor(sec % 60);
  return `${mins}:${remSec < 10 ? '0' : ''}${remSec}`;
}

export default function SearchScreen() {
  const { isOnline, isBackendConnected } = useSettingsStore();
  const { playSong } = usePlayerStore();
  const [query, setQuery] = useState('');
  const [selectedMood, setSelectedMood] = useState<string | null>(null);

  const [onlineResults, setOnlineResults] = useState<OnlineSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Track downloading and downloaded state for online results
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const debounceTimeout = useRef<any>(null);
  const pollIntervalsRef = useRef<Set<any>>(new Set());
  const requestGenerationRef = useRef(0);
  const disposedRef = useRef(false);

  useEffect(() => () => {
    disposedRef.current = true;
    requestGenerationRef.current += 1;
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    pollIntervalsRef.current.forEach((interval) => clearInterval(interval));
    pollIntervalsRef.current.clear();
  }, []);

  useEffect(() => {
    if (!query.trim() || !isOnline || !isBackendConnected) {
      setOnlineResults([]);
      setSelectedMood(null);
      return;
    }

    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

    const generation = ++requestGenerationRef.current;
    debounceTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.searchOnline(query.trim(), 15);
        if (disposedRef.current || generation !== requestGenerationRef.current) return;
        setOnlineResults(res);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        if (!disposedRef.current && generation === requestGenerationRef.current) setIsSearching(false);
      }
    }, 400);

    return () => {
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    };
  }, [query, isOnline, isBackendConnected]);

  const handlePlayPreview = async (item: OnlineSearchResult) => {
    if (!isBackendConnected) return;
    const previewSong: Song = {
      id: `online_${item.sourceId}`,
      title: item.title,
      artistId: null,
      artistName: item.artistName,
      durationSec: item.durationSec,
      filePath: '',
      thumbnailPath: null,
      thumbnailUrl: item.thumbnailUrl,
      streamUrl: `${getApiBaseUrl()}/api/search/online/stream?url=${encodeURIComponent(item.sourceUrl)}`,
      source: 'online',
      sourceId: item.sourceId,
      sourceUrl: item.sourceUrl,
      addedAt: Date.now(),
      genres: [],
      rating: null,
      isFavorite: false,
      playCount: 0,
    };
    await playSong(previewSong, undefined, 'online_preview');
  };

  const handleDownloadOnline = async (item: OnlineSearchResult) => {
    if (!isBackendConnected) return;
    setDownloadingIds(prev => new Set(prev).add(item.sourceId));
    try {
      const { jobId } = await api.startDownload(item.sourceUrl);
      if (disposedRef.current) return;
      const interval = setInterval(async () => {
        if (disposedRef.current) {
          clearInterval(interval);
          pollIntervalsRef.current.delete(interval);
          return;
        }
        try {
          const status = await api.getJobStatus(jobId);
          if (status.status === 'done' || status.status === 'failed') {
            clearInterval(interval);
            pollIntervalsRef.current.delete(interval);
            setDownloadingIds(prev => {
              const next = new Set(prev);
              next.delete(item.sourceId);
              return next;
            });
          }
        } catch {
          clearInterval(interval);
          pollIntervalsRef.current.delete(interval);
          setDownloadingIds(prev => {
            const next = new Set(prev);
            next.delete(item.sourceId);
            return next;
          });
        }
      }, 1500);
      pollIntervalsRef.current.add(interval);
    } catch (err) {
      if (disposedRef.current) return;
      console.error('Download start failed:', err);
      setDownloadingIds(prev => {
        const next = new Set(prev);
        next.delete(item.sourceId);
        return next;
      });
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>Search for music</Text>

        {/* Search Input */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={Colors.textMuted} />
          <TextInput
            style={styles.input}
            placeholder="Search YouTube Music..."
            placeholderTextColor={Colors.textMuted}
            value={query}
            onChangeText={(value) => {
              setSelectedMood(null);
              setQuery(value);
            }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.moodChips}
        >
          {MOOD_CHIPS.map((mood) => {
            const isSelected = selectedMood === mood.label;
            return (
              <TouchableOpacity
                key={mood.label}
                style={[styles.moodChip, isSelected && styles.moodChipSelected]}
                disabled={!isOnline || !isBackendConnected}
                onPress={() => {
                  setSelectedMood(isSelected ? null : mood.label);
                  setQuery(isSelected ? '' : mood.query);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Search ${mood.label.toLowerCase()} music`}
              >
                <Ionicons
                  name={isSelected ? 'checkmark' : 'sparkles-outline'}
                  size={14}
                  color={isSelected ? '#FFFFFF' : Colors.primaryLight}
                />
                <Text style={[styles.moodChipText, isSelected && styles.moodChipTextSelected]}>
                  {mood.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Results Content */}
      <ScrollView style={styles.content}>
        {isSearching && (
          <View style={styles.centerBox}>
            <ActivityIndicator size="small" color={Colors.primary} />
          </View>
        )}

        {!isSearching && (
          <>
            {!isOnline || !isBackendConnected ? (
              <View style={styles.centerBox}>
                <Ionicons name="cloud-offline-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>
                  {!isBackendConnected ? 'Server unavailable' : 'You are offline'}
                </Text>
                <Text style={styles.emptySubText}>
                  Online search requires the music server and an active internet connection.
                </Text>
              </View>
            ) : query.trim().length > 0 && onlineResults.length === 0 ? (
              <View style={styles.centerBox}>
                <Ionicons name="musical-notes-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No matching songs found</Text>
              </View>
            ) : (
              onlineResults.map((item) => {
                const isDownloading = downloadingIds.has(item.sourceId);
                return (
                  <View key={item.sourceId} style={styles.onlineItem}>
                    <TouchableOpacity
                      style={styles.itemTouchable}
                      onPress={() => handlePlayPreview(item)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.onlineThumb}>
                        {item.thumbnailUrl ? (
                          <Image source={{ uri: item.thumbnailUrl }} style={styles.art} />
                        ) : (
                          <Ionicons name="musical-note" size={20} color={Colors.textMuted} />
                        )}
                        <View style={styles.playOverlay}>
                          <Ionicons name="play" size={16} color="#FFFFFF" />
                        </View>
                      </View>

                      <View style={styles.onlineInfo}>
                        <Text numberOfLines={1} style={styles.onlineTitle}>
                          {item.title}
                        </Text>
                        <Text numberOfLines={1} style={styles.onlineArtist}>
                          {item.artistName}
                        </Text>
                        <Text style={styles.onlineDuration}>
                          {formatDuration(item.durationSec)}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.downloadBtn,
                        isDownloading && styles.downloadBtnLoading
                      ]}
                      disabled={isDownloading}
                      onPress={() => handleDownloadOnline(item)}
                    >
                      {isDownloading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons name="download-outline" size={16} color="#FFFFFF" />
                          <Text style={styles.downloadBtnText}>Download</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
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
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 10,
  },
  moodChips: {
    paddingTop: 10,
    gap: 8,
  },
  moodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  moodChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  moodChipText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  moodChipTextSelected: {
    color: '#FFFFFF',
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  content: {
    flex: 1,
    marginTop: 8,
  },
  centerBox: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 12,
  },
  emptySubText: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  onlineItem: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 12,
    marginHorizontal: 12,
    marginVertical: 4,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  itemTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  onlineThumb: {
    width: 56,
    backgroundColor: Colors.surfaceBorder,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  art: {
    ...StyleSheet.absoluteFill,
  },
  playOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineInfo: {
    flex: 1,
    marginLeft: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  onlineTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  onlineArtist: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  onlineDuration: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
    marginLeft: 8,
    marginVertical: 10,
    marginRight: 12,
  },
  downloadBtnLoading: {
    backgroundColor: Colors.surfaceBorder,
  },
  downloadBtnDone: {
    backgroundColor: Colors.primaryDark,
  },
  downloadBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
