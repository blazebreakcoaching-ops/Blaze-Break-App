// Minimal account screen - the one piece of core UX Phase 1 was missing:
// somewhere to see your sign-in state and actually sign out. Reachable
// from Pulse's header. Full settings (notifications, plan/billing, etc.)
// is out of scope this phase - this is deliberately just identity.
import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../src/lib/auth-context';
import { getNovaMemoryConsent, setNovaMemoryConsent } from '../src/lib/nova-memory-consent';
import { useNativeTheme } from '../src/lib/native-theme';
import { Text } from '../src/lib/native-ui';
import { PersonalWelcomeSettings } from '../src/components/PersonalWelcomeSettings';
import type { NativeThemeColors, NativeAppearanceMode } from '../src/lib/native-theme-palette';

export default function AccountScreen() {
  const { user, logOut } = useAuth();
  const { mode, setMode, colors } = useNativeTheme();
  const styles = React.useMemo(() => createThemedStyles(colors), [colors]);
  const [signingOut, setSigningOut] = useState(false);
  // Paired with the uid it was loaded for, rather than reset eagerly on
  // every user change: a stale value is only ever overwritten by the
  // CURRENT user's own resolved fetch (the .then() below), never by a
  // synchronous call in the effect body itself
  // (react-hooks/set-state-in-effect) - and the uid comparison below
  // means a previous account's value is never shown as if it were this
  // one's, even for the moment before that fetch resolves.
  const [loadedConsent, setLoadedConsent] = useState<{ uid: string; value: boolean } | null>(null);
  const [consentReadError, setConsentReadError] = useState<{ uid: string; message: string } | null>(null);
  const uid = user?.uid ?? null;
  const memoryConsent = loadedConsent !== null && uid !== null && loadedConsent.uid === uid
    ? loadedConsent.value : null;

  useEffect(() => {
    if (!uid) return;
    let active = true;
    void getNovaMemoryConsent(uid)
      .then((value) => {
        if (!active) return;
        setLoadedConsent({ uid, value });
        setConsentReadError(null);
      })
      .catch(() => {
        if (!active) return;
        setLoadedConsent(null);
        setConsentReadError({ uid, message: 'Could not verify your preference. Reopen Account when connected to retry.' });
      });
    return () => { active = false; };
  }, [uid]);

  const toggleMemoryConsent = async () => {
    if (!user || memoryConsent === null) return;
    const next = !memoryConsent;
    setLoadedConsent({ uid: user.uid, value: next });
    try {
      await setNovaMemoryConsent(user.uid, next);
    } catch (e: unknown) {
      setLoadedConsent({ uid: user.uid, value: !next });
      Alert.alert('Could not update this', e instanceof Error ? e.message : 'Something went wrong.');
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logOut();
      // No manual navigation here - the root layout's own effect (see
      // app/_layout.tsx) reacts to `user` becoming null and redirects to
      // /sign-in. Navigating from both places risks a race between two
      // different destinations.
    } catch (e: unknown) {
      Alert.alert('Could not sign out', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSigningOut(false);
    }
  };

  const isAnonymous = user?.isAnonymous ?? true;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isAnonymous ? (
        <>
          <Text style={styles.title}>Temporary session</Text>
          <Text style={styles.subtitle}>
            You&apos;re using Blaze Break without an account. Your data is saved to this device&apos;s session, but
            won&apos;t follow you to another device unless you create an account.
          </Text>
          <TouchableOpacity style={styles.button} onPress={() => router.replace('/sign-up')}>
            <Text style={styles.buttonText}>Create an account</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/sign-in')}>
            <Text style={styles.link}>Already have an account? Sign in</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.title}>Signed in</Text>
          <Text style={styles.subtitle}>{user?.email}</Text>
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} disabled={signingOut}>
            {signingOut ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.signOutButtonText}>Sign out</Text>}
          </TouchableOpacity>
        </>
      )}

      {uid && !isAnonymous && <PersonalWelcomeSettings uid={uid} />}

      <View style={styles.appearanceSection}>
        <Text style={styles.appearanceTitle}>Appearance</Text>
        <Text style={styles.appearanceHint}>Use your device setting, or choose a look for Blaze Break.</Text>
        <View style={styles.appearanceRow} accessibilityRole="radiogroup" accessibilityLabel="Appearance">
          {(['light', 'dark', 'system'] as NativeAppearanceMode[]).map(choice => (
            <TouchableOpacity key={choice}
              onPress={() => setMode(choice)}
              accessibilityRole="radio"
              accessibilityState={{ checked: mode === choice }}
              accessibilityLabel={choice === 'system' ? 'System appearance' : choice === 'dark' ? 'Dark appearance' : 'Light appearance'}
              style={[styles.appearanceChoice, mode === choice && styles.appearanceChoiceActive]}
            >
              <Text style={[styles.appearanceChoiceText, mode === choice && styles.appearanceChoiceTextActive]}>
                {choice === 'system' ? 'System' : choice === 'dark' ? 'Dark' : 'Light'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {user && (
        <View style={styles.consentRow}>
          <View style={styles.consentTextGroup}>
            <Text style={styles.consentLabel}>Behavioural learning</Text>
            <Text style={styles.consentDescription}>Allow Nova to learn from your check-ins and recovery actions.</Text>
            {consentReadError?.uid === uid && (
              <Text accessibilityRole="alert" style={styles.consentError}>{consentReadError.message}</Text>
            )}
          </View>
          <TouchableOpacity
            onPress={toggleMemoryConsent}
            disabled={memoryConsent === null}
            accessibilityRole="switch"
            accessibilityLabel="Behavioural learning"
            accessibilityState={{ checked: memoryConsent === true, disabled: memoryConsent === null }}
            style={[styles.toggle, memoryConsent === true && styles.toggleOn]}
          >
            <View style={[styles.toggleDot, memoryConsent === true && styles.toggleDotOn]} />
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const createThemedStyles = (colors: NativeThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, flexGrow: 1, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  button: { backgroundColor: colors.accent, borderRadius: 12, padding: 16, alignItems: 'center' },
  buttonText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
  link: { textAlign: 'center', marginTop: 16, color: colors.accent, fontWeight: '600' },
  signOutButton: { borderWidth: 1.5, borderColor: colors.danger, borderRadius: 12, padding: 16, alignItems: 'center' },
  signOutButtonText: { color: colors.danger, fontWeight: '700', fontSize: 16 },
  consentRow: { marginTop: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, gap: 12 },
  consentTextGroup: { flex: 1, gap: 2 },
  consentLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  consentDescription: { fontSize: 12, color: colors.muted, lineHeight: 16 },
  consentError: { fontSize: 12, color: colors.danger, lineHeight: 17, marginTop: 4 },
  toggle: { width: 44, height: 28, borderRadius: 999, backgroundColor: colors.border, padding: 3, justifyContent: 'center' },
  toggleOn: { backgroundColor: colors.accent },
  toggleDot: { width: 22, height: 22, borderRadius: 999, backgroundColor: colors.card, alignSelf: 'flex-start' },
  toggleDotOn: { alignSelf: 'flex-end' },
  appearanceSection: { gap: 10, marginTop: 24, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  appearanceTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  appearanceHint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  appearanceRow: { flexDirection: 'row', gap: 8 },
  appearanceChoice: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10, borderColor: colors.border, backgroundColor: colors.surface },
  appearanceChoiceActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  appearanceChoiceText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  appearanceChoiceTextActive: { color: colors.accent, fontWeight: '800' },
});
