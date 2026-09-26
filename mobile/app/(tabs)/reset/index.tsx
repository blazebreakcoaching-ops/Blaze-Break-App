// Reset picker - three real tools now (BLAME Reset, Nervous System
// Reset, Sleep & Wind-Down Builder), replacing the earlier stub.
import React from 'react';
import { Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

const TOOLS: { title: string; subtitle: string; route: string }[] = [
  {
    title: 'BLAME Reset',
    subtitle: "A short interrupt for the moment you're about to react instead of respond, with Nova alongside you for Locate + Accept.",
    route: '/(tabs)/reset/blame',
  },
  {
    title: 'Nervous System Reset',
    subtitle: 'Breathing and grounding techniques for when you feel wired or overloaded.',
    route: '/(tabs)/reset/nervous-system',
  },
  {
    title: 'Sleep & Wind-Down Builder',
    subtitle: 'A short ritual to help you switch off before bed.',
    route: '/(tabs)/reset/sleep',
  },
];

export default function ResetPickerScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Reset</Text>
        <Text style={styles.subtitle}>Short, guided techniques for calming down when you&apos;re wired or overloaded.</Text>
        {TOOLS.map((tool) => (
          <TouchableOpacity key={tool.title} style={styles.toolCard} onPress={() => router.push(tool.route as never)}>
            <Text style={styles.toolTitle}>{tool.title}</Text>
            <Text style={styles.toolSubtitle}>{tool.subtitle}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 20 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 24 },
  toolCard: {
    backgroundColor: '#fafafa',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 18,
    marginBottom: 12,
  },
  toolTitle: { fontSize: 16, fontWeight: '700' },
  toolSubtitle: { fontSize: 13, color: '#777', marginTop: 4, lineHeight: 18 },
});
