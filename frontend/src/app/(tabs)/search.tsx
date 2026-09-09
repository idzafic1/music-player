import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { api, Song, OnlineSearchResult } from '../../services/api';
import { Colors } from '../../constants/theme';
import { SongListItem } from '../../components/SongListItem';
import { useSettingsStore } from '../../store/settingsStore';

function formatDuration(sec: number): string {
  const mins = Math.floor(sec / 60);
  const remSec = Math.floor(sec % 60);
  return `${mins}:${remSec < 10 ? '0' : ''}${remSec}`;
}

export default function SearchScreen() {
  const { isOnline } = useSettingsStore();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'library' | 'online'>('library');

  const [localResults, setLocalResults] = useState<Song[]>([]);
  const [onlineResults, setOnlineResults] = useState<OnlineSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Track downloading and downloaded state for online results
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());

  const debounceTimeout = useRef<any>(null);

  useEffect(() => {
    if (!query.trim()) {
      setLocalResults([]);
      setOnlineResults([]);
      return;
    }

    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

    debounceTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        if (tab === 'library') {
          const res = await api.getSongs({ q: query.trim(), limit: 30 });
          setLocalResults(res.songs);
        } else {
          const res = await api.searchOnline(query.trim(), 15);
          setOnlineResults(res);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => {
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    };
  }, [query, tab]);

  const handleDownloadOnline = async (item: OnlineSearchResult) => {
    setDownloadingIds(prev => new Set(prev).add(item.sourceId));
    try {
      const { jobId } = await api.startDownload(item.sourceUrl);
      const interval = setInterval(async () => {
        try {
          const status = await api.getJobStatus(jobId);
          if (status.status === 'done') {
            clearInterval(interval);
            setDownloadingIds(prev => {
              const next = new Set(prev);
              next.delete(item.sourceId);
              return next;
            });
            setDownloadedIds(prev => new Set(prev).add(item.sourceId));
          } else if (status.status === 'failed') {
            clearInterval(interval);
            setDownloadingIds(prev => {
              const next = new Set(prev);
              next.delete(item.sourceId);
              return next;
            });
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
        <Text style={styles.title}>Search</Text>

        {/* Search Input */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={Colors.textMuted} />
          <TextInput
            style={styles.input}
            placeholder={tab === 'library' ? 'Search in Library...' : 'Search YouTube Music...'}
            placeholderTextColor={Colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Tab Toggle */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'library' && styles.tabBtnActive]}
            onPress={() => setTab('library')}
          >
            <Ionicons
              name="library"
              size={16}
              color={tab === 'library' ? '#FFFFFF' : Colors.textMuted}
            />
            <Text style={[styles.tabText, tab === 'library' && styles.tabTextActive]}>
              Library
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, tab === 'online' && styles.tabBtnActive]}
            onPress={() => setTab('online')}
          >
            <Ionicons
              name="globe-outline"
              size={16}
              color={tab === 'online' ? '#FFFFFF' : Colors.textMuted}
            />
            <Text style={[styles.tabText, tab === 'online' && styles.tabTextActive]}>
              YouTube Music
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Results Content */}
      <ScrollView style={styles.content}>
        {isSearching && (
          <View style={styles.centerBox}>
            <ActivityIndicator size="small" color={Colors.primary} />
          </View>
        )}

        {!isSearching && tab === 'library' && (
          <>
            {query.trim().length > 0 && localResults.length === 0 ? (
              <View style={styles.centerBox}>
                <Ionicons name="search-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No songs found in your library</Text>
                <TouchableOpacity
                  style={styles.switchTabBtn}
                  onPress={() => setTab('online')}
                >
                  <Text style={styles.switchTabText}>Search on YouTube Music</Text>
                </TouchableOpacity>
              </View>
            ) : (
              localResults.map((song) => (
                <SongListItem
                  key={song.id}
                  song={song}
                  playlistContext={localResults}
                />
              ))
            )}
          </>
        )}

        {!isSearching && tab === 'online' && (
          <>
            {!isOnline ? (
              <View style={styles.centerBox}>
                <Ionicons name="cloud-offline-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>You are offline</Text>
                <Text style={styles.emptySubText}>
                  Online search requires an active internet connection.
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
                const isDownloaded = downloadedIds.has(item.sourceId);

                return (
                  <View key={item.sourceId} style={styles.onlineItem}>
                    <View style={styles.onlineThumb}>
                      {item.thumbnailUrl ? (
                        <Image source={{ uri: item.thumbnailUrl }} style={styles.art} />
                      ) : (
                        <Ionicons name="musical-note" size={20} color={Colors.textMuted} />
                      )}
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

                    <TouchableOpacity
                      style={[
                        styles.downloadBtn,
                        isDownloaded && styles.downloadBtnDone,
                        isDownloading && styles.downloadBtnLoading
                      ]}
                      disabled={isDownloading || isDownloaded}
                      onPress={() => handleDownloadOnline(item)}
                    >
                      {isDownloading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : isDownloaded ? (
                        <>
                          <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                          <Text style={styles.downloadBtnText}>Saved</Text>
                        </>
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
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginTop: 12,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
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
  switchTabBtn: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  switchTabText: {
    color: Colors.primaryLight,
    fontSize: 13,
    fontWeight: '600',
  },
  onlineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginHorizontal: 12,
    marginVertical: 4,
    backgroundColor: Colors.surface,
  },
  onlineThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  art: {
    width: '100%',
    height: '100%',
  },
  onlineInfo: {
    flex: 1,
    marginLeft: 12,
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
