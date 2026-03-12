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
import { GiftedChat, IMessage, Bubble, InputToolbar, Composer, Send, SystemMessage } from 'react-native-gifted-chat';
import Markdown from 'react-native-markdown-display';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useHeaderHeight } from '@react-navigation/elements';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../src/store/app-store';
import { sendMessage, loadConversationHistory, createNewThread, initTutor } from '../../src/services/tutor-agent';
import type { CurriculumStatus } from '../../src/services/curriculum-context';
import { listThreads, deleteThread, type ThreadSummary } from '../../src/db/checkpointer';

const SENSEI_USER = {
  _id: 2,
  name: 'Sensei',
  avatar: '🎓',
};

const SCREEN_WIDTH = Dimensions.get('window').width;

const ThinkBlock = ({ text }: { text: string }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.thinkContainer}>
      <TouchableOpacity 
        style={styles.thinkHeader} 
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <Text style={styles.thinkIcon}>{expanded ? '▼' : '▶'}</Text>
        <Text style={styles.thinkTitle}>Thought Process</Text>
      </TouchableOpacity>
      {expanded && (
        <View style={styles.thinkContent}>
          <Text style={styles.thinkText} selectable={true}>{text}</Text>
        </View>
      )}
    </View>
  );
};

export default function ChatScreen() {
  const { apiKeys, currentModel, isGeminiReady, currentThreadId, setCurrentThreadId } = useAppStore();
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [curriculumStatus, setCurriculumStatus] = useState<CurriculumStatus | null>(null);
  const router = useRouter();

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
    initTutor(apiKeys, currentModel);
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
          text: '🔑 Add an API key in Settings to start.',
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

      const { text: response, progressUpdates, progressItemNames, curriculumStatus: status } = await sendMessage(threadId, userMessage.text);
      setCurriculumStatus(status);
      console.log('📱 ChatScreen received response:', { length: response.length, curriculumStatus: status });

      const aiMessage: IMessage = {
        _id: `ai-${Date.now()}`,
        text: response,
        createdAt: new Date(),
        user: SENSEI_USER,
      };
      setMessages((prev) => GiftedChat.append(prev, [aiMessage]));

      if (progressUpdates > 0) {
        const itemList = progressItemNames.length > 0
          ? progressItemNames.join(', ')
          : `${progressUpdates} item${progressUpdates > 1 ? 's' : ''}`;
        const progressNotif: IMessage = {
          _id: `prog-notif-${Date.now()}`,
          text: `📊 Progress: ${itemList}`,
          createdAt: new Date(),
          user: SENSEI_USER,
          system: true,
        };
        setTimeout(() => {
          setMessages((prev) => GiftedChat.append(prev, [progressNotif]));
        }, 500);
      }
    } catch (error) {
      const errText = error instanceof Error ? error.message : 'Something went wrong.';
      // Keep error messages short and actionable
      const shortErr = errText.length > 80 ? errText.slice(0, 80) + '…' : errText;
      const errorMsg: IMessage = {
        _id: `error-${Date.now()}`,
        text: `⚠️ ${shortErr}`,
        createdAt: new Date(),
        user: SENSEI_USER,
      };
      setMessages((prev) => GiftedChat.append(prev, [errorMsg]));
    } finally {
      setIsTyping(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

      {/* Curriculum status banner */}
      {curriculumStatus && curriculumStatus !== 'has_content' && (
        <TouchableOpacity
          style={[
            styles.curriculumBanner,
            curriculumStatus === 'all_mastered' ? styles.bannerMastered : styles.bannerEmpty,
          ]}
          onPress={() => router.push('/(tabs)/curriculum')}
          activeOpacity={0.7}
        >
          <Text style={styles.bannerText}>
            {curriculumStatus === 'empty'
              ? '📚 No curriculum yet — tap to add items'
              : '🎉 All mastered! Tap to add more curriculum'}
          </Text>
          <Text style={styles.bannerArrow}>→</Text>
        </TouchableOpacity>
      )}

      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        enabled
        keyboardVerticalOffset={Platform.OS === 'ios' ? tabBarHeight : headerHeight}
      >
        {messages.length === 0 && (
          <View style={styles.startContainer}>
            <Text style={styles.startText}>Start a conversation with Sensei 🎓</Text>
            <Text style={styles.startSubText}>Say "hi", ask about a word, or say "quiz me"</Text>
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

            let displayText = currentMessage.text;
            let thinkText = null;
            
            const thinkRegex = /<think>\s*([\s\S]*?)\s*<\/think>/i;
            const thinkMatch = displayText.match(thinkRegex);
            if (thinkMatch) {
              thinkText = thinkMatch[1];
              displayText = displayText.replace(thinkRegex, '').trim();
            }

            return (
              <View style={{ paddingHorizontal: 10, paddingVertical: 5 }}>
                {thinkText ? <ThinkBlock text={thinkText} /> : null}
                {displayText ? (
                  <Markdown
                    style={markdownStyles}
                    rules={{
                      // Disable default paragraph margin to fit better in bubble
                      paragraph: (node: any, children: any, parent: any, styles: any) => (
                        <Text key={node.key} style={styles.paragraph} selectable={true}>
                          {children}
                        </Text>
                      ),
                      textgroup: (node: any, children: any, parent: any, styles: any) => (
                        <Text key={node.key} style={styles.text} selectable={true}>
                          {children}
                        </Text>
                      ),
                      bullet_list: (node: any, children: any, parent: any, styles: any) => (
                        <View key={node.key} style={styles.bullet_list}>
                          {children}
                        </View>
                      ),
                      ordered_list: (node: any, children: any, parent: any, styles: any) => (
                        <View key={node.key} style={styles.ordered_list}>
                          {children}
                        </View>
                      ),
                      list_item: (node: any, children: any, parent: any, styles: any) => (
                        <View key={node.key} style={styles.list_item}>
                          <Text style={{ color: '#fff' }} selectable={true}>{children}</Text>
                        </View>
                      ),
                    }}
                  >
                    {displayText}
                  </Markdown>
                ) : null}
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
          renderSystemMessage={(props) => (
            <SystemMessage
              {...props}
              textStyle={{ color: '#E0E7FF', fontSize: 13, fontWeight: '600', textAlign: 'center' }}
              containerStyle={{ marginBottom: 10, paddingHorizontal: 20 }}
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
  curriculumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 10,
  },
  bannerEmpty: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  bannerMastered: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  bannerText: {
    color: '#E0E7FF',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  bannerArrow: {
    color: '#a5b4fc',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  thinkContainer: {
    marginVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  thinkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  thinkIcon: {
    color: '#a5b4fc',
    fontSize: 12,
    marginRight: 8,
  },
  thinkTitle: {
    color: '#a5b4fc',
    fontSize: 13,
    fontWeight: '600',
  },
  thinkContent: {
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  thinkText: {
    color: '#aaa',
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
