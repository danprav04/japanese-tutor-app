import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Dimensions,
  Linking,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useAppStore } from '../src/store/app-store';
import { getDatabase } from '../src/db/database';

interface OnboardingProps {
  onComplete: () => void;
}

const { width, height } = Dimensions.get('window');

export default function OnboardingScreen({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const { addApiKey, isGeminiReady } = useAppStore();

  const handleAddKey = () => {
    if (apiKey.trim()) {
      addApiKey(apiKey.trim());
      setApiKey('');
    }
  };

  const handleFinish = async () => {
    try {
      const db = getDatabase();
      await db.execute(
        `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('onboarding_complete', '1')`
      );
    } catch (err) {
      console.error('Failed to persist onboarding flag:', err);
    }
    onComplete();
  };

  const slides = [
    // Slide 0 — Welcome
    <Animated.View key="welcome" entering={FadeInDown.duration(600)} style={styles.slide}>
      <Text style={styles.heroEmoji}>🎌</Text>
      <Text style={styles.heroTitle}>日本語チューター</Text>
      <Text style={styles.heroSubtitle}>Your AI Japanese Tutor</Text>
      <View style={styles.featureList}>
        <FeatureItem emoji="🧠" text="Adaptive learning with BKT mastery tracking" />
        <FeatureItem emoji="📝" text="Spaced repetition flashcards (FSRS)" />
        <FeatureItem emoji="💬" text="Conversational AI tutor powered by Gemini" />
        <FeatureItem emoji="📖" text="50+ N5 starter curriculum items" />
        <FeatureItem emoji="🔒" text="100% local — your data stays on your device" />
      </View>
    </Animated.View>,

    // Slide 1 — API Key Setup
    <Animated.View key="apikey" entering={FadeInDown.duration(600)} style={styles.slide}>
      <Text style={styles.stepEmoji}>🔑</Text>
      <Text style={styles.stepTitle}>Connect to Gemini</Text>
      <Text style={styles.stepText}>
        This app uses Google's Gemini AI for tutoring. You'll need a free API key from Google AI Studio.
      </Text>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => Linking.openURL('https://aistudio.google.com/apikey')}
      >
        <Text style={styles.linkButtonText}>🌐 Get a Free API Key</Text>
      </TouchableOpacity>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.apiInput}
            placeholder="Paste your API key here"
            placeholderTextColor="#666"
            value={apiKey}
            onChangeText={setApiKey}
            secureTextEntry
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[styles.addButton, !apiKey.trim() && styles.addButtonDisabled]}
            onPress={handleAddKey}
            disabled={!apiKey.trim()}
          >
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {isGeminiReady && (
        <Animated.View entering={FadeIn.duration(400)} style={styles.successBadge}>
          <Text style={styles.successText}>✅ API key added successfully!</Text>
        </Animated.View>
      )}

      <Text style={styles.skipHint}>
        You can also add this later in Settings
      </Text>
    </Animated.View>,

    // Slide 2 — Ready
    <Animated.View key="ready" entering={FadeInUp.duration(600)} style={styles.slide}>
      <Text style={styles.heroEmoji}>✨</Text>
      <Text style={styles.heroTitle}>You're all set!</Text>
      <Text style={styles.readyText}>
        Start chatting with Sensei to learn Japanese. The tutor will adapt to your level and create flashcards automatically.
      </Text>
      <View style={styles.tipList}>
        <Text style={styles.tipItem}>💡 Chat naturally — ask questions, practice, or just say こんにちは</Text>
        <Text style={styles.tipItem}>📚 Review tab shows your flashcards with spaced repetition</Text>
        <Text style={styles.tipItem}>📊 Track your mastery on the Progress tab</Text>
        <Text style={styles.tipItem}>📖 Browse the full curriculum in the Curriculum tab</Text>
      </View>
    </Animated.View>,
  ];

  const isLastSlide = step === slides.length - 1;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {slides[step]}
      </ScrollView>

      {/* Navigation */}
      <View style={styles.nav}>
        {/* Dots */}
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === step && styles.dotActive]}
            />
          ))}
        </View>

        <View style={styles.navButtons}>
          {step > 0 && (
            <TouchableOpacity style={styles.backBtn} onPress={() => setStep(step - 1)}>
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          )}
          {step === 1 && !isGeminiReady && (
            <TouchableOpacity style={styles.skipBtn} onPress={() => setStep(step + 1)}>
              <Text style={styles.skipBtnText}>Skip for now</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={isLastSlide ? handleFinish : () => setStep(step + 1)}
          >
            <Text style={styles.nextBtnText}>
              {isLastSlide ? 'Start Learning! 🚀' : 'Next'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function FeatureItem({ emoji, text }: { emoji: string; text: string }) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureEmoji}>{emoji}</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 32,
  },
  slide: {
    alignItems: 'center',
  },
  heroEmoji: {
    fontSize: 72,
    marginBottom: 16,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    color: '#999',
    fontSize: 18,
    marginBottom: 32,
  },
  featureList: {
    width: '100%',
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  featureEmoji: {
    fontSize: 20,
    marginRight: 12,
  },
  featureText: {
    color: '#ccc',
    fontSize: 14,
    flex: 1,
  },
  // API key step
  stepEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  stepTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 12,
  },
  stepText: {
    color: '#999',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  linkButton: {
    backgroundColor: '#1e40af',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  linkButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 8,
    marginBottom: 12,
  },
  apiInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  addButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  addButtonDisabled: {
    opacity: 0.4,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  successBadge: {
    backgroundColor: '#16653433',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  successText: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '500',
  },
  skipHint: {
    color: '#555',
    fontSize: 12,
    marginTop: 4,
  },
  // Ready step
  readyText: {
    color: '#999',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 28,
  },
  tipList: {
    width: '100%',
    gap: 12,
  },
  tipItem: {
    color: '#bbb',
    fontSize: 14,
    lineHeight: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
  },
  // Navigation
  nav: {
    padding: 24,
    paddingBottom: 40,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  dotActive: {
    backgroundColor: '#6366f1',
    width: 24,
  },
  navButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  backBtnText: {
    color: '#666',
    fontSize: 15,
  },
  skipBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  skipBtnText: {
    color: '#6366f1',
    fontSize: 14,
  },
  nextBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    flex: 1,
    maxWidth: 240,
    alignItems: 'center',
  },
  nextBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
