// RN port of ../../../src/components/BLAMEResetOverlay.tsx - same step
// order/prompts/timing (Breathe is the one legitimately timed step;
// everything else is self-paced), same Firestore write shape, same
// points. Voice mode is out of Phase 1 entirely (see
// BlameLocateAcceptExchange.tsx's own note) - no entitlement fetch, no
// voice button, nothing to gate.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addDoc, collection } from 'firebase/firestore';
import { getDb, auth } from '../../../src/lib/firebase';
import { secureApiFetch } from '../../../src/lib/secure-api';
import { usePoints } from '../../../src/lib/use-points';
import { BlameLocateAcceptExchange, BlameExchangeSummary } from '../../../src/components/BlameLocateAcceptExchange';

type Speed = 'mini' | 'full';
type ManageChoice = 'delete' | 'delegate' | 'do';
type StepKey = 'breathe' | 'locateAccept' | 'manage' | 'empower' | 'manageEmpower';

interface BlameStep {
  key: StepKey;
  letter: string;
  title: string;
  instruction: string;
  prompt: string;
  duration: number;
  hasChoice?: boolean;
}

const FULL_STEPS: BlameStep[] = [
  {
    key: 'breathe', letter: 'B', title: 'Breathe and Become Aware',
    instruction: 'A physiological sigh: double inhale through your nose, then a long exhale through your mouth. Repeat once more.',
    prompt: "I'm activated. I'm not broken.",
    duration: 20,
  },
  {
    key: 'locateAccept', letter: 'L · A', title: 'Locate + Accept',
    instruction: 'Name the trigger, then acknowledge it without fighting it.',
    prompt: "What am I actually reacting to — and what's true right now, even if I don't like it?",
    duration: 0,
  },
  {
    key: 'manage', letter: 'M', title: 'Manage What You Can',
    instruction: 'Choose exactly one, whenever you’re ready.',
    prompt: "What's the smallest move that helps?",
    duration: 0, hasChoice: true,
  },
  {
    key: 'empower', letter: 'E', title: 'Empower Yourself to Evolve',
    instruction: 'Take the action, then ask:',
    prompt: 'What would the upgraded version of me do next?',
    duration: 0,
  },
];

const MINI_STEPS: BlameStep[] = [
  {
    key: 'breathe', letter: 'B', title: 'Breathe and Become Aware',
    instruction: 'A physiological sigh: double inhale through your nose, then a long exhale through your mouth.',
    prompt: "I'm activated. I'm not broken.",
    duration: 10,
  },
  {
    key: 'locateAccept', letter: 'L · A', title: 'Locate + Accept',
    instruction: 'Name the trigger, then acknowledge it without fighting it.',
    prompt: "What am I actually reacting to — and what's true right now, even if I don't like it?",
    duration: 0,
  },
  {
    key: 'manageEmpower', letter: 'M · E', title: 'Manage + Empower',
    instruction: 'Choose one, then act, whenever you’re ready.',
    prompt: "What's the smallest move that helps?",
    duration: 0, hasChoice: true,
  },
];

const MANAGE_CHOICES: { key: ManageChoice; label: string; description: string }[] = [
  { key: 'delete', label: 'Delete', description: 'Say no, cancel it, remove it from the list.' },
  { key: 'delegate', label: 'Delegate', description: 'Hand it to someone else — including your future self.' },
  { key: 'do', label: 'Do', description: 'The smallest meaningful step, right now.' },
];

type Phase = 'intro' | 'step' | 'exchange' | 'complete';

