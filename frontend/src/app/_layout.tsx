import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import TrackPlayer from 'react-native-track-player';
import { Colors } from '../constants/theme';
import { FullPlayerModal } from '../components/FullPlayerModal';
import { useSettingsStore } from '../store/settingsStore';
import { useOfflineStore } from '../store/offlineStore';
import NetInfo from '@react-native-community/netinfo';

import { SafeAreaProvider } from 'react-native-safe-area-context';

if (Platform.OS !== 'web' && TrackPlayer && typeof TrackPlayer.registerPlaybackService === 'function') {
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

    // Hydrate offline store on startup
    useOfflineStore.getState().hydrate().catch(() => {});

    checkBackendConnection()
      .catch(() => {})
      .finally(() => {
        clearTimeout(fallbackHideTimer);
        SplashScreen.hideAsync().catch(() => {});
      });

    // Wire NetInfo to drive isOnline state
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      useSettingsStore.getState().setOnline(state.isConnected ?? true);
    });

    return () => {
      clearTimeout(fallbackHideTimer);
      unsubscribeNetInfo();
    };
  }, [checkBackendConnection]);

  return (
    <SafeAreaProvider>
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
        <Stack.Screen name="wrapped" options={{ presentation: 'card' }} />
      </Stack>
      <FullPlayerModal />
    </SafeAreaProvider>
  );
}
