import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ActivityIndicator } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '../../src/store/app-store';
import { getDueCards, reviewCardAndPersist, getCardSchedulingPreview } from '../../src/services/card-service';
import { recordAnswer } from '../../src/services/progress-service';
import { type ReviewRating, Rating, type CardData } from '../../src/algorithms/fsrs';

interface DisplayCard {
  card_id: string;
  node_id: string | null;
  front: string;
  back: string;
  card_type: 'vocab' | 'grammar' | 'kanji';
}

export default function FlashcardsScreen() {
  const { isDatabaseReady, setCardsDueCount, setTotalReviews, totalReviews } = useAppStore();
  const [cards, setCards] = useState<DisplayCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [scheduling, setScheduling] = useState<{ again: string; hard: string; good: string; easy: string }>({
    again: '?', hard: '?', good: '?', easy: '?',
  });

  // Load due cards
  const loadCards = useCallback(() => {
    if (!isDatabaseReady) return;
    setIsLoading(true);
    try {
      const due = getDueCards(20);
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
    if (cards.length > 0 && currentIndex < cards.length && isFlipped) {
      try {
        const preview = getCardSchedulingPreview(cards[currentIndex].card_id);
        setScheduling(preview);
      } catch {
        setScheduling({ again: '?', hard: '?', good: '?', easy: '?' });
      }
    }
  }, [currentIndex, isFlipped, cards]);

  const handleFlip = () => setIsFlipped(!isFlipped);

  const handleRating = (rating: ReviewRating) => {
    const card = cards[currentIndex];
    try {
      // Update FSRS card state
      reviewCardAndPersist(card.card_id, rating);

      // Update BKT mastery if linked to a curriculum node
      if (card.node_id) {
        const isCorrect = rating === Rating.Good || rating === Rating.Easy;
        recordAnswer(card.node_id, isCorrect);
      }

      setTotalReviews(totalReviews + 1);
    } catch (err) {
      console.error('Failed to record review:', err);
    }

    setIsFlipped(false);
    setCompleted(completed + 1);

    if (currentIndex < cards.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Session complete — reload to check for more
      loadCards();
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

  const currentCard = cards[currentIndex];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.progress}>
        <Text style={styles.progressText}>
          {completed} reviewed • {cards.length - completed} remaining
        </Text>
      </View>

      <TouchableOpacity
        style={styles.cardContainer}
        onPress={handleFlip}
        activeOpacity={0.9}
      >
        <View style={[styles.card, isFlipped && styles.cardFlipped]}>
          <Text style={styles.cardType}>{currentCard.card_type.toUpperCase()}</Text>
          <Text style={styles.cardText}>
            {isFlipped ? currentCard.back : currentCard.front}
          </Text>
          <Text style={styles.tapHint}>
            {isFlipped ? 'Rate your recall below' : 'Tap to reveal answer'}
          </Text>
        </View>
      </TouchableOpacity>

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
    alignItems: 'center',
  },
  progressText: {
    color: '#666',
    fontSize: 14,
  },
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
});
