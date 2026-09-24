// Pure decision logic behind HomeSection.tsx's progressive widget
// disclosure - kept free of React state/localStorage so it's genuinely
// unit-testable, same reasoning as this app's other extracted-logic
// modules (paletteMatch.ts, useNovaLiveVoice.ts's isServedViaHostingRewrite).
//
// Why this exists: a beta tester's very first login, moments after
// finishing onboarding while still in a high-stress state, showed every
// Home widget at once (Recovery Score, Points/Badges, Recovery Hub,
// Recovery Trends, Nova's Suggestion) and found it overwhelming. Someone
// who hasn't engaged with the app at all yet now starts with only Nova's
// suggestion visible; everything else unlocks automatically, once, the
// moment they earn their first points (their first real check-in or
// completed recommendation) - never re-applied to an account that was
// already established when this shipped.

export const isBrandNewUser = (points: number, streak: number): boolean =>
  points === 0 && streak === 0;

export interface WidgetLayout {
  left: string[];
  right: string[];
  hidden: string[];
}

// The very first layout a brand-new user (no saved layout in storage yet)
// sees: only `newUserLeft`/`newUserRight` visible, every other known
// widget id hidden.
export const buildNewUserLayout = (
  allWidgetIds: string[],
  newUserLeft: string[],
  newUserRight: string[],
): WidgetLayout => {
  const visible = new Set([...newUserLeft, ...newUserRight]);
  return {
    left: newUserLeft,
    right: newUserRight,
    hidden: allWidgetIds.filter((id) => !visible.has(id)),
  };
};

// Applied once, when a brand-new user earns their first points: every id
// in `toUnlock` that isn't already visible somewhere gets added to `left`
// and removed from `hidden`. Anything already visible (including
// something the person already added themselves via "Add widget") is
// left exactly where it is - this never reorders or duplicates.
export const applyUnlock = (
  current: WidgetLayout,
  toUnlock: string[],
): { left: string[]; hidden: string[] } => {
  const alreadyVisible = new Set([...current.left, ...current.right]);
  const additions = toUnlock.filter((id) => !alreadyVisible.has(id));
  const toUnlockSet = new Set(toUnlock);
  return {
    left: additions.length > 0 ? [...current.left, ...additions] : current.left,
    hidden: current.hidden.filter((id) => !toUnlockSet.has(id)),
  };
};
