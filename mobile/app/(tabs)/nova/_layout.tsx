import React from 'react';
import { Stack } from 'expo-router';
import { useAuth } from '../../../src/lib/auth-context';
import { NovaInvisibleLoadProvider } from '../../../src/lib/nova-invisible-load-context';

// Wraps Nova's chat screen and its Invisible Load sub-screen in one
// shared NovaInvisibleLoadProvider, so navigating between them (a plain
// push/back, not a tab switch) never loses what was just added - see
// that provider's own header. Keyed by uid, same as the chat screen's
// own `key={user?.uid}` remount: a changed Firebase identity always
// starts Invisible Load empty too, never carrying the previous
// account's items forward.
export default function NovaLayout() {
  const { user } = useAuth();
  return (
    <NovaInvisibleLoadProvider key={user?.uid ?? 'signed-out'}>
      <Stack screenOptions={{ headerShown: false }} />
    </NovaInvisibleLoadProvider>
  );
}
