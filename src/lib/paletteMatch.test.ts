import { describe, it, expect } from "vitest";
import { matchTabs, getAvailableMoods, MOODS } from "./paletteMatch";

const TABS = [
  { id: "home", label: "Home" },
  { id: "reset", label: "Nervous System Reset" },
  { id: "anxiety_reset", label: "Anxiety Reset" },
  { id: "recover", label: "Recovery Hub" },
  { id: "reflect", label: "Reflect" },
];

describe("matchTabs", () => {
  it("returns every tab for an empty query", () => {
    expect(matchTabs(TABS, "")).toEqual(TABS);
    expect(matchTabs(TABS, "   ")).toEqual(TABS);
  });

  it("matches on a tab's own label", () => {
    expect(matchTabs(TABS, "reflect").map((t) => t.id)).toEqual(["reflect"]);
  });

  it("matches on a keyword synonym, not just the label", () => {
    // "panic" is a synonym for both reset and anxiety_reset, not their label.
    const ids = matchTabs(TABS, "panic").map((t) => t.id);
    expect(ids).toContain("reset");
    expect(ids).toContain("anxiety_reset");
  });

  it("matches case-insensitively", () => {
    expect(matchTabs(TABS, "DRAINED").map((t) => t.id)).toEqual(["recover"]);
  });

  it("returns nothing for a query with no match", () => {
    expect(matchTabs(TABS, "xyzzy nonsense")).toEqual([]);
  });

  it("only matches tabs actually present in the given list", () => {
    // "org" has keywords but isn't in TABS - must not appear.
    const ids = matchTabs(TABS, "workplace").map((t) => t.id);
    expect(ids).toEqual([]);
  });
});

describe("getAvailableMoods", () => {
  it("only returns moods whose target tab is available", () => {
    const available = getAvailableMoods(new Set(["reset", "recover"]));
    expect(available.every((m) => m.tab === "reset" || m.tab === "recover")).toBe(true);
    expect(available.length).toBeGreaterThan(0);
  });

  it("returns nothing when no mood targets are available", () => {
    expect(getAvailableMoods(new Set(["home"]))).toEqual([]);
  });

  it("never returns a mood pointing at an id absent from MOODS", () => {
    const allTabIds = new Set(MOODS.map((m) => m.tab));
    const available = getAvailableMoods(allTabIds);
    expect(available.length).toBe(MOODS.length);
  });
});
