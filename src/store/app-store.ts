/**
 * Global App State managed with Zustand
 * Central store for API keys, settings, and session state
 */

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

export type ModelType = 'gemini-3-flash-preview' | 'gemini-3-pro-preview';

interface AppState {
  // API Keys
  apiKeys: string[];
  currentModel: ModelType;
  isGeminiReady: boolean;

  // Database
  isDatabaseReady: boolean;

  // Session
  isLoading: boolean;
  currentThreadId: string;

  // Stats
  studyStreak: number;
  totalReviews: number;
  cardsDueCount: number;

  // Actions
  setApiKeys: (keys: string[]) => void;
  addApiKey: (key: string) => void;
  removeApiKey: (index: number) => void;
  setCurrentModel: (model: ModelType) => void;
  setDatabaseReady: (ready: boolean) => void;
  setLoading: (loading: boolean) => void;
  setCurrentThreadId: (id: string) => void;
  setStudyStreak: (streak: number) => void;
  setTotalReviews: (count: number) => void;
  setCardsDueCount: (count: number) => void;
  loadFromStorage: () => Promise<void>;
  persistApiKeys: () => Promise<void>;
}

const API_KEYS_STORAGE = 'gemini_api_keys';
const MODEL_STORAGE = 'selected_model';

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  apiKeys: [],
  currentModel: 'gemini-3-flash-preview',
  isGeminiReady: false,
  isDatabaseReady: false,
  isLoading: false,
  currentThreadId: 'default',
  studyStreak: 0,
  totalReviews: 0,
  cardsDueCount: 0,

  // Actions
  setApiKeys: (keys) => {
    set({ apiKeys: keys, isGeminiReady: keys.length > 0 });
  },

  addApiKey: (key) => {
    const { apiKeys, persistApiKeys } = get();
    const trimmed = key.trim();
    if (trimmed && !apiKeys.includes(trimmed)) {
      set({
        apiKeys: [...apiKeys, trimmed],
        isGeminiReady: true,
      });
      persistApiKeys();
    }
  },

  removeApiKey: (index) => {
    const { apiKeys, persistApiKeys } = get();
    const updated = apiKeys.filter((_, i) => i !== index);
    set({
      apiKeys: updated,
      isGeminiReady: updated.length > 0,
    });
    persistApiKeys();
  },

  setCurrentModel: (model) => {
    set({ currentModel: model });
    SecureStore.setItemAsync(MODEL_STORAGE, model).catch(console.error);
  },

  setDatabaseReady: (ready) => set({ isDatabaseReady: ready }),
  setLoading: (loading) => set({ isLoading: loading }),
  setCurrentThreadId: (id) => set({ currentThreadId: id }),
  setStudyStreak: (streak) => set({ studyStreak: streak }),
  setTotalReviews: (count) => set({ totalReviews: count }),
  setCardsDueCount: (count) => set({ cardsDueCount: count }),

  loadFromStorage: async () => {
    try {
      const [storedKeys, storedModel] = await Promise.all([
        SecureStore.getItemAsync(API_KEYS_STORAGE),
        SecureStore.getItemAsync(MODEL_STORAGE),
      ]);

      const apiKeys = storedKeys ? JSON.parse(storedKeys) : [];
      let currentModel = (storedModel as ModelType) || 'gemini-3-flash-preview';
      
      // Validate model name (in case old invalid name is stored)
      if (currentModel !== 'gemini-3-flash-preview' && currentModel !== 'gemini-3-pro-preview') {
        currentModel = 'gemini-3-flash-preview';
      }

      set({
        apiKeys,
        currentModel,
        isGeminiReady: apiKeys.length > 0,
      });
    } catch (error) {
      console.error('Failed to load from storage:', error);
    }
  },

  persistApiKeys: async () => {
    try {
      const { apiKeys } = get();
      await SecureStore.setItemAsync(API_KEYS_STORAGE, JSON.stringify(apiKeys));
    } catch (error) {
      console.error('Failed to persist API keys:', error);
    }
  },
}));
