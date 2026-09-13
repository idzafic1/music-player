import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, DownloadJobStatus } from '../services/api';
import { Colors } from '../constants/theme';
import { useSettingsStore } from '../store/settingsStore';

export default function ImportScreen() {
  const router = useRouter();
  const { isBackendConnected } = useSettingsStore();
  const [url, setUrl] = useState('');
  const [playlistName, setPlaylistName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentJob, setCurrentJob] = useState<DownloadJobStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pollIntervalRef = useRef<any>(null);
  const disposedRef = useRef(false);

  useEffect(() => {
    return () => {
      disposedRef.current = true;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    };
  }, []);

  const handleStartImport = async () => {
    if (!url.trim()) return;
    if (!isBackendConnected) {
      setErrorMessage('Server unavailable. Reconnect before starting a playlist import.');
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    setCurrentJob(null);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = null;

    try {
      const { jobId } = await api.importYouTubePlaylist(
        url.trim(),
        playlistName.trim() || undefined
      );
      if (disposedRef.current) return;

      // Start polling status
      pollIntervalRef.current = setInterval(async () => {
        if (disposedRef.current) return;
        try {
          const status = await api.getJobStatus(jobId);
          if (disposedRef.current) return;
          setCurrentJob(status);
          if (status.status === 'done' || status.status === 'failed') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setIsSubmitting(false);
            if (status.status === 'failed') {
              setErrorMessage(status.error || 'Playlist import failed');
            }
          }
        } catch (err: any) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setIsSubmitting(false);
          setErrorMessage(err.message || 'Error checking import status');
        }
      }, 1500);
    } catch (err: any) {
      if (disposedRef.current) return;
      setIsSubmitting(false);
      setErrorMessage(err.message || 'Failed to start playlist import');
    }
  };

  const completed = currentJob?.completedCount || 0;
  const total = currentJob?.totalCount || 0;
  const progressPercent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Import YouTube Playlist</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {!isBackendConnected && (
          <View style={styles.unavailableBox}>
            <Ionicons name="cloud-offline-outline" size={18} color={Colors.star} />
            <Text style={styles.unavailableText}>
              The server is unavailable. Playlist imports and progress checks are disabled.
            </Text>
          </View>
        )}
        <View style={styles.formCard}>
          <Text style={styles.desc}>
            Paste a public YouTube or YouTube Music playlist URL. All tracks will be downloaded
            in high quality, tagged with metadata, and added to your personal library.
          </Text>

          <Text style={styles.fieldLabel}>Playlist URL</Text>
          <TextInput
            style={styles.input}
            placeholder="https://www.youtube.com/playlist?list=..."
            placeholderTextColor={Colors.textMuted}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isSubmitting}
          />

          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Custom Name (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Leave empty to use original YouTube title"
            placeholderTextColor={Colors.textMuted}
            value={playlistName}
            onChangeText={setPlaylistName}
            editable={!isSubmitting}
          />

          {errorMessage && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={Colors.danger} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, (!url.trim() || isSubmitting || !isBackendConnected) && styles.submitBtnDisabled]}
            disabled={!url.trim() || isSubmitting || !isBackendConnected}
            onPress={handleStartImport}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="cloud-download-outline" size={18} color="#FFFFFF" />
                <Text style={styles.submitBtnText}>Start Import</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Live Progress Card */}
        {currentJob && (
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>
                {currentJob.status === 'done'
                  ? 'Import Finished!'
                  : currentJob.status === 'failed'
                  ? 'Import Failed'
                  : 'Importing Tracks...'}
              </Text>
              <Text style={styles.progressFraction}>
                {completed} / {total}
              </Text>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            </View>
            <Text style={styles.progressPercent}>{progressPercent}% completed</Text>

            {currentJob.status === 'done' && currentJob.playlistId && (
              <TouchableOpacity
                style={styles.viewPlaylistBtn}
                onPress={() => router.replace(`/playlist/${currentJob.playlistId}` as any)}
              >
                <Text style={styles.viewPlaylistText}>View Playlist</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            )}

            {/* Failures list if any */}
            {currentJob.failedVideos && currentJob.failedVideos.length > 0 && (
              <View style={styles.failedSection}>
                <Text style={styles.failedHeading}>
                  Skipped / Failed Tracks ({currentJob.failedVideos.length})
                </Text>
                {currentJob.failedVideos.map((f, i) => (
                  <View key={i} style={styles.failedItem}>
                    <Text style={styles.failedTitle} numberOfLines={1}>
                      {f.title || f.id || 'Unknown'}
                    </Text>
                    <Text style={styles.failedReason} numberOfLines={1}>
                      {f.error}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  closeBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 20,
  },
  desc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
    marginBottom: 16,
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
  unavailableBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    marginBottom: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  unavailableText: {
    flex: 1,
    color: Colors.star,
    fontSize: 12,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    padding: 10,
    borderRadius: 8,
    gap: 8,
    marginTop: 12,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 12,
    flex: 1,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 18,
    gap: 8,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  progressCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  progressFraction: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: Colors.surfaceBorder,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  progressPercent: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 6,
    textAlign: 'right',
  },
  viewPlaylistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 16,
    gap: 6,
  },
  viewPlaylistText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  failedSection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    paddingTop: 12,
  },
  failedHeading: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.star,
    marginBottom: 8,
  },
  failedItem: {
    backgroundColor: Colors.surfaceElevated,
    padding: 8,
    borderRadius: 8,
    marginBottom: 6,
  },
  failedTitle: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  failedReason: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
