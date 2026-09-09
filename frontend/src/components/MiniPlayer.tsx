import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { usePlayerStore } from '../store/playerStore';
import { getFullThumbnailUrl } from '../services/api';
import { Colors } from '../constants/theme';

export const MiniPlayer: React.FC = () => {
  const {
    currentSong,
    isPlaying,
    positionSec,
    durationSec,
    togglePlayPause,
    nextTrack,
    toggleFavorite,
    setFullPlayerVisible
  } = usePlayerStore();

  if (!currentSong) return null;

  const progressPercent = durationSec > 0 ? Math.min(100, (positionSec / durationSec) * 100) : 0;
  const thumbUrl = getFullThumbnailUrl(currentSong.thumbnailUrl || currentSong.thumbnailPath);

  return (
    <View style={styles.outerContainer}>
      {/* Progress Line */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
      </View>

      <TouchableOpacity
        style={styles.innerContainer}
        onPress={() => setFullPlayerVisible(true)}
        activeOpacity={0.9}
      >
        <View style={styles.artContainer}>
          {thumbUrl ? (
            <Image
              source={{ uri: thumbUrl }}
              style={styles.art}
              contentFit="cover"
            />
          ) : (
            <View style={styles.placeholderArt}>
              <Ionicons name="musical-note" size={18} color={Colors.textMuted} />
            </View>
          )}
        </View>

        <View style={styles.infoContainer}>
          <Text numberOfLines={1} style={styles.title}>
            {currentSong.title}
          </Text>
          <Text numberOfLines={1} style={styles.artist}>
            {currentSong.artistName || 'Unknown Artist'}
          </Text>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => toggleFavorite(currentSong.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={currentSong.isFavorite ? 'heart' : 'heart-outline'}
              size={20}
              color={currentSong.isFavorite ? Colors.favorite : Colors.textMuted}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.playBtn]}
            onPress={togglePlayPause}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={20}
              color="#FFFFFF"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btn}
            onPress={nextTrack}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="play-skip-forward" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    backgroundColor: Colors.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  progressTrack: {
    height: 2.5,
    backgroundColor: Colors.trackRemaining,
    width: '100%',
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  innerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  artContainer: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  art: {
    width: '100%',
    height: '100%',
  },
  placeholderArt: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  artist: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  btn: {
    padding: 6,
  },
  playBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
