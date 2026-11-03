// RN port of ../../../src/components/SleepBuilder.tsx - same single
// free-form ritual screen (not a stepped flow), same Firestore contract
// (users/{uid}/preferences/sleep_builder, debounced merge-write). The
// Nova-memory summary write (addNovaMemory) on "Begin Wind-Down" is NOT
// ported in this pass - it depends on web's nova-brain caching/consent
// system (isNovaLearningAllowed, cachedBrain), which is its own piece of
// infrastructure not yet built for mobile. Everything load-bearing
// (the ritual itself, its persistence, the points award) is intact;
// only the memory summary is deferred.
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput } from '../../../src/lib/native-ui';
import { useNativeTheme } from '../../../src/lib/native-theme';
import type { NativeThemeColors } from '../../../src/lib/native-theme-palette';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDb, auth } from '../../../src/lib/firebase';
import { usePoints } from '../../../src/lib/use-points';

export default function SleepBuilderScreen() {
  const styles = useThemedStyles();
  const { awardPoints } = usePoints();
  const [bedtime, setBedtime] = useState('22:30');
  const [caffeineCutoff, setCaffeineCutoff] = useState(true);
  const [phoneOff, setPhoneOff] = useState(true);
  const [mentalUnload, setMentalUnload] = useState('');
  const [parkedItem, setParkedItem] = useState('');
  const [parkingList, setParkingList] = useState<string[]>([]);
  const [windDownStarted, setWindDownStarted] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setLoaded(true);
        return;
      }
      try {
        const db = await getDb();
        const snap = await getDoc(doc(db, 'users', uid, 'preferences', 'sleep_builder'));
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data.bedtime === 'string') setBedtime(data.bedtime);
          if (typeof data.caffeineCutoff === 'boolean') setCaffeineCutoff(data.caffeineCutoff);
          if (typeof data.phoneOff === 'boolean') setPhoneOff(data.phoneOff);
          if (typeof data.mentalUnload === 'string') setMentalUnload(data.mentalUnload);
          if (Array.isArray(data.parkingList)) setParkingList(data.parkingList);
        }
      } catch {
        // Leaves the honest defaults in place rather than pretending progress loaded.
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const t = setTimeout(async () => {
      try {
        const db = await getDb();
        await setDoc(
          doc(db, 'users', uid, 'preferences', 'sleep_builder'),
          { bedtime, caffeineCutoff, phoneOff, mentalUnload, parkingList, updatedAt: new Date().toISOString() },
          { merge: true }
        );
      } catch {
        // Non-fatal - the UI still reflects the change locally even if this save fails.
      }
    }, 800);
    return () => clearTimeout(t);
  }, [bedtime, caffeineCutoff, phoneOff, mentalUnload, parkingList, loaded]);

  // Web's <input type="time"> structurally can't produce anything but a
  // valid HH:MM string. A plain RN TextInput has no such constraint, and
  // firestore.rules caps bedtime at 5 characters (isStringWithMax(...,
  // 5)) - without this, someone typing a longer value would have their
  // change silently rejected by the write (the debounced save's catch
  // block is intentionally non-fatal, so nothing would visibly tell
  // them). This auto-inserts the colon and hard-caps at 5 digits/colon.
  const handleBedtimeChange = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '').slice(0, 4);
    const formatted = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
    setBedtime(formatted);
  };

  // firestore.rules caps parkingList at 30 entries as part of validating
  // the WHOLE merged preferences/sleep_builder document - past that, not
  // just this field but every field in the same debounced write (bedtime,
  // toggles, mental unload) would start silently failing to save. Capping
  // client-side keeps that failure mode unreachable rather than just rare.
  const MAX_PARKED_ITEMS = 30;
  const handleParkItem = () => {
    if (parkedItem.trim() && parkingList.length < MAX_PARKED_ITEMS) {
      setParkingList([...parkingList, parkedItem.trim()]);
      setParkedItem('');
    }
  };

  const removeParkedItem = (index: number) => {
    setParkingList(parkingList.filter((_, i) => i !== index));
  };

  const handleStartWindDown = () => {
    setWindDownStarted(true);
    awardPoints(15);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Sleep & Wind-Down Builder</Text>
        <Text style={styles.subtitle}>
          &ldquo;Burnout recovery without sleep support is like trying to charge your phone with a shoelace.&rdquo;
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Bedtime target</Text>
          <TextInput
            style={styles.bedtimeInput}
            value={bedtime}
            onChangeText={handleBedtimeChange}
            placeholder="22:30"
            keyboardType="number-pad"
            maxLength={5}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Environmental control</Text>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Caffeine cut-off (2 PM)</Text>
            <Switch value={caffeineCutoff} onValueChange={setCaffeineCutoff} />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Screen blackout (1 hr prior)</Text>
            <Switch value={phoneOff} onValueChange={setPhoneOff} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Mental unload</Text>
          <Text style={styles.cardHint}>Dump any racing thoughts here. They are structurally contained for the night.</Text>
          <TextInput
            style={styles.textarea}
            value={mentalUnload}
            onChangeText={setMentalUnload}
            placeholder="What is keeping your nervous system engaged right now?"
            multiline
            numberOfLines={5}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Tomorrow parking list</Text>
          <Text style={styles.cardHint}>Store action items you are afraid of forgetting. Deal with them tomorrow.</Text>
          <View style={styles.parkRow}>
            <TextInput
              style={styles.parkInput}
              value={parkedItem}
              onChangeText={setParkedItem}
              placeholder="Task or worry..."
              onSubmitEditing={handleParkItem}
            />
            <TouchableOpacity
              style={[styles.parkButton, parkingList.length >= MAX_PARKED_ITEMS && styles.parkButtonDisabled]}
              onPress={handleParkItem}
              disabled={parkingList.length >= MAX_PARKED_ITEMS}
            >
              <Text style={styles.parkButtonText}>Park it</Text>
            </TouchableOpacity>
          </View>
          {parkingList.length >= MAX_PARKED_ITEMS && (
            <Text style={styles.cardHint}>That&apos;s the most you can park at once - clear a few off tomorrow.</Text>
          )}
          {parkingList.length === 0 ? (
            <Text style={styles.emptyText}>No items parked yet.</Text>
          ) : (
            parkingList.map((item, idx) => (
              <View key={idx} style={styles.parkedItem}>
                <Text style={styles.parkedItemText}>{item}</Text>
                <TouchableOpacity onPress={() => removeParkedItem(idx)}>
                  <Text style={styles.removeLink}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        <TouchableOpacity
          style={[styles.windDownButton, windDownStarted && styles.windDownButtonActive]}
          onPress={handleStartWindDown}
          disabled={windDownStarted}
        >
          <Text style={[styles.windDownButtonText, windDownStarted && styles.windDownButtonTextActive]}>
            {windDownStarted ? 'Wind-Down Routine Active' : 'Begin Official Wind-Down'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createThemedStyles = (colors: NativeThemeColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 13, fontStyle: 'italic', color: colors.muted, lineHeight: 19, marginBottom: 24 },
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 18, marginBottom: 16 },
  cardLabel: { fontSize: 11, fontWeight: '800', color: colors.subtle, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  cardHint: { fontSize: 12, color: colors.muted, marginBottom: 10 },
  bedtimeInput: { fontSize: 28, fontWeight: '900', color: colors.accent, paddingVertical: 4, borderBottomWidth: 2, borderBottomColor: colors.border },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  textarea: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 100, textAlignVertical: 'top' },
  parkRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  parkInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  parkButton: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  parkButtonDisabled: { backgroundColor: colors.accentSoft },
  parkButtonText: { color: colors.onAccent, fontWeight: '700', fontSize: 13 },
  emptyText: { fontSize: 13, color: colors.subtle, fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 },
  parkedItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 },
  parkedItemText: { fontSize: 13, color: colors.text, flex: 1 },
  removeLink: { fontSize: 12, color: colors.danger, fontWeight: '600' },
  windDownButton: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  windDownButtonActive: { backgroundColor: colors.accentSoft },
  windDownButtonText: { color: colors.onAccent, fontWeight: '800', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 },
  windDownButtonTextActive: { color: colors.accent },
});

function useThemedStyles() {
  const { colors } = useNativeTheme();
  return React.useMemo(() => ({ ...createThemedStyles(colors), colors }), [colors]);
}
