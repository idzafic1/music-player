import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Colors } from '../constants/theme';
import { FullPlayerModal } from '../components/FullPlayerModal';
import { useSettingsStore } from '../store/settingsStore';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const { checkBackendConnection } = useSettingsStore();

  useEffect(() => {
    checkBackendConnection().finally(() => {
      SplashScreen.hideAsync().catch(() => {});
    });
  }, []);

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
