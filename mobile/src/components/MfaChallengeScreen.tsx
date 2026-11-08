import React, { useState } from 'react';
import { View, TouchableOpacity, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput } from '../lib/native-ui';
import { useNativeTheme } from '../lib/native-theme';
import { useAuth } from '../lib/auth-context';
import type { MfaMode } from '../lib/mfa-challenge';

// Native two-factor challenge for accounts with 2FA on. Shown by the root
// layout BEFORE any app screen or Firestore read. Cancelling signs out:
// there is no way past this screen without a server-verified code.
export function MfaChallengeScreen() {
  const { colors } = useNativeTheme();
  const { verifyMfa, logOut } = useAuth();
  const [mode, setMode] = useState<MfaMode>('code');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const message = await verifyMfa(mode, value);
    setBusy(false);
    if (message) {
      setError(message);
      setValue('');
    }
  };

  const switchMode = () => {
    setMode((m) => (m === 'code' ? 'recovery' : 'code'));
    setValue('');
    setError(null);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.inner}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Two-factor verification</Text>
        <Text style={[styles.body, { color: colors.muted }]}>
          {mode === 'code'
            ? 'Enter the 6-digit code from your authenticator app to continue.'
            : 'Enter one of the recovery codes you saved when you turned on two-factor. Each code works once.'}
        </Text>
        <TextInput
          accessibilityLabel={mode === 'code' ? 'Six-digit authenticator code' : 'Recovery code'}
          style={[styles.input, { borderColor: error ? colors.danger : colors.border, color: colors.text, backgroundColor: colors.input }]}
          value={value}
          onChangeText={setValue}
          keyboardType={mode === 'code' ? 'number-pad' : 'default'}
          textContentType={mode === 'code' ? 'oneTimeCode' : 'none'}
          autoComplete={mode === 'code' ? 'one-time-code' : 'off'}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={mode === 'code' ? 6 : 20}
          editable={!busy}
          onSubmitEditing={submit}
          placeholder={mode === 'code' ? '123456' : 'Recovery code'}
          placeholderTextColor={colors.subtle}
        />
        {error ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : null}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          onPress={submit}
          style={[styles.primary, { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }]}
        >
          {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={[styles.primaryText, { color: colors.onAccent }]}>Verify</Text>}
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={switchMode} disabled={busy} style={styles.link}>
          <Text style={[styles.linkText, { color: colors.accent }]}>
            {mode === 'code' ? 'Use a recovery code instead' : 'Use my authenticator app instead'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={() => { void logOut(); }} disabled={busy} style={styles.link}>
          <Text style={[styles.linkText, { color: colors.muted }]}>Cancel and sign out</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  inner: { padding: 28, gap: 14, width: '100%', maxWidth: 440, alignSelf: 'center' },
  title: { fontSize: 23, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 23, textAlign: 'center' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 20, letterSpacing: 4, textAlign: 'center', minHeight: 52 },
  error: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  primary: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  primaryText: { fontWeight: '800', fontSize: 16 },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontWeight: '700', fontSize: 14 },
});
