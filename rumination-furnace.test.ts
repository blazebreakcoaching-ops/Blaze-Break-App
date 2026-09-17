import { describe, it, expect } from "vitest";
import { nextRuminationUseCount, buildRuminationMemoryContent } from "./rumination-furnace";

describe("nextRuminationUseCount", () => {
  it("starts at 1 when there's no existing memory", () => {
    expect(nextRuminationUseCount(undefined)).toBe(1);
  });

  it("increments from an existing recorded count", () => {
    expect(nextRuminationUseCount("Used the rumination-release ritual (use #3).")).toBe(4);
  });

  it("falls back to 1 if the existing content doesn't match the expected shape", () => {
    expect(nextRuminationUseCount("some unrelated memory content")).toBe(1);
  });
});

describe("buildRuminationMemoryContent", () => {
  it("only ever takes a count, never raw text - the tool's core privacy promise", () => {
    // The function signature itself is the guarantee: it has no parameter
    // for the burned text, so it is structurally impossible for this
    // function to leak it. This test just pins the exact wording.
    expect(buildRuminationMemoryContent(1)).toBe("Used the rumination-release ritual (use #1).");
    expect(buildRuminationMemoryContent(12)).toBe("Used the rumination-release ritual (use #12).");
  });

  it("never echoes anything resembling free-text input", () => {
    const content = buildRuminationMemoryContent(5);
    // A crude but meaningful guard: the only variable part of this string
    // is a number, so its length is bounded regardless of how much the
    // user typed into the furnace.
    expect(content.length).toBeLessThan(60);
  });
});
