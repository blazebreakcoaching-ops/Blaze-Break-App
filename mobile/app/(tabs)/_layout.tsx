import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Pulse',
          tabBarIcon: ({ color, size }) => <Ionicons name="pulse" size={size} color={color} />,
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
