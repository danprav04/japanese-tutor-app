import { View, Text, StyleSheet, SectionList, TextInput, TouchableOpacity, Dimensions, Alert } from 'react-native';
import { useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useAppStore } from '../../src/store/app-store';
import { getNodesWithProgress, deleteNode, type NodeWithProgress } from '../../src/services/curriculum-service';

interface Section {
  title: string;
  data: NodeWithProgress[];
}

function getMasteryColor(score: number): string {
  if (score >= 0.95) return '#22c55e';
  if (score >= 0.6) return '#eab308';
  if (score >= 0.3) return '#f97316';
  return '#666';
}

function getMasteryLabel(score: number): string {
  if (score >= 0.95) return '✅ Mastered';
  if (score >= 0.6) return '📗 Almost';
  if (score >= 0.3) return '📙 Learning';
  if (score > 0) return '📕 Started';
  return '⬜ Not started';
}

function CurriculumItem({ item, onDelete }: { item: NodeWithProgress; onDelete: (nodeId: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const content = item.contentPayload as Record<string, string> | null;

  return (
    <TouchableOpacity
      style={styles.item}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.7}
    >
      <View style={styles.itemHeader}>
        <View style={styles.itemTitleRow}>
          <Text style={styles.itemTitle}>{item.title}</Text>
          <Text style={[styles.masteryLabel, { color: getMasteryColor(item.masteryScore) }]}>
            {getMasteryLabel(item.masteryScore)}
          </Text>
        </View>
        {content?.meaning && (
          <Text style={styles.itemMeaning} numberOfLines={expanded ? undefined : 1}>
            {content.meaning}
          </Text>
        )}
        {/* Mastery bar */}
        <View style={styles.masteryBarContainer}>
          <View
            style={[
              styles.masteryBarFill,
              {
                width: `${Math.max(item.masteryScore * 100, 2)}%`,
                backgroundColor: getMasteryColor(item.masteryScore),
              },
            ]}
          />
        </View>
      </View>

      {expanded && content && (
        <View style={styles.itemDetails}>
          {content.reading && (
            <Text style={styles.detailText}>
              <Text style={styles.detailLabel}>Reading: </Text>
              {content.reading}
            </Text>
          )}
          {content.onyomi && (
            <Text style={styles.detailText}>
              <Text style={styles.detailLabel}>音読み: </Text>
              {content.onyomi}
            </Text>
          )}
          {content.kunyomi && (
            <Text style={styles.detailText}>
              <Text style={styles.detailLabel}>訓読み: </Text>
              {content.kunyomi}
            </Text>
          )}
          {content.strokeCount && (
            <Text style={styles.detailText}>
              <Text style={styles.detailLabel}>Strokes: </Text>
              {content.strokeCount}
            </Text>
          )}
          {content.example && (
            <View style={styles.exampleBox}>
              <Text style={styles.exampleText}>{content.example}</Text>
              {content.exampleTranslation && (
                <Text style={styles.exampleTranslation}>{content.exampleTranslation}</Text>
              )}
            </View>
          )}
          <Text style={styles.detailMeta}>
            {item.attempts} attempts · N{item.jlptLevel}
          </Text>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => onDelete(item.nodeId)}
          >
            <Text style={styles.deleteButtonText}>🗑️ Remove</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function CurriculumScreen() {
  const { isDatabaseReady } = useAppStore();
  const [sections, setSections] = useState<Section[]>([]);
  const [search, setSearch] = useState('');
  const [totalCount, setTotalCount] = useState(0);

  const loadData = useCallback(async () => {
    if (!isDatabaseReady) return;
    try {
      const nodes = await getNodesWithProgress(search || undefined);
      setTotalCount(nodes.length);

      // Group by type
      const grouped: Record<string, NodeWithProgress[]> = {};
      const typeLabels: Record<string, string> = {
        vocab: '📝 Vocabulary',
        grammar: '📐 Grammar',
        kanji: '🈶 Kanji',
      };

      for (const node of nodes) {
        const key = typeLabels[node.type] || node.type;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(node);
      }

      const orderedKeys = ['📝 Vocabulary', '📐 Grammar', '🈶 Kanji'];
      const newSections = orderedKeys
        .filter((key) => grouped[key]?.length > 0)
        .map((key) => ({
          title: `${key} (${grouped[key].length})`,
          data: grouped[key],
        }));

      setSections(newSections);
    } catch (err) {
      console.error('Failed to load curriculum:', err);
    }
  }, [isDatabaseReady, search]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const handleDeleteNode = useCallback((nodeId: string) => {
    Alert.alert(
      'Remove Item',
      'This will permanently delete this curriculum item, its flashcards, and progress. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNode(nodeId);
              loadData();
            } catch (err) {
              console.error('Failed to delete node:', err);
            }
          },
        },
      ]
    );
  }, [loadData]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search curriculum..."
          placeholderTextColor="#666"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={loadData}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity style={styles.clearBtn} onPress={() => setSearch('')}>
            <Text style={styles.clearText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.nodeId}
        renderItem={({ item }) => <CurriculumItem item={item} onDelete={handleDeleteNode} />}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        stickySectionHeadersEnabled
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📖</Text>
            <Text style={styles.emptyTitle}>
              {search ? 'No results found' : 'No curriculum items'}
            </Text>
            <Text style={styles.emptyText}>
              {search
                ? `No items match "${search}"`
                : 'Start learning in the Chat tab to build your curriculum!'}
            </Text>
          </View>
        }
        ListFooterComponent={
          totalCount > 0 ? (
            <Text style={styles.footerText}>{totalCount} items total</Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
  },
  clearBtn: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  clearText: {
    color: '#666',
    fontSize: 16,
  },
  listContent: {
    paddingBottom: 40,
  },
  sectionHeader: {
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  item: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  itemHeader: {},
  itemTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  masteryLabel: {
    fontSize: 12,
    marginLeft: 8,
  },
  itemMeaning: {
    color: '#999',
    fontSize: 14,
    marginBottom: 8,
  },
  masteryBarContainer: {
    height: 4,
    backgroundColor: '#2a2a2a',
    borderRadius: 2,
    overflow: 'hidden',
  },
  masteryBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  itemDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  detailText: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 4,
  },
  detailLabel: {
    color: '#6366f1',
    fontWeight: '600',
  },
  exampleBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  exampleText: {
    color: '#fff',
    fontSize: 16,
  },
  exampleTranslation: {
    color: '#999',
    fontSize: 13,
    marginTop: 4,
  },
  detailMeta: {
    color: '#555',
    fontSize: 12,
  },
  separator: {
    height: 1,
    backgroundColor: '#111',
    marginHorizontal: 16,
  },
  emptyState: {
    alignItems: 'center',
    padding: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
  },
  footerText: {
    color: '#555',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 16,
  },
  deleteButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#3f1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '500',
  },
});
