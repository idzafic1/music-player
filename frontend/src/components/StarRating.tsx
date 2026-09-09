import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

interface StarRatingProps {
  rating: number | null;
  onRate?: (stars: number) => void;
  size?: number;
  readonly?: boolean;
}

export const StarRating: React.FC<StarRatingProps> = ({
  rating = 0,
  onRate,
  size = 18,
  readonly = false
}) => {
  const currentStars = rating || 0;

  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = star <= currentStars;
        return (
          <TouchableOpacity
            key={star}
            disabled={readonly}
            onPress={() => onRate && onRate(star)}
            style={styles.starTouch}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Ionicons
              name={isFilled ? 'star' : 'star-outline'}
              size={size}
              color={isFilled ? Colors.star : Colors.textMuted}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starTouch: {
    paddingHorizontal: 2,
  },
});