export default function BlameResetScreen() {
  const { awardPoints } = usePoints();
  const [phase, setPhase] = useState<Phase>('intro');
  const [speed, setSpeed] = useState<Speed | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [manageChoice, setManageChoice] = useState<ManageChoice | null>(null);
  const [exchangeSummary, setExchangeSummary] = useState<BlameExchangeSummary | null>(null);
  const openedAtRef = useRef(0);

  const steps = speed === 'mini' ? MINI_STEPS : FULL_STEPS;
  const currentStep = steps[stepIndex];

  const advanceTo = (nextIndex: number) => {
    if (nextIndex >= steps.length) {
      setPhase('complete');
      return;
    }
    setStepIndex(nextIndex);
    const next = steps[nextIndex];
    if (next.key === 'locateAccept') {
      setPhase('exchange');
    } else {
      setPhase('step');
      setTimeLeft(next.duration);
    }
  };

  useEffect(() => {
    if (phase !== 'step' || currentStep?.key !== 'breathe') return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          advanceTo(stepIndex + 1);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stepIndex]);

  const handleSelectSpeed = (s: Speed) => {
    const stepList = s === 'mini' ? MINI_STEPS : FULL_STEPS;
    setSpeed(s);
    setStepIndex(0);
    setTimeLeft(stepList[0].duration);
    setPhase('step');
    openedAtRef.current = Date.now();
  };

  const handleExchangeContinue = (summary: BlameExchangeSummary) => {
    setExchangeSummary(summary);
    advanceTo(stepIndex + 1);
  };

  const handleCompleteReset = async () => {
    const points = speed === 'full' ? 25 : 15;
    awardPoints(points);

    const elapsed = openedAtRef.current ? Math.round((Date.now() - openedAtRef.current) / 1000) : 0;
    const durationSeconds = Math.min(Math.max(elapsed, 0), 1800);

    const uid = auth.currentUser?.uid;
    if (uid) {
      (async () => {
        try {
          const db = await getDb();
          await addDoc(collection(db, 'users', uid, 'blame_resets'), {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            speed,
            durationSeconds,
            manageChoice,
            source: 'user',
            exchangeMode: exchangeSummary?.mode ?? null,
            exchangeTurns: exchangeSummary?.mode === 'text' ? exchangeSummary.turns : null,
          });
        } catch {
          // Non-fatal - the completion still counts for this session even if the write fails.
        }
      })();
      secureApiFetch('/api/user/mark-activity', { method: 'POST', data: { activity: 'blameReset' } }).catch(() => {});
    }

    router.back();
  };

  const isBreatheActive = phase === 'step' && currentStep?.key === 'breathe';

  if (phase === 'intro') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.eyebrow}>BLAME Reset</Text>
          <Text style={styles.title}>Stop the spiral</Text>
          <Text style={styles.subtitle}>
            A short interrupt for the moment you&apos;re about to react instead of respond — Breathe, Locate, Accept,
            Manage, Empower. Not a personality change. Just a brake, at your own pace.
          </Text>
          <TouchableOpacity style={styles.choiceCard} onPress={() => handleSelectSpeed('mini')}>
            <Text style={styles.choiceTitle}>Quick Reset</Text>
            <Text style={styles.choiceSubtitle}>
              For tension that&apos;s building but hasn&apos;t reached crisis mode — Manage and Empower merged into one
              step.
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.choiceCard} onPress={() => handleSelectSpeed('full')}>
            <Text style={styles.choiceTitle}>Full Reset</Text>
            <Text style={styles.choiceSubtitle}>For a genuine spike — all five steps, unhurried.</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === 'exchange' && currentStep) {
    // This is the Nova crisis-support text exchange - the single most
    // safety-critical screen in the app. Without KeyboardAvoidingView,
    // the software keyboard can cover the input row and Send button on
    // smaller devices, right when someone is mid-activation and least
    // equipped to fight the UI to reply.
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
        >
          <ScrollView contentContainerStyle={styles.container}>
            <BlameLocateAcceptExchange
              title={currentStep.title}
              instruction={currentStep.instruction}
              prompt={currentStep.prompt}
              onContinue={handleExchangeContinue}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (phase === 'complete') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.centered}>
          <Text style={styles.completeTitle}>That&apos;s it</Text>
          <Text style={styles.completeBody}>
            {manageChoice
              ? `You chose to ${manageChoice}. Go do that next, whenever you're ready.`
              : "Whatever comes next, it comes from choice — not activation."}
          </Text>
          <TouchableOpacity style={styles.doneButton} onPress={handleCompleteReset}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // phase === 'step'. ScrollView (not a plain View) for the same reason
  // as the other phases - the Manage step's 3 choice cards plus prompt
  // text can overflow a small screen or larger accessibility text size.
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.centered}>
        <Text style={styles.stepMeta}>
          Step {stepIndex + 1} of {steps.length}
          {isBreatheActive ? ` · ${timeLeft}s` : ''}
        </Text>
        <Text style={styles.stepLetter}>{currentStep.letter}</Text>
        <Text style={styles.stepTitle}>{currentStep.title}</Text>
        <Text style={styles.stepInstruction}>{currentStep.instruction}</Text>
        <Text style={styles.stepPrompt}>&ldquo;{currentStep.prompt}&rdquo;</Text>

        {currentStep.hasChoice && (
          <View style={styles.choiceList}>
            {MANAGE_CHOICES.map((choice) => {
              const selected = manageChoice === choice.key;
              return (
                <TouchableOpacity
                  key={choice.key}
                  style={[styles.manageCard, selected && styles.manageCardSelected]}
                  onPress={() => setManageChoice(choice.key)}
                >
                  <Text style={styles.manageLabel}>{choice.label}</Text>
                  <Text style={styles.manageDescription}>{choice.description}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {!isBreatheActive && (
          <TouchableOpacity style={styles.continueButton} onPress={() => advanceTo(stepIndex + 1)}>
            <Text style={styles.continueButtonText}>Continue</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  container: { padding: 24, paddingTop: 32 },
  centered: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  eyebrow: { fontSize: 11, fontWeight: '800', color: '#9a3412', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 12 },
  subtitle: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 28 },
  choiceCard: { backgroundColor: '#fafafa', borderRadius: 16, borderWidth: 1, borderColor: '#eee', padding: 18, marginBottom: 12 },
  choiceTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  choiceSubtitle: { fontSize: 12, color: '#777', lineHeight: 17 },
  stepMeta: { fontSize: 11, fontWeight: '800', color: '#9a3412', textTransform: 'uppercase', letterSpacing: 1, fontVariant: ['tabular-nums'] },
  stepLetter: { fontSize: 32, fontWeight: '900', marginVertical: 8 },
  stepTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  stepInstruction: { fontSize: 13, color: '#666', textAlign: 'center', lineHeight: 18, marginTop: 6 },
  stepPrompt: { fontSize: 15, fontWeight: '700', fontStyle: 'italic', textAlign: 'center', marginTop: 8, marginBottom: 8 },
  choiceList: { width: '100%', gap: 10, marginTop: 12 },
  manageCard: { borderWidth: 1, borderColor: '#eee', borderRadius: 14, padding: 14, backgroundColor: '#fafafa' },
  manageCardSelected: { borderColor: '#ea580c', backgroundColor: '#fff7ed' },
  manageLabel: { fontSize: 14, fontWeight: '700' },
  manageDescription: { fontSize: 12, color: '#777', marginTop: 2 },
  continueButton: { backgroundColor: '#ea580c', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, marginTop: 20 },
  continueButtonText: { color: '#fff', fontWeight: '800', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 },
  completeTitle: { fontSize: 24, fontWeight: '800' },
  completeBody: { fontSize: 13, color: '#666', textAlign: 'center', lineHeight: 19, maxWidth: 280 },
  doneButton: { backgroundColor: '#ea580c', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 48, marginTop: 16 },
  doneButtonText: { color: '#fff', fontWeight: '800', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 },
});
