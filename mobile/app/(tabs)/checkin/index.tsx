// Intro screen for the Fingerprint diagnostic ("Check-in"). The full
// question-by-question flow + result screen is a separate build (see
// task #187 / plan's "Check-in stack" section) - this establishes the
// route and the quick-vs-full choice, matching DiagnoseSection.tsx's own
// entry point framing.
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CheckInIntroScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title}>Check-in</Text>
        <Text style={styles.subtitle}>
          A short, honest self-assessment - not a medical test - that builds your personal burnout
          picture.
        </Text>
        <TouchableOpacity style={styles.optionCard} disabled>
          <Text style={styles.optionTitle}>Quick check-in</Text>
          <Text style={styles.optionSubtitle}>About 90 seconds, 7 questions</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.optionCard} disabled>
          <Text style={styles.optionTitle}>Full check-in</Text>
          <Text style={styles.optionSubtitle}>About 3-4 minutes, 14 questions</Text>
        </TouchableOpacity>
        <Text style={styles.comingSoon}>The full question flow is coming in the next build.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 20 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 24 },
  optionCard: {
    backgroundColor: '#fafafa',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 18,
    marginBottom: 12,
    opacity: 0.6,
  },
  optionTitle: { fontSize: 16, fontWeight: '700' },
  optionSubtitle: { fontSize: 13, color: '#777', marginTop: 4 },
  comingSoon: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: 16 },
});
