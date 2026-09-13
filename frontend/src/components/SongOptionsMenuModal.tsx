import React, { useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Alert
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Song, getFullThumbnailUrl } from '../services/api';
import { usePlayerStore } from '../store/playerStore';
import { Colors, Spacing } from '../constants/theme';
import { useOfflineStore } from '../store/offlineStore';
import { StarRating } from './StarRating';
import { useSettingsStore } from '../store/settingsStore';

interface SongOptionsMenuModalProps {
  visible: boolean;
  song: Song | null;
  onClose: () => void;
  onAddToPlaylist?: (song: Song) => void;
  onDelete?: (song: Song) => void;
}

export const SongOptionsMenuModal: React.FC<SongOptionsMenuModalProps> = ({
  visible,
  song,
  onClose,
  onAddToPlaylist,
  onDelete,
}) => {
  const { toggleFavorite, setRating } = usePlayerStore();
  const { downloadedSongIds, downloadingIds, downloadProgress, download, remove, lastError } = useOfflineStore();
  const isBackendConnected = useSettingsStore((state) => state.isBackendConnected);
  const songIsDownloaded = song ? downloadedSongIds.has(song.id) : false;
  const songIsDownloading = song ? downloadingIds.has(song.id) : false;
  const songProgress = song ? (downloadProgress[song.id] ?? 0) : 0;

  useEffect(() => {
    if (lastError && visible) {
      Alert.alert('Offline download failed', lastError);
    }
  }, [lastError, visible]);

  const handleDownloadToggle = async () => {
    if (!song) return;
    if (!songIsDownloaded && !isBackendConnected) {
      Alert.alert('Server Unavailable', 'This track is not downloaded. Reconnect before saving it for offline playback.');
      return;
    }
    try {
      if (songIsDownloaded) {
        await remove(song.id);
      } else if (!songIsDownloading) {
        await download(song);
      }
    } catch (err) {
      console.warn('Download/remove failed:', err);
    }
  };

  if (!song) return null;

  const thumbUrl = getFullThumbnailUrl(song.thumbnailUrl || song.thumbnailPath);

  const handleRate = (stars: number) => {
    setRating(song.id, stars);
  };

  const handleToggleFav = () => {
    toggleFavorite(song.id);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheetContainer}>
              {/* Drag Handle */}
              <View style={styles.handle} />

              {/* Song Info Header */}
              <View style={styles.songHeader}>
                <View style={styles.thumbContainer}>
                  {thumbUrl ? (
                    <Image source={{ uri: thumbUrl }} style={styles.thumb} contentFit="cover" />
                  ) : (
                    <View style={styles.placeholderThumb}>
                      <Ionicons name="musical-note" size={24} color={Colors.textMuted} />
                    </View>
                  )}
                </View>

                <View style={styles.songMeta}>
                  <Text numberOfLines={1} style={styles.title}>
                    {song.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.artist}>
                    {song.artistName || 'Unknown Artist'}
                  </Text>
                </View>

                <TouchableOpacity onPress={handleToggleFav} style={styles.favBtn} disabled={!isBackendConnected}>
                  <Ionicons
                    name={song.isFavorite ? 'heart' : 'heart-outline'}
                    size={26}
                    color={!isBackendConnected ? Colors.surfaceBorder : song.isFavorite ? Colors.favorite : Colors.textMuted}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.divider} />

              {/* Rating Section */}
              <View style={styles.ratingSection}>
                <Text style={styles.sectionLabel}>Track Rating</Text>
                <StarRating rating={song.rating} size={28} onRate={isBackendConnected ? handleRate : undefined} />
              </View>

              <View style={styles.divider} />

              {/* Action Buttons */}
              <View style={styles.actionsList}>
                {/* Download / Remove Download */}
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={handleDownloadToggle}
                  disabled={songIsDownloading || (!songIsDownloaded && !isBackendConnected)}
                >
                  <Ionicons
                    name={songIsDownloaded ? 'cloud-done' : songIsDownloading ? 'cloud-download' : 'cloud-download-outline'}
                    size={22}
                    color={songIsDownloaded ? Colors.primary : songIsDownloading ? Colors.accent : Colors.primary}
                  />
                  <Text style={styles.actionText}>
                    {songIsDownloading
                      ? `Downloading… ${Math.round(songProgress * 100)}%`
                      : songIsDownloaded
                        ? 'Remove Download'
                        : 'Download for Offline'}
                  </Text>
                </TouchableOpacity>
                {songIsDownloading && (
                  <View style={styles.downloadProgressTrack}>
                    <View
                      style={[styles.downloadProgressFill, { width: `${Math.max(4, songProgress * 100)}%` }]}
                    />
                  </View>
                )}

                {onAddToPlaylist && (
                  <TouchableOpacity
                    style={styles.actionRow}
                    onPress={() => {
                      onClose();
                      onAddToPlaylist(song);
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
                    <Text style={styles.actionText}>Add to Playlist</Text>
                  </TouchableOpacity>
                )}

                {onDelete && (
                  <TouchableOpacity
                    style={styles.actionRow}
                    onPress={() => {
                      onClose();
                      onDelete(song);
                    }}
                  >
                    <Ionicons name="trash-outline" size={22} color={Colors.danger} />
                    <Text style={[styles.actionText, { color: Colors.danger }]}>Delete Track</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Close Button */}
              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <Text style={styles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceBorder,
    alignSelf: 'center',
    marginBottom: 16,
  },
  songHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumbContainer: {
    width: 52,
    height: 52,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceBorder,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  placeholderThumb: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  songMeta: {
    flex: 1,
    marginLeft: 14,
    marginRight: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  artist: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  favBtn: {
    padding: 8,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginVertical: 16,
  },
  ratingSection: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  actionsList: {
    gap: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginLeft: 12,
  },
  downloadProgressTrack: {
    height: 3,
    marginHorizontal: 12,
    marginTop: -4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceBorder,
  },
  downloadProgressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  closeBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
});
