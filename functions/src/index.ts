import { beforeUserCreated, beforeUserSignedIn, HttpsError } from 'firebase-functions/v2/identity';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { evaluateIpVelocity, IP_VELOCITY_WINDOW_MS, sanitizeIpForDocId, type SignInEvent } from './signin-velocity';
import { isDisposableEmailDomain } from './disposable-email';

initializeApp();

// Rejects account creation from a small, known set of disposable/
// throwaway email domains outright - see disposable-email.ts for what
// this does and does not cover.
export const beforeCreate = beforeUserCreated((event) => {
  const email = event.data?.email;
  if (email && isDisposableEmailDomain(email)) {
    throw new HttpsError('invalid-argument', 'Please sign up with a permanent email address.');
  }
});

const SIGNIN_EVENTS_COLLECTION = 'signin_ip_velocity';

// See signin-velocity.ts for the full reasoning behind this design and
// the hard constraint it works within: beforeSignIn only ever fires on a
// sign-in Firebase has already determined is credentially valid, so this
// can never see or count a wrong password - only unusual cross-account
// velocity from one IP among SUCCESSFUL sign-ins.
export const beforeSignIn = beforeUserSignedIn(async (event) => {
  const email = event.data?.email;
  const ip = event.ipAddress;
  if (!email || !ip) return;

  const db = getFirestore();
  const eventsRef = db.collection(SIGNIN_EVENTS_COLLECTION).doc(sanitizeIpForDocId(ip)).collection('events');
  const windowStart = Timestamp.fromMillis(Date.now() - IP_VELOCITY_WINDOW_MS);

  const recentSnap = await eventsRef.where('at', '>=', windowStart).get();
  const recentEvents: SignInEvent[] = recentSnap.docs.map((d) => ({
    email: d.data().email as string,
    at: (d.data().at as Timestamp).toMillis(),
  }));

  const { distinctAccountCount, shouldWarn, shouldBlock } = evaluateIpVelocity(recentEvents, email);

  // Logged with the IP and a count only - never a password, never which
  // specific accounts were involved - matching this app's existing
  // redaction discipline (see logRouteError in server.ts).
  if (shouldWarn) {
    console.warn('[signin-velocity] unusual cross-account sign-in rate from one IP', { ip, distinctAccountCount });
  }

  if (shouldBlock) {
    throw new HttpsError('resource-exhausted', 'Too many accounts signed in from this network recently. Please try again shortly.');
  }

  await eventsRef.add({ email: email.toLowerCase(), at: Timestamp.now() });

  // Best-effort cleanup so this collection doesn't grow unbounded -
  // deletes events older than the window on a small fraction of
  // invocations rather than on every single one, to keep this cheap.
  if (Math.random() < 0.05) {
    const staleSnap = await eventsRef.where('at', '<', windowStart).limit(50).get();
    await Promise.all(staleSnap.docs.map((d) => d.ref.delete()));
  }
});
