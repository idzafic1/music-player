import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api, Song, Artist, Playlist, Genre } from '../../services/api';
import { Colors } from '../../constants/theme';
import { SongListItem } from '../../components/SongListItem';
import { GenreChips } from '../../components/GenreChips';
import { useOfflineStore } from '../../store/offlineStore';

export default function LibraryScreen() {
  const router = useRouter();
  const [section, setSection] = useState<'songs' | 'artists' | 'playlists'>('songs');
  const [sort, setSort] = useState<'added_at' | 'title' | 'play_count' | null>('added_at');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [showDownloadedOnly, setShowDownloadedOnly] = useState(false);
  const [localQuery, setLocalQuery] = useState('');
  const downloadedSongIds = useOfflineStore((s) => s.downloadedSongIds);

  const [songs, setSongs] = useState<Song[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // New playlist modal state
  const [isNewPlaylistModalVisible, setIsNewPlaylistModalVisible] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');

  const loadData = async () => {
    try {
      if (section === 'songs') {
        const [songsRes, genresRes] = await Promise.all([
          api.getSongs({ q: localQuery.trim() || undefined, genre: selectedGenre || undefined, sort: sort || undefined, limit: 100 }),
          api.getGenres()
        ]);
        setSongs(songsRes.songs);
        setGenres(genresRes);
      } else if (section === 'artists') {
        const artistsRes = await api.getArtists();
        setArtists(artistsRes);
      } else if (section === 'playlists') {
        const playlistsRes = await api.getPlaylists();
        setPlaylists(playlistsRes);
      }
    } catch (err) {
      console.error('Error loading library:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [section, sort, selectedGenre, localQuery]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    try {
      await api.createPlaylist(newPlaylistName.trim(), newPlaylistDesc.trim() || undefined);
      setNewPlaylistName('');
      setNewPlaylistDesc('');
      setIsNewPlaylistModalVisible(false);
      loadData();
    } catch (err) {
      console.error('Failed to create playlist:', err);
    }
  };

  const handleDeleteSong = async (song: Song) => {
    try {
      await api.deleteSong(song.id);
      setSongs(prev => prev.filter(s => s.id !== song.id));
    } catch (err) {
      console.error('Failed to delete song:', err);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Library</Text>
          {section === 'playlists' && (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setIsNewPlaylistModalVisible(true)}
            >
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.addBtnText}>New Playlist</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Section Segmented Control */}
        <View style={styles.segmentedContainer}>
          {(['songs', 'artists', 'playlists'] as const).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.segmentBtn, section === s && styles.segmentBtnActive]}
              onPress={() => setSection(s)}
            >
              <Text style={[styles.segmentText, section === s && styles.segmentTextActive]}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Local Search Input (for Songs section) */}
        {section === 'songs' && (
          <View style={styles.localSearchBar}>
            <Ionicons name="search" size={18} color={Colors.textMuted} />
            <TextInput
              style={styles.localSearchInput}
              placeholder="Search library songs..."
              placeholderTextColor={Colors.textMuted}
              value={localQuery}
              onChangeText={setLocalQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {localQuery.length > 0 && (
              <TouchableOpacity onPress={() => setLocalQuery('')}>
                <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Genre Chips (for Songs section) */}
        {section === 'songs' && genres.length > 0 && (
          <GenreChips
            genres={genres}
            selectedGenre={selectedGenre}
            onSelectGenre={setSelectedGenre}
          />
        )}

        {/* Filter Row (for Songs section) */}
        {section === 'songs' && (
          <View style={styles.filterRow}>
            <TouchableOpacity
              style={[styles.filterPill, showDownloadedOnly && styles.filterPillActive]}
              onPress={() => setShowDownloadedOnly((v) => !v)}
            >
              <Ionicons
                name={showDownloadedOnly ? 'cloud-done' : 'cloud-download-outline'}
                size={14}
                color={showDownloadedOnly ? Colors.primary : Colors.textSecondary}
              />
              <Text style={[styles.filterPillText, showDownloadedOnly && styles.filterPillTextActive]}>
                Downloaded only
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Sort Controls (for Songs section) */}
        {section === 'songs' && (
          <View style={styles.sortRow}>
            <Text style={styles.sortLabel}>Sort by:</Text>
            {(['added_at', 'title', 'play_count'] as const).map((st) => (
              <TouchableOpacity
                key={st}
                style={[styles.sortPill, sort === st && styles.sortPillActive]}
                onPress={() => setSort(sort === st ? null : st)}
              >
                <Text style={[styles.sortPillText, sort === st && styles.sortPillTextActive]}>
                  {st === 'added_at' ? 'Recent' : st === 'title' ? 'Title' : 'Most Played'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
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
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <>
            {/* Songs List */}
            {section === 'songs' && (() => {
              const displaySongs = showDownloadedOnly
                ? songs.filter((s) => downloadedSongIds.has(s.id))
                : songs;
              return (
                <>
                  {displaySongs.length === 0 ? (
                    <View style={styles.centerBox}>
                      <Ionicons name={showDownloadedOnly ? 'cloud-download-outline' : 'musical-notes-outline'} size={44} color={Colors.textMuted} />
                      <Text style={styles.emptyTitle}>
                        {showDownloadedOnly ? 'No downloaded songs' : 'No songs found'}
                      </Text>
                    </View>
                  ) : (
                    displaySongs.map((song) => (
                      <SongListItem
                        key={song.id}
                        song={song}
                        playlistContext={displaySongs}
                        onDelete={handleDeleteSong}
                      />
                    ))
                  )}
                </>
              );
            })()}

            {/* Artists List */}
            {section === 'artists' && (
              <>
                {artists.length === 0 ? (
                  <View style={styles.centerBox}>
                    <Ionicons name="people-outline" size={44} color={Colors.textMuted} />
                    <Text style={styles.emptyTitle}>No artists yet</Text>
                  </View>
                ) : (
                  artists.map((artist) => (
                    <TouchableOpacity
                      key={artist.id}
                      style={styles.cardItem}
                      onPress={() => router.push(`/artist/${artist.id}` as any)}
                    >
                      <View style={styles.cardIconBox}>
                        <Ionicons name="person" size={24} color={Colors.primary} />
                      </View>
                      <View style={styles.cardInfo}>
                        <Text numberOfLines={1} style={styles.cardTitle}>
                          {artist.name}
                        </Text>
                        <Text style={styles.cardSub}>
                          {artist.songCount} {artist.songCount === 1 ? 'song' : 'songs'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ))
                )}
              </>
            )}

            {/* Playlists List */}
            {section === 'playlists' && (
              <>
                {playlists.length === 0 ? (
                  <View style={styles.centerBox}>
                    <Ionicons name="list-outline" size={44} color={Colors.textMuted} />
                    <Text style={styles.emptyTitle}>No playlists created</Text>
                    <TouchableOpacity
                      style={styles.createFirstBtn}
                      onPress={() => setIsNewPlaylistModalVisible(true)}
                    >
                      <Text style={styles.createFirstBtnText}>Create your first playlist</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  playlists.map((pl) => (
                    <TouchableOpacity
                      key={pl.id}
                      style={styles.cardItem}
                      onPress={() => router.push(`/playlist/${pl.id}` as any)}
                    >
                      <View style={[styles.cardIconBox, { backgroundColor: 'rgba(6, 182, 212, 0.15)' }]}>
                        <Ionicons name="musical-notes" size={24} color={Colors.accent} />
                      </View>
                      <View style={styles.cardInfo}>
                        <Text numberOfLines={1} style={styles.cardTitle}>
                          {pl.name}
                        </Text>
                        <Text style={styles.cardSub}>
                          {pl.songCount} {pl.songCount === 1 ? 'song' : 'songs'}
                          {pl.source === 'youtube_import' ? ' • YouTube Import' : ''}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ))
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* New Playlist Modal */}
      <Modal
        visible={isNewPlaylistModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsNewPlaylistModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Playlist</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Playlist name"
              placeholderTextColor={Colors.textMuted}
              value={newPlaylistName}
              onChangeText={setNewPlaylistName}
              autoFocus
            />
            <TextInput
              style={[styles.modalInput, { height: 70, textAlignVertical: 'top' }]}
              placeholder="Description (optional)"
              placeholderTextColor={Colors.textMuted}
              value={newPlaylistDesc}
              onChangeText={setNewPlaylistDesc}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setIsNewPlaylistModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, !newPlaylistName.trim() && styles.modalSubmitDisabled]}
                disabled={!newPlaylistName.trim()}
                onPress={handleCreatePlaylist}
              >
                <Text style={styles.modalSubmitText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 3,
    marginBottom: 8,
  },
  localSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 8,
    gap: 8,
  },
  localSearchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
  },
  segmentBtnActive: {
    backgroundColor: Colors.surfaceElevated,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  segmentTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 6,
  },
  filterPillActive: {
    backgroundColor: Colors.surfaceElevated,
    borderColor: Colors.primary,
  },
  filterPillText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  filterPillTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
  },
  sortLabel: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  sortPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: Colors.surface,
  },
  sortPillActive: {
    backgroundColor: Colors.primaryGlow,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  sortPillText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  sortPillTextActive: {
    color: Colors.primary,
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
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 12,
  },
  createFirstBtn: {
    marginTop: 16,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  createFirstBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  cardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginHorizontal: 12,
    marginVertical: 4,
  },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
    marginLeft: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  cardSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  modalCancel: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  modalCancelText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  modalSubmit: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
  },
  modalSubmitDisabled: {
    opacity: 0.5,
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
