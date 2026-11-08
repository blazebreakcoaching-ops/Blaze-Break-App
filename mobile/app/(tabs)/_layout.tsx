import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useNativeTheme } from '../../src/lib/native-theme';
import { useNativeI18n } from '../../src/lib/i18n';

export default function TabsLayout() {
  const { colors } = useNativeTheme();
  const { t } = useNativeI18n();
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
          title: t('nav.home'),
          tabBarIcon: ({ color, size }) => <Ionicons name="pulse" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="nova"
        options={{
          title: t('nav.nova'),
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="checkin"
        options={{
          title: t('nav.diagnose'),
          tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reset"
        options={{
          title: t('nav.reset'),
          tabBarIcon: ({ color, size }) => <Ionicons name="leaf" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
