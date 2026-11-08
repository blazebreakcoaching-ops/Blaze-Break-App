// Fallback text for the burnout diagnostic when Nova's written analysis is
// unavailable (AI not configured, over quota, or the model failed).
// Previously a fixed paragraph claimed "your primary energy leak is
// completely clear" and described "a metabolic deficit that is
// biologically impossible to sustain" for EVERY person, whatever their
// answers - an invented conclusion with a medical-sounding claim. This is
// built only from the person's own scores and makes no medical claim.
export interface DiagnoseScore { label: string; score: number }

export function buildDiagnoseFallbackAnalysis(profile: string, scores: DiagnoseScore[]): string {
  const valid = scores.filter((s) => Number.isFinite(s.score));
  const top = [...valid].sort((a, b) => b.score - a.score);
  const highest = top[0]?.score ?? 0;
  const leaders = top.filter((s) => s.score === highest && highest > 0).slice(0, 3);
  const intro = `Your answers point to the ${profile} pattern.`;
  if (leaders.length === 0 || highest < 2) {
    return `${intro} None of the areas you rated stood out strongly, so start with the priorities below and check in again in a week. This summary comes only from your answers; Nova's written analysis isn't available right now, and this is not a medical assessment.`;
  }
  const names = leaders.map((s) => s.label.toLowerCase());
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${intro} Your highest-rated area${leaders.length > 1 ? 's were' : ' was'} ${list} (${highest} out of 4), so that is the best place to start. Begin with the first priority below this week. This summary comes only from your answers; Nova's written analysis isn't available right now, and this is not a medical assessment.`;
}
