import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '../../store/settingsStore';
import { api } from '../../services/api';
import { Colors } from '../../constants/theme';

export default function SettingsScreen() {
  const {
    baseUrl,
    apiToken,
    isBackendConnected,
    setBaseUrl,
    setApiToken,
    checkBackendConnection
  } = useSettingsStore();

  const [inputUrl, setInputUrl] = useState(baseUrl);
  const [inputToken, setInputToken] = useState(apiToken);
  const [testing, setTesting] = useState(false);
  const [refreshingRecs, setRefreshingRecs] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleSaveAndTest = async () => {
    setTesting(true);
    setMessage(null);
    setBaseUrl(inputUrl.trim());
    setApiToken(inputToken.trim());

    try {
      const connected = await checkBackendConnection();
      if (connected) {
        setMessage({ text: 'Connected to backend successfully!', type: 'success' });
      } else {
        setMessage({ text: 'Could not connect to backend at this URL.', type: 'error' });
      }
    } catch {
      setMessage({ text: 'Connection failed.', type: 'error' });
    } finally {
      setTesting(false);
    }
  };

  const handleManualRefreshRecs = async () => {
    setRefreshingRecs(true);
    setMessage(null);
    try {
      await api.refreshRecommendations();
      setMessage({ text: 'Recommendations refreshed successfully!', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to refresh recommendations', type: 'error' });
    } finally {
      setRefreshingRecs(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Server configuration and preferences</Text>
        </View>

        {message && (
          <View
            style={[
              styles.messageBox,
              message.type === 'success' ? styles.messageSuccess : styles.messageError
            ]}
          >
            <Ionicons
              name={message.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
              size={18}
              color={message.type === 'success' ? Colors.primary : Colors.danger}
            />
            <Text
              style={[
                styles.messageText,
                { color: message.type === 'success' ? Colors.primary : Colors.danger }
              ]}
            >
              {message.text}
            </Text>
          </View>
        )}

        {/* Backend Connection Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Backend Server</Text>
            <View
              style={[
                styles.statusBadge,
                isBackendConnected ? styles.statusConnected : styles.statusDisconnected
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isBackendConnected ? Colors.primary : Colors.danger }
                ]}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: isBackendConnected ? Colors.primary : Colors.danger }
                ]}
              >
                {isBackendConnected ? 'Connected' : 'Offline'}
              </Text>
            </View>
          </View>

          <Text style={styles.fieldLabel}>Backend URL</Text>
          <TextInput
            style={styles.input}
            placeholder="http://localhost:3001"
            placeholderTextColor={Colors.textMuted}
            value={inputUrl}
            onChangeText={setInputUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.helperText}>
            Points to your personal music player backend instance over LAN or localhost.
          </Text>

          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>API Token (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Bearer token if set in backend"
            placeholderTextColor={Colors.textMuted}
            value={inputToken}
            onChangeText={setInputToken}
            secureTextEntry
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={styles.actionBtn}
            disabled={testing}
            onPress={handleSaveAndTest}
          >
            {testing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="refresh" size={16} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Save & Test Connection</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Recommendations Maintenance Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recommendations</Text>
          <Text style={styles.cardDesc}>
            Recommendations automatically refresh once every day at 6:00 AM based on your recent listening habits.
          </Text>

          <TouchableOpacity
            style={[styles.actionBtn, styles.secondaryBtn]}
            disabled={refreshingRecs}
            onPress={handleManualRefreshRecs}
          >
            {refreshingRecs ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="sparkles" size={16} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Regenerate Recommendations Now</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* App Info Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>About</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Architecture</Text>
            <Text style={styles.infoValue}>Single-user Personal Player</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Audio Quality</Text>
            <Text style={styles.infoValue}>Original m4a / 0 Transcoding</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>15s Play Rule</Text>
            <Text style={styles.infoValue}>Enabled (Local Ledger)</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  messageBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  messageSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderWidth: 1,
  },
  messageError: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
  },
  messageText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  cardDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 14,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 6,
  },
  statusConnected: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  statusDisconnected: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 10,
    padding: 12,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    fontSize: 14,
  },
  helperText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  secondaryBtn: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginTop: 0,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  infoLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  infoValue: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
});
