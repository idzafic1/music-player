import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  SafeAreaView
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { usePlayerStore } from '../store/playerStore';
import { getFullThumbnailUrl } from '../services/api';
import { Colors, Spacing } from '../constants/theme';
import { StarRating } from './StarRating';

function formatTime(sec: number): string {
  if (isNaN(sec) || sec < 0) return '0:00';
  const mins = Math.floor(sec / 60);
  const remSec = Math.floor(sec % 60);
  return `${mins}:${remSec < 10 ? '0' : ''}${remSec}`;
}

export const FullPlayerModal: React.FC = () => {
  const {
    currentSong,
    isPlaying,
    positionSec,
    durationSec,
    queue,
    queueIndex,
    isFullPlayerVisible,
    isShuffle,
    repeatMode,
    togglePlayPause,
    seekTo,
    nextTrack,
    prevTrack,
    setFullPlayerVisible,
    toggleShuffle,
    cycleRepeatMode,
    toggleFavorite,
    setRating,
    playSong
  } = usePlayerStore();

  const [showQueue, setShowQueue] = useState(false);

  if (!currentSong) return null;

  const totalDuration = durationSec > 0 ? durationSec : (currentSong.durationSec || 1);
  const progressRatio = Math.max(0, Math.min(1, positionSec / totalDuration));
  const thumbUrl = getFullThumbnailUrl(currentSong.thumbnailUrl || currentSong.thumbnailPath);

  const handleSeekPress = (e: any) => {
    const { locationX } = e.nativeEvent;
    const barWidth = Dimensions.get('window').width - 48; // padding 24 on each side
    if (barWidth > 0) {
      const ratio = Math.max(0, Math.min(1, locationX / barWidth));
      seekTo(ratio * totalDuration);
    }
  };

  return (
    <Modal
      visible={isFullPlayerVisible}
      animationType="slide"
      transparent={false}
      onRequestClose={() => setFullPlayerVisible(false)}
    >
      <SafeAreaView style={styles.modalContainer}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setFullPlayerVisible(false)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-down" size={28} color={Colors.textPrimary} />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Now Playing</Text>

          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setShowQueue(!showQueue)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons
              name={showQueue ? 'musical-notes' : 'list'}
              size={24}
              color={showQueue ? Colors.primary : Colors.textPrimary}
            />
          </TouchableOpacity>
        </View>

        {showQueue ? (
          /* Queue View */
          <View style={styles.queueContainer}>
            <Text style={styles.queueHeading}>Up Next ({queue.length} tracks)</Text>
            <ScrollView style={styles.queueList}>
              {queue.map((item, index) => {
                const isItemCurrent = index === queueIndex;
                const itemThumb = getFullThumbnailUrl(item.thumbnailUrl || item.thumbnailPath);
                return (
                  <TouchableOpacity
                    key={`${item.id}-${index}`}
                    style={[styles.queueItem, isItemCurrent && styles.queueItemActive]}
                    onPress={() => playSong(item, queue)}
                  >
                    <View style={styles.queueItemThumb}>
                      {itemThumb ? (
                        <Image source={{ uri: itemThumb }} style={styles.art} />
                      ) : (
                        <Ionicons name="musical-note" size={16} color={Colors.textMuted} />
                      )}
                    </View>
                    <View style={styles.queueItemInfo}>
                      <Text
                        numberOfLines={1}
                        style={[styles.queueItemTitle, isItemCurrent && styles.queueItemTitleActive]}
                      >
                        {item.title}
                      </Text>
                      <Text numberOfLines={1} style={styles.queueItemArtist}>
                        {item.artistName || 'Unknown Artist'}
                      </Text>
                    </View>
                    <Text style={styles.queueItemDuration}>{formatTime(item.durationSec)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : (
          /* Player View */
          <View style={styles.playerContent}>
            {/* Artwork */}
            <View style={styles.artworkContainer}>
              {thumbUrl ? (
                <Image
                  source={{ uri: thumbUrl }}
                  style={styles.artwork}
                  contentFit="cover"
                  transition={300}
                />
              ) : (
                <View style={styles.placeholderArtwork}>
                  <Ionicons name="musical-notes" size={90} color={Colors.textMuted} />
                </View>
              )}
            </View>

            {/* Song Meta & Favorite */}
            <View style={styles.metaRow}>
              <View style={styles.titleArtistContainer}>
                <Text numberOfLines={1} style={styles.title}>
                  {currentSong.title}
                </Text>
                <Text numberOfLines={1} style={styles.artist}>
                  {currentSong.artistName || 'Unknown Artist'}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => toggleFavorite(currentSong.id)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.favBtn}
              >
                <Ionicons
                  name={currentSong.isFavorite ? 'heart' : 'heart-outline'}
                  size={28}
                  color={currentSong.isFavorite ? Colors.favorite : Colors.textMuted}
                />
              </TouchableOpacity>
            </View>

            {/* Rating Stars Row */}
            <View style={styles.ratingRow}>
              <StarRating
                rating={currentSong.rating}
                size={22}
                onRate={(stars) => setRating(currentSong.id, stars)}
              />
            </View>

            {/* Scrub / Seek Bar */}
            <View style={styles.scrubSection}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={handleSeekPress}
                style={styles.scrubTrackContainer}
              >
                <View style={styles.scrubBackground}>
                  <View style={[styles.scrubFill, { width: `${progressRatio * 100}%` }]} />
                  <View style={[styles.scrubKnob, { left: `${progressRatio * 100}%` }]} />
                </View>
              </TouchableOpacity>

              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatTime(positionSec)}</Text>
                <Text style={styles.timeText}>{formatTime(totalDuration)}</Text>
              </View>
            </View>

            {/* Main Controls */}
            <View style={styles.controlsRow}>
              <TouchableOpacity
                onPress={toggleShuffle}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="shuffle"
                  size={22}
                  color={isShuffle ? Colors.primary : Colors.textMuted}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={prevTrack}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="play-skip-back" size={28} color={Colors.textPrimary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.playButton}
                onPress={togglePlayPause}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={36}
                  color="#FFFFFF"
                  style={{ marginLeft: isPlaying ? 0 : 3 }}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={nextTrack}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="play-skip-forward" size={28} color={Colors.textPrimary} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={cycleRepeatMode}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={repeatMode === 'one' ? 'repeat' : 'repeat'}
                  size={22}
                  color={repeatMode !== 'off' ? Colors.primary : Colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
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
  headerBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  playerContent: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-around',
    paddingBottom: 24,
  },
  artworkContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    shadowColor: Colors.primaryGlow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
    alignSelf: 'center',
    maxWidth: 360,
  },
  artwork: {
    width: '100%',
    height: '100%',
  },
  art: {
    width: '100%',
    height: '100%',
  },
  placeholderArtwork: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  titleArtistContainer: {
    flex: 1,
    marginRight: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  artist: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  favBtn: {
    padding: 6,
  },
  ratingRow: {
    alignItems: 'center',
    marginVertical: 4,
  },
  scrubSection: {
    width: '100%',
    marginVertical: 12,
  },
  scrubTrackContainer: {
    paddingVertical: 10,
  },
  scrubBackground: {
    height: 5,
    backgroundColor: Colors.surfaceBorder,
    borderRadius: 3,
    position: 'relative',
    justifyContent: 'center',
  },
  scrubFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  scrubKnob: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    marginLeft: -7,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  timeText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginTop: 8,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  queueContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  queueHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
    marginTop: 8,
  },
  queueList: {
    flex: 1,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: Colors.surface,
  },
  queueItemActive: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.primaryGlow,
  },
  queueItemThumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  queueItemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  queueItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  queueItemTitleActive: {
    color: Colors.primary,
  },
  queueItemArtist: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  queueItemDuration: {
    fontSize: 12,
    color: Colors.textMuted,
  },
});
