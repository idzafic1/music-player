import { Platform } from 'react-native';

export interface Song {
  id: string;
  title: string;
  artistId: string | null;
  artistName: string | null;
  durationSec: number;
  filePath: string;
  thumbnailPath: string | null;
  thumbnailUrl: string | null;
  streamUrl: string;
  source: string;
  sourceId: string | null;
  sourceUrl: string | null;
  addedAt: number;
  genres: string[];
  rating: number | null;
  isFavorite: boolean;
  playCount: number;
}

export interface Artist {
  id: string;
  name: string;
  thumbnailPath: string | null;
  songCount: number;
}

export interface Playlist {
  id: string;
  name: string;
  description: string | null;
  source: string;
  sourceUrl: string | null;
  createdAt: number;
  songCount: number;
  sampleThumbnailUrl?: string | null;
  songs?: Song[];
}

export interface Genre {
  id: string;
  name: string;
  songCount: number;
  sampleThumbnailUrl: string | null;
}

export interface OnlineSearchResult {
  sourceId: string;
  title: string;
  artistName: string;
  thumbnailUrl: string | null;
  durationSec: number;
  sourceUrl: string;
}

export interface RecommendationItem {
  id: string;
  sourceId: string;
  title: string;
  artistName: string;
  thumbnailUrl: string | null;
  sourceUrl: string;
  reason: string;
  generatedAt: number;
}

export interface WrappedStats {
  topSongs: { songId: string; title: string; artistName: string; playCount: number }[];
  topArtists: { artistId: string; name: string; playCount: number }[];
  topGenres: { genre: string; playCount: number }[];
  totalQualifyingPlays: number;
  totalMinutesListened: number;
}

export interface DownloadJobStatus {
  jobId: string;
  type: 'single' | 'playlist';
  status: 'pending' | 'downloading' | 'tagging' | 'done' | 'failed';
  songId: string | null;
  playlistId: string | null;
  title: string | null;
  artistName: string | null;
  error: string | null;
  completedCount: number | null;
  totalCount: number | null;
  failedVideos: { id?: string; title?: string; error: string }[];
}

// Configurable backend base URL
let currentBaseUrl = 'http://localhost:3001';
let currentApiToken = '';

if (typeof window !== 'undefined' && window.location) {
  const hostname = window.location.hostname || 'localhost';
  currentBaseUrl = `http://${hostname}:3001`;
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
    const savedBase = localStorage.getItem('music_player_api_base');
    if (savedBase) currentBaseUrl = savedBase;
    const savedToken = localStorage.getItem('music_player_api_token');
    if (savedToken) currentApiToken = savedToken;
  }
}

export function setApiConfig(baseUrl: string, token = '') {
  currentBaseUrl = baseUrl.replace(/\/+$/, '');
  currentApiToken = token;
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
    localStorage.setItem('music_player_api_base', currentBaseUrl);
    localStorage.setItem('music_player_api_token', currentApiToken);
  }
}

export function getApiBaseUrl(): string {
  return currentBaseUrl;
}

export function getApiToken(): string {
  return currentApiToken;
}

export function getFullThumbnailUrl(urlOrPath: string | null): string | null {
  if (!urlOrPath) return null;
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    return urlOrPath;
  }
  if (urlOrPath.startsWith('/thumbnails/')) {
    return `${currentBaseUrl}${urlOrPath}`;
  }
  const filename = urlOrPath.split('/').pop();
  return `${currentBaseUrl}/thumbnails/${filename}`;
}

