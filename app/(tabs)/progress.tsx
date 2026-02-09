import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

// Sample progress data - will be replaced with BKT data from database
const progressData = {
  overall: 0.35,
  categories: [
    { name: 'Hiragana', mastery: 0.95, total: 46, learned: 44 },
    { name: 'Katakana', mastery: 0.72, total: 46, learned: 33 },
    { name: 'N5 Vocabulary', mastery: 0.28, total: 800, learned: 224 },
    { name: 'N5 Grammar', mastery: 0.15, total: 130, learned: 20 },
    { name: 'N5 Kanji', mastery: 0.12, total: 103, learned: 12 },
  ],
  streak: 7,
  totalReviews: 342,
};

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
          strokeDasharray={circumference}
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

function CategoryBar({ name, mastery, total, learned }: {
  name: string;
  mastery: number;
  total: number;
  learned: number;
}) {
  return (
    <View style={styles.categoryItem}>
      <View style={styles.categoryHeader}>
        <Text style={styles.categoryName}>{name}</Text>
        <Text style={styles.categoryStats}>{learned}/{total}</Text>
      </View>
      <View style={styles.barContainer}>
        <View style={[styles.barFill, { width: `${mastery * 100}%` }]} />
      </View>
    </View>
  );
}

export default function ProgressScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Overall Progress */}
        <View style={styles.overallCard}>
          <ProgressRing progress={progressData.overall} />
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{progressData.streak}</Text>
              <Text style={styles.statLabel}>🔥 Day Streak</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{progressData.totalReviews}</Text>
              <Text style={styles.statLabel}>📝 Reviews</Text>
            </View>
          </View>
        </View>

        {/* Category Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Curriculum Progress</Text>
          {progressData.categories.map((cat) => (
            <CategoryBar key={cat.name} {...cat} />
          ))}
        </View>

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
