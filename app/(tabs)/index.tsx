import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { KeyboardAvoidingView, KeyboardProvider } from 'react-native-keyboard-controller';
import { GiftedChat, IMessage, Bubble, InputToolbar, Composer, Send } from 'react-native-gifted-chat';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '../../src/store/app-store';
import { sendMessage, loadConversationHistory, createNewThread, initTutor } from '../../src/services/tutor-agent';

const SENSEI_USER = {
  _id: 2,
  name: 'Sensei',
  avatar: '🎓',
};

export default function ChatScreen() {
  const { apiKeys, currentModel, isGeminiReady, currentThreadId, setCurrentThreadId } = useAppStore();
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const initialized = useRef(false);

  // Initialize on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Set initial welcome message
    setMessages([
      {
        _id: 'welcome',
        text: 'こんにちは！I\'m your Japanese tutor. Let\'s start learning! 🎌\n\nYou can:\n• Ask me to teach you new vocabulary\n• Practice grammar with exercises\n• Have conversations in Japanese\n• Upload learning materials in Settings\n\n⚠️ Add a Gemini API key in Settings to enable AI responses.',
        createdAt: new Date(),
        user: SENSEI_USER,
      },
    ]);

    // Load existing conversation history
    if (currentThreadId) {
      (async () => {
        try {
          const history = await loadConversationHistory(currentThreadId);
          if (history && history.length > 0) {
            const historicalMessages: IMessage[] = history.map((msg, i) => ({
              _id: `history-${i}`,
              text: msg.content,
              createdAt: new Date(msg.timestamp),
              user: msg.role === 'user' ? { _id: 1 } : SENSEI_USER,
            }));
            setMessages((prev) => GiftedChat.append(prev, historicalMessages.reverse()));
          }
        } catch {
          // DB not initialized yet — that's fine on first load
        }
      })();
    }
  }, []);

  // Re-initialize Gemini client when keys/model change
  useEffect(() => {
    if (apiKeys.length > 0) {
      initTutor(apiKeys, currentModel);
    }
  }, [apiKeys, currentModel]);

  const onSend = useCallback(async (newMessages: IMessage[] = []) => {
    const userMessage = newMessages[0];
    if (!userMessage?.text) return;

    // Add user message immediately
    setMessages((prev) => GiftedChat.append(prev, newMessages));

    if (!isGeminiReady) {
      // No API key — show helpful message
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
      // Ensure we have a thread
      let threadId = currentThreadId;
      if (!threadId || threadId === 'default') {
        threadId = createNewThread();
        setCurrentThreadId(threadId);
      }

      // Get AI response
      const response = await sendMessage(threadId, userMessage.text);

      const aiMessage: IMessage = {
        _id: `ai-${Date.now()}`,
        text: response,
        createdAt: new Date(),
        user: SENSEI_USER,
      };
      setMessages((prev) => GiftedChat.append(prev, [aiMessage]));
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

  return (
    <KeyboardProvider>
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
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
      </SafeAreaView>
    </KeyboardProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
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
});
