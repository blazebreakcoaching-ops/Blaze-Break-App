// Native port of ConnectedDailyCheckIn's core write path
// (../../../src/components/ConnectedRecoveryModules.tsx:31-102) - same
// checkins/{docId} shape, same mark-activity call, so it's the exact same
// contract the web app and its weekly-recap/recommendation routes read
// from. Deliberately just the 4-slider submit flow, not history/edit/
// delete - those aren't part of Pulse's "one clear next step" loop.
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import Slider from '@react-native-community/slider';
import { doc, setDoc } from 'firebase/firestore';
import { getDb, auth } from '../lib/firebase';
import { secureApiFetch } from '../lib/secure-api';

interface DailyCheckInModalProps {
  visible: boolean;
  onClose: () => void;
  onComplete: (data: { energyLevel: number; focusLevel: number; detachmentLevel: number; stressLoad: number }) => void;
}

const SLIDERS: { key: 'energyLevel' | 'focusLevel' | 'detachmentLevel' | 'stressLoad'; label: string; low: string; high: string }[] = [
  { key: 'energyLevel', label: 'Energy', low: 'Running on empty', high: 'Fully charged' },
  { key: 'focusLevel', label: 'Focus', low: 'Scattered', high: 'Sharp' },
  { key: 'detachmentLevel', label: 'Detachment', low: 'Fully present', high: 'Checked out' },
  { key: 'stressLoad', label: 'Stress load', low: 'Light', high: 'Heavy' },
];

export function DailyCheckInModal({ visible, onClose, onComplete }: DailyCheckInModalProps) {
  const [values, setValues] = useState({ energyLevel: 5, focusLevel: 5, detachmentLevel: 5, stressLoad: 5 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      onComplete(values);
      setValues({ energyLevel: 5, focusLevel: 5, detachmentLevel: 5, stressLoad: 5 });
    } catch {
      setError('This entry could not be saved. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.title}>Claim your Pulse</Text>
        <Text style={styles.subtitle}>Four quick sliders - takes about 30 seconds.</Text>
        {SLIDERS.map((s) => (
          <View key={s.key} style={styles.sliderRow}>
            <View style={styles.sliderHeader}>
              <Text style={styles.sliderLabel}>{s.label}</Text>
              <Text style={styles.sliderValue}>{values[s.key]}/10</Text>
            </View>
            <Slider
              minimumValue={0}
              maximumValue={10}
              step={1}
              value={values[s.key]}
              onValueChange={(v) => setValues((prev) => ({ ...prev, [s.key]: v }))}
              minimumTrackTintColor="#ea580c"
            />
            <View style={styles.sliderCaptions}>
              <Text style={styles.caption}>{s.low}</Text>
              <Text style={styles.caption}>{s.high}</Text>
            </View>
          </View>
        ))}
        {error && <Text style={styles.error}>{error}</Text>}
        <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save Pulse</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} disabled={saving}>
          <Text style={styles.cancel}>Not now</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 32, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#666', textAlign: 'center', marginTop: 4, marginBottom: 24 },
  sliderRow: { marginBottom: 20 },
  sliderHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  sliderLabel: { fontSize: 15, fontWeight: '600' },
  sliderValue: { fontSize: 13, color: '#ea580c', fontWeight: '700' },
  sliderCaptions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  caption: { fontSize: 11, color: '#999' },
  error: { color: '#dc2626', textAlign: 'center', marginBottom: 12, fontSize: 13 },
  button: { backgroundColor: '#ea580c', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancel: { textAlign: 'center', marginTop: 16, color: '#999' },
});
