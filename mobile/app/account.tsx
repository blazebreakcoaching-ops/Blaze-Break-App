// Minimal account screen - the one piece of core UX Phase 1 was missing:
// somewhere to see your sign-in state and actually sign out. Reachable
// from Pulse's header. Full settings (notifications, plan/billing, etc.)
// is out of scope this phase - this is deliberately just identity.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../src/lib/auth-context';
import { getNovaMemoryConsent, setNovaMemoryConsent } from '../src/lib/nova-memory-consent';

export default function AccountScreen() {
  const { user, logOut } = useAuth();
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
    <View style={styles.container}>
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
            {signingOut ? <ActivityIndicator color="#dc2626" /> : <Text style={styles.signOutButtonText}>Sign out</Text>}
          </TouchableOpacity>
        </>
      )}

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  button: { backgroundColor: '#ea580c', borderRadius: 12, padding: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  link: { textAlign: 'center', marginTop: 16, color: '#ea580c', fontWeight: '600' },
  signOutButton: { borderWidth: 1.5, borderColor: '#dc2626', borderRadius: 12, padding: 16, alignItems: 'center' },
  signOutButtonText: { color: '#dc2626', fontWeight: '700', fontSize: 16 },
  consentRow: { marginTop: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, gap: 12 },
  consentTextGroup: { flex: 1, gap: 2 },
  consentLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  consentDescription: { fontSize: 12, color: '#6b7280', lineHeight: 16 },
  consentError: { fontSize: 12, color: '#b91c1c', lineHeight: 17, marginTop: 4 },
  toggle: { width: 44, height: 28, borderRadius: 999, backgroundColor: '#e5e7eb', padding: 3, justifyContent: 'center' },
  toggleOn: { backgroundColor: '#16a34a' },
  toggleDot: { width: 22, height: 22, borderRadius: 999, backgroundColor: '#fff', alignSelf: 'flex-start' },
  toggleDotOn: { alignSelf: 'flex-end' },
});
