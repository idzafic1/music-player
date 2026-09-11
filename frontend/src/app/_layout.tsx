import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import TrackPlayer from 'react-native-track-player';
import { Colors } from '../constants/theme';
import { FullPlayerModal } from '../components/FullPlayerModal';
import { useSettingsStore } from '../store/settingsStore';

if (Platform.OS !== 'web') {
  try {
    TrackPlayer.registerPlaybackService(() => require('../services/service').default);
  } catch (e) {
    // Ignore already registered error
  }
}

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const { checkBackendConnection } = useSettingsStore();

  useEffect(() => {
    const fallbackHideTimer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 1500);

    checkBackendConnection()
      .catch(() => {})
      .finally(() => {
        clearTimeout(fallbackHideTimer);
        SplashScreen.hideAsync().catch(() => {});
      });

    return () => clearTimeout(fallbackHideTimer);
  }, [checkBackendConnection]);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background }
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="playlist/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="artist/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="import" options={{ presentation: 'modal' }} />
      </Stack>
      <FullPlayerModal />
    </>
  );
}
