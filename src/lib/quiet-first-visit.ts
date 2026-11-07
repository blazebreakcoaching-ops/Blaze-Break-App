/**
 * Informational prompts are optional. Never interrupt a more important
 * first-use or consent/security task with another guide, nudge or changelog.
 * This is presentation state only; it does not bypass the underlying
 * authentication, MFA, role or subscription checks.
 */
export interface FirstVisitUIState {
  welcome: boolean;
  novaGuide: boolean;
  coachMarks: boolean;
  dailyCheckIn: boolean;
  settings: boolean;
  walkthrough: boolean;
  support: boolean;
  launcher: boolean;
}

export function shouldPausePassivePrompts(state: FirstVisitUIState): boolean {
  return state.welcome || state.novaGuide || state.coachMarks ||
    state.dailyCheckIn || state.settings || state.walkthrough ||
    state.support || state.launcher;
}
