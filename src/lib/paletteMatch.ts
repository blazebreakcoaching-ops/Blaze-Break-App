// Shared "find the right tool" logic, used by both the visible command
// palette (CommandPalette.tsx) and the "Hey Nova" wake-word listener
// (useHeyNovaWakeWord.ts). Kept framework-free and dependency-free so it
// stays plain-unit-testable — this repo's vitest config runs with
// environment: 'node' (no DOM), so nothing here can touch React or the
// DOM directly.

export interface PaletteMatchable {
  id: string;
  label: string;
}

// Search synonyms so people find a tool by how they'd describe it in the
// moment, not just its official label ("panic" -> Anxiety Reset, "breathe" ->
// Nervous System). Keyed by tab id; unknown ids simply have no extra terms.
export const KEYWORDS: Record<string, string[]> = {
  home: ['pulse', 'dashboard', 'today', 'overview', 'score'],
  plan: ['recovery plan', 'roadmap', 'steps', 'what to do'],
  diagnose: ['burnout', 'assessment', 'test', 'fingerprint', 'where am i'],
  recover: ['energy', 'battery', 'budget', 'tired', 'drained', 'rest', 'habit', 'habits', 'weekly goals', 'recovery hub', 'habit os'],
  fuel: ['nutrition', 'food', 'eat', 'caffeine', 'hydration', 'gut'],
  reset: ['breathe', 'breathing', 'calm', 'panic', 'overwhelmed', 'ground', 'somatic', 'nervous system'],
  anxiety_reset: ['anxious', 'anxiety', 'panic', 'racing thoughts', 'spiralling', 'worry'],
  wellbeing: ['gad-7', 'gad7', 'anxiety check', 'anxiety score', 'track anxiety', 'questionnaire', 'assessment', 'screening', 'how am i doing', 'symptoms'],
  communicate: ['boundary', 'boundaries', 'say no', 'script', 'message', 'email', 'assert'],
  reflect: ['journal', 'reflect', 'write', 'thoughts', 'rumination'],
  nova: ['chat', 'talk', 'coach', 'ai', 'nova', 'ask'],
  ally: ['guardian', 'support', 'friend', 'ally', 'someone i trust'],
  org: ['team', 'organisation', 'organization', 'dashboard', 'workplace'],
};

// "How are you right now?" - a feeling-first way in, so someone in a bad
// moment doesn't have to know the app's vocabulary. Each maps to a tool that
// genuinely helps with that state; only shown if that tool is available.
export const MOODS: { label: string; emoji: string; tab: string }[] = [
  { label: 'Overwhelmed', emoji: '😵‍💫', tab: 'reset' },
  { label: 'Anxious', emoji: '😰', tab: 'anxiety_reset' },
  { label: "Can't focus", emoji: '🌫️', tab: 'reset' },
  { label: 'Drained', emoji: '🔋', tab: 'recover' },
  { label: 'Resentful', emoji: '😤', tab: 'reflect' },
  { label: 'Need to say no', emoji: '🛑', tab: 'communicate' },
];

// Moods whose target tab is actually available to this user (role/
// entitlement-filtered tab list, same as the palette's own tabs prop).
export function getAvailableMoods(availableTabIds: Set<string>) {
  return MOODS.filter((m) => availableTabIds.has(m.tab));
}

// Ordered subset of `tabs` matching `query`, empty query returns everything.
export function matchTabs<T extends PaletteMatchable>(tabs: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  const items: T[] = [];
  for (const t of tabs) {
    const hay = [t.label.toLowerCase(), ...(KEYWORDS[t.id] || [])].join(' ');
    if (!q || hay.includes(q) || t.label.toLowerCase().includes(q)) {
      items.push(t);
    }
  }
  return items;
}
