// Native Proactive Suggestions, against the real, unmocked
// /api/nova/proactive-suggestions route (server.ts) - this route is
// inert by design (nova-proactive-assistance-contract.ts's own header):
// it never prepares, approves or executes anything, only represents
// what might be worth proposing, and only ever offers a category the
// caller's REAL, server-checked authorisation already covers (never a
// client-side guess).
import React, { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { secureApiFetch, SecureApiError } from '../../../src/lib/secure-api';

type CapacityBand = 'low_bandwidth' | 'some_bandwidth' | 'reflective_bandwidth';

interface Suggestion {
  suggestionId: string;
  category: 'calendar_protection' | 'task_deferral';
  description: string;
  whyItMightHelp: string;
  requiresPermissionOrIntegration: string;
  whatHappensIfYouProceed: string;
  whatNovaCannotDoYet: string;
}

const CAPACITY_OPTIONS: { value: CapacityBand; label: string }[] = [
  { value: 'low_bandwidth', label: 'Low' },
  { value: 'some_bandwidth', label: 'Some' },
  { value: 'reflective_bandwidth', label: 'Reflective' },
];

export default function ProactiveSuggestionsScreen() {
  const params = useLocalSearchParams<{ obligation?: string }>();
  const [obligation, setObligation] = useState(params.obligation ?? '');
  const [capacityBand, setCapacityBand] = useState<CapacityBand | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setBusy(true);
    setError(null);
    setSuggestions(null);
    try {
      const res = await secureApiFetch('/api/nova/proactive-suggestions', {
        method: 'POST',
        data: {
          statedGoal: null,
          voluntarilySharedObligation: obligation.trim() || null,
          capacityBand,
          priorUserConfirmedPlan: null,
        },
      });
      const body = await res.json();
      setSuggestions(Array.isArray(body.suggestions) ? body.suggestions : []);
    } catch (err: unknown) {
      setError(err instanceof SecureApiError ? err.message : 'Could not reach Nova for suggestions.');
    } finally {
      setBusy(false);
    }
  };

  const applySuggestion = (s: Suggestion) => {
    if (s.category === 'calendar_protection') {
      router.push({ pathname: '/(tabs)/nova/calendar-protection', params: { title: obligation.trim() } });
    } else {
      router.push({ pathname: '/(tabs)/nova/task-deferral', params: { description: obligation.trim() } });
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back to Nova" style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.title}>Proactive Options</Text>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.description}>
            Nova can suggest a possible next step based on what you tell it here, your stated capacity, and
            permissions/integrations you've already set up. This is only ever a suggestion - nothing is prepared
            or changed until you choose one and review it in the real screen it leads to.
          </Text>

          <TextInput
            accessibilityLabel="Obligation or goal for proactive suggestions"
            value={obligation} onChangeText={setObligation}
            placeholder="What's the obligation or goal? (your own words)"
            placeholderTextColor="#6b7280" style={styles.input}
          />

          <View style={styles.capacityRow}>
            {CAPACITY_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                onPress={() => setCapacityBand(option.value)}
                accessibilityRole="button"
                accessibilityLabel={`Capacity: ${option.label}`}
                style={[styles.capacityChip, capacityBand === option.value && styles.capacityChipActive]}
              >
                <Text style={[styles.capacityChipText, capacityBand === option.value && styles.capacityChipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={ask} disabled={busy} accessibilityRole="button" accessibilityLabel="See what Nova can suggest"
            style={[styles.button, busy && styles.buttonDisabled]}
          >
            <Text style={styles.buttonText}>See what Nova can suggest</Text>
          </TouchableOpacity>

          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {busy && <ActivityIndicator color="#9a3412" />}

          {suggestions && suggestions.length === 0 && (
            <Text style={styles.description}>
              Nothing to suggest right now - that's fine, you can still go straight to Calendar Protection or Task
              Deferral yourself.
            </Text>
          )}

          {suggestions?.map((s) => (
            <View key={s.suggestionId} style={styles.card}>
              <Text style={styles.cardText}>{s.description}</Text>
              <Text style={styles.cardLabel}>Why this might help</Text>
              <Text style={styles.cardDetail}>{s.whyItMightHelp}</Text>
              <Text style={styles.cardLabel}>What's required</Text>
              <Text style={styles.cardDetail}>{s.requiresPermissionOrIntegration}</Text>
              <Text style={styles.cardLabel}>If you proceed</Text>
              <Text style={styles.cardDetail}>{s.whatHappensIfYouProceed}</Text>
              <Text style={styles.cardLabel}>Nova can't yet</Text>
              <Text style={styles.cardDetail}>{s.whatNovaCannotDoYet}</Text>
              <TouchableOpacity onPress={() => applySuggestion(s)} accessibilityRole="button" accessibilityLabel="Use this" style={styles.useButton}>
                <Text style={styles.useButtonText}>Use this</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, safeArea: { flex: 1, backgroundColor: '#fff' },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, borderBottomWidth: 1, borderColor: '#e5e7eb' },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  content: { padding: 18, gap: 14, paddingBottom: 40 },
  description: { fontSize: 13, lineHeight: 19, color: '#4b5563' },
  input: { minHeight: 46, borderRadius: 12, backgroundColor: '#f3f4f6', color: '#111827', paddingHorizontal: 12, paddingVertical: 12, fontSize: 15 },
  capacityRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  capacityChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#e5e7eb' },
  capacityChipActive: { backgroundColor: '#c2410c', borderColor: '#c2410c' },
  capacityChipText: { fontSize: 13, color: '#4b5563', fontWeight: '600' },
  capacityChipTextActive: { color: '#fff' },
  button: { minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#c2410c' },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  error: { color: '#b91c1c', fontSize: 13 },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, padding: 14, gap: 6 },
  cardText: { fontSize: 15, color: '#111827', lineHeight: 21, fontWeight: '600' },
  cardLabel: { fontSize: 11, color: '#9a3412', fontWeight: '700', textTransform: 'uppercase', marginTop: 6 },
  cardDetail: { fontSize: 13, color: '#4b5563', lineHeight: 18 },
  useButton: { marginTop: 10, minHeight: 42, borderRadius: 10, backgroundColor: '#c2410c', alignItems: 'center', justifyContent: 'center' },
  useButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
