import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Flashcard {
  id: string;
  front: string;
  back: string;
  type: 'vocab' | 'grammar' | 'kanji';
}

// Sample data - will be replaced with FSRS-managed cards from database
const sampleCards: Flashcard[] = [
  { id: '1', front: '食べる', back: 'to eat (taberu)', type: 'vocab' },
  { id: '2', front: '日', back: 'sun, day (hi, nichi)', type: 'kanji' },
  { id: '3', front: '〜ている', back: 'progressive form (-ing)', type: 'grammar' },
];

export default function FlashcardsScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [completed, setCompleted] = useState(0);

  const currentCard = sampleCards[currentIndex];
  const hasCards = sampleCards.length > 0;

  const handleFlip = () => setIsFlipped(!isFlipped);

  const handleRating = (rating: 'again' | 'hard' | 'good' | 'easy') => {
    // TODO: Update FSRS card state based on rating
    console.log(`Card ${currentCard.id} rated: ${rating}`);
    
    setIsFlipped(false);
    setCompleted(completed + 1);
    
    if (currentIndex < sampleCards.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setCurrentIndex(0); // Loop for demo
    }
  };

  if (!hasCards) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📚</Text>
          <Text style={styles.emptyTitle}>No cards due!</Text>
          <Text style={styles.emptyText}>Learn some content in the Chat tab first.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.progress}>
        <Text style={styles.progressText}>
          {completed} reviewed • {sampleCards.length - completed} remaining
        </Text>
      </View>

      <TouchableOpacity 
        style={styles.cardContainer} 
        onPress={handleFlip}
        activeOpacity={0.9}
      >
        <View style={[styles.card, isFlipped && styles.cardFlipped]}>
          <Text style={styles.cardType}>{currentCard.type.toUpperCase()}</Text>
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
            onPress={() => handleRating('again')}
          >
            <Text style={styles.ratingText}>Again</Text>
            <Text style={styles.ratingSubtext}>1m</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.ratingButton, styles.hardButton]} 
            onPress={() => handleRating('hard')}
          >
            <Text style={styles.ratingText}>Hard</Text>
            <Text style={styles.ratingSubtext}>6m</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.ratingButton, styles.goodButton]} 
            onPress={() => handleRating('good')}
          >
            <Text style={styles.ratingText}>Good</Text>
            <Text style={styles.ratingSubtext}>10m</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.ratingButton, styles.easyButton]} 
            onPress={() => handleRating('easy')}
          >
            <Text style={styles.ratingText}>Easy</Text>
            <Text style={styles.ratingSubtext}>4d</Text>
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
  },
});
