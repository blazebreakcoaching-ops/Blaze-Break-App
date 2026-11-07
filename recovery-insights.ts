// Customer-facing Recovery Insights: pure, I/O-free wording and shaping for
// the server-derived trend summaries (users/{uid}/derived/*), shared by the
// recalculation route, Nova's consented context and GET /api/recovery/insights.
//
// Accuracy rule: every sentence is generated from the summary's OWN status,
// direction, confidence and record count. Previously each summary carried a
// fixed reassuring sentence ("stable", "your actions are working") written
// regardless of what the numbers showed, and that text also reached Nova.
// Recovery velocity is deliberately excluded from customer insights: it is
// one of the conflicting legacy formulas superseded by Recovery Direction.
import { isUsableRecoveryDerivedSummary } from './recovery-derived-signals';

export const CUSTOMER_INSIGHT_TYPES = ['energy_trend', 'mood_trend', 'recovery_debt'] as const;
export type CustomerInsightType = (typeof CUSTOMER_INSIGHT_TYPES)[number];
export type TrendDirection = 'rising' | 'falling' | 'stable' | 'unknown';
export type InsightTone = 'better' | 'worse' | 'steady' | 'unknown';

export const INSIGHT_LABELS: Record<CustomerInsightType, string> = {
  energy_trend: 'Energy',
  mood_trend: 'Mood',
  recovery_debt: 'Pressure load',
};

// Which direction is good news for each measure. Pressure load is the
// recovery-debt indicator: rising means more strain.
const RISING_IS_BETTER: Record<CustomerInsightType, boolean> = {
  energy_trend: true,
  mood_trend: true,
  recovery_debt: false,
};

const WHAT_IT_MEASURES: Record<CustomerInsightType, string> = {
  energy_trend: 'the energy levels you logged in check-ins and energy budgets',
  mood_trend: 'the moods you logged in quick mood checks',
  recovery_debt: 'the pressure, energy and body signals you logged, offset by recorded wins and reviews',
};

const SUBJECT: Record<CustomerInsightType, string> = {
  energy_trend: 'Your logged energy',
  mood_trend: 'Your logged mood',
  recovery_debt: 'Your pressure load',
};

const isDirection = (v: unknown): v is TrendDirection =>
  v === 'rising' || v === 'falling' || v === 'stable' || v === 'unknown';

export function toneFor(type: CustomerInsightType, direction: TrendDirection): InsightTone {
  if (direction === 'stable') return 'steady';
  if (direction === 'unknown') return 'unknown';
  const better = (direction === 'rising') === RISING_IS_BETTER[type];
  return better ? 'better' : 'worse';
}

export interface TrendFacts {
  status: unknown;
  direction: unknown;
  confidenceLevel: unknown;
  sourceCount: unknown;
}

// Plain-English, non-clinical explanation built only from the facts given.
export function describeTrend(type: CustomerInsightType, facts: TrendFacts): string {
  const count = typeof facts.sourceCount === 'number' && Number.isFinite(facts.sourceCount) ? facts.sourceCount : 0;
  if (facts.status !== 'available' && facts.status !== 'early_signal') {
    return `Not enough data yet. This is based on ${WHAT_IT_MEASURES[type]}; log a few more over the next week and a trend will appear.`;
  }
  const direction = isDirection(facts.direction) ? facts.direction : 'unknown';
  const records = `${count} record${count === 1 ? '' : 's'} from the last 30 days`;
  const early = facts.status === 'early_signal' || facts.confidenceLevel === 'low'
    ? ' This is an early signal from limited data, so treat it as a hint rather than a conclusion.' : '';
  let movement: string;
  switch (direction) {
    case 'rising': movement = `${SUBJECT[type]} has been going up`; break;
    case 'falling': movement = `${SUBJECT[type]} has been going down`; break;
    case 'stable': movement = `${SUBJECT[type]} has stayed broadly level`; break;
    default: movement = `There isn't a clear direction in ${SUBJECT[type].toLowerCase()} yet`;
  }
  const tone = toneFor(type, direction);
  const meaning = tone === 'better' ? ' That is moving in a helpful direction.'
    : tone === 'worse' ? ' That is moving in an unhelpful direction and may be worth attention.'
      : '';
  return `${movement}, based on ${records}.${meaning}${early} This reflects only what you logged and is not a medical assessment.`;
}

export interface CustomerInsight {
  type: CustomerInsightType;
  label: string;
  state: 'available' | 'not_enough_data' | 'stale' | 'not_calculated';
  value: number | null;          // 0-100 indicator, only when available
  direction: TrendDirection;
  tone: InsightTone;
  confidence: 'low' | 'medium' | 'high' | null;
  sourceCount: number;
  calculatedAt: string | null;
  explanation: string;
}

// Shapes one stored derived document for the customer. Never trusts the
// stored explanation text; never returns a number that is not genuinely
// available and fresh.
export function toCustomerInsight(type: CustomerInsightType, doc: unknown, nowMs: number): CustomerInsight {
  const base = { type, label: INSIGHT_LABELS[type] };
  if (!doc || typeof doc !== 'object') {
    return { ...base, state: 'not_calculated', value: null, direction: 'unknown', tone: 'unknown', confidence: null, sourceCount: 0, calculatedAt: null,
      explanation: 'Not calculated yet. Use "Update my insights" to calculate this from what you have logged.' };
  }
  const d = doc as Record<string, unknown>;
  const sourceCount = typeof d.sourceCount === 'number' && Number.isFinite(d.sourceCount) ? d.sourceCount : 0;
  const calculatedAt = typeof d.calculatedAt === 'string' ? d.calculatedAt : null;
  const confidence = d.confidenceLevel === 'low' || d.confidenceLevel === 'medium' || d.confidenceLevel === 'high' ? d.confidenceLevel : null;
  if (d.status !== 'available') {
    return { ...base, state: 'not_enough_data', value: null, direction: 'unknown', tone: 'unknown', confidence, sourceCount, calculatedAt,
      explanation: describeTrend(type, { status: 'not_enough_data', direction: 'unknown', confidenceLevel: confidence, sourceCount }) };
  }
  if (!isUsableRecoveryDerivedSummary(doc, nowMs)) {
    return { ...base, state: 'stale', value: null, direction: 'unknown', tone: 'unknown', confidence, sourceCount, calculatedAt,
      explanation: 'This was last calculated a while ago, so it is hidden rather than shown out of date. Use "Update my insights" to refresh it.' };
  }
  const direction: TrendDirection = isDirection(d.direction) ? d.direction : 'unknown';
  const value = typeof d.value === 'number' && Number.isFinite(d.value) && d.value >= 0 && d.value <= 100 ? Math.round(d.value) : null;
  return { ...base, state: 'available', value, direction, tone: toneFor(type, direction), confidence, sourceCount, calculatedAt,
    explanation: describeTrend(type, { status: 'available', direction, confidenceLevel: confidence, sourceCount }) };
}
