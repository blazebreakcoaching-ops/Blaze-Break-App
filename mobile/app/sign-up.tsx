import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { Text, TextInput } from '../src/lib/native-ui';
import { useNativeTheme } from '../src/lib/native-theme';
import type { NativeThemeColors } from '../src/lib/native-theme-palette';
import { router } from 'expo-router';
import { useAuth } from '../src/lib/auth-context';

export default function SignUpScreen() {
  const styles = useThemedStyles();
  const { signUpWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async () => {
    // Previously a silent no-op on invalid input - pressing "Create
    // account" with an empty email or a too-short password did nothing,
    // with zero visible feedback about why.
    if (!email.trim()) {
      setFormError('Enter an email address.');
      return;
    }
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await signUpWithEmail(email.trim(), password);
      router.back();
    } catch (e: unknown) {
      Alert.alert('Could not create account', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Save your progress</Text>
        <Text style={styles.subtitle}>
          You can already use Blaze Break without an account. Creating one keeps your Check-in, Pulse
          history, and Reset activity synced if you switch devices.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password (min 6 characters)"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {formError && <Text style={styles.error}>{formError}</Text>}
        <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color={styles.colors.onAccent} /> : <Text style={styles.buttonText}>Create account</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace('/sign-in')}>
          <Text style={styles.link}>Already have an account? Sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createThemedStyles = (colors: NativeThemeColors) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.card },
  container: { flexGrow: 1, padding: 24, justifyContent: 'center', backgroundColor: colors.background },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
  link: { textAlign: 'center', marginTop: 16, color: colors.accent, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13, marginBottom: 12, textAlign: 'center' },
});

function useThemedStyles() {
  const { colors } = useNativeTheme();
  return React.useMemo(() => ({ ...createThemedStyles(colors), colors }), [colors]);
}
