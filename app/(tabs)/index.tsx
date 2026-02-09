import { useState, useCallback } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { GiftedChat, IMessage, Bubble, InputToolbar, Composer, Send } from 'react-native-gifted-chat';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ChatScreen() {
  const [messages, setMessages] = useState<IMessage[]>([
    {
      _id: 1,
      text: 'こんにちは！I\'m your Japanese tutor. Let\'s start learning! 🎌\n\nYou can:\n• Ask me to teach you new vocabulary\n• Practice grammar with exercises\n• Have conversations in Japanese\n• Upload learning materials in Settings',
      createdAt: new Date(),
      user: {
        _id: 2,
        name: 'Sensei',
        avatar: '🎓',
      },
    },
  ]);

  const onSend = useCallback((newMessages: IMessage[] = []) => {
    setMessages((previousMessages) =>
      GiftedChat.append(previousMessages, newMessages)
    );
    
    // TODO: Connect to LangGraph agent for response
    setTimeout(() => {
      const response: IMessage = {
        _id: Math.random().toString(),
        text: 'I received your message! The AI agent will be connected soon. がんばって！ 💪',
        createdAt: new Date(),
        user: {
          _id: 2,
          name: 'Sensei',
          avatar: '🎓',
        },
      };
      setMessages((prev) => GiftedChat.append(prev, [response]));
    }, 500);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <GiftedChat
          messages={messages}
          onSend={(msgs) => onSend(msgs)}
          user={{ _id: 1 }}
          textInputProps={{
            placeholder: "Type a message... (日本語 OK!)",
          }}
          // placeholder="Type a message... (日本語 OK!)"
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
                <View style={styles.sendIcon} />
              </View>
            </Send>
          )}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
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
});
