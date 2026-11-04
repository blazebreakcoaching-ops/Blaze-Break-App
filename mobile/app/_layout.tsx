import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/lib/auth-context';
import { NativeThemeProvider, useNativeTheme } from '../src/lib/native-theme';

// The anonymous-first pattern means `user` is set as soon as loading
// finishes for essentially everyone (even a brand-new visitor - see
// auth-context.tsx), so sign-in/sign-up are NOT a blocking gate in front
// of the tabs the way a typical "logged out" screen would be. They're
// reachable as modal routes (see app/sign-in.tsx, app/sign-up.tsx) from a
// banner/button on Pulse, same as the web app's own anonymous-session-
// upgrade model.
//
// `user` CAN still be null after loading, though: right after an explicit
// sign-out (auth-context.tsx's explicitSignOutRef path), on purpose -
// re-anonymizing immediately would silently hand back a blank new
// identity, which is more confusing than useful right after someone
// deliberately signed out. Without handling that state here, every tab
// screen's Firestore/API calls would just silently fail (most already
// swallow errors into a graceful-looking empty state) with nothing on
// screen telling the person they're signed out at all. Redirect to
// sign-in instead - the same real "you're logged out" moment web's own
// App.tsx handles by falling back to LandingPage when `!user`.
function RootNavigator() {
  const { loading, user, securityGate, logOut } = useAuth();
  const { colors } = useNativeTheme();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/sign-in');
    }
  }, [loading, user]);

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // Even when Firebase Auth succeeds, an account that requires MFA cannot
  // enter native screens until a real native challenge is implemented.
  if (user && securityGate !== 'clear') {
    return (
      <View style={[styles.securityBlock, { backgroundColor: colors.background }]}>
        <Text style={[styles.securityTitle, { color: colors.text }]}>Additional verification required</Text>
        <Text style={[styles.securityExplanation, { color: colors.muted }]}>
          {securityGate === 'mfa_required'
            ? 'This account uses two-factor verification. Use the Blaze Break website to sign in until native verification is supported.'
            : 'We could not verify your account security. Sign out and try again when connected.'}
        </Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => { void logOut(); }}
          style={[styles.securityButton, { backgroundColor: colors.accent }]}>
          <Text style={[styles.securityButtonText, { color: colors.onAccent }]}>Sign out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Stack screenOptions={{
      contentStyle: { backgroundColor: colors.background },
      headerStyle: { backgroundColor: colors.card },
      headerTintColor: colors.text,
      headerTitleStyle: { color: colors.text },
    }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ presentation: 'modal', title: 'Sign in' }} />
      <Stack.Screen name="sign-up" options={{ presentation: 'modal', title: 'Create account' }} />
      <Stack.Screen name="account" options={{ presentation: 'modal', title: 'Account' }} />
    </Stack>
  );
}

function ThemedStatusBar() {
  const { isDark } = useNativeTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <NativeThemeProvider>
      <AuthProvider>
        <RootNavigator />
        <ThemedStatusBar />
      </AuthProvider>
    </NativeThemeProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityBlock: {
    flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 16,
  },
  securityTitle: { fontSize: 23, fontWeight: '800', textAlign: 'center' },
  securityExplanation: { maxWidth: 420, fontSize: 15, lineHeight: 23, textAlign: 'center' },
  securityButton: { paddingVertical: 14, paddingHorizontal: 26, borderRadius: 12, minHeight: 48, justifyContent: 'center' },
  securityButtonText: { fontWeight: '800', fontSize: 15 },
});
