export const Colors = {
  background: '#0B0D13',
  backgroundElevated: '#141722',
  surface: '#1A1E2C',
  surfaceElevated: '#24293C',
  surfaceBorder: '#2B3248',
  
  primary: '#10B981', // Emerald vibrant
  primaryDark: '#059669',
  primaryLight: '#34D399',
  primaryGlow: 'rgba(16, 185, 129, 0.25)',

  accent: '#06B6D4', // Cyan
  danger: '#EF4444',
  star: '#F59E0B',
  favorite: '#EC4899',

  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textDisabled: '#475569',

  trackProgress: '#10B981',
  trackRemaining: '#2B3248',

  cardRadius: 16,
  chipRadius: 20,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const Typography = {
  titleLarge: {
    fontSize: 26,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  titleMedium: {
    fontSize: 20,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  titleSmall: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  body: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  bodyMuted: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  caption: {
    fontSize: 11,
    color: Colors.textMuted,
  },
};
