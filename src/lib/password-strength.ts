// Password strength policy for Blaze Break signup. Enforced here
// client-side for immediate feedback - the real enforcement point is
// Firebase's own Password Policy setting (Authentication > Settings >
// Password Policy in Firebase Console), since Firebase, not this app's
// server, is what actually creates the account. See
// MANUAL_SECURITY_ACTIONS.md for the exact Console configuration that
// should match this.

export const PASSWORD_MIN_LENGTH = 10;

const CATEGORY_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'uppercase letter', pattern: /[A-Z]/ },
  { name: 'lowercase letter', pattern: /[a-z]/ },
  { name: 'number', pattern: /[0-9]/ },
  { name: 'symbol', pattern: /[^A-Za-z0-9]/ },
];

export const PASSWORD_MIN_CATEGORIES = 2;

export interface PasswordStrengthResult {
  valid: boolean;
  reasons: string[];
}

export const checkPasswordStrength = (password: string): PasswordStrengthResult => {
  const reasons: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    reasons.push(`At least ${PASSWORD_MIN_LENGTH} characters`);
  }
  const metCategories = CATEGORY_PATTERNS.filter((c) => c.pattern.test(password)).length;
  if (metCategories < PASSWORD_MIN_CATEGORIES) {
    reasons.push(`At least ${PASSWORD_MIN_CATEGORIES} of: uppercase, lowercase, number, symbol`);
  }
  return { valid: reasons.length === 0, reasons };
};

// Shown in the UI before submission, not just as a rejection message after.
export const PASSWORD_REQUIREMENT_TEXT =
  `At least ${PASSWORD_MIN_LENGTH} characters, with at least ${PASSWORD_MIN_CATEGORIES} of: uppercase, lowercase, number, symbol.`;

// No visually-ambiguous characters (no 0/O, 1/I/l) - same reasoning as
// totp-mfa.ts's recovery-code charset, since a generated password is
// often typed or read back, not just pasted.
const UPPER = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_=+?';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

const GENERATED_PASSWORD_LENGTH = 16;

// Web Crypto API only - never Math.random(), which is not
// cryptographically secure and unsuitable for generating credentials.
const randomIndex = (max: number): number => {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % max;
};

const randomChar = (charset: string): string => charset[randomIndex(charset.length)];

// Fisher-Yates using the same crypto source, so the guaranteed
// one-per-category characters aren't predictably placed at the front.
const shuffle = (chars: string[]): string[] => {
  const out = [...chars];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// Guarantees the strength requirement above by construction - one
// character from every category, not just enough to probably scrape past
// the minimum - so a generated password never needs the user to
// regenerate it to pass. Generated entirely client-side; nothing here
// ever leaves the browser before the user has seen and accepted it.
export const generateStrongPassword = (length = GENERATED_PASSWORD_LENGTH): string => {
  const required = [randomChar(UPPER), randomChar(LOWER), randomChar(DIGITS), randomChar(SYMBOLS)];
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => randomChar(ALL));
  return shuffle([...required, ...rest]).join('');
};
