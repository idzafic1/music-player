import { create } from 'zustand';
import { getApiBaseUrl, getApiToken, setApiConfig, api } from '../services/api';

interface SettingsState {
  baseUrl: string;
  apiToken: string;
  isOnline: boolean;
  isMetered: boolean;
  isBackendConnected: boolean;
  lastChecked: number;

  setBaseUrl: (url: string) => void;
  setApiToken: (token: string) => void;
  setOnline: (online: boolean) => void;
  setMetered: (metered: boolean) => void;
  checkBackendConnection: () => Promise<boolean>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  baseUrl: getApiBaseUrl(),
  apiToken: getApiToken(),
  isOnline: true,
  isMetered: false,
  isBackendConnected: false,
  lastChecked: 0,

  setBaseUrl: (url: string) => {
    setApiConfig(url, get().apiToken);
    set({ baseUrl: url });
    get().checkBackendConnection();
  },

  setApiToken: (token: string) => {
    setApiConfig(get().baseUrl, token);
    set({ apiToken: token });
    get().checkBackendConnection();
  },

  setOnline: (online: boolean) => {
    set({ isOnline: online });
  },

  setMetered: (metered: boolean) => {
    set({ isMetered: metered });
  },

  checkBackendConnection: async () => {
    try {
      await api.checkHealth();
      set({ isBackendConnected: true, lastChecked: Date.now() });
      return true;
    } catch {
      set({ isBackendConnected: false, lastChecked: Date.now() });
      return false;
    }
  }
}));
