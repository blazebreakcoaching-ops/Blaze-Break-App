// Native Calendar Protection: propose -> present -> approve -> try to
// apply, against the real, existing /api/nova/calendar-protection/*
// routes (server.ts) - no separate engine, no client-side state machine
// of its own beyond what's needed to drive one proposal through the
// real server states. Real execution is a hardcoded `false` source
// constant in nova-calendar-protection-service.ts regardless of what
// this screen does, so "Try to apply" can never reach a real calendar.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from '../../../src/lib/native-ui';
import { useNativeTheme } from '../../../src/lib/native-theme';
import type { NativeThemeColors } from '../../../src/lib/native-theme-palette';
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
  startIso: string;
  endIso: string;
}

type Phase = 'form' | 'prepared' | 'awaiting_approval' | 'approved' | 'result';

export default function CalendarProtectionScreen() {
  const styles = useThemedStyles();
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
    let cancelled = false;
    void (async () => {
      try {
        const res = await secureApiFetch('/api/nova/calendar-protection/action-permission');
        const body = await res.json();
        if (!cancelled) setGranted(body?.permission?.granted === true);
      } catch {
        if (!cancelled) setGranted(false);
      }
    })();
    // Guards against setting state after navigating back while this
    // request is still in flight (an interrupted request, not just a
    // slow one).
    return () => { cancelled = true; };
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
      // 200 does not mean approved: the backend can return a
      // not_awaiting_approval or superseded state without changing
      // anything. Never advance the UI on those outcomes.
      if (body.status !== (approved ? 'approved' : 'declined') || !body.proposal) {
        setError('The server did not record this decision. Review the proposal status before trying again.');
        return;
      }
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
            <Ionicons name="chevron-back" size={24} color={styles.colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Take the Load - Calendar Protection</Text>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.description}>
            Nova can prepare a specific calendar change for you to review and approve. Every step below calls a
            real server route. Preparing and approving the proposal are real recorded steps, but external execution is disabled, so
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
                placeholderTextColor={styles.colors.muted} style={styles.input}
              />
              <TextInput
                accessibilityLabel="Start time"
                value={startIso} onChangeText={setStartIso}
                placeholder="Start (e.g. 2026-03-02T14:00)"
                placeholderTextColor={styles.colors.muted} style={styles.input}
              />
              <TextInput
                accessibilityLabel="End time"
                value={endIso} onChangeText={setEndIso}
                placeholder="End (e.g. 2026-03-02T14:30)"
                placeholderTextColor={styles.colors.muted} style={styles.input}
              />
              <PrimaryButton label="Prepare this proposal" onPress={propose} disabled={!canPropose || busy} />
            </View>
          )}

          {proposal && ['prepared', 'awaiting_approval', 'approved'].includes(phase) && (
            <View style={styles.proposalSummary} accessible accessibilityLabel="Calendar proposal details for review">
              <Text style={styles.proposalSummaryTitle}>Review the exact calendar proposal</Text>
              <Text style={styles.proposalSummaryText}>Title: {proposal.title}</Text>
              <Text style={styles.proposalSummaryText}>Start: {proposal.startIso}</Text>
              <Text style={styles.proposalSummaryText}>End: {proposal.endIso}</Text>
              <Text style={styles.proposalSummaryNote}>
                These are the details returned by the server. Approval applies only to this proposal;
                no calendar change has been made.
              </Text>
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

          {busy && <ActivityIndicator color={styles.colors.accent} style={styles.spinner} />}
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
  const styles = useThemedStyles();
  return (
    <TouchableOpacity
      onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={[styles.button, outline && styles.buttonOutline, disabled && styles.buttonDisabled]}
    >
      <Text style={[styles.buttonText, outline && styles.buttonOutlineText]}>{label}</Text>
    </TouchableOpacity>
  );
}

const createThemedStyles = (colors: NativeThemeColors) => StyleSheet.create({
  flex: { flex: 1 }, safeArea: { flex: 1, backgroundColor: colors.card },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, borderBottomWidth: 1, borderColor: colors.border },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: colors.text, flexShrink: 1 },
  content: { padding: 18, gap: 16, paddingBottom: 40 },
  description: { fontSize: 13, lineHeight: 19, color: colors.muted },
  permissionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: 12, padding: 12 },
  permissionLabel: { fontSize: 13, color: colors.muted, fontWeight: '600', flexShrink: 1 },
  permissionButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.accent },
  permissionButtonText: { color: colors.onAccent, fontWeight: '700', fontSize: 12 },
  section: { gap: 12 },
  proposalSummary: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, gap: 8, backgroundColor: colors.surface },
  proposalSummaryTitle: { fontSize: 15, color: colors.text, fontWeight: '700' },
  proposalSummaryText: { fontSize: 14, color: colors.text, lineHeight: 21 },
  proposalSummaryNote: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  statusText: { fontSize: 15, color: colors.text, lineHeight: 21 },
  input: { minHeight: 46, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15 },
  button: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  buttonOutline: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.accent },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: colors.onAccent, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  buttonOutlineText: { color: colors.accent },
  error: { color: colors.danger, fontSize: 13 },
  spinner: { marginTop: 8 },
});

function useThemedStyles() {
  const { colors } = useNativeTheme();
  return React.useMemo(() => ({ ...createThemedStyles(colors), colors }), [colors]);
}
