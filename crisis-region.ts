// Pure logic for guessing which crisis-support region to show first,
// kept I/O-free and unit-tested - same pattern as the other logic modules
// in this codebase (dashboard-greeting.ts, weekly-goal-tracker.ts).
//
// Deliberately a REORDER hint, never a filter: CrisisSupportContent always
// shows every region's numbers regardless of what this returns - getting
// this wrong (a VPN, travel, an unrecognised time zone) must never hide a
// real, working crisis number from someone who needs it. This only decides
// which block appears first, so the closest-to-correct one needs less
// scrolling in the moment it matters most.

export type CrisisRegion = "uk_ireland" | "us_canada" | "unknown";

// IANA time zone identifiers, not a blind "America/" prefix match - that
// prefix also covers Latin America extensively (America/Mexico_City,
// America/Sao_Paulo, America/Bogota...), and this app doesn't have
// Latin-American crisis numbers to show, so guessing "US or Canada" for
// those visitors would be actively wrong, not just imprecise.
const UK_IRELAND_ZONES = new Set(["Europe/London", "Europe/Dublin"]);

const US_CANADA_ZONES = new Set([
  // United States
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Anchorage", "America/Phoenix", "America/Detroit", "America/Boise",
  "America/Juneau", "America/Sitka", "America/Nome", "America/Adak",
  "America/Indiana/Indianapolis", "America/Indiana/Knox", "America/Indiana/Marengo",
  "America/Indiana/Petersburg", "America/Indiana/Tell_City", "America/Indiana/Vevay",
  "America/Indiana/Vincennes", "America/Indiana/Winamac",
  "America/Kentucky/Louisville", "America/Kentucky/Monticello",
  "America/North_Dakota/Beulah", "America/North_Dakota/Center", "America/North_Dakota/New_Salem",
  "America/Menominee", "Pacific/Honolulu",
  // Canada
  "America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg",
  "America/Halifax", "America/St_Johns", "America/Regina", "America/Montreal",
  "America/Moncton", "America/Glace_Bay", "America/Goose_Bay", "America/Thunder_Bay",
  "America/Whitehorse", "America/Yellowknife", "America/Iqaluit", "America/Dawson",
  "America/Dawson_Creek", "America/Creston", "America/Fort_Nelson", "America/Cambridge_Bay",
  "America/Rankin_Inlet", "America/Resolute", "America/Blanc-Sablon", "America/Nipigon",
  "America/Rainy_River", "America/Swift_Current", "America/Atikokan",
]);

export function detectCrisisRegion(timeZone: string | undefined | null): CrisisRegion {
  if (!timeZone) return "unknown";
  if (UK_IRELAND_ZONES.has(timeZone)) return "uk_ireland";
  if (US_CANADA_ZONES.has(timeZone)) return "us_canada";
  return "unknown";
}

// Wrapped in try/catch since Intl.DateTimeFormat().resolvedOptions() can
// throw in a locked-down or unusual environment - callers get null and
// fall back to "unknown" (today's fixed order) rather than a crash.
export function getBrowserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch (e) {
    return null;
  }
}
