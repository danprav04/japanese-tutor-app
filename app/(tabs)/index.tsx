import { useState, useCallback, useEffect, useRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  FlatList,
  Alert,
} from 'react-native';
import { GiftedChat, IMessage, Bubble, InputToolbar, Composer, Send } from 'react-native-gifted-chat';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '../../src/store/app-store';
import { sendMessage, loadConversationHistory, createNewThread, initTutor } from '../../src/services/tutor-agent';
import { listThreads, deleteThread, type ThreadSummary } from '../../src/db/checkpointer';

const SENSEI_USER = {
  _id: 2,
  name: 'Sensei',
  avatar: '🎓',
};

const WELCOME_MSG: IMessage = {
  _id: 'welcome',
  text: 'こんにちは！I\'m your Japanese tutor. Let\'s start learning! 🎌\n\nYou can:\n• Ask me to teach you new vocabulary\n• Practice grammar with exercises\n• Have conversations in Japanese\n• Upload learning materials in Settings\n\n⚠️ Add a Gemini API key in Settings to enable AI responses.',
  createdAt: new Date(),
  user: SENSEI_USER,
};

export default function ChatScreen() {
  const { apiKeys, currentModel, isGeminiReady, currentThreadId, setCurrentThreadId } = useAppStore();
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const initialized = useRef(false);

  // Initialize on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    setMessages([WELCOME_MSG]);

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
        setMessages([WELCOME_MSG, ...historicalMessages.reverse()]);
      }
    } catch {
      // DB not initialized yet — that's fine on first load
    }
  };

  const handleNewChat = useCallback(() => {
    const newId = createNewThread();
    setCurrentThreadId(newId);
    setMessages([
      {
        _id: `welcome-${Date.now()}`,
        text: '✨ New conversation started! What would you like to learn today?',
        createdAt: new Date(),
        user: SENSEI_USER,
      },
    ]);
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
      setMessages([WELCOME_MSG]);
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

      const { text: response, cardsCreated, progressUpdates } = await sendMessage(threadId, userMessage.text);

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
          <Text style={styles.headerBtnText}>📋</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerBtn} onPress={handleNewChat}>
          <Text style={styles.headerBtnText}>✏️ New</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 113}
      >
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
          bottomOffset={Platform.OS === 'ios' ? 0 : 0}
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
                        {item.lastMessagePreview}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
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
    alignItems: 'center',
  },
  composer: {
    backgroundColor: '#2a2a2a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    marginLeft: 10,
    color: '#fff',
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
});
