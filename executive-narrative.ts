// Executive narrative (Work Design Pulse PR12) - a short, deterministic
// plain-language summary built ONLY from real counts server.ts already
// computes (active interventions vs. the Organisational Action Budget,
// open Work Design Debt items and how many lack an owner, and how many
// patterns have been promoted to a Local Operating Principle). Pure
// string formatting only - no AI, no invented language, same "Nova
// never freeform-generates, templates translate real numbers" doctrine
// as nova-manager-coach.ts. Every clause is conditional on the real
// number being nonzero, so an org with nothing to report gets a short,
// honest sentence instead of a padded one.

export interface ExecutiveNarrativeInput {
  activeInterventionCount: number;
  maxConcurrentActiveInterventions: number;
  openDebtCount: number;
  openDebtWithoutOwnerCount: number;
  localOperatingPrincipleCount: number;
}

export const buildExecutiveNarrative = (input: ExecutiveNarrativeInput): string => {
  const clauses: string[] = [];

  clauses.push(
    `${input.activeInterventionCount} active change${input.activeInterventionCount === 1 ? '' : 's'} running (of a budget of ${input.maxConcurrentActiveInterventions})`
  );

  if (input.openDebtCount > 0) {
    const ownerClause = input.openDebtWithoutOwnerCount > 0
      ? `, ${input.openDebtWithoutOwnerCount} without an owner yet`
      : '';
    clauses.push(`${input.openDebtCount} open Work Design Debt item${input.openDebtCount === 1 ? '' : 's'}${ownerClause}`);
  } else {
    clauses.push('no open Work Design Debt items');
  }

  if (input.localOperatingPrincipleCount > 0) {
    clauses.push(`${input.localOperatingPrincipleCount} practice${input.localOperatingPrincipleCount === 1 ? '' : 's'} established as a Local Operating Principle`);
  }

  return `Your organisation currently has ${clauses.join(', ')}.`;
};
