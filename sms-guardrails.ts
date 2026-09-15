// Central Twilio SMS cost/abuse configuration and guardrails. Twilio SMS
// is the most expensive per-message channel this app has (billed per
// segment) and, per product direction, must never be the routine
// engagement channel - push is. This module is the one place that
// governs how much SMS a single account can generate in a day/month and
// the one switch that turns SMS off globally or per category without a
// redeploy. See docs/NOTIFICATION_ARCHITECTURE.md.
//
// Guardian alerts are a deliberate exception to the aggregate cap below:
// they already have their own tighter, dedicated limits (5/hour via
// guardianAlertLimiter, 15/day + per-contact cooldown in-handler, see
// server.ts and guardian-alert.ts) because they're a safety feature, not
// a cost-optimisation target. A shared cross-category cap must never be
// able to silently swallow a real crisis alert because someone also used
// up their nudge/manual-send quota that day - see docs/PRODUCT_SAFETY_
// PRIVACY.md's "safety must not be removed to save money" principle.

export type SmsCategory = 'guardian_alert' | 'ally_nudge' | 'manual_send';

export interface SmsLimitConfig {
  perUserDailyLimit: number;
  perUserMonthlyLimit: number;
}

// Aggregate ceiling across every SMS category EXCEPT guardian_alert (see
// above). Centralised here rather than as magic numbers scattered across
// server.ts, and intentionally generous - this is an abuse/runaway-cost
// backstop, not the primary lever (the primary lever is routing routine
// engagement to push at all, which NotificationRouter/notification-
// router.ts handles).
export const SMS_LIMITS: SmsLimitConfig = {
  perUserDailyLimit: 20,
  perUserMonthlyLimit: 150,
};

export const CATEGORIES_SUBJECT_TO_AGGREGATE_CAP: readonly SmsCategory[] = ['ally_nudge', 'manual_send'];

export interface SmsQuotaCheckResult {
  allowed: boolean;
  reason?: 'daily_limit_reached' | 'monthly_limit_reached';
}

// `category` decides whether the aggregate cap applies at all - a
// guardian_alert always passes this specific check (its own dedicated
// limiter/cooldown/daily-cap in server.ts is what actually governs it).
export const checkSmsQuota = (
  category: SmsCategory,
  usedToday: number,
  usedThisMonth: number,
  limits: SmsLimitConfig = SMS_LIMITS
): SmsQuotaCheckResult => {
  if (!CATEGORIES_SUBJECT_TO_AGGREGATE_CAP.includes(category)) {
    return { allowed: true };
  }
  if (usedThisMonth >= limits.perUserMonthlyLimit) {
    return { allowed: false, reason: 'monthly_limit_reached' };
  }
  if (usedToday >= limits.perUserDailyLimit) {
    return { allowed: false, reason: 'daily_limit_reached' };
  }
  return { allowed: true };
};

// A rough GSM-7 checker: any character outside this set drops the whole
// message to UCS-2 encoding, which segments at a much shorter length.
// This is an estimate (not a byte-exact reproduction of Twilio's own
// encoding detection) - good enough to flag "this reminder just became a
// 3-segment message" before it ships, which is the actual goal (section
// 6 of the hardening brief: "detect or estimate multi-segment SMS").
const GSM7_PATTERN = /^[A-Za-z0-9@£$¥èéùìòÇ\n\rØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#$%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;

export interface SmsSegmentEstimate {
  segments: number;
  encoding: 'GSM-7' | 'UCS-2';
}

export const estimateSmsSegments = (message: string): SmsSegmentEstimate => {
  const isGsm7 = GSM7_PATTERN.test(message);
  const singleSegmentLimit = isGsm7 ? 160 : 70;
  const concatenatedSegmentLimit = isGsm7 ? 153 : 67;
  const segments = message.length <= singleSegmentLimit
    ? 1
    : Math.ceil(message.length / concatenatedSegmentLimit);
  return { segments, encoding: isGsm7 ? 'GSM-7' : 'UCS-2' };
};

// Global + per-category kill switches, same default-on/explicit-off-only
// polarity as every other kill switch in this codebase (toolsAreEnabled,
// liveVoiceIsEnabled in nova-tools.ts, nudgeSchedulerIsEnabled in
// guardian-alert.ts) - unset or unexpected env values never silently
// disable something that was working; deliberately turning SMS off in an
// incident is one env var, no redeploy.
export const smsGloballyEnabled = (envValue: string | undefined): boolean => envValue !== 'false';

// Category-specific switches use distinct env vars (checked by the
// caller), but share this same evaluation function/polarity.
export const smsCategoryEnabled = (envValue: string | undefined): boolean => envValue !== 'false';
