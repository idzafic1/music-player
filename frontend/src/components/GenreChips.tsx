import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Colors } from '../constants/theme';
import { Genre, getFullThumbnailUrl } from '../services/api';

interface GenreChipsProps {
  genres: Genre[];
  selectedGenre: string | null;
  onSelectGenre: (genre: string | null) => void;
}

export const GenreChips: React.FC<GenreChipsProps> = ({
  genres,
  selectedGenre,
  onSelectGenre
}) => {
  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.container}
      >
        <TouchableOpacity
          style={[styles.chip, !selectedGenre && styles.chipActive]}
          onPress={() => onSelectGenre(null)}
        >
          <Text style={[styles.chipText, !selectedGenre && styles.chipTextActive]}>
            All
          </Text>
        </TouchableOpacity>

        {genres.map((g) => {
          const isSelected = selectedGenre === g.name;
          const thumbnailUrl = g.sampleThumbnailUrl
            ? getFullThumbnailUrl(g.sampleThumbnailUrl)
            : null;
          return (
            <TouchableOpacity
              key={g.id || g.name}
              style={[styles.chip, isSelected && styles.chipActive]}
              onPress={() => onSelectGenre(isSelected ? null : g.name)}
            >
              {thumbnailUrl ? (
                <Image
                  source={{ uri: thumbnailUrl }}
                  style={styles.chipThumb}
                />
              ) : null}
              <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                {g.name} ({g.songCount})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    paddingVertical: 10,
  },
  container: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Colors.chipRadius,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 6,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
