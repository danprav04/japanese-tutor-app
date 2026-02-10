import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import Svg, { Circle, Rect, Line, Text as SvgText } from 'react-native-svg';

import { getOverallMastery, getStudyStreak } from '../../src/services/progress-service';
import { getCardStats } from '../../src/services/card-service';
import {
  getStudySessionSummary,
  getWeeklyStreak,
  getTypeBreakdown,
  getRecentMasteryChanges,
  type StudySessionSummary,
  type WeekDay,
  type TypeBreakdown,
  type MasteryChange,
} from '../../src/services/study-stats-service';

// ─── Sub-components ──────────────────────────────────────────

function ProgressRing({ progress, size = 110, label }: { progress: number; size?: number; label?: string }) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const strokeDashoffset = circumference * (1 - clamped);

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        {/* Background circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#1e1e2e"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={clamped >= 0.95 ? '#22c55e' : clamped >= 0.5 ? '#6366f1' : '#f59e0b'}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
        <SvgText
          x={size / 2}
          y={size / 2 - 4}
          textAnchor="middle"
          alignmentBaseline="central"
          fill="#fff"
          fontSize={24}
          fontWeight="bold"
        >
          {Math.round(clamped * 100)}%
        </SvgText>
        {label && (
          <SvgText
            x={size / 2}
            y={size / 2 + 18}
            textAnchor="middle"
            alignmentBaseline="central"
            fill="#888"
            fontSize={11}
          >
            {label}
          </SvgText>
        )}
      </Svg>
    </View>
  );
}

function StreakCalendar({ days }: { days: WeekDay[] }) {
  return (
    <View style={styles.streakRow}>
      {days.map((day, i) => (
        <View key={i} style={styles.streakDay}>
          <View
            style={[
              styles.streakDot,
              day.active ? styles.streakDotActive : styles.streakDotInactive,
            ]}
          >
            {day.active && (
              <Text style={styles.streakDotCount}>
                {day.reviewCount > 99 ? '99+' : day.reviewCount}
              </Text>
            )}
          </View>
          <Text style={[styles.streakDayLabel, day.active && styles.streakDayLabelActive]}>
            {day.dayLabel}
          </Text>
        </View>
      ))}
    </View>
  );
}

function TypeProgressBar({ data }: { data: TypeBreakdown }) {
  const masteredPct = data.total > 0 ? data.mastered / data.total : 0;
  const learningPct = data.total > 0 ? data.learning / data.total : 0;
  const iconMap: Record<string, string> = { grammar: '📐', vocab: '📝', kanji: '漢' };

  return (
    <View style={styles.typeRow}>
      <View style={styles.typeHeader}>
        <Text style={styles.typeIcon}>{iconMap[data.type] || '📖'}</Text>
        <Text style={styles.typeLabel}>{data.type.charAt(0).toUpperCase() + data.type.slice(1)}</Text>
        <Text style={styles.typeCount}>
          {data.mastered}/{data.total}
        </Text>
      </View>
      <View style={styles.barBg}>
        <View
          style={[
            styles.barFillMastered,
            { width: `${Math.round(masteredPct * 100)}%` },
          ]}
        />
        <View
          style={[
            styles.barFillLearning,
            {
              width: `${Math.round(learningPct * 100)}%`,
              left: `${Math.round(masteredPct * 100)}%`,
            },
          ]}
        />
      </View>
      <Text style={styles.typeAvg}>
        {Math.round(data.avgMastery * 100)}% avg mastery
      </Text>
    </View>
  );
}

function StatCard({ value, label, emoji }: { value: string | number; label: string; emoji: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RecentItem({ item }: { item: MasteryChange }) {
  const pct = Math.round(item.masteryScore * 100);
  const color = pct >= 95 ? '#22c55e' : pct >= 50 ? '#6366f1' : pct >= 25 ? '#f59e0b' : '#ef4444';

  return (
    <View style={styles.recentRow}>
      <View style={styles.recentInfo}>
        <Text style={styles.recentTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.recentMeta}>{item.type} · {item.attempts} attempts</Text>
      </View>
      <View style={[styles.recentBadge, { backgroundColor: color + '20', borderColor: color }]}>
        <Text style={[styles.recentPct, { color }]}>{pct}%</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────

export default function ProgressScreen() {
  const [loading, setLoading] = useState(true);
  const [overallMastery, setOverallMastery] = useState({ mastery: 0, total: 0, mastered: 0 });
  const [streak, setStreak] = useState({ streak: 0, lastStudyDate: null as string | null });
  const [cardStats, setCardStats] = useState({ total: 0, newCards: 0, learning: 0, reviewing: 0, dueNow: 0 });
  const [sessionSummary, setSessionSummary] = useState<StudySessionSummary | null>(null);
  const [weekDays, setWeekDays] = useState<WeekDay[]>([]);
  const [typeBreakdowns, setTypeBreakdowns] = useState<TypeBreakdown[]>([]);
  const [recentChanges, setRecentChanges] = useState<MasteryChange[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const [mastery, streakData, cards, session, week, types, recent] = await Promise.all([
        getOverallMastery(),
        getStudyStreak(),
        getCardStats(),
        getStudySessionSummary(),
        getWeeklyStreak(),
        getTypeBreakdown(),
        getRecentMasteryChanges(5),
      ]);
      setOverallMastery(mastery);
      setStreak(streakData);
      setCardStats(cards);
      setSessionSummary(session);
      setWeekDays(week);
      setTypeBreakdowns(types);
      setRecentChanges(recent);
    } catch (e) {
      console.error('Failed to load progress data:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['bottom']}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading progress...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Overall Mastery ── */}
        <View style={styles.masterySection}>
          <ProgressRing progress={overallMastery.mastery} label="Overall" />
          <View style={styles.masteryStats}>
            <Text style={styles.masteryTitle}>
              {overallMastery.mastered} / {overallMastery.total}
            </Text>
            <Text style={styles.masterySubtitle}>items mastered</Text>
          </View>
        </View>

        {/* ── Weekly Streak ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>🔥 Study Streak</Text>
            <Text style={styles.streakBadge}>
              {streak.streak} day{streak.streak !== 1 ? 's' : ''}
            </Text>
          </View>
          <StreakCalendar days={weekDays} />
        </View>

        {/* ── Today's Summary ── */}
        {sessionSummary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📅 Today</Text>
            <View style={styles.statsGrid}>
              <StatCard
                emoji="📝"
                value={sessionSummary.todayReviews}
                label="Reviews"
              />
              <StatCard
                emoji="✅"
                value={sessionSummary.todayReviews > 0 ? `${Math.round(sessionSummary.todayAccuracy * 100)}%` : '—'}
                label="Accuracy"
              />
              <StatCard
                emoji="🧠"
                value={sessionSummary.todayMasteryGains}
                label="Learned"
              />
              <StatCard
                emoji="📊"
                value={sessionSummary.cardsReviewedThisWeek}
                label="This Week"
              />
            </View>
          </View>
        )}

        {/* ── Flashcard Stats ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📚 Flashcards</Text>
          <View style={styles.cardStatsRow}>
            <View style={styles.cardStatItem}>
              <Text style={[styles.cardStatNum, { color: '#6366f1' }]}>{cardStats.dueNow}</Text>
              <Text style={styles.cardStatLabel}>Due Now</Text>
            </View>
            <View style={styles.cardStatDivider} />
            <View style={styles.cardStatItem}>
              <Text style={[styles.cardStatNum, { color: '#f59e0b' }]}>{cardStats.newCards}</Text>
              <Text style={styles.cardStatLabel}>New</Text>
            </View>
            <View style={styles.cardStatDivider} />
            <View style={styles.cardStatItem}>
              <Text style={[styles.cardStatNum, { color: '#3b82f6' }]}>{cardStats.learning}</Text>
              <Text style={styles.cardStatLabel}>Learning</Text>
            </View>
            <View style={styles.cardStatDivider} />
            <View style={styles.cardStatItem}>
              <Text style={[styles.cardStatNum, { color: '#22c55e' }]}>{cardStats.reviewing}</Text>
              <Text style={styles.cardStatLabel}>Review</Text>
            </View>
          </View>
        </View>

        {/* ── Type Breakdown ── */}
        {typeBreakdowns.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📊 By Category</Text>
            {typeBreakdowns.map((tb) => (
              <TypeProgressBar key={tb.type} data={tb} />
            ))}
          </View>
        )}

        {/* ── Recent Activity ── */}
        {recentChanges.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⏱ Recent Activity</Text>
            {recentChanges.map((item) => (
              <RecentItem key={item.nodeId} item={item} />
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────

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
    color: '#666',
    marginTop: 12,
  },
  content: {
    padding: 20,
  },
  // ── Overall mastery
  masterySection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 28,
    backgroundColor: '#111118',
    borderRadius: 20,
    padding: 24,
  },
  masteryStats: {
    alignItems: 'flex-start',
  },
  masteryTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
  },
  masterySubtitle: {
    color: '#888',
    fontSize: 14,
    marginTop: 2,
  },
  // ── Sections
  section: {
    marginBottom: 24,
    backgroundColor: '#111118',
    borderRadius: 16,
    padding: 18,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 14,
  },
  // ── Streak
  streakBadge: {
    color: '#f59e0b',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 14,
  },
  streakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  streakDay: {
    alignItems: 'center',
    gap: 6,
  },
  streakDot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  streakDotActive: {
    backgroundColor: '#22c55e20',
    borderWidth: 2,
    borderColor: '#22c55e',
  },
  streakDotInactive: {
    backgroundColor: '#1e1e2e',
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  streakDotCount: {
    color: '#22c55e',
    fontSize: 11,
    fontWeight: '700',
  },
  streakDayLabel: {
    color: '#555',
    fontSize: 11,
    fontWeight: '600',
  },
  streakDayLabelActive: {
    color: '#22c55e',
  },
  // ── Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: '40%',
    backgroundColor: '#0a0a14',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  statEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  statValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    color: '#888',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  // ── Card stats row
  cardStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  cardStatNum: {
    fontSize: 22,
    fontWeight: '800',
  },
  cardStatLabel: {
    color: '#888',
    fontSize: 11,
    marginTop: 3,
    fontWeight: '600',
  },
  cardStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#2a2a3a',
  },
  // ── Type breakdown
  typeRow: {
    marginBottom: 14,
  },
  typeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  typeIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  typeLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  typeCount: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  barBg: {
    height: 8,
    backgroundColor: '#1e1e2e',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  barFillMastered: {
    position: 'absolute',
    height: '100%',
    backgroundColor: '#22c55e',
    borderRadius: 4,
  },
  barFillLearning: {
    position: 'absolute',
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 4,
  },
  typeAvg: {
    color: '#666',
    fontSize: 11,
    marginTop: 4,
  },
  // ── Recent activity
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2a',
  },
  recentInfo: {
    flex: 1,
    marginRight: 10,
  },
  recentTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  recentMeta: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  recentBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  recentPct: {
    fontSize: 14,
    fontWeight: '700',
  },
});
