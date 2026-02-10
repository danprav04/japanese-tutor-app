import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ActivityIndicator } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { useAppStore } from '../../src/store/app-store';
import { getDueCards, reviewCardAndPersist, getCardSchedulingPreview } from '../../src/services/card-service';
import { recordAnswer, updateStudyStreak } from '../../src/services/progress-service';
import { type ReviewRating, Rating, type CardData } from '../../src/algorithms/fsrs';

interface DisplayCard {
  card_id: string;
  node_id: string | null;
  front: string;
  back: string;
  card_type: 'vocab' | 'grammar' | 'kanji';
}

interface SessionStats {
  totalReviewed: number;
  ratings: { again: number; hard: number; good: number; easy: number };
}

export default function FlashcardsScreen() {
  const { isDatabaseReady, setCardsDueCount, setTotalReviews, totalReviews } = useAppStore();
  const [cards, setCards] = useState<DisplayCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionDone, setSessionDone] = useState(false);
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    totalReviewed: 0,
    ratings: { again: 0, hard: 0, good: 0, easy: 0 },
  });
  const [scheduling, setScheduling] = useState<{ again: string; hard: string; good: string; easy: string }>({
    again: '?', hard: '?', good: '?', easy: '?',
  });

  // Flip animation
  const flipProgress = useSharedValue(0);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1000 }, { rotateY: `${interpolate(flipProgress.value, [0, 1], [0, 180])}deg` }],
    backfaceVisibility: 'hidden' as const,
  }));

  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1000 }, { rotateY: `${interpolate(flipProgress.value, [0, 1], [180, 360])}deg` }],
    backfaceVisibility: 'hidden' as const,
  }));

  // Load due cards
  const loadCards = useCallback(async () => {
    if (!isDatabaseReady) return;
    setIsLoading(true);
    setSessionDone(false);
    try {
      const due = await getDueCards(20);
      setCards(due.map((c: CardData) => ({
        card_id: c.card_id,
        node_id: c.node_id,
        front: c.front,
        back: c.back,
        card_type: c.card_type,
      })));
      setCardsDueCount(due.length);
      setCurrentIndex(0);
      setCompleted(0);
      setIsFlipped(false);
      flipProgress.value = 0;
      setSessionStats({ totalReviewed: 0, ratings: { again: 0, hard: 0, good: 0, easy: 0 } });
    } catch (err) {
      console.error('Failed to load cards:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isDatabaseReady]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  // Update scheduling when card changes or flips
  useEffect(() => {
    let mounted = true;
    const fetchScheduling = async () => {
      if (cards.length > 0 && currentIndex < cards.length && isFlipped) {
        try {
          const preview = await getCardSchedulingPreview(cards[currentIndex].card_id);
          if (mounted) setScheduling(preview);
        } catch {
          if (mounted) setScheduling({ again: '?', hard: '?', good: '?', easy: '?' });
        }
      }
    };
    fetchScheduling();
    return () => { mounted = false; };
  }, [currentIndex, isFlipped, cards]);

  const handleFlip = () => {
    const newFlipped = !isFlipped;
    setIsFlipped(newFlipped);
    flipProgress.value = withTiming(newFlipped ? 1 : 0, {
      duration: 400,
      easing: Easing.out(Easing.cubic),
    });
  };

  const handleRating = async (rating: ReviewRating) => {
    const card = cards[currentIndex];
    try {
      await reviewCardAndPersist(card.card_id, rating);

      if (card.node_id) {
        const isCorrect = rating === Rating.Good || rating === Rating.Easy;
        await recordAnswer(card.node_id, isCorrect);
      }

      await updateStudyStreak();
      setTotalReviews(totalReviews + 1);
    } catch (err) {
      console.error('Failed to record review:', err);
    }

    // Track session stats
    const ratingKey = rating === Rating.Again ? 'again'
      : rating === Rating.Hard ? 'hard'
      : rating === Rating.Good ? 'good' : 'easy';
    setSessionStats((prev) => ({
      totalReviewed: prev.totalReviewed + 1,
      ratings: { ...prev.ratings, [ratingKey]: prev.ratings[ratingKey] + 1 },
    }));

    // Reset flip
    setIsFlipped(false);
    flipProgress.value = withTiming(0, { duration: 200 });
    setCompleted(completed + 1);

    if (currentIndex < cards.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Session complete
      setSessionDone(true);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading cards...</Text>
      </SafeAreaView>
    );
  }

  if (cards.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📚</Text>
          <Text style={styles.emptyTitle}>No cards due!</Text>
          <Text style={styles.emptyText}>
            Learn some content in the Chat tab or upload materials in Settings to generate flashcards.
          </Text>
          <TouchableOpacity style={styles.refreshButton} onPress={loadCards}>
            <Text style={styles.refreshText}>Check Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Session summary screen
  if (sessionDone) {
    const total = sessionStats.totalReviewed;
    const goodPct = total > 0
      ? Math.round(((sessionStats.ratings.good + sessionStats.ratings.easy) / total) * 100)
      : 0;

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.summaryContainer}>
          <Text style={styles.summaryEmoji}>🎉</Text>
          <Text style={styles.summaryTitle}>Session Complete!</Text>
          <Text style={styles.summarySubtitle}>
            You reviewed {total} card{total !== 1 ? 's' : ''}
          </Text>

          <View style={styles.summaryGrid}>
            <View style={[styles.summaryItem, { backgroundColor: '#991b1b33' }]}>
              <Text style={styles.summaryItemValue}>{sessionStats.ratings.again}</Text>
              <Text style={styles.summaryItemLabel}>Again</Text>
            </View>
            <View style={[styles.summaryItem, { backgroundColor: '#854d0e33' }]}>
              <Text style={styles.summaryItemValue}>{sessionStats.ratings.hard}</Text>
              <Text style={styles.summaryItemLabel}>Hard</Text>
            </View>
            <View style={[styles.summaryItem, { backgroundColor: '#16653433' }]}>
              <Text style={styles.summaryItemValue}>{sessionStats.ratings.good}</Text>
              <Text style={styles.summaryItemLabel}>Good</Text>
            </View>
            <View style={[styles.summaryItem, { backgroundColor: '#1e40af33' }]}>
              <Text style={styles.summaryItemValue}>{sessionStats.ratings.easy}</Text>
              <Text style={styles.summaryItemLabel}>Easy</Text>
            </View>
          </View>

          <Text style={styles.summaryAccuracy}>
            {goodPct}% correct recall
          </Text>

          <TouchableOpacity style={styles.summaryButton} onPress={loadCards}>
            <Text style={styles.summaryButtonText}>Review More Cards</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const currentCard = cards[currentIndex];

  return (
    <SafeAreaView style={styles.container}>
      {/* Progress counter */}
      <View style={styles.progress}>
        <Text style={styles.progressText}>
          Card {currentIndex + 1} of {cards.length}  ·  {completed} reviewed
        </Text>
        <View style={styles.progressBarContainer}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${((currentIndex) / cards.length) * 100}%` },
            ]}
          />
        </View>
      </View>

      {/* Animated card */}
      <TouchableOpacity
        style={styles.cardContainer}
        onPress={handleFlip}
        activeOpacity={0.95}
      >
        {/* Front face */}
        <Animated.View style={[styles.card, styles.cardFace, frontStyle]}>
          <Text style={styles.cardType}>{currentCard.card_type.toUpperCase()}</Text>
          <Text style={styles.cardText}>{currentCard.front}</Text>
          <Text style={styles.tapHint}>Tap to reveal answer</Text>
        </Animated.View>

        {/* Back face */}
        <Animated.View style={[styles.card, styles.cardFace, styles.cardFlipped, backStyle]}>
          <Text style={styles.cardType}>{currentCard.card_type.toUpperCase()}</Text>
          <Text style={styles.cardTextBack}>{currentCard.back}</Text>
          <Text style={styles.tapHint}>Rate your recall below</Text>
        </Animated.View>
      </TouchableOpacity>

      {/* Rating buttons */}
      {isFlipped && (
        <View style={styles.ratingContainer}>
          <TouchableOpacity
            style={[styles.ratingButton, styles.againButton]}
            onPress={() => handleRating(Rating.Again)}
          >
            <Text style={styles.ratingText}>Again</Text>
            <Text style={styles.ratingSubtext}>{scheduling.again}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ratingButton, styles.hardButton]}
            onPress={() => handleRating(Rating.Hard)}
          >
            <Text style={styles.ratingText}>Hard</Text>
            <Text style={styles.ratingSubtext}>{scheduling.hard}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ratingButton, styles.goodButton]}
            onPress={() => handleRating(Rating.Good)}
          >
            <Text style={styles.ratingText}>Good</Text>
            <Text style={styles.ratingSubtext}>{scheduling.good}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ratingButton, styles.easyButton]}
            onPress={() => handleRating(Rating.Easy)}
          >
            <Text style={styles.ratingText}>Easy</Text>
            <Text style={styles.ratingSubtext}>{scheduling.easy}</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#999',
    marginTop: 12,
  },
  progress: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  progressText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  progressBarContainer: {
    height: 3,
    backgroundColor: '#2a2a2a',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 2,
  },
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cardFace: {
    position: 'absolute',
  },
  card: {
    width: width - 40,
    height: 300,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cardFlipped: {
    backgroundColor: '#1e1e2e',
  },
  cardType: {
    position: 'absolute',
    top: 16,
    left: 16,
    color: '#6366f1',
    fontSize: 12,
    fontWeight: '600',
  },
  cardText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '600',
    textAlign: 'center',
  },
  cardTextBack: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 34,
  },
  tapHint: {
    position: 'absolute',
    bottom: 16,
    color: '#666',
    fontSize: 12,
  },
  ratingContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 8,
  },
  ratingButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  againButton: { backgroundColor: '#991b1b' },
  hardButton: { backgroundColor: '#854d0e' },
  goodButton: { backgroundColor: '#166534' },
  easyButton: { backgroundColor: '#1e40af' },
  ratingText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  ratingSubtext: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginTop: 2,
  },
  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  refreshButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  refreshText: {
    color: '#fff',
    fontWeight: '600',
  },
  // Session summary
  summaryContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  summaryEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  summaryTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  summarySubtitle: {
    color: '#999',
    fontSize: 16,
    marginBottom: 32,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  summaryItem: {
    width: 70,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  summaryItemValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  summaryItemLabel: {
    color: '#999',
    fontSize: 11,
    marginTop: 4,
  },
  summaryAccuracy: {
    color: '#22c55e',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 32,
  },
  summaryButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
  },
  summaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
