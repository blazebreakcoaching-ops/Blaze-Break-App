// Native port of ConnectedDailyCheckIn's core write path
// (../../../src/components/ConnectedRecoveryModules.tsx:31-102) - same
// checkins/{docId} shape, same mark-activity call, so it's the exact same
// contract the web app and its weekly-recap/recommendation routes read
// from. Deliberately just the 4-slider submit flow, not history/edit/
// delete - those aren't part of Pulse's "one clear next step" loop.
import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { Text } from '../lib/native-ui';
import { useNativeTheme } from '../lib/native-theme';
import type { NativeThemeColors } from '../lib/native-theme-palette';
import Slider from '@react-native-community/slider';
import { doc, setDoc } from 'firebase/firestore';
import { getDb, auth } from '../lib/firebase';
import { secureApiFetch } from '../lib/secure-api';

interface DailyCheckInModalProps {
  visible: boolean;
  onClose: () => void;
  onComplete: () => void;
}

import { LOW_ENERGY_OPTIONS, type LowEnergyResponse } from '../../../low-energy-checkin';

const SLIDERS: { key: 'energyLevel' | 'focusLevel' | 'detachmentLevel' | 'stressLoad'; label: string; low: string; high: string }[] = [
  { key: 'energyLevel', label: 'Energy', low: 'Running on empty', high: 'Fully charged' },
  { key: 'focusLevel', label: 'Focus', low: 'Scattered', high: 'Sharp' },
  { key: 'detachmentLevel', label: 'Detachment', low: 'Fully present', high: 'Checked out' },
  { key: 'stressLoad', label: 'Stress load', low: 'Light', high: 'Heavy' },
];

