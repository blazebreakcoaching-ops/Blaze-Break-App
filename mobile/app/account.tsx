// Minimal account screen - the one piece of core UX Phase 1 was missing:
// somewhere to see your sign-in state and actually sign out. Reachable
// from Pulse's header. Full settings (notifications, plan/billing, etc.)
// is out of scope this phase - this is deliberately just identity.
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../src/lib/auth-context';

export default function AccountScreen() {
  const { user, logOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

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
});
