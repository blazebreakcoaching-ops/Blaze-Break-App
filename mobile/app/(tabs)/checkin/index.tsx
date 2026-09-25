// Faithful re-implementation of DiagnoseSection.tsx's DiagnoseView - same
// state machine (choice -> question loop -> loading -> result), same
// question bank (src/data/diagnose-questions.ts, ported verbatim), same
// backend contract (POST /api/nova/diagnose). The result screen is
// deliberately simpler than web's ResultView + FutureSelfSimulator (no
// recovery-plan cross-linking, no FINGERPRINT_ENHANCEMENTS copy tables) -
// "here's your profile + your top priorities," per the mobile plan.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDb, auth } from '../../../src/lib/firebase';
import { secureApiFetch } from '../../../src/lib/secure-api';
import { usePoints } from '../../../src/lib/use-points';
import { QUESTIONS, QUICK_CHECK_IDS } from '../../../src/data/diagnose-questions';

type Mode = 'loading' | 'choice' | 'quick' | 'full' | 'submitting' | 'result';

interface FingerprintResult {
  profile: string;
  description: string;
  priorities: string[];
  blend?: { profile: string; percentage: number }[];
}

export default function CheckInScreen() {
  const { awardPoints } = usePoints();
  const [mode, setMode] = useState<Mode>('loading');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FingerprintResult | null>(null);
  const awardedRef = useRef(false);

  // Mirrors web's own persisted fingerprint (App.tsx's fingerprint state,
  // debounce-saved to user_stats/core.fingerprint) - a returning visitor
  // sees their existing result instead of the choice screen every time.
  useEffect(() => {
    (async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setMode('choice');
        return;
      }
      try {
        const db = await getDb();
        const snap = await getDoc(doc(db, 'users', uid, 'user_stats', 'core'));
        const existing = snap.exists() ? snap.data().fingerprint : null;
        if (existing) {
          setResult(existing);
          setMode('result');
        } else {
          setMode('choice');
        }
      } catch {
        setMode('choice');
      }
    })();
  }, []);

  const activeQuestions = mode === 'quick' ? QUESTIONS.filter((q) => QUICK_CHECK_IDS.includes(q.id)) : QUESTIONS;

  const persistFingerprint = async (f: FingerprintResult) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      const db = await getDb();
      await setDoc(doc(db, 'users', uid, 'user_stats', 'core'), { fingerprint: f, updatedAt: new Date().toISOString() }, { merge: true });
    } catch {
      // Non-fatal - the result still shows locally even if this save fails.
    }
  };

  const submitAssessment = async (finalAnswers: Record<string, number>) => {
    setMode('submitting');
    setError(null);
    try {
      const res = await secureApiFetch('/api/nova/diagnose', {
        method: 'POST',
        data: { answers: finalAnswers, letNovaLearn: true },
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      setMode('result');
      persistFingerprint(data);
      if (!awardedRef.current) {
        awardedRef.current = true;
        awardPoints(250);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to analyse assessment');
      setMode('choice');
    }
  };

  const handleAnswer = (value: number) => {
    const question = activeQuestions[step];
    const nextAnswers = { ...answers, [question.id]: value };
    setAnswers(nextAnswers);
    if (step < activeQuestions.length - 1) {
      setStep(step + 1);
    } else {
      submitAssessment(nextAnswers);
    }
  };

  const startMode = (m: 'quick' | 'full') => {
    setAnswers({});
    setStep(0);
    setError(null);
    setMode(m);
  };

  if (mode === 'loading') {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (mode === 'submitting') {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Nova is analysing your burnout fingerprint…</Text>
      </SafeAreaView>
    );
  }

  if (mode === 'choice') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>How much time do you have right now?</Text>
          <Text style={styles.subtitle}>Either way gets you a real result - the difference is how much of the picture it covers.</Text>
          {error && <Text style={styles.error}>{error}</Text>}
          <TouchableOpacity style={styles.choiceCard} onPress={() => startMode('quick')}>
            <Text style={styles.choiceEyebrow}>Quick Check — ~90 seconds</Text>
            <Text style={styles.choiceBody}>
              7 questions. Covers the 5 core burnout patterns - Founder on Fire, Over-Giver, Silent Resenter, Manager in
              the Middle, High-Functioning Exhausted.
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.choiceCard, styles.choiceCardPrimary]} onPress={() => startMode('full')}>
            <Text style={styles.choiceEyebrow}>Full Assessment — ~3-4 minutes</Text>
            <Text style={styles.choiceBody}>
              14 questions. Also checks for Impostor Syndrome, Perfectionism, Crisis Dependency, and 4 more patterns -
              plus your full blend, not just one label.
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (mode === 'result' && result) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.resultEyebrow}>Your burnout fingerprint</Text>
          <Text style={styles.title}>{result.profile}</Text>
          <Text style={styles.subtitle}>{result.description}</Text>

          {result.priorities?.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardEyebrow}>Your priorities</Text>
              {result.priorities.map((p, i) => (
                <Text key={i} style={styles.priorityItem}>
                  {i + 1}. {p}
                </Text>
              ))}
            </View>
          )}

          {result.blend && result.blend.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardEyebrow}>Your blend</Text>
              {result.blend.map((b) => (
                <Text key={b.profile} style={styles.blendItem}>
                  {b.profile} — {b.percentage}%
                </Text>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.retakeButton} onPress={() => setMode('choice')}>
            <Text style={styles.retakeButtonText}>Retake check-in</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Question loop (mode === 'quick' | 'full')
  const question = activeQuestions[step];
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>
            Question {step + 1} of {activeQuestions.length}
          </Text>
        </View>
        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: `${((step + 1) / activeQuestions.length) * 100}%` }]} />
        </View>
        <Text style={styles.questionText}>{question.text}</Text>
        <View style={styles.optionsList}>
          {question.options.map((option, idx) => (
            <TouchableOpacity key={idx} style={styles.optionCard} onPress={() => handleAnswer(option.value)}>
              <Text style={styles.optionText}>{option.text}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {step > 0 && (
          <TouchableOpacity onPress={() => setStep(step - 1)}>
            <Text style={styles.backLink}>Go back</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', gap: 16, padding: 20 },
  loadingText: { fontSize: 14, color: '#666', textAlign: 'center' },
  container: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 24 },
  error: { color: '#dc2626', fontSize: 13, marginBottom: 16, textAlign: 'center' },
  choiceCard: {
    backgroundColor: '#fafafa',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 18,
    marginBottom: 14,
  },
  choiceCardPrimary: { borderColor: '#ea580c', backgroundColor: '#fff7ed' },
  choiceEyebrow: { fontSize: 11, fontWeight: '800', color: '#9a3412', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  choiceBody: { fontSize: 14, color: '#444', lineHeight: 20 },
  progressRow: { marginBottom: 6 },
  progressText: { fontSize: 12, color: '#999', fontWeight: '600' },
  progressBarTrack: { height: 4, backgroundColor: '#eee', borderRadius: 2, marginBottom: 28 },
  progressBarFill: { height: 4, backgroundColor: '#ea580c', borderRadius: 2 },
  questionText: { fontSize: 22, fontWeight: '700', lineHeight: 30, marginBottom: 24 },
  optionsList: { gap: 12 },
  optionCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 14,
    padding: 18,
  },
  optionText: { fontSize: 15, color: '#333', lineHeight: 21 },
  backLink: { textAlign: 'center', marginTop: 24, color: '#999', fontSize: 13, fontWeight: '600' },
  resultEyebrow: { fontSize: 11, fontWeight: '800', color: '#9a3412', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  card: {
    backgroundColor: '#fafafa',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 18,
    marginBottom: 16,
  },
  cardEyebrow: { fontSize: 11, fontWeight: '800', color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  priorityItem: { fontSize: 14, color: '#333', lineHeight: 22 },
  blendItem: { fontSize: 14, color: '#333', lineHeight: 22 },
  retakeButton: { borderWidth: 2, borderColor: '#ea580c', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  retakeButtonText: { color: '#ea580c', fontWeight: '800', fontSize: 15 },
});
