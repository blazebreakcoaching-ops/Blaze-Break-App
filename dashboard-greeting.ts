// Pure logic for the personalised dashboard greeting, kept I/O-free and
// unit-tested - same pattern as the other logic modules in this codebase
// (weekly-goal-tracker.ts, gad7.ts). Time-of-day comes from the caller
// (new Date().getHours()) rather than being computed in here, since that
// already reflects the visitor's own local device clock with zero extra
// work - no timezone detection needed for this one, unlike the crisis
// support region guess.

export type GreetingTimeOfDay = "morning" | "afternoon" | "evening" | "night";

export function getTimeOfDay(hour: number): GreetingTimeOfDay {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

type GreetingTemplate = (name: string | null) => string;

// A handful of warm, plain greetings per slot, plus a couple of gently
// humorous ones mixed in - never so often that they wear thin, never so
// dry that the app feels distant. British voice throughout, matching the
// rest of the app's copy.
const TEMPLATES: Record<GreetingTimeOfDay, GreetingTemplate[]> = {
  morning: [
    (n) => (n ? `Good morning, ${n}.` : "Good morning."),
    (n) => (n ? `Morning, ${n}. Let's make today a little lighter.` : "Let's make today a little lighter."),
    (n) => (n ? `Rise and shine, ${n} — the world's better with you in it today.` : "Rise and shine — the world's better with you in it today."),
    (n) => (n ? `Morning, ${n}. Coffee's optional. Showing up isn't.` : "Coffee's optional. Showing up isn't."),
    (n) => (n ? `Hello, ${n}. Here's to a calmer version of today.` : "Here's to a calmer version of today."),
  ],
  afternoon: [
    (n) => (n ? `Good afternoon, ${n}.` : "Good afternoon."),
    (n) => (n ? `Afternoon, ${n}. How's the day treating you?` : "How's the day treating you?"),
    (n) => (n ? `Hope your afternoon's kinder than your inbox, ${n}.` : "Hope your afternoon's kinder than your inbox."),
    (n) => (n ? `Good afternoon, ${n}. Halfway there — you're doing better than you think.` : "Halfway there — you're doing better than you think."),
    (n) => (n ? `Afternoon, ${n}. Time for a proper breath.` : "Time for a proper breath."),
  ],
  evening: [
    (n) => (n ? `Good evening, ${n}.` : "Good evening."),
    (n) => (n ? `Evening, ${n}. Nearly there.` : "Nearly there."),
    (n) => (n ? `Good evening, ${n}. Worth starting to wind down, if you can.` : "Worth starting to wind down, if you can."),
    (n) => (n ? `Evening, ${n}. You made it through — that counts.` : "You made it through — that counts."),
    (n) => (n ? `Good evening, ${n}. Let's close the day out gently.` : "Let's close the day out gently."),
  ],
  night: [
    (n) => (n ? `Still up, ${n}? Good to see you.` : "Still up? Good to see you."),
    (n) => (n ? `Late one, ${n}? Let's not make it a habit.` : "Late one? Let's not make it a habit."),
    (n) => (n ? `Hello, ${n}. The night owl shift begins.` : "Hello. The night owl shift begins."),
    (n) => (n ? `Good evening — or very early morning, ${n}.` : "Good evening — or very early morning."),
    (n) => (n ? `You're up late, ${n}. Everything alright?` : "You're up late. Everything alright?"),
  ],
};

// `random` is any value in [0, 1) — pass Math.random() at the call site.
// Kept as a parameter (rather than calling Math.random() in here) so this
// stays a pure function callers can test deterministically.
export function buildDashboardGreeting(hour: number, firstName: string | null, random: number): string {
  const templates = TEMPLATES[getTimeOfDay(hour)];
  const clamped = Math.min(Math.max(random, 0), 0.999999);
  const index = Math.floor(clamped * templates.length);
  return templates[index](firstName);
}
