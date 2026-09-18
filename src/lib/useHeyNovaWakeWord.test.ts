import { describe, it, expect } from "vitest";
import { extractQueryAfterWake } from "./useHeyNovaWakeWord";

describe("extractQueryAfterWake", () => {
  it("returns null when the wake phrase isn't present", () => {
    expect(extractQueryAfterWake("what tools help with a headache")).toBeNull();
    expect(extractQueryAfterWake("")).toBeNull();
  });

  it("returns the trimmed text spoken after the wake phrase", () => {
    expect(extractQueryAfterWake("hey nova show me my recovery plan")).toBe("show me my recovery plan");
    expect(extractQueryAfterWake("hey nova   i feel anxious  ")).toBe("i feel anxious");
  });

  it("returns an empty string when nothing followed the wake phrase yet", () => {
    expect(extractQueryAfterWake("hey nova")).toBe("");
    expect(extractQueryAfterWake("hey nova ")).toBe("");
  });

  it("matches case-insensitively but preserves the original casing of what follows", () => {
    expect(extractQueryAfterWake("Hey Nova Show Me Anxiety Reset")).toBe("Show Me Anxiety Reset");
    expect(extractQueryAfterWake("HEY NOVA drained")).toBe("drained");
  });

  it("matches the wake phrase wherever it appears, not just at the start", () => {
    expect(extractQueryAfterWake("okay hey nova open recovery plan")).toBe("open recovery plan");
  });
});
