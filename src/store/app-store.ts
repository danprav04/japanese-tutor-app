/**
 * Global App State managed with Zustand
 * Central store for API keys, settings, and session state
 */

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { ModelType } from '../services/groq-client';

export type { ModelType } from '../services/groq-client';

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

  // Extraction model preferences
  extractionModels: ModelType[];

  // Stats
  studyStreak: number;
  totalReviews: number;
  cardsDueCount: number;
  dailyGoal: number;

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
  setDailyGoal: (goal: number) => void;
  toggleExtractionModel: (model: ModelType) => void;
  loadFromStorage: () => Promise<void>;
  persistApiKeys: () => Promise<void>;
}

const API_KEYS_STORAGE = 'gemini_api_keys';
const MODEL_STORAGE = 'selected_model';
const EXTRACTION_MODELS_STORAGE = 'extraction_models';
const DAILY_GOAL_STORAGE = 'daily_goal';

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  apiKeys: [],
  currentModel: 'qwen/qwen3-32b',
  isGeminiReady: true,
  isDatabaseReady: false,
  isLoading: false,
  currentThreadId: 'default',
  studyStreak: 0,
  totalReviews: 0,
  cardsDueCount: 0,
  dailyGoal: 10,
  extractionModels: ['qwen/qwen3-32b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'moonshotai/kimi-k2-instruct'] as ModelType[],

  // Actions
  setApiKeys: (keys) => {
    set({ apiKeys: keys, isGeminiReady: true });
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
      isGeminiReady: true,
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

  setDailyGoal: (goal) => {
    set({ dailyGoal: goal });
    SecureStore.setItemAsync(DAILY_GOAL_STORAGE, String(goal)).catch(console.error);
  },

  toggleExtractionModel: (model) => {
    const { extractionModels } = get();
    const isSelected = extractionModels.includes(model);
    // Prevent deselecting the last model
    if (isSelected && extractionModels.length <= 1) return;
    const updated = isSelected
      ? extractionModels.filter((m) => m !== model)
      : [...extractionModels, model];
    set({ extractionModels: updated });
    SecureStore.setItemAsync(EXTRACTION_MODELS_STORAGE, JSON.stringify(updated)).catch(console.error);
  },

  loadFromStorage: async () => {
    try {
      const [storedKeys, storedModel, storedGoal, storedExtractionModels] = await Promise.all([
        SecureStore.getItemAsync(API_KEYS_STORAGE),
        SecureStore.getItemAsync(MODEL_STORAGE),
        SecureStore.getItemAsync(DAILY_GOAL_STORAGE),
        SecureStore.getItemAsync(EXTRACTION_MODELS_STORAGE),
      ]);

      const apiKeys = storedKeys ? JSON.parse(storedKeys) : [];
      const dailyGoal = storedGoal ? parseInt(storedGoal, 10) : 10;
      let currentModel = (storedModel as ModelType) || 'qwen/qwen3-32b';
      const extractionModels: ModelType[] = storedExtractionModels
        ? JSON.parse(storedExtractionModels)
        : ['qwen/qwen3-32b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'moonshotai/kimi-k2-instruct'];
      
      // Validate model name (in case old invalid name is stored)
      const validModels: ModelType[] = ['qwen/qwen3-32b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'moonshotai/kimi-k2-instruct'];
      if (!validModels.includes(currentModel)) {
        currentModel = 'qwen/qwen3-32b';
      }

      set({
        apiKeys,
        currentModel,
        dailyGoal: isNaN(dailyGoal) ? 10 : dailyGoal,
        extractionModels,
        isGeminiReady: true,
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
