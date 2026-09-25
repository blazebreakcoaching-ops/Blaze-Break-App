// Reset picker - three tools (BLAME Reset, Nervous System Reset, Sleep &
// Wind-Down Builder). Full flows are a separate build (see task #188 /
// plan's "Reset stack" section); this establishes the route and the
// picker UI.
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TOOLS = [
  { title: 'BLAME Reset', subtitle: "A short interrupt for the moment you're about to react instead of respond." },
  { title: 'Nervous System Reset', subtitle: 'Breathing and grounding techniques for when you feel wired or overloaded.' },
  { title: 'Sleep & Wind-Down Builder', subtitle: 'A short ritual to help you switch off before bed.' },
];

export default function ResetPickerScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title}>Reset</Text>
        <Text style={styles.subtitle}>Short, guided techniques for calming down when you&apos;re wired or overloaded.</Text>
        {TOOLS.map((tool) => (
          <TouchableOpacity key={tool.title} style={styles.toolCard} disabled>
            <Text style={styles.toolTitle}>{tool.title}</Text>
            <Text style={styles.toolSubtitle}>{tool.subtitle}</Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.comingSoon}>These tools are coming in the next build.</Text>
      </View>
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
    opacity: 0.6,
  },
  toolTitle: { fontSize: 16, fontWeight: '700' },
  toolSubtitle: { fontSize: 13, color: '#777', marginTop: 4 },
  comingSoon: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: 16 },
});
