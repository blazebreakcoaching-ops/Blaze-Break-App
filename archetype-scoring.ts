// Pure scoring logic extracted from the /api/nova/diagnose endpoint so it can
// be unit tested directly, without spinning up the whole Express app. This is
// the highest-consequence pure logic in the app — it decides which of 12
// archetypes someone sees, which then drives Nova's coaching tone, the home
// screen defaults, and the boundary scripts they're shown.

export interface ArchetypeScores {
  [key: string]: number;
  'Founder on Fire': number;
  'Over-Giver': number;
  'Silent Resenter': number;
  'High-Functioning Exhausted': number;
  'Manager in the Middle': number;
  'The Impostor': number;
  'The Perfectionist': number;
  'The Constant Adapter': number;
  'The Second Shift': number;
  'Crisis Sprinter': number;
  'People-Pleasing Performer': number;
  'Responsibility Addict': number;
}

export interface DimensionScores {
  workload: number;
  boundaries: number;
  peoplePleasing: number;
  guilt: number;
  sleep: number;
  emotionalOverload: number;
  meaning: number;
  selfDoubt: number;
  delegationControl: number;
  maskingLoad: number;
  caregivingLoad: number;
  crisisDependency: number;
  emotionalPerformance: number;
  responsibilityCreep: number;
}

// Maps a quiz answer (numeric, or one of the legacy string options) to a 1-4
// severity value. Unanswered questions default to 2 (neutral) rather than 1
// (best case) — an unanswered question shouldn't quietly read as "things are
// fine here", especially for a quick check that deliberately skips several
// dimensions.
export const mapToVal = (val: any): number => {
  if (typeof val === 'number') return val;
  if (!val) return 2;
  const valStr = String(val).toLowerCase();
  if (valStr.includes('rarely') || valStr.includes('very little') || valStr.includes('never') || valStr.includes('not at all') || valStr.includes('fully') || valStr.includes('comfortable') || valStr.includes('hold my line')) return 1;
  if (valStr.includes('sometimes') || valStr.includes('some') || valStr.includes('occasionally') || valStr.includes('vaguely') || valStr.includes('flinch') || valStr.includes('moderate') || valStr.includes('restless') || valStr.includes('fading')) return 2;
  if (valStr.includes('most days') || valStr.includes('significant') || valStr.includes('noticeably') || valStr.includes('most nights') || valStr.includes('often') || valStr.includes('resentfully') || valStr.includes('simmer') || valStr.includes('guilt') || valStr.includes('disconnection') || valStr.includes('disconnected') || valStr.includes('severe')) return 3;
  if (valStr.includes('every waking hour') || valStr.includes('entire') || valStr.includes('constantly') || valStr.includes('jar') || valStr.includes('permanent') || valStr.includes('panic') || valStr.includes('prioritize') || valStr.includes('paralysis') || valStr.includes('crisis')) return 4;
  return 2; // default fallback
};

export const computeDimensionScores = (answers: Record<string, any>): DimensionScores => ({
  workload: mapToVal(answers.workload),
  boundaries: mapToVal(answers.boundaries),
  peoplePleasing: mapToVal(answers.peoplePleasing || answers.identity), // handle legacy identity
  guilt: mapToVal(answers.guilt || answers.rest), // handle legacy rest
  sleep: mapToVal(answers.sleep || answers.wired), // handle legacy wired
  emotionalOverload: mapToVal(answers.emotionalOverload || answers.emotional), // handle legacy emotional
  meaning: mapToVal(answers.meaning || answers.disconnection), // handle legacy disconnection
  selfDoubt: mapToVal(answers.selfDoubt),
  delegationControl: mapToVal(answers.delegationControl),
  maskingLoad: mapToVal(answers.maskingLoad),
  caregivingLoad: mapToVal(answers.caregivingLoad),
  crisisDependency: mapToVal(answers.crisisDependency),
  emotionalPerformance: mapToVal(answers.emotionalPerformance),
  responsibilityCreep: mapToVal(answers.responsibilityCreep),
});

// Every archetype's coefficients sum to exactly 9, so no archetype has a
// scoring advantage purely from its weighting shape — the only thing that
// should decide the winner is the person's actual answers.
export const computeArchetypeScores = (d: DimensionScores): ArchetypeScores => ({
  'Founder on Fire': (d.workload * 3) + (d.peoplePleasing * 1) + (d.guilt * 3) + (d.sleep * 2),
  'Over-Giver': (d.peoplePleasing * 3) + (d.boundaries * 3) + (d.guilt * 2) + (d.workload * 1),
  'Silent Resenter': (d.emotionalOverload * 3) + (d.boundaries * 3) + (d.meaning * 3),
  'High-Functioning Exhausted': (d.workload * 3) + (d.sleep * 3) + (d.guilt * 2) + (d.meaning * 1),
  'Manager in the Middle': (d.workload * 2) + (d.boundaries * 3) + (d.peoplePleasing * 2) + (d.emotionalOverload * 1) + (d.meaning * 1),
  'The Impostor': (d.selfDoubt * 4) + (d.guilt * 2) + (d.workload * 2) + (d.meaning * 1),
  'The Perfectionist': (d.delegationControl * 4) + (d.boundaries * 2) + (d.workload * 2) + (d.guilt * 1),
  'The Constant Adapter': (d.maskingLoad * 4) + (d.emotionalOverload * 2) + (d.sleep * 2) + (d.workload * 1),
  'The Second Shift': (d.caregivingLoad * 4) + (d.guilt * 3) + (d.sleep * 1) + (d.workload * 1),
  'Crisis Sprinter': (d.crisisDependency * 4) + (d.workload * 2) + (d.sleep * 2) + (d.guilt * 1),
  'People-Pleasing Performer': (d.emotionalPerformance * 4) + (d.peoplePleasing * 2) + (d.guilt * 2) + (d.emotionalOverload * 1),
  'Responsibility Addict': (d.responsibilityCreep * 4) + (d.boundaries * 2) + (d.workload * 2) + (d.guilt * 1),
});

export const pickDominantProfile = (scores: ArchetypeScores): string => {
  let profile = 'High-Functioning Exhausted';
  let maxVal = -1;
  for (const [k, v] of Object.entries(scores)) {
    if (v > maxVal) {
      maxVal = v;
      profile = k;
    }
  }
  return profile;
};

// The blend: rather than reducing someone to one label, the top 3 renormalized
// to sum to 100% gives an honest "62% X, 24% Y, 14% Z" style breakdown.
export const computeBlend = (scores: Record<string, number>): { profile: string; percentage: number }[] => {
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const topThree = sorted.slice(0, 3);
  const topThreeSum = topThree.reduce((sum, [, score]) => sum + score, 0);
  return topThree.map(([profile, score]) => ({
    profile,
    percentage: topThreeSum > 0 ? Math.round((score / topThreeSum) * 100) : 0,
  }));
};
