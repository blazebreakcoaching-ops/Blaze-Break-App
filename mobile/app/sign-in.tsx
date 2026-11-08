import { useNativeI18n } from '../src/lib/i18n';
import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { Text, TextInput } from '../src/lib/native-ui';
import { useNativeTheme } from '../src/lib/native-theme';
import type { NativeThemeColors } from '../src/lib/native-theme-palette';
import { router } from 'expo-router';
import { useAuth } from '../src/lib/auth-context';

export default function SignInScreen() {
  const styles = useThemedStyles();
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const { t, tag, dir } = useNativeI18n();

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setFormError(t('auth.missingFields'));
      return;
    }
    setFormError('');
    setSubmitting(true);
    try {
      await signInWithEmail(email.trim(), password);
      router.back();
    } catch (e: unknown) {
      Alert.alert('Could not sign in', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={[styles.container, { direction: dir }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.title} accessibilityRole="header" accessibilityLanguage={tag}>{t('auth.welcomeBack')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('auth.email')}
          accessibilityLabel={t('auth.email')}
          autoComplete="email"
          textContentType="username"
          returnKeyType="next"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder={t('auth.password')}
          accessibilityLabel={t('auth.password')}
          autoComplete="current-password"
          textContentType="password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {formError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{formError}</Text> : null}
        <TouchableOpacity style={styles.button} accessibilityRole="button" accessibilityLabel={t('auth.signIn')} accessibilityState={{ disabled: submitting, busy: submitting }} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color={styles.colors.onAccent} /> : <Text style={styles.buttonText}>{t('auth.signIn')}</Text>}
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="link" accessibilityLabel={t('auth.createAccount')} style={styles.linkTouch} onPress={() => router.replace('/sign-up')}>
          <Text style={styles.link}>{t('auth.noAccount')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createThemedStyles = (colors: NativeThemeColors) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.card },
  container: { flexGrow: 1, padding: 24, justifyContent: 'center', backgroundColor: colors.background },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 24, textAlign: 'center' },
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
  error: { fontSize: 14, color: colors.danger, marginTop: 4, marginBottom: 8 },
  linkTouch: { minHeight: 48, justifyContent: 'center' },
  link: { textAlign: 'center', marginTop: 16, color: colors.accent, fontWeight: '600' },
});

function useThemedStyles() {
  const { colors } = useNativeTheme();
  return React.useMemo(() => ({ ...createThemedStyles(colors), colors }), [colors]);
}
