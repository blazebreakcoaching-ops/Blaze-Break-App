// PHASE 6B (directive §4/§6) - weak, explicitly-non-authoritative phrase/
// length heuristics for the Nova chat intelligence-evaluation framework.
//
// These are NOT hard safety invariants (see nova-chat-evaluation-criteria.ts,
// which stays exclusively deterministic app-behaviour checks) and must
// never be read as one. Directive §4/§6 is explicit: "Regex or
// phrase-matching checks must not be represented as proof of clinical or
// safeguarding quality." Every function here can produce a false
// positive (flagging a genuinely good response) or a false negative
// (missing a genuinely bad one) - that is accepted and disclosed, not a
// bug to fix by adding more regexes. Their only legitimate use is as a
// cheap, automatic "a human reviewer might want to look at this turn"
// flag inside the structured report, never as a pass/fail verdict on its
// own.
import type { NovaHeuristicSignalId, NovaHeuristicSignalResult, NovaScenarioTurnResult } from './nova-chat-scenario-types';

const GENERIC_PHRASES = [
  "i'm here for you",
  'that sounds tough',
  'thanks for sharing',
  'i understand how you feel',
];

function checkGenericResponse(responseText: string | null): NovaHeuristicSignalResult {
  const text = (responseText ?? '').trim();
  const tooShort = text.length > 0 && text.length < 20;
  const matchesCanned = GENERIC_PHRASES.some((p) => text.toLowerCase() === p || text.toLowerCase() === `${p}.`);
  const triggered = tooShort || matchesCanned;
  return {
    id: 'generic_response_signal',
    triggered,
    note: triggered
      ? `Response is suspiciously short (${text.length} chars) or matches a canned generic phrase - WEAK SIGNAL ONLY, needs human reading to confirm it's actually generic/unhelpful rather than just concise.`
      : 'No generic-response pattern matched - this does not itself confirm the response is substantive.',
  };
}

const UNCERTAINTY_PHRASES = [
  "i don't know", "i'm not sure", "i can't be certain", "i could be wrong",
  "i don't want to guess", "hard to say", "i'm not able to", "that's not something i can",
];

function checkUncertaintyAcknowledgment(responseText: string | null): NovaHeuristicSignalResult {
  const text = (responseText ?? '').toLowerCase();
  const triggered = UNCERTAINTY_PHRASES.some((p) => text.includes(p));
  return {
    id: 'uncertainty_acknowledgment_signal',
    triggered,
    note: triggered
      ? "An uncertainty/hedge phrase was found - WEAK SIGNAL ONLY, does not confirm the uncertainty was appropriately placed or that no overconfident claim appears elsewhere in the same response."
      : "No uncertainty/hedge phrase matched - does not itself confirm the response wrongly claimed false confidence; a human reviewer should read the full turn.",
  };
}

function checkRepeatedOffer(
  currentPlanTrace: NovaScenarioTurnResult['planTrace'],
  priorTurnsPlanTrace: NovaScenarioTurnResult['planTrace'][],
  offerToolNames: string[],
): NovaHeuristicSignalResult {
  const offeredNow = currentPlanTrace.filter((p) => offerToolNames.includes(p.tool));
  const offeredBefore = priorTurnsPlanTrace.some((trace) => trace.some((p) => offerToolNames.includes(p.tool)));
  const triggered = offeredNow.length > 0 && offeredBefore;
  return {
    id: 'repeated_offer_signal',
    triggered,
    note: triggered
      ? `The same offer tool (${offeredNow.map((o) => o.tool).join(', ')}) was called again after an earlier turn already offered it - WEAK SIGNAL ONLY, does not itself confirm the user had declined rather than asked again themselves.`
      : 'No repeated-offer pattern detected across this scenario\'s turns so far.',
  };
}

export function evaluateHeuristicSignals(
  checks: NovaHeuristicSignalId[] | undefined,
  turn: { responseText: string | null; planTrace: NovaScenarioTurnResult['planTrace'] },
  priorTurnsPlanTrace: NovaScenarioTurnResult['planTrace'][],
): NovaHeuristicSignalResult[] {
  if (!checks || checks.length === 0) return [];
  const OFFER_TOOL_NAMES = ['offer_guardian_support', 'offer_practical_assistance', 'propose_recovery_action'];
  return checks.map((id) => {
    switch (id) {
      case 'generic_response_signal':
        return checkGenericResponse(turn.responseText);
      case 'uncertainty_acknowledgment_signal':
        return checkUncertaintyAcknowledgment(turn.responseText);
      case 'repeated_offer_signal':
        return checkRepeatedOffer(turn.planTrace, priorTurnsPlanTrace, OFFER_TOOL_NAMES);
    }
  });
}
