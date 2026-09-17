import { describe, it, expect } from "vitest";
import { getTimeOfDay, buildDashboardGreeting } from "./dashboard-greeting";

describe("getTimeOfDay", () => {
  it("buckets the day into morning/afternoon/evening/night", () => {
    expect(getTimeOfDay(5)).toBe("morning");
    expect(getTimeOfDay(11)).toBe("morning");
    expect(getTimeOfDay(12)).toBe("afternoon");
    expect(getTimeOfDay(16)).toBe("afternoon");
    expect(getTimeOfDay(17)).toBe("evening");
    expect(getTimeOfDay(20)).toBe("evening");
    expect(getTimeOfDay(21)).toBe("night");
    expect(getTimeOfDay(4)).toBe("night");
    expect(getTimeOfDay(0)).toBe("night");
  });
});

describe("buildDashboardGreeting", () => {
  it("includes the first name when one is provided", () => {
    const greeting = buildDashboardGreeting(9, "Tourae", 0);
    expect(greeting).toContain("Tourae");
  });

  it("never mentions a name when none is provided", () => {
    for (let i = 0; i < 5; i++) {
      const greeting = buildDashboardGreeting(9, null, i / 5);
      expect(greeting.toLowerCase()).not.toContain("undefined");
      expect(greeting.toLowerCase()).not.toContain("null");
    }
  });

  it("picks a different variant depending on the random value, for the same hour", () => {
    const variants = new Set<string>();
    for (let i = 0; i < 5; i++) {
      variants.add(buildDashboardGreeting(9, "Tourae", i / 5));
    }
    // 5 distinct template slots in the morning bucket - every one should be reachable.
    expect(variants.size).toBe(5);
  });

  it("is deterministic for the same inputs", () => {
    const a = buildDashboardGreeting(14, "Tourae", 0.42);
    const b = buildDashboardGreeting(14, "Tourae", 0.42);
    expect(a).toBe(b);
  });

  it("produces a plausible greeting for each time-of-day bucket", () => {
    expect(buildDashboardGreeting(8, "Tourae", 0)).toMatch(/morning/i);
    expect(buildDashboardGreeting(14, "Tourae", 0)).toMatch(/afternoon/i);
    expect(buildDashboardGreeting(18, "Tourae", 0)).toMatch(/evening/i);
    expect(buildDashboardGreeting(23, "Tourae", 0)).toContain("Tourae");
  });

  it("clamps out-of-range random values instead of throwing", () => {
    expect(() => buildDashboardGreeting(9, "Tourae", 1)).not.toThrow();
    expect(() => buildDashboardGreeting(9, "Tourae", -1)).not.toThrow();
  });
});
