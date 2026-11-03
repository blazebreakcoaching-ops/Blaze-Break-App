// Native Proactive Suggestions, against the real, unmocked
// /api/nova/proactive-suggestions route (server.ts) - this route is
// inert by design (nova-proactive-assistance-contract.ts's own header):
// it never prepares, approves or executes anything, only represents
// what might be worth proposing, and only ever offers a category the
// caller's REAL, server-checked authorisation already covers (never a
// client-side guess).
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from '../../../src/lib/native-ui';
import { useNativeTheme } from '../../../src/lib/native-theme';
import type { NativeThemeColors } from '../../../src/lib/native-theme-palette';
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
  const styles = useThemedStyles();
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
            <Ionicons name="chevron-back" size={24} color={styles.colors.text} />
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
            placeholderTextColor={styles.colors.muted} style={styles.input}
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
          {busy && <ActivityIndicator color={styles.colors.accent} />}

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

const createThemedStyles = (colors: NativeThemeColors) => StyleSheet.create({
  flex: { flex: 1 }, safeArea: { flex: 1, backgroundColor: colors.card },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, borderBottomWidth: 1, borderColor: colors.border },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  content: { padding: 18, gap: 14, paddingBottom: 40 },
  description: { fontSize: 13, lineHeight: 19, color: colors.muted },
  input: { minHeight: 46, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15 },
  capacityRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  capacityChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  capacityChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  capacityChipText: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  capacityChipTextActive: { color: colors.onAccent },
  button: { minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: colors.onAccent, fontSize: 14, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 13 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, gap: 6 },
  cardText: { fontSize: 15, color: colors.text, lineHeight: 21, fontWeight: '600' },
  cardLabel: { fontSize: 11, color: colors.accent, fontWeight: '700', textTransform: 'uppercase', marginTop: 6 },
  cardDetail: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  useButton: { marginTop: 10, minHeight: 42, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  useButtonText: { color: colors.onAccent, fontWeight: '700', fontSize: 13 },
});

function useThemedStyles() {
  const { colors } = useNativeTheme();
  return React.useMemo(() => ({ ...createThemedStyles(colors), colors }), [colors]);
}
