import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useNativeTheme } from '../../src/lib/native-theme';

export default function TabsLayout() {
  const { colors } = useNativeTheme();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.accent,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
    }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Pulse',
          tabBarIcon: ({ color, size }) => <Ionicons name="pulse" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="nova"
        options={{
          title: 'Nova',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="checkin"
        options={{
          title: 'Check-in',
          tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reset"
        options={{
          title: 'Reset',
          tabBarIcon: ({ color, size }) => <Ionicons name="leaf" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
