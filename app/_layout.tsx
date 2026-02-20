import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { initDatabase, getDatabase } from '../src/db/database';
import { useAppStore } from '../src/store/app-store';
import OnboardingScreen from './onboarding';

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setDatabaseReady, loadFromStorage } = useAppStore();

  useEffect(() => {
    async function initialize() {
      try {
        // 1. Initialize database
        await initDatabase();
        setDatabaseReady(true);

        // 1.5. Skipping automatic curriculum seeding



        // 2. Load settings from secure storage
        await loadFromStorage();

        // 3. Check if onboarding is complete
        try {
          const db = getDatabase();
          const result = await db.execute(
            `SELECT value FROM app_settings WHERE key = 'onboarding_complete'`
          );
          const onboardingDone = result.rows?.[0]
            ? ((result.rows[0] as any).value as string) === '1'
            : false;
          setShowOnboarding(!onboardingDone);
        } catch {
          setShowOnboarding(true);
        }

        setIsReady(true);
      } catch (err) {
        console.error('Initialization failed:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    }

    initialize();
  }, []);

  if (error) {
    return (
      <View style={[styles.container, styles.center]}>
        <StatusBar style="light" />
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Initialization Error</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={[styles.container, styles.center]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading 日本語チューター...</Text>
      </View>
    );
  }

  if (showOnboarding) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <OnboardingScreen onComplete={() => setShowOnboarding(false)} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Slot />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#999',
    fontSize: 16,
    marginTop: 16,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorText: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
