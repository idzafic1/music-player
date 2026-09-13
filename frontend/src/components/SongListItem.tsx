import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Song, getFullThumbnailUrl } from '../services/api';
import { usePlayerStore } from '../store/playerStore';
import { Colors } from '../constants/theme';
import { useOfflineStore } from '../store/offlineStore';
import { SongOptionsMenuModal } from './SongOptionsMenuModal';

interface SongListItemProps {
  song: Song;
  playlistContext?: Song[];
  onAddToPlaylist?: (song: Song) => void;
  onDelete?: (song: Song) => void;
}

function formatDuration(sec: number): string {
  const mins = Math.floor(sec / 60);
  const remSec = Math.floor(sec % 60);
  return `${mins}:${remSec < 10 ? '0' : ''}${remSec}`;
}

export const SongListItem: React.FC<SongListItemProps> = ({
  song,
  playlistContext,
  onAddToPlaylist,
  onDelete
}) => {
  const { currentSong, isPlaying, playSong, toggleFavorite } = usePlayerStore();
  const [optionsVisible, setOptionsVisible] = useState(false);
  const isCurrent = currentSong?.id === song.id;
  const isOfflineAvailable = useOfflineStore((s) => s.downloadedSongIds.has(song.id));
  const isDownloading = useOfflineStore((s) => s.downloadingIds.has(song.id));
  const thumbUrl = getFullThumbnailUrl(song.thumbnailUrl || song.thumbnailPath);

  return (
    <>
      <TouchableOpacity
        style={[styles.container, isCurrent && styles.containerCurrent]}
        onPress={() => playSong(song, playlistContext)}
        activeOpacity={0.7}
      >
        <View style={styles.artContainer}>
          {thumbUrl ? (
            <Image
              source={{ uri: thumbUrl }}
              style={styles.art}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={styles.placeholderArt}>
              <Ionicons name="musical-note" size={20} color={Colors.textMuted} />
            </View>
          )}
          {isCurrent && (
            <View style={styles.playingBadge}>
              <Ionicons
                name={isPlaying ? 'volume-high' : 'pause'}
                size={14}
                color="#FFFFFF"
              />
            </View>
          )}
        </View>

        <View style={styles.infoContainer}>
          <Text
            numberOfLines={1}
            style={[styles.title, isCurrent && styles.titleCurrent]}
          >
            {song.title}
          </Text>
          <Text numberOfLines={1} style={styles.artist}>
            {song.artistName || 'Unknown Artist'}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.duration}>{formatDuration(song.durationSec)}</Text>
            {song.rating ? (
              <>
                <View style={styles.dot} />
                <Ionicons name="star" size={11} color={Colors.star} style={{ marginRight: 2 }} />
                <Text style={styles.ratingText}>{song.rating}</Text>
              </>
            ) : null}
            {(isOfflineAvailable || isDownloading) && (
              <>
                <View style={styles.dot} />
                <Ionicons
                  name={isOfflineAvailable ? 'cloud-done' : 'cloud-download'}
                  size={12}
                  color={isOfflineAvailable ? Colors.primary : Colors.accent}
                />
              </>
            )}
          </View>
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => toggleFavorite(song.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={song.isFavorite ? 'heart' : 'heart-outline'}
              size={20}
              color={song.isFavorite ? Colors.favorite : Colors.textMuted}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setOptionsVisible(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="ellipsis-vertical" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      <SongOptionsMenuModal
        visible={optionsVisible}
        song={song}
        onClose={() => setOptionsVisible(false)}
        onAddToPlaylist={onAddToPlaylist}
        onDelete={onDelete}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 12,
    marginHorizontal: 12,
    marginVertical: 4,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  containerCurrent: {
    backgroundColor: Colors.surfaceElevated,
    borderColor: Colors.primaryGlow,
    borderWidth: 1,
  },
  artContainer: {
    width: 56,
    position: 'relative',
    backgroundColor: Colors.surfaceBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  art: {
    ...StyleSheet.absoluteFillObject,
  },
  placeholderArt: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playingBadge: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(16, 185, 129, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    flex: 1,
    marginLeft: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  titleCurrent: {
    color: Colors.primary,
  },
  artist: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  duration: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.textMuted,
    marginHorizontal: 6,
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 12,
  },
  actionBtn: {
    padding: 4,
  },
  ratingText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
  },
});
