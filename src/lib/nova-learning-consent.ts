/**
 * Learning from check-ins and recovery activity needs an affirmative,
 * account-specific choice. An absent, malformed or migrated legacy value
 * does not prove consent.
 */
export const hasExplicitNovaLearningConsent = (value: unknown): boolean => value === true;
