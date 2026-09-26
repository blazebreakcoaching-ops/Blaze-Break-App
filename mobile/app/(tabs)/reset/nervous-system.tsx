// RN port of ../../../src/components/NervousSystemReset.tsx - two
// sections (Breathwork/Grounding), content banks ported verbatim (see
// src/data/reset-techniques.ts). Already self-paced on web (user-
// controlled Play/Pause, tap-to-complete checklist, no forced duration) -
// nothing to fix there, just re-implement natively. The Web Audio
// soundscape engine and canvas pacer visualizer are intentionally not
// ported (see reset-techniques.ts's own note) - a simple pulsing circle
// stands in for the pacer.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { secureApiFetch } from '../../../src/lib/secure-api';
import { usePoints } from '../../../src/lib/use-points';
import { BREATHING_MODES, GROUNDING_MODES, BreathingModeKey, GroundingModeKey } from '../../../src/data/reset-techniques';

type Section = 'breathwork' | 'grounding';

export default function NervousSystemResetScreen() {
  const { awardPoints } = usePoints();
  const [section, setSection] = useState<Section>('breathwork');
  const [activeMode, setActiveMode] = useState<BreathingModeKey | null>(null);
  const [activeGrounding, setActiveGrounding] = useState<GroundingModeKey | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const pulse = useMemo(() => new Animated.Value(1), []);
  const sessionStartRef = useRef<number | null>(null);
  const completionFiredRef = useRef(false);

  const markResetComplete = () => {
    awardPoints(15);
    secureApiFetch('/api/user/mark-activity', { method: 'POST', data: { activity: 'nervousSystemReset' } }).catch(() => {});
  };

  useEffect(() => {
    if (!isPlaying) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.3, duration: 4000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 4000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isPlaying, pulse]);

  const handlePlayPause = () => {
    if (!isPlaying) {
      sessionStartRef.current = Date.now();
    } else if (sessionStartRef.current && !completionFiredRef.current) {
      const elapsedSec = (Date.now() - sessionStartRef.current) / 1000;
      if (elapsedSec >= 60) {
        completionFiredRef.current = true;
        markResetComplete();
      }
    }
    setIsPlaying((p) => !p);
  };

  const handleGroundingStepToggle = (idx: number) => {
    setCompletedSteps((prev) => {
      const next = prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx];
      const mode = GROUNDING_MODES.find((m) => m.key === activeGrounding);
      if (mode && next.length === mode.instructions.length && !completionFiredRef.current) {
        completionFiredRef.current = true;
        markResetComplete();
      }
      return next;
    });
  };

  const selectBreathing = (key: BreathingModeKey) => {
    setActiveMode(key);
    setIsPlaying(false);
    completionFiredRef.current = false;
    sessionStartRef.current = null;
  };

  const selectGrounding = (key: GroundingModeKey) => {
    setActiveGrounding(key);
    setCompletedSteps([]);
    completionFiredRef.current = false;
  };

  const selectedBreathing = BREATHING_MODES.find((m) => m.key === activeMode);
  const selectedGrounding = GROUNDING_MODES.find((m) => m.key === activeGrounding);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Reset</Text>
        <Text style={styles.subtitle}>Short, guided techniques for calming down when you&apos;re wired or overloaded.</Text>

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, section === 'breathwork' && styles.tabActive]}
            onPress={() => setSection('breathwork')}
          >
            <Text style={[styles.tabText, section === 'breathwork' && styles.tabTextActive]}>Breathwork</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, section === 'grounding' && styles.tabActive]}
            onPress={() => setSection('grounding')}
          >
            <Text style={[styles.tabText, section === 'grounding' && styles.tabTextActive]}>Grounding</Text>
          </TouchableOpacity>
        </View>

        {section === 'breathwork' && !selectedBreathing && (
          <View style={styles.list}>
            {BREATHING_MODES.map((mode) => (
              <TouchableOpacity key={mode.key} style={styles.techniqueCard} onPress={() => selectBreathing(mode.key)}>
                <Text style={styles.techniqueName}>{mode.name}</Text>
                <Text style={styles.techniqueDescription}>{mode.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {section === 'breathwork' && selectedBreathing && (
          <View style={styles.playerContainer}>
            <TouchableOpacity onPress={() => setActiveMode(null)}>
              <Text style={styles.backLink}>← All techniques</Text>
            </TouchableOpacity>
            <Text style={styles.playerTitle}>{selectedBreathing.name}</Text>
            <Text style={styles.playerInstruction}>{selectedBreathing.instruction}</Text>
            <Animated.View style={[styles.pacerCircle, { transform: [{ scale: pulse }] }]} />
            <TouchableOpacity style={styles.playButton} onPress={handlePlayPause}>
              <Text style={styles.playButtonText}>{isPlaying ? 'Pause' : 'Begin Reset Sequence'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {section === 'grounding' && !selectedGrounding && (
          <View style={styles.list}>
            {GROUNDING_MODES.map((mode) => (
              <TouchableOpacity key={mode.key} style={styles.techniqueCard} onPress={() => selectGrounding(mode.key)}>
                <Text style={styles.techniqueName}>{mode.name}</Text>
                <Text style={styles.techniqueDescription}>{mode.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {section === 'grounding' && selectedGrounding && (
          <View style={styles.playerContainer}>
            <TouchableOpacity onPress={() => setActiveGrounding(null)}>
              <Text style={styles.backLink}>← All techniques</Text>
            </TouchableOpacity>
            <Text style={styles.playerTitle}>{selectedGrounding.name}</Text>
            <View style={styles.checklist}>
              {selectedGrounding.instructions.map((step, idx) => {
                const checked = completedSteps.includes(idx);
                return (
                  <TouchableOpacity key={idx} style={styles.checklistItem} onPress={() => handleGroundingStepToggle(idx)}>
                    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                      {checked && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={[styles.checklistText, checked && styles.checklistTextDone]}>{step}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 20 },
  tabRow: { flexDirection: 'row', backgroundColor: '#f5f5f5', borderRadius: 12, padding: 4, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  tabActive: { backgroundColor: '#fff' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#999' },
  tabTextActive: { color: '#ea580c' },
  list: { gap: 12 },
  techniqueCard: { backgroundColor: '#fafafa', borderRadius: 14, borderWidth: 1, borderColor: '#eee', padding: 16 },
  techniqueName: { fontSize: 15, fontWeight: '700' },
  techniqueDescription: { fontSize: 12, color: '#777', marginTop: 3 },
  playerContainer: { alignItems: 'center', paddingTop: 8 },
  backLink: { fontSize: 13, color: '#ea580c', fontWeight: '600', alignSelf: 'flex-start', marginBottom: 20 },
  playerTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  playerInstruction: { fontSize: 13, color: '#666', textAlign: 'center', marginTop: 6, marginBottom: 32 },
  pacerCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#fed7aa', marginBottom: 32 },
  playButton: { backgroundColor: '#ea580c', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 },
  playButtonText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  checklist: { width: '100%', gap: 12 },
  checklistItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: '#ea580c', borderColor: '#ea580c' },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '800' },
  checklistText: { fontSize: 15, color: '#333', flex: 1 },
  checklistTextDone: { color: '#999', textDecorationLine: 'line-through' },
});
