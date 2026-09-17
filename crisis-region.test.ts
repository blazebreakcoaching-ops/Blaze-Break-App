import { describe, it, expect } from "vitest";
import { detectCrisisRegion } from "./crisis-region";

describe("detectCrisisRegion", () => {
  it("recognises UK and Ireland time zones", () => {
    expect(detectCrisisRegion("Europe/London")).toBe("uk_ireland");
    expect(detectCrisisRegion("Europe/Dublin")).toBe("uk_ireland");
  });

  it("recognises common US and Canada time zones", () => {
    expect(detectCrisisRegion("America/New_York")).toBe("us_canada");
    expect(detectCrisisRegion("America/Los_Angeles")).toBe("us_canada");
    expect(detectCrisisRegion("America/Chicago")).toBe("us_canada");
    expect(detectCrisisRegion("America/Toronto")).toBe("us_canada");
    expect(detectCrisisRegion("America/Vancouver")).toBe("us_canada");
    expect(detectCrisisRegion("Pacific/Honolulu")).toBe("us_canada");
  });

  it("never mistakes a Latin American time zone for US/Canada, even sharing the America/ prefix", () => {
    expect(detectCrisisRegion("America/Mexico_City")).toBe("unknown");
    expect(detectCrisisRegion("America/Sao_Paulo")).toBe("unknown");
    expect(detectCrisisRegion("America/Bogota")).toBe("unknown");
  });

  it("returns unknown for an unrecognised, missing, or null time zone", () => {
    expect(detectCrisisRegion("Australia/Sydney")).toBe("unknown");
    expect(detectCrisisRegion(undefined)).toBe("unknown");
    expect(detectCrisisRegion(null)).toBe("unknown");
    expect(detectCrisisRegion("")).toBe("unknown");
  });
});
