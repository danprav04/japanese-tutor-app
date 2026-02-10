import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { useAppStore } from '../../src/store/app-store';
import { getOverallMastery, getCategoryProgress, getStudyStreak } from '../../src/services/progress-service';
import { getCardStats } from '../../src/services/card-service';

interface CategoryData {
  name: string;
  mastery: number;
  total: number;
  learned: number;
}

function ProgressRing({ progress, size = 120 }: { progress: number; size?: number }) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress * circumference);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#2a2a2a"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#6366f1"
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[styles.ringContent, { width: size, height: size }]}>
        <Text style={styles.ringPercent}>{Math.round(progress * 100)}%</Text>
        <Text style={styles.ringLabel}>Mastery</Text>
      </View>
    </View>
  );
}

function CategoryBar({ name, mastery, total, learned }: CategoryData) {
  return (
    <View style={styles.categoryItem}>
      <View style={styles.categoryHeader}>
        <Text style={styles.categoryName}>{name}</Text>
        <Text style={styles.categoryStats}>{learned}/{total}</Text>
      </View>
      <View style={styles.barContainer}>
        <View style={[styles.barFill, { width: `${Math.min(mastery * 100, 100)}%` }]} />
      </View>
    </View>
  );
}

export default function ProgressScreen() {
  const { isDatabaseReady, totalReviews } = useAppStore();
  const [overall, setOverall] = useState({ mastery: 0, total: 0, mastered: 0 });
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [cardStats, setCardStats] = useState({ total: 0, newCards: 0, learning: 0, reviewing: 0, dueNow: 0 });
  const [streak, setStreak] = useState(0);

  const loadData = useCallback(async () => {
    if (!isDatabaseReady) return;
    try {
      const [overallData, categoryData, cardData, streakData] = await Promise.all([
        getOverallMastery(),
        getCategoryProgress(),
        getCardStats(),
        getStudyStreak(),
      ]);
      setOverall(overallData);
      setCategories(categoryData);
      setCardStats(cardData);
      setStreak(streakData.streak);
    } catch (err) {
      console.error('Failed to load progress:', err);
    }
  }, [isDatabaseReady]);

  // Reload data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Overall Progress */}
        <View style={styles.overallCard}>
          <ProgressRing progress={overall.mastery} />
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{streak}</Text>
              <Text style={styles.statLabel}>🔥 Day Streak</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalReviews}</Text>
              <Text style={styles.statLabel}>📝 Reviews</Text>
            </View>
          </View>
        </View>

        {/* Card Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Flashcard Stats</Text>
          <View style={styles.cardStatsGrid}>
            <View style={styles.cardStatItem}>
              <Text style={styles.cardStatValue}>{cardStats.dueNow}</Text>
              <Text style={styles.cardStatLabel}>Due Now</Text>
            </View>
            <View style={styles.cardStatItem}>
              <Text style={styles.cardStatValue}>{cardStats.newCards}</Text>
              <Text style={styles.cardStatLabel}>New</Text>
            </View>
            <View style={styles.cardStatItem}>
              <Text style={styles.cardStatValue}>{cardStats.learning}</Text>
              <Text style={styles.cardStatLabel}>Learning</Text>
            </View>
            <View style={styles.cardStatItem}>
              <Text style={styles.cardStatValue}>{cardStats.reviewing}</Text>
              <Text style={styles.cardStatLabel}>Review</Text>
            </View>
          </View>
        </View>

        {/* Category Breakdown */}
        {categories.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Curriculum Progress</Text>
            {categories.map((cat) => (
              <CategoryBar key={cat.name} {...cat} />
            ))}
          </View>
        )}

        {/* Empty state */}
        {categories.length === 0 && overall.total === 0 && (
          <View style={styles.emptyInfo}>
            <Text style={styles.emptyInfoIcon}>📖</Text>
            <Text style={styles.emptyInfoTitle}>No progress yet</Text>
            <Text style={styles.emptyInfoText}>
              Start chatting with Sensei or upload learning materials to begin tracking your progress!
            </Text>
          </View>
        )}

        {/* Explanation */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>📊 How Mastery Works</Text>
          <Text style={styles.infoText}>
            Your mastery score is calculated using Bayesian Knowledge Tracing (BKT).
            It accounts for both correct answers and potential lucky guesses to
            give you an accurate picture of what you truly know.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    padding: 20,
  },
  overallCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  ringContent: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringPercent: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  ringLabel: {
    color: '#666',
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 40,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
  },
  statLabel: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  cardStatsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  cardStatItem: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  cardStatValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  cardStatLabel: {
    color: '#666',
    fontSize: 11,
    marginTop: 4,
  },
  categoryItem: {
    marginBottom: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  categoryName: {
    color: '#fff',
    fontSize: 15,
  },
  categoryStats: {
    color: '#666',
    fontSize: 14,
  },
  barContainer: {
    height: 8,
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 4,
  },
  emptyInfo: {
    alignItems: 'center',
    padding: 24,
    marginBottom: 24,
  },
  emptyInfoIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyInfoTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyInfoText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#6366f1',
  },
  infoTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoText: {
    color: '#999',
    fontSize: 14,
    lineHeight: 22,
  },
});
