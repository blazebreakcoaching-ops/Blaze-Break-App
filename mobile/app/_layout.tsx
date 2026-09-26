import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/lib/auth-context';

// The anonymous-first pattern means `user` is set as soon as loading
// finishes (even for a brand-new visitor - see auth-context.tsx), so
// sign-in/sign-up are NOT a blocking gate in front of the tabs the way a
// typical "logged out" screen would be. They're reachable as modal routes
// (see app/sign-in.tsx, app/sign-up.tsx) from a banner/button on Pulse,
// same as the web app's own anonymous-session-upgrade model.
function RootNavigator() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ presentation: 'modal', title: 'Sign in' }} />
      <Stack.Screen name="sign-up" options={{ presentation: 'modal', title: 'Create account' }} />
      <Stack.Screen name="account" options={{ presentation: 'modal', title: 'Account' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
      <StatusBar style="auto" />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