export function getFullStreamUrl(songId: string): string {
  return `${currentBaseUrl}/api/songs/${songId}/stream`;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${currentBaseUrl}${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  if (currentApiToken) {
    headers['Authorization'] = `Bearer ${currentApiToken}`;
  }

  const controller = new AbortController();
  const timeoutMs = Number(process.env.EXPO_PUBLIC_API_TIMEOUT_MS ?? 5000);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...options, headers, signal: controller.signal });
    if (!res.ok) {
      let errorData: any = {};
      try {
        errorData = await res.json();
      } catch {
        errorData = { message: res.statusText };
      }
      throw new Error(errorData.error?.message || errorData.message || `Request failed with ${res.status}`);
    }

    return res.json();
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// API methods
export const api = {
  checkHealth: () => request<{ status: string }>('/api/health'),

  getSongs: (params?: { q?: string; genre?: string; sort?: 'title' | 'added_at' | 'play_count'; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.q) searchParams.set('q', params.q);
    if (params?.genre) searchParams.set('genre', params.genre);
    if (params?.sort) searchParams.set('sort', params.sort);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    const qs = searchParams.toString();
    return request<{ songs: Song[]; total: number }>(`/api/songs${qs ? `?${qs}` : ''}`);
  },

  getSong: (id: string) => request<Song>(`/api/songs/${id}`),

  deleteSong: (id: string) => request<{ success: boolean }>(`/api/songs/${id}`, { method: 'DELETE' }),

  updateSong: (id: string, body: { title?: string; artistName?: string; genreNames?: string[] }) =>
    request<Song>(`/api/songs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  updateSongGenres: (id: string, genreNames: string[]) =>
    request<Song>(`/api/songs/${id}/genres`, { method: 'PATCH', body: JSON.stringify({ genreNames }) }),

  getArtists: () => request<Artist[]>('/api/artists'),
  getArtist: (id: string) => request<{ artist: Artist; songs: Song[] }>(`/api/artists/${id}`),

  getPlaylists: () => request<Playlist[]>('/api/playlists'),
  getPlaylist: (id: string) => request<Playlist>(`/api/playlists/${id}`),
  createPlaylist: (name: string, description?: string) =>
    request<Playlist>('/api/playlists', { method: 'POST', body: JSON.stringify({ name, description }) }),
  updatePlaylist: (id: string, body: { name?: string; description?: string; songOrder?: string[] }) =>
    request<Playlist>(`/api/playlists/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePlaylist: (id: string) =>
    request<{ success: boolean }>(`/api/playlists/${id}`, { method: 'DELETE' }),
  addSongToPlaylist: (playlistId: string, songId: string) =>
    request<{ success: boolean }>(`/api/playlists/${playlistId}/songs`, { method: 'POST', body: JSON.stringify({ songId }) }),
  removeSongFromPlaylist: (playlistId: string, songId: string) =>
    request<{ success: boolean }>(`/api/playlists/${playlistId}/songs/${songId}`, { method: 'DELETE' }),

  getFavorites: (limit = 50, offset = 0) =>
    request<{ songs: Song[]; total: number }>(`/api/favorites?limit=${limit}&offset=${offset}`),
  setFavorite: (songId: string) =>
    request<{ success: boolean; isFavorite: boolean }>(`/api/favorites/${songId}`, { method: 'PUT' }),
  removeFavorite: (songId: string) =>
    request<{ success: boolean; isFavorite: boolean }>(`/api/favorites/${songId}`, { method: 'DELETE' }),

  setRating: (songId: string, stars: number) =>
    request<{ success: boolean; stars: number }>(`/api/ratings/${songId}`, { method: 'PUT', body: JSON.stringify({ stars }) }),
  removeRating: (songId: string) =>
    request<{ success: boolean; stars: null }>(`/api/ratings/${songId}`, { method: 'DELETE' }),

  getGenres: () => request<Genre[]>('/api/genres'),

  getRecentlyPlayed: (limit = 10) => request<Song[]>(`/api/plays/recent?limit=${limit}`),

  recordPlay: (songId: string, secondsPlayed: number, sourceContext = 'library') =>
    request<any>('/api/plays', { method: 'POST', body: JSON.stringify({ songId, secondsPlayed, sourceContext }) }),

  getWrapped: (from?: number, to?: number) => {
    const params = new URLSearchParams();
    if (from) params.set('from', String(from));
    if (to) params.set('to', String(to));
    const qs = params.toString();
    return request<WrappedStats>(`/api/stats/wrapped${qs ? `?${qs}` : ''}`);
  },

  startDownload: (urlOrQuery: string) => {
    const isUrl = urlOrQuery.startsWith('http://') || urlOrQuery.startsWith('https://');
    const body = isUrl ? { url: urlOrQuery } : { query: urlOrQuery };
    return request<{ jobId: string }>('/api/downloads', { method: 'POST', body: JSON.stringify(body) });
  },

  getJobStatus: (jobId: string) => request<DownloadJobStatus>(`/api/downloads/${jobId}`),

  importYouTubePlaylist: (url: string, playlistName?: string) =>
    request<{ jobId: string }>('/api/downloads/youtube-playlist', {
      method: 'POST',
      body: JSON.stringify({ url, playlistName })
    }),

  searchOnline: (q: string, limit = 15) =>
    request<OnlineSearchResult[]>(`/api/search/online?q=${encodeURIComponent(q)}&limit=${limit}`),

  getDailyRecommendations: () => request<RecommendationItem[]>('/api/recommendations/daily'),
  refreshRecommendations: () => request<RecommendationItem[]>('/api/recommendations/refresh', { method: 'POST' }),
  getGenreRecommendations: (genreName: string) =>
    request<OnlineSearchResult[]>(`/api/recommendations/genre/${encodeURIComponent(genreName)}`),

  getSettings: () => request<Record<string, string>>('/api/settings'),
  updateSettings: (settings: Record<string, any>) =>
    request<Record<string, string>>('/api/settings', { method: 'PATCH', body: JSON.stringify(settings) })
};
