import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Platform,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GiftedChat, IMessage, Bubble, InputToolbar, Composer, Send } from 'react-native-gifted-chat';
import Markdown from 'react-native-markdown-display';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useHeaderHeight } from '@react-navigation/elements';
import { useAppStore } from '../../src/store/app-store';
import { sendMessage, loadConversationHistory, createNewThread, initTutor, getThreadDocumentState, clearThreadDocumentState, type ParsedExercise } from '../../src/services/tutor-agent';
import { listThreads, deleteThread, type ThreadSummary } from '../../src/db/checkpointer';
import { type DocumentLearningState } from '../../src/services/document-learning-service';
import ExerciseCard from '../../src/components/ExerciseCard';

const SENSEI_USER = {
  _id: 2,
  name: 'Sensei',
  avatar: '🎓',
};

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function ChatScreen() {
  const { apiKeys, currentModel, isGeminiReady, currentThreadId, setCurrentThreadId } = useAppStore();
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [docLearningMode, setDocLearningMode] = useState<DocumentLearningState | null>(null);
  const initialized = useRef(false);
  const tabBarHeight = useBottomTabBarHeight();
  const headerHeight = useHeaderHeight();

  // Initialize on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (currentThreadId && currentThreadId !== 'default') {
      loadThread(currentThreadId);
    }
  }, []);

  // Re-initialize Gemini client when keys/model change
  useEffect(() => {
    if (apiKeys.length > 0) {
      initTutor(apiKeys, currentModel);
    }
  }, [apiKeys, currentModel]);

  const loadThread = async (threadId: string) => {
    try {
      const history = await loadConversationHistory(threadId);
      if (history && history.length > 0) {
        const historicalMessages: IMessage[] = history.map((msg, i) => ({
          _id: `history-${i}`,
          text: msg.content,
          createdAt: new Date(msg.timestamp),
          user: msg.role === 'user' ? { _id: 1 } : SENSEI_USER,
        }));
        setMessages(historicalMessages.reverse());
      } else {
        setMessages([]);
      }
    } catch {
      // DB not initialized yet — that's fine on first load
      setMessages([]);
    }
  };

  const handleNewChat = useCallback(() => {
    const newId = createNewThread();
    setCurrentThreadId(newId);
    setMessages([]);
    setDocLearningMode(null);
  }, [setCurrentThreadId]);

  const handleOpenHistory = useCallback(async () => {
    try {
      const allThreads = await listThreads();
      setThreads(allThreads);
    } catch {
      setThreads([]);
    }
    setShowHistory(true);
  }, []);

  const handleSelectThread = useCallback(
    async (threadId: string) => {
      setShowHistory(false);
      setCurrentThreadId(threadId);
      setMessages([]);
      // Check if the selected thread has active document learning
      const docState = getThreadDocumentState(threadId);
      setDocLearningMode(docState);
      await loadThread(threadId);
    },
    [setCurrentThreadId],
  );

  const handleDeleteThread = useCallback(
    (threadId: string) => {
      Alert.alert('Delete Conversation', 'Are you sure? This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteThread(threadId);
            setThreads((prev) => prev.filter((t) => t.threadId !== threadId));
            // If we deleted the active thread, start a new one
            if (threadId === currentThreadId) {
              handleNewChat();
            }
          },
        },
      ]);
    },
    [currentThreadId, handleNewChat],
  );

  const onSend = useCallback(async (newMessages: IMessage[] = []) => {
    const userMessage = newMessages[0];
    if (!userMessage?.text) return;

    // Add user message immediately
    setMessages((prev) => GiftedChat.append(prev, newMessages));

    if (!isGeminiReady) {
      setTimeout(() => {
        const noKeyMsg: IMessage = {
          _id: `no-key-${Date.now()}`,
          text: '🔑 Please add a Gemini API key in the Settings tab to enable AI responses. You can get a free key from Google AI Studio!',
          createdAt: new Date(),
          user: SENSEI_USER,
        };
        setMessages((prev) => GiftedChat.append(prev, [noKeyMsg]));
      }, 300);
      return;
    }

    setIsTyping(true);

    try {
      let threadId = currentThreadId;
      if (!threadId || threadId === 'default') {
        threadId = createNewThread();
        setCurrentThreadId(threadId);
      }

      const { text: response, cardsCreated, progressUpdates, exercises } = await sendMessage(threadId, userMessage.text);

      // Check if document learning mode was activated
      const docState = getThreadDocumentState(threadId);
      if (docState && !docLearningMode) {
        setDocLearningMode(docState);
      }

      const aiMessage: IMessage = {
        _id: `ai-${Date.now()}`,
        text: response,
        createdAt: new Date(),
        user: SENSEI_USER,
      };
      setMessages((prev) => GiftedChat.append(prev, [aiMessage]));

      if (cardsCreated > 0) {
        const cardNotif: IMessage = {
          _id: `card-notif-${Date.now()}`,
          text: `📝 ${cardsCreated} flashcard${cardsCreated > 1 ? 's' : ''} created! Check the Review tab.`,
          createdAt: new Date(),
          user: SENSEI_USER,
          system: true,
        };
        setTimeout(() => {
          setMessages((prev) => GiftedChat.append(prev, [cardNotif]));
        }, 500);
      }

      if (progressUpdates > 0) {
        const progressNotif: IMessage = {
          _id: `prog-notif-${Date.now()}`,
          text: `📊 Progress updated for ${progressUpdates} item${progressUpdates > 1 ? 's' : ''}!`,
          createdAt: new Date(),
          user: SENSEI_USER,
          system: true,
        };
        setTimeout(() => {
          setMessages((prev) => GiftedChat.append(prev, [progressNotif]));
        }, cardsCreated > 0 ? 1000 : 500);
      }

      // Display exercise cards inline as interactive components
      if (exercises.length > 0) {
        const exerciseMsg: IMessage = {
          _id: `exercise-${Date.now()}`,
          text: '__EXERCISES__',
          createdAt: new Date(),
          user: SENSEI_USER,
          // @ts-ignore — custom field to pass exercise data
          exercises: exercises,
        };
        setTimeout(() => {
          setMessages((prev) => GiftedChat.append(prev, [exerciseMsg]));
        }, cardsCreated > 0 || progressUpdates > 0 ? 1500 : 500);
      }
    } catch (error) {
      const errorMsg: IMessage = {
        _id: `error-${Date.now()}`,
        text: `⚠️ Error: ${error instanceof Error ? error.message : 'Failed to generate response'}.\n\nPlease check your API key in Settings and try again.`,
        createdAt: new Date(),
        user: SENSEI_USER,
      };
      setMessages((prev) => GiftedChat.append(prev, [errorMsg]));
    } finally {
      setIsTyping(false);
    }
  }, [isGeminiReady, currentThreadId, setCurrentThreadId]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return 'Today';
    if (diff < 172800000) return 'Yesterday';
    return d.toLocaleDateString();
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Header buttons */}
      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.headerBtn} onPress={handleOpenHistory}>
          <Text style={styles.headerBtnText}>📋 History</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerBtn} onPress={handleNewChat}>
          <Text style={styles.headerBtnText}>✏️ New</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        enabled
        keyboardVerticalOffset={Platform.OS === 'ios' ? tabBarHeight : headerHeight}
      >
        {/* Document learning mode banner */}
        {docLearningMode && (
          <View style={styles.docBanner}>
            <Text style={styles.docBannerText}>📖 Learning: {docLearningMode.documentName}</Text>
            <TouchableOpacity
              onPress={() => {
                if (currentThreadId && currentThreadId !== 'default') {
                  clearThreadDocumentState(currentThreadId);
                }
                setDocLearningMode(null);
              }}
              style={styles.docBannerClose}
            >
              <Text style={styles.docBannerCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {messages.length === 0 && (
          <View style={styles.startContainer}>
            <Text style={styles.startText}>How can I help you learn Japanese today?</Text>
            <Text style={styles.startSubText}>Try "let's start learning [document name]" to study an uploaded document step by step!</Text>
          </View>
        )}
        <GiftedChat
          messages={messages}
          onSend={(msgs) => onSend(msgs)}
          user={{ _id: 1 }}
          isTyping={isTyping}
          textInputProps={{
            placeholder: "Type a message... (日本語 OK!)",
          }}
          // @ts-ignore
          alwaysShowSend
          renderBubble={(props) => (
            <Bubble
              {...props}
              wrapperStyle={{
                right: { backgroundColor: '#6366f1' },
                left: { backgroundColor: '#1a1a1a' },
              }}
              textStyle={{
                right: { color: '#fff' },
                left: { color: '#fff' },
              }}
            />
          )}
          renderMessageText={(props) => {
            const { currentMessage } = props;
            if (!currentMessage?.text) return null;

            // Render interactive exercises instead of markdown
            if (currentMessage.text === '__EXERCISES__' && (currentMessage as any).exercises) {
              const exercises = (currentMessage as any).exercises as ParsedExercise[];
              return (
                <View style={{ paddingHorizontal: 6, paddingVertical: 5 }}>
                  {exercises.map((ex, i) => (
                    <ExerciseCard
                      key={`ex-${i}`}
                      exercise={ex}
                      onAnswer={(answer) => {
                        // Send the answer as a user message
                        const answerMsg: IMessage[] = [{
                          _id: `answer-${Date.now()}-${i}`,
                          text: answer,
                          createdAt: new Date(),
                          user: { _id: 1 },
                        }];
                        onSend(answerMsg);
                      }}
                    />
                  ))}
                </View>
              );
            }

            return (
              <View style={{ paddingHorizontal: 10, paddingVertical: 5 }}>
                <Markdown
                  style={markdownStyles}
                  rules={{
                    // Disable default paragraph margin to fit better in bubble
                    paragraph: (node: any, children: any, parent: any, styles: any) => (
                      <Text key={node.key} style={styles.paragraph}>
                        {children}
                      </Text>
                    ),
                  }}
                >
                  {currentMessage.text}
                </Markdown>
              </View>
            );
          }}
          renderInputToolbar={(props) => (
            <InputToolbar
              {...props}
              containerStyle={styles.inputToolbar}
              primaryStyle={styles.inputPrimary}
            />
          )}
          renderComposer={(props) => (
            <Composer
              {...props}
              textInputProps={{
                ...props.textInputProps,
                style: styles.composer,
                placeholderTextColor: "#666",
              }}
            />
          )}
          renderSend={(props) => (
            <Send {...props} containerStyle={styles.sendContainer}>
              <View style={styles.sendButton}>
                {isTyping ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <View style={styles.sendIcon} />
                )}
              </View>
            </Send>
          )}
          renderFooter={() => (
            !isGeminiReady ? (
              <View style={styles.footer}>
                <Text style={styles.footerText}>🔑 Add API key in Settings to enable AI</Text>
              </View>
            ) : null
          )}
          bottomOffset={tabBarHeight}
          keyboardShouldPersistTaps="never"
        />
      </KeyboardAvoidingView>

      {/* Thread History Modal */}
      <Modal
        visible={showHistory}
        animationType="slide"
        transparent
        onRequestClose={() => setShowHistory(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Conversation History</Text>
              <TouchableOpacity onPress={() => setShowHistory(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {threads.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No conversations yet</Text>
              </View>
            ) : (
              <FlatList
                data={threads}
                keyExtractor={(item) => item.threadId}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.threadItem,
                      item.threadId === currentThreadId && styles.threadItemActive,
                    ]}
                    onPress={() => handleSelectThread(item.threadId)}
                    onLongPress={() => handleDeleteThread(item.threadId)}
                  >
                    <View style={styles.threadInfo}>
                      <Text style={styles.threadPreview} numberOfLines={1}>
                        {item.title || item.lastMessagePreview}
                      </Text>
                      <Text style={styles.threadMeta}>
                        {item.messageCount} messages · {formatDate(item.createdAt)}
                      </Text>
                    </View>
                    {item.threadId === currentThreadId && (
                      <Text style={styles.activeBadge}>●</Text>
                    )}
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
              />
            )}

            <Text style={styles.hintText}>Long press to delete a conversation</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const markdownStyles = StyleSheet.create({
  body: {
    color: '#fff',
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    // Constrain width to prevent horizontal scroll/cut-off in bubble
    maxWidth: SCREEN_WIDTH * 0.7, 
  },
  heading1: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginVertical: 10,
  },
  heading2: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginVertical: 8,
  },
  heading3: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginVertical: 6,
  },
  paragraph: {
    marginVertical: 4,
    flexWrap: 'wrap',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    width: '100%',
  },
  link: {
    color: '#a5b4fc',
    textDecorationLine: 'underline',
  },
  list_item: {
    marginVertical: 4,
  },
  bullet_list: {
    marginVertical: 4,
  },
  ordered_list: {
    marginVertical: 4,
  },
  code_inline: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 4,
    paddingHorizontal: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  fence: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 10,
    marginVertical: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  blockquote: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderLeftWidth: 4,
    borderLeftColor: '#a5b4fc',
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginVertical: 5,
  },
  table: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 4,
    marginVertical: 5,
  },
  tr: {
    borderBottomWidth: 1,
    borderColor: '#333',
    flexDirection: 'row',
  },
  th: {
    flex: 1,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    fontWeight: 'bold',
  },
  td: {
    flex: 1,
    padding: 8,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  chatContainer: {
    flex: 1,
  },
  startContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: -1,
    paddingHorizontal: 40,
  },
  startText: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  startSubText: {
    color: 'rgba(255, 255, 255, 0.2)',
    fontSize: 16,
    textAlign: 'center',
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
  },
  headerBtnText: {
    color: '#fff',
    fontSize: 14,
  },
  inputToolbar: {
    backgroundColor: '#1a1a1a',
    borderTopColor: '#2a2a2a',
    paddingVertical: 4,
  },
  inputPrimary: {
    alignItems: 'flex-end',
    paddingVertical: 5,
  },
  composer: {
    backgroundColor: '#2a2a2a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    marginLeft: 10,
    marginRight: 10,
    color: '#fff',
    fontSize: 16,
    lineHeight: 20,
  },
  sendContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginBottom: 5,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendIcon: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftColor: '#fff',
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    marginLeft: 4,
  },
  footer: {
    padding: 8,
    alignItems: 'center',
  },
  footerText: {
    color: '#666',
    fontSize: 12,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#111',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  modalClose: {
    color: '#666',
    fontSize: 22,
    padding: 4,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
    fontSize: 15,
  },
  threadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  threadItemActive: {
    backgroundColor: '#1a1a2e',
  },
  threadInfo: {
    flex: 1,
  },
  threadPreview: {
    color: '#fff',
    fontSize: 15,
  },
  threadMeta: {
    color: '#666',
    fontSize: 12,
    marginTop: 3,
  },
  activeBadge: {
    color: '#6366f1',
    fontSize: 12,
    marginLeft: 8,
  },
  separator: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginHorizontal: 20,
  },
  hintText: {
    color: '#555',
    fontSize: 11,
    textAlign: 'center',
    paddingTop: 12,
  },
  docBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a2e',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4a',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  docBannerText: {
    color: '#a5b4fc',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  docBannerClose: {
    padding: 4,
    marginLeft: 8,
  },
  docBannerCloseText: {
    color: '#666',
    fontSize: 16,
  },
});