export function DailyCheckInModal({ visible, onClose, onComplete }: DailyCheckInModalProps) {
  const styles = useThemedStyles();
  const [values, setValues] = useState({ energyLevel: 5, focusLevel: 5, detachmentLevel: 5, stressLoad: 5 });
  const [mode, setMode] = useState<'choice' | 'quick' | 'full'>('choice');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveQuickResponse = async (response: LowEnergyResponse) => {
    const uid = auth.currentUser?.uid;
    if (!uid || saving) {
      if (!uid) setError('Please sign in to save a check-in.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const db = await getDb();
      const entry = doc(db, 'users', uid, 'low_energy_checkins', Date.now().toString());
      await setDoc(entry, {
        createdAt: new Date().toISOString(),
        response,
        kind: 'qualitative',
        source: 'user',
      });
      // Do not notify scoring, weekly recap, NHEI, or Nova; this is a
      // qualitative answer, not a numerical energy/stress measurement.
      setMode('choice');
      onComplete();
    } catch {
      setError('Could not save your answer. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSaving(true);
    setError(null);
    try {
      const db = await getDb();
      const docId = Date.now().toString();
      await setDoc(doc(db, 'users', uid, 'checkins', docId), {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...values,
        source: 'user',
      });
      secureApiFetch('/api/user/mark-activity', { method: 'POST', data: { activity: 'checkIn' } }).catch(() => {
        // Non-fatal - only affects the home recommendation engine's freshness.
      });
      onComplete();
      setValues({ energyLevel: 5, focusLevel: 5, detachmentLevel: 5, stressLoad: 5 });
    } catch {
      setError('This entry could not be saved. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        {mode === 'choice' ? (
          <>
            <Text style={styles.title} accessibilityRole="header">How would you like to check in?</Text>
            <Text style={styles.subtitle}>Choose what works for you today. You can skip.</Text>
            <TouchableOpacity style={styles.choice} accessibilityRole="button"
              accessibilityLabel="One question check-in" onPress={() => { setError(null); setMode('quick'); }}>
              <Text style={styles.choiceTitle}>One question</Text>
              <Text style={styles.choiceHint}>One tap. No scores or follow-up questions.</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.choice} accessibilityRole="button"
              accessibilityLabel="Full check-in, four sliders" onPress={() => { setError(null); setMode('full'); }}>
              <Text style={styles.choiceTitle}>Full check-in</Text>
              <Text style={styles.choiceHint}>Four sliders for energy, focus, detachment and stress.</Text>
            </TouchableOpacity>
          </>
        ) : mode === 'quick' ? (
          <>
            <Text style={styles.title} accessibilityRole="header">How are you feeling right now?</Text>
            <Text style={styles.subtitle}>Choose what feels closest. There is no wrong answer.</Text>
            {LOW_ENERGY_OPTIONS.map((option) => (
              <TouchableOpacity key={option.id} style={styles.choice}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityHint="Save this private, qualitative check-in"
                disabled={saving} onPress={() => { void saveQuickResponse(option.id); }}>
                <Text style={styles.choiceTitle}>{option.label}</Text>
                <Text style={styles.choiceHint}>{option.description}</Text>
              </TouchableOpacity>
            ))}
            <Text style={styles.privacyNote}>Your answer stays private. It does not create a recovery score.</Text>
          </>
        ) : (
          <>
            <Text style={styles.title} accessibilityRole="header">Claim your Pulse</Text>
            <Text style={styles.subtitle}>Four sliders. Take your time.</Text>
            {SLIDERS.map((s) => (
              <View key={s.key} style={styles.sliderRow}>
                <View style={styles.sliderHeader}>
                  <Text style={styles.sliderLabel}>{s.label}</Text>
                  <Text style={styles.sliderValue}>{values[s.key]}/10</Text>
                </View>
                <Slider minimumValue={0} maximumValue={10} step={1}
                  accessibilityLabel={s.label} accessibilityValue={{ min: 0, max: 10, now: values[s.key] }}
                  value={values[s.key]}
                  onValueChange={(v) => setValues((prev) => ({ ...prev, [s.key]: v }))}
                  minimumTrackTintColor={styles.colors.accent} />
                <View style={styles.sliderCaptions}>
                  <Text style={styles.caption}>{s.low}</Text>
                  <Text style={styles.caption}>{s.high}</Text>
                </View>
              </View>
            ))}
          </>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
        {mode === 'full' && (
          <TouchableOpacity style={styles.button} accessibilityRole="button" onPress={handleSubmit} disabled={saving}>
            {saving ? <ActivityIndicator color={styles.colors.onAccent} /> : <Text style={styles.buttonText}>Save Pulse</Text>}
          </TouchableOpacity>
        )}
        {saving && mode === 'quick' && <ActivityIndicator accessibilityLabel="Saving your answer" />}
        {mode !== 'choice' && (
          <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => { setError(null); setMode('choice'); }} style={styles.secondaryAction}>
            <Text style={styles.cancel}>Go back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity accessibilityRole="button" onPress={onClose} disabled={saving} style={styles.secondaryAction}>
          <Text style={styles.cancel}>Not today</Text>
        </TouchableOpacity>
      </ScrollView>
    </Modal>
  );
}

const createThemedStyles = (colors: NativeThemeColors) => StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { padding: 24, paddingTop: 32, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 4, marginBottom: 24 },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 18, minHeight: 64, marginBottom: 12, backgroundColor: colors.surface, justifyContent: 'center' },
  choiceTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  choiceHint: { color: colors.muted, fontSize: 14, marginTop: 5, lineHeight: 21 },
  privacyNote: { color: colors.muted, fontSize: 13, marginBottom: 14 },
  secondaryAction: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  sliderRow: { marginBottom: 20 },
  sliderHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  sliderLabel: { fontSize: 15, fontWeight: '600' },
  sliderValue: { fontSize: 13, color: colors.accent, fontWeight: '700' },
  sliderCaptions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  caption: { fontSize: 11, color: colors.subtle },
  error: { color: colors.danger, textAlign: 'center', marginBottom: 12, fontSize: 13 },
  button: { backgroundColor: colors.accent, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
  cancel: { textAlign: 'center', marginTop: 16, color: colors.subtle },
});

function useThemedStyles() {
  const { colors } = useNativeTheme();
  return React.useMemo(() => ({ ...createThemedStyles(colors), colors }), [colors]);
}
