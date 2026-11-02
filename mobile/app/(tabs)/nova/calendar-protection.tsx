// Native Calendar Protection: propose -> present -> approve -> try to
// apply, against the real, existing /api/nova/calendar-protection/*
// routes (server.ts) - no separate engine, no client-side state machine
// of its own beyond what's needed to drive one proposal through the
// real server states. Real execution is a hardcoded `false` source
// constant in nova-calendar-protection-service.ts regardless of what
// this screen does, so "Try to apply" can never reach a real calendar.
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { secureApiFetch, SecureApiError } from '../../../src/lib/secure-api';
import { newIdempotencyKey } from '../../../src/lib/idempotency-key';

interface CalendarProposal {
  proposalId: string;
  state: string;
  approvalFingerprint: string;
  title: string;
}

type Phase = 'form' | 'prepared' | 'awaiting_approval' | 'approved' | 'result';

export default function CalendarProtectionScreen() {
  const params = useLocalSearchParams<{ title?: string }>();
  const [title, setTitle] = useState(params.title ?? '');
  const [startIso, setStartIso] = useState('');
  const [endIso, setEndIso] = useState('');
  const [proposal, setProposal] = useState<CalendarProposal | null>(null);
  const [phase, setPhase] = useState<Phase>('form');
  const [granted, setGranted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultText, setResultText] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await secureApiFetch('/api/nova/calendar-protection/action-permission');
        const body = await res.json();
        setGranted(body?.permission?.granted === true);
      } catch {
        setGranted(false);
      }
    })();
  }, []);

  const togglePermission = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await secureApiFetch('/api/nova/calendar-protection/action-permission', {
        method: 'POST', data: { granted: !granted },
      });
      const body = await res.json();
      setGranted(body?.permission?.granted === true);
    } catch (err: unknown) {
      setError(err instanceof SecureApiError ? err.message : 'Could not update permission.');
    } finally {
      setBusy(false);
    }
  };

  const canPropose = title.trim().length > 0 && startIso.trim().length > 0 && endIso.trim().length > 0;

  const propose = async () => {
    if (!canPropose) return;
    setBusy(true);
    setError(null);
    try {
      const res = await secureApiFetch('/api/nova/calendar-protection/propose', {
        method: 'POST',
        data: { idempotencyKey: newIdempotencyKey(), startIso, endIso, title: title.trim() },
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
      const res = await secureApiFetch(`/api/nova/calendar-protection/${proposal.proposalId}/present`, { method: 'POST' });
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
      const res = await secureApiFetch(`/api/nova/calendar-protection/${proposal.proposalId}/approve`, {
        method: 'POST', data: { approved, approvalFingerprint: proposal.approvalFingerprint },
      });
      const body = await res.json();
      if (!approved) {
        setResultText('Declined. Nothing was sent to your calendar.');
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
      const res = await secureApiFetch(`/api/nova/calendar-protection/${proposal.proposalId}/execute`, { method: 'POST' });
      const body = await res.json();
      setResultText(describeExecutionOutcome(body.status));
      setPhase('result');
    } catch (err: unknown) {
      setError(err instanceof SecureApiError ? err.message : 'Could not try to apply this.');
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
          <Text style={styles.title}>Take the Load - Calendar Protection</Text>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.description}>
            Nova can prepare a specific calendar change for you to review and approve. Every step below calls a
            real server route - nothing is simulated. Real execution is turned off platform-wide right now, so
            even an approved change will not actually reach your calendar yet.
          </Text>

          <View style={styles.permissionRow}>
            <Text style={styles.permissionLabel}>Calendar action permission: {granted === null ? '...' : granted ? 'Granted' : 'Not granted'}</Text>
            <TouchableOpacity onPress={togglePermission} disabled={busy || granted === null} accessibilityRole="button" style={styles.permissionButton}>
              <Text style={styles.permissionButtonText}>{granted ? 'Withdraw' : 'Grant'}</Text>
            </TouchableOpacity>
          </View>

          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

          {phase === 'form' && (
            <View style={styles.section}>
              <TextInput
                accessibilityLabel="Title for the protected time"
                value={title} onChangeText={setTitle}
                placeholder="What should this protected time be called?"
                placeholderTextColor="#6b7280" style={styles.input}
              />
              <TextInput
                accessibilityLabel="Start time"
                value={startIso} onChangeText={setStartIso}
                placeholder="Start (e.g. 2026-03-02T14:00)"
                placeholderTextColor="#6b7280" style={styles.input}
              />
              <TextInput
                accessibilityLabel="End time"
                value={endIso} onChangeText={setEndIso}
                placeholder="End (e.g. 2026-03-02T14:30)"
                placeholderTextColor="#6b7280" style={styles.input}
              />
              <PrimaryButton label="Prepare this proposal" onPress={propose} disabled={!canPropose || busy} />
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
              <Text style={styles.statusText}>Awaiting your approval - nothing has happened yet</Text>
              <PrimaryButton label="Approve exactly this" onPress={() => approve(true)} disabled={busy} />
              <PrimaryButton label="Decline" outline onPress={() => approve(false)} disabled={busy} />
            </View>
          )}

          {phase === 'approved' && (
            <View style={styles.section}>
              <Text style={styles.statusText}>Approved - not yet applied</Text>
              <PrimaryButton label="Try to apply this" onPress={execute} disabled={busy} />
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

function describeExecutionOutcome(status: string): string {
  switch (status) {
    case 'execution_disabled':
      return 'Real execution is turned off platform-wide right now - this was approved, but nothing was actually sent to your calendar.';
    case 'calendar_action_permission_required':
      return 'Calendar action permission is no longer granted, so this could not be applied.';
    case 'superseded':
      return 'This proposal was replaced by a newer version before it could be applied - nothing was sent to your calendar.';
    case 'pilot_not_eligible':
      return "This account isn't part of the Calendar Protection pilot, so this wasn't applied.";
    case 'ambiguous':
      return 'The outcome is genuinely unknown and will not be retried automatically - nothing is confirmed either way.';
    case 'failed':
      return 'The calendar provider rejected this change.';
    case 'confirmed':
      return 'This was actually applied to your calendar.';
    default:
      return `Status: ${status}`;
  }
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
  permissionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f3f4f6', borderRadius: 12, padding: 12 },
  permissionLabel: { fontSize: 13, color: '#374151', fontWeight: '600', flexShrink: 1 },
  permissionButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#c2410c' },
  permissionButtonText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  section: { gap: 12 },
  statusText: { fontSize: 15, color: '#111827', lineHeight: 21 },
  input: { minHeight: 46, borderRadius: 12, backgroundColor: '#f3f4f6', color: '#111827', paddingHorizontal: 12, paddingVertical: 12, fontSize: 15 },
  button: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#c2410c' },
  buttonOutline: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#c2410c' },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  buttonOutlineText: { color: '#9a3412' },
  error: { color: '#b91c1c', fontSize: 13 },
  spinner: { marginTop: 8 },
});
