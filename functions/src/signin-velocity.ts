// Pure decision logic for the beforeSignIn blocking function's abuse
// signal - kept free of Firestore/firebase-admin I/O so it's genuinely
// unit-testable, same reasoning as the main app's totp-mfa.ts.
//
// IMPORTANT CONSTRAINT THIS IS BUILT AROUND: Firebase's beforeSignIn
// blocking function only ever fires on a sign-in attempt Firebase has
// ALREADY determined is credentially valid (the right password, or a
// completed OAuth exchange) - a wrong password is rejected entirely
// inside Google's own Identity Platform servers before any Cloud
// Function, blocking or otherwise, is invoked. So this can never observe
// or count FAILED attempts directly, only successful ones. What it CAN
// observe: the IP address and account of every otherwise-successful
// sign-in. A credential-stuffing bot trying many stolen email/password
// pairs from one IP eventually succeeds on several of them, so unusually
// many DISTINCT accounts signing in from one IP in a short window is a
// real, available signal for exactly that attack pattern - without
// needing to see the failures at all. See MANUAL_SECURITY_ACTIONS.md for
// the full explanation of why this differs from a naive
// "track-failed-attempts" design.

// 10-minute rolling window: long enough to catch a sustained credential-
// stuffing run, short enough that a shared IP's normal daily traffic
// (an office, a VPN exit node, a mobile carrier's NAT) doesn't
// accumulate across unrelated sessions hours apart.
export const IP_VELOCITY_WINDOW_MS = 10 * 60 * 1000;

// Logged (not blocked) once an IP has signed into this many distinct
// accounts within the window - low enough to actually flag real abuse
// for an operator to review, without being a hard consequence for
// anyone.
export const IP_VELOCITY_WARN_THRESHOLD = 4;

// Actually rejected once an IP crosses this many distinct accounts in the
// window - set well above the warn threshold specifically so shared IPs
// (offices, VPNs, carrier-grade NAT) are never blocked for ordinary,
// unrelated use; this only fires for genuinely unusual velocity.
export const IP_VELOCITY_BLOCK_THRESHOLD = 12;

export interface SignInEvent {
  email: string;
  at: number; // epoch ms
}

export interface IpVelocityResult {
  distinctAccountCount: number;
  shouldWarn: boolean;
  shouldBlock: boolean;
}

// `recentEvents` is expected to already be window-filtered by the caller
// (a Firestore range query in production) - this function only makes the
// warn/block decision from whatever events it's handed.
export const evaluateIpVelocity = (recentEvents: SignInEvent[], newEmail: string): IpVelocityResult => {
  const distinctEmails = new Set(recentEvents.map((e) => e.email.toLowerCase()));
  distinctEmails.add(newEmail.toLowerCase());
  const distinctAccountCount = distinctEmails.size;
  return {
    distinctAccountCount,
    shouldWarn: distinctAccountCount >= IP_VELOCITY_WARN_THRESHOLD,
    shouldBlock: distinctAccountCount >= IP_VELOCITY_BLOCK_THRESHOLD,
  };
};

// Firestore document IDs can't contain a forward slash; IP addresses
// never legitimately do either, so this is defensive rather than
// expected to change real input, same spirit as this app's other
// doc-id sanitizers.
export const sanitizeIpForDocId = (ip: string): string => ip.replace(/[/\s]/g, '_');
