// Native Task Deferral: identify -> clarify control -> prepare -> present
// -> approve -> run the simulation, against the real, existing
// /api/nova/task-deferral/* routes. nova-task-deferral-connector-
// contract.ts has no real connector implementation at all - execute
// always runs through the permanently mock-only one, so this can never
// touch a real Asana/Monday/Jira task regardless of this screen.
import React, { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { secureApiFetch, SecureApiError } from '../../../src/lib/secure-api';
import { newIdempotencyKey } from '../../../src/lib/idempotency-key';

interface TaskProposal {
  proposalId: string;
  state: string;
  approvalFingerprint: string;
}

type ControlAnswer = 'yes' | 'no' | 'unsure';
type Phase = 'describe' | 'clarify' | 'blocked' | 'prepare' | 'prepared' | 'awaiting_approval' | 'approved' | 'result';

export default function TaskDeferralScreen() {
  const params = useLocalSearchParams<{ description?: string }>();
  const [taskDescription, setTaskDescription] = useState(params.description ?? '');
  const [proposal, setProposal] = useState<TaskProposal | null>(null);
  const [phase, setPhase] = useState<Phase>('describe');
  const [reasoning, setReasoning] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultText, setResultText] = useState<string | null>(null);

  const identify = async () => {
    if (!taskDescription.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await secureApiFetch('/api/nova/task-deferral/identify', {
        method: 'POST',
        data: { idempotencyKey: newIdempotencyKey(), taskDescription: taskDescription.trim(), currentDueDescription: null },
      });
      const body = await res.json();
      setProposal(body.proposal);
      setPhase('clarify');
    } catch (err: unknown) {
      setError(err instanceof SecureApiError ? err.message : 'Could not tell Nova about this task.');
    } finally {
      setBusy(false);
    }
  };

  const clarify = async (userControlsDeadline: ControlAnswer, userControlsOwnership: ControlAnswer) => {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      const res = await secureApiFetch(`/api/nova/task-deferral/${proposal.proposalId}/clarify-control`, {
        method: 'POST', data: { userControlsDeadline, userControlsOwnership },
      });
      const body = await res.json();
      if (body.status === 'requires_other_person') {
        setPhase('blocked');
        return;
      }
      setProposal(body.proposal);
      setPhase('prepare');
    } catch (err: unknown) {
      setError(err instanceof SecureApiError ? err.message : 'Could not record your answer.');
    } finally {
      setBusy(false);
    }
  };

  const canPrepare = reasoning.trim().length > 0 && newDueDate.trim().length > 0;

  const prepare = async () => {
    if (!proposal || !canPrepare) return;
    setBusy(true);
    setError(null);
    try {
      const res = await secureApiFetch(`/api/nova/task-deferral/${proposal.proposalId}/prepare`, {
        method: 'POST',
        data: {
          reasonablyPostponable: true,
          postponementReasoning: reasoning.trim(),
          proposedNewDueDescription: newDueDate.trim(),
          proposedNewPriority: null,
          consequences: [],
          uncertainties: [],
        },
      });
      const body = await res.json();
      setProposal(body.proposal);
      setPhase('prepared');
    } catch (err: unknown) {
      setError(err instanceof SecureApiError ? err.message : 'Could not prepare this proposal.');
    } finally {
      setBusy(false);
    }
  };

  const present = async () => {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      const res = await secureApiFetch(`/api/nova/task-deferral/${proposal.proposalId}/present`, { method: 'POST' });
      const body = await res.json();
      setProposal(body.proposal);
      setPhase('awaiting_approval');
    } catch (err: unknown) {
      setError(err instanceof SecureApiError ? err.message : 'Could not show this for approval.');
    } finally {
      setBusy(false);
    }
  };

  const approve = async (approved: boolean) => {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      const res = await secureApiFetch(`/api/nova/task-deferral/${proposal.proposalId}/approve`, {
        method: 'POST', data: { approved, approvalFingerprint: proposal.approvalFingerprint },
      });
      const body = await res.json();
      if (!approved) {
        setResultText('Declined. No real task was touched.');
        setPhase('result');
        return;
      }
      setProposal(body.proposal ?? proposal);
      setPhase('approved');
    } catch (err: unknown) {
      setError(err instanceof SecureApiError ? err.message : 'Could not record your decision.');
    } finally {
      setBusy(false);
    }
  };

  const execute = async () => {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      const res = await secureApiFetch(`/api/nova/task-deferral/${proposal.proposalId}/execute`, { method: 'POST' });
      const body = await res.json();
      setResultText(body.status === 'confirmed'
        ? 'Simulation complete. No real Asana, Monday, or Jira task was modified - this only ever touches a mocked, practice task list.'
        : `Status: ${body.status}`);
      setPhase('result');
    } catch (err: unknown) {
      setError(err instanceof SecureApiError ? err.message : 'Could not run the simulation.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back to Nova" style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.title}>Take the Load - Move a Task</Text>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.description}>
            Nova can help you work out whether a task can wait, and prepare a change for you to review. This only
            ever touches a mocked, practice task list here - nothing is sent to your real Asana, Monday, or Jira account.
          </Text>

          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

          {phase === 'describe' && (
            <View style={styles.section}>
              <TextInput
                accessibilityLabel="Task description"
                value={taskDescription} onChangeText={setTaskDescription}
                placeholder="What's the task?" placeholderTextColor="#6b7280" style={styles.input}
              />
              <PrimaryButton label="Tell Nova about this task" onPress={identify} disabled={!taskDescription.trim() || busy} />
            </View>
          )}

          {phase === 'clarify' && <ClarifyQuestions onSubmit={clarify} busy={busy} />}

          {phase === 'blocked' && (
            <View style={styles.section}>
              <Text style={styles.statusText}>
                This isn't fully yours to move alone, so Nova can't prepare a deferral here - this would need the
                other person involved.
              </Text>
              <PrimaryButton label="Back to Nova" onPress={() => router.back()} />
            </View>
          )}

          {phase === 'prepare' && (
            <View style={styles.section}>
              <TextInput
                accessibilityLabel="Proposed new due date"
                value={newDueDate} onChangeText={setNewDueDate}
                placeholder="Proposed new due date (e.g. next Friday)"
                placeholderTextColor="#6b7280" style={styles.input}
              />
              <TextInput
                accessibilityLabel="Why, or why not"
                value={reasoning} onChangeText={setReasoning}
                placeholder="Why (or why not)?" placeholderTextColor="#6b7280" style={styles.input}
                multiline
              />
              <PrimaryButton label="Prepare this proposal" onPress={prepare} disabled={!canPrepare || busy} />
            </View>
          )}

          {phase === 'prepared' && (
            <View style={styles.section}>
              <Text style={styles.statusText}>Prepared - not yet shown for approval</Text>
              <PrimaryButton label="Show for approval" onPress={present} disabled={busy} />
            </View>
          )}

          {phase === 'awaiting_approval' && (
            <View style={styles.section}>
              <Text style={styles.statusText}>Awaiting your approval - nothing has changed yet</Text>
              <PrimaryButton label="Approve exactly this" onPress={() => approve(true)} disabled={busy} />
              <PrimaryButton label="Decline" outline onPress={() => approve(false)} disabled={busy} />
            </View>
          )}

          {phase === 'approved' && (
            <View style={styles.section}>
              <Text style={styles.statusText}>Approved - not yet simulated</Text>
              <PrimaryButton label="Run the simulation" onPress={execute} disabled={busy} />
            </View>
          )}

          {phase === 'result' && resultText && (
            <View style={styles.section}>
              <Text style={styles.statusText}>{resultText}</Text>
              <PrimaryButton label="Done" onPress={() => router.back()} />
            </View>
          )}

          {busy && <ActivityIndicator color="#9a3412" style={styles.spinner} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Both control questions live together so the single clarify-control
// call (the server takes both answers at once) only ever fires once per
// genuine submission, not once per individual tap.
function ClarifyQuestions({ onSubmit, busy }: {
  onSubmit: (deadline: ControlAnswer, ownership: ControlAnswer) => void;
  busy: boolean;
}) {
  const [deadline, setDeadline] = useState<ControlAnswer | null>(null);
  const [ownership, setOwnership] = useState<ControlAnswer | null>(null);
  return (
    <View style={styles.section}>
      <Text style={styles.statusText}>Do you control when this is due?</Text>
      <AnswerRow onAnswer={setDeadline} selected={deadline} />
      <Text style={styles.statusText}>Is this task yours alone to move?</Text>
      <AnswerRow onAnswer={setOwnership} selected={ownership} />
      <PrimaryButton
        label="Continue"
        disabled={!deadline || !ownership || busy}
        onPress={() => deadline && ownership && onSubmit(deadline, ownership)}
      />
    </View>
  );
}

function AnswerRow({ onAnswer, selected }: { onAnswer: (a: ControlAnswer) => void; selected: ControlAnswer | null }) {
  const options: ControlAnswer[] = ['yes', 'no', 'unsure'];
  return (
    <View style={styles.answerRow}>
      {options.map((option) => (
        <TouchableOpacity
          key={option}
          onPress={() => onAnswer(option)}
          accessibilityRole="button"
          accessibilityLabel={option}
          style={[styles.answerChip, selected === option && styles.answerChipActive]}
        >
          <Text style={[styles.answerChipText, selected === option && styles.answerChipTextActive]}>{option}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled, outline }: {
  label: string; onPress: () => void; disabled?: boolean; outline?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={[styles.button, outline && styles.buttonOutline, disabled && styles.buttonDisabled]}
    >
      <Text style={[styles.buttonText, outline && styles.buttonOutlineText]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, safeArea: { flex: 1, backgroundColor: '#fff' },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, borderBottomWidth: 1, borderColor: '#e5e7eb' },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: '#111827', flexShrink: 1 },
  content: { padding: 18, gap: 16, paddingBottom: 40 },
  description: { fontSize: 13, lineHeight: 19, color: '#4b5563' },
  section: { gap: 12 },
  statusText: { fontSize: 15, color: '#111827', lineHeight: 21 },
  input: { minHeight: 46, borderRadius: 12, backgroundColor: '#f3f4f6', color: '#111827', paddingHorizontal: 12, paddingVertical: 12, fontSize: 15 },
  answerRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  answerChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#e5e7eb' },
  answerChipActive: { backgroundColor: '#c2410c', borderColor: '#c2410c' },
  answerChipText: { fontSize: 13, color: '#4b5563', fontWeight: '600' },
  answerChipTextActive: { color: '#fff' },
  button: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#c2410c' },
  buttonOutline: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#c2410c' },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  buttonOutlineText: { color: '#9a3412' },
  error: { color: '#b91c1c', fontSize: 13 },
  spinner: { marginTop: 8 },
});
