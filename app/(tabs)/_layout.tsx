import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';

// Simple icon component (will be replaced with proper icons later)
const TabIcon = ({ name, focused }: { name: string; focused: boolean }) => (
  <Text style={[styles.icon, focused && styles.iconFocused]}>{name}</Text>
);

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#0a0a0a' },
        headerTintColor: '#ffffff',
        tabBarStyle: { 
          backgroundColor: '#0a0a0a',
          borderTopColor: '#1a1a1a',
        },
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: '#666666',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chat',
          headerTitle: '日本語チューター',
          tabBarIcon: ({ focused }) => <TabIcon name="💬" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="flashcards"
        options={{
          title: 'Review',
          tabBarIcon: ({ focused }) => <TabIcon name="📚" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ focused }) => <TabIcon name="📊" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => <TabIcon name="⚙️" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  icon: {
    fontSize: 20,
  },
  iconFocused: {
    transform: [{ scale: 1.1 }],
  },
});
