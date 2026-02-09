import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ExpoRoot } from 'expo-router';
import { StyleSheet } from 'react-native';

// This is the main App component used by Expo Router
export default function App() {
  // @ts-expect-error - require.context is a Metro bundler feature
  const ctx = require.context('./app');
  
  return (
    <GestureHandlerRootView style={styles.container}>
      <ExpoRoot context={ctx} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
