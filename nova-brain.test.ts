import { describe, it, expect, beforeEach, vi } from "vitest";

// nova-brain.ts is a browser module (localStorage, window.dispatchEvent,
// the Firebase client SDK) but this suite runs under vitest's node
// environment like every other test here - so the browser globals it
// touches are polyfilled directly rather than pulling in jsdom for one file.
class FakeLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

(globalThis as any).localStorage = new FakeLocalStorage();
(globalThis as any).window = { dispatchEvent: () => true };

// firebase/firestore's writes (setDoc/getDocs/deleteDoc) aren't exercised
// by this suite - isNovaLearningAllowed() is a pure localStorage read, and
// the no-op assertions below prove nova-brain.ts returns before it ever
// reaches a Firestore call. Mocked anyway so importing the module can't
// attempt a real network call if that ever changes.
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  query: vi.fn(),
  orderBy: vi.fn(),
}));
vi.mock("./src/lib/firebase", () => ({ auth: { currentUser: null }, db: {} }));

const { isNovaLearningAllowed, getNovaBrain, addNovaMemory, logJourney, updateNovaMemoryBySourceAndType } =
  await import("./src/lib/nova-brain");

describe("isNovaLearningAllowed", () => {
  beforeEach(() => {
    (globalThis as any).localStorage.clear();
  });

  it("defaults to true when no profile has been saved yet", () => {
    expect(isNovaLearningAllowed()).toBe(true);
  });

  it("is true when letNovaLearn is unset on a saved profile", () => {
    localStorage.setItem("blaze_profile", JSON.stringify({ fullName: "A" }));
    expect(isNovaLearningAllowed()).toBe(true);
  });

  it("is true when letNovaLearn is explicitly true", () => {
    localStorage.setItem("blaze_profile", JSON.stringify({ letNovaLearn: true }));
    expect(isNovaLearningAllowed()).toBe(true);
  });

  it("is false when letNovaLearn is explicitly false", () => {
    localStorage.setItem("blaze_profile", JSON.stringify({ letNovaLearn: false }));
    expect(isNovaLearningAllowed()).toBe(false);
  });

  it("defaults to true if the saved profile is corrupted JSON", () => {
    localStorage.setItem("blaze_profile", "{not json");
    expect(isNovaLearningAllowed()).toBe(true);
  });
});

describe("memory writes respect the consent gate", () => {
  beforeEach(() => {
    (globalThis as any).localStorage.clear();
    localStorage.setItem("blaze_profile", JSON.stringify({ letNovaLearn: false }));
  });

  it("addNovaMemory no-ops when consent is off", () => {
    const before = getNovaBrain().length;
    addNovaMemory({ type: "state", content: "should not be saved", source: "test", confidence: "high", canEdit: true });
    expect(getNovaBrain().length).toBe(before);
  });

  it("logJourney no-ops when consent is off", () => {
    const before = getNovaBrain().length;
    logJourney("some action");
    expect(getNovaBrain().length).toBe(before);
  });

  it("updateNovaMemoryBySourceAndType no-ops when consent is off", () => {
    const before = getNovaBrain().length;
    updateNovaMemoryBySourceAndType("Test Source", "state", { content: "should not be saved", confidence: "high", canEdit: true });
    expect(getNovaBrain().length).toBe(before);
  });

  it("addNovaMemory writes normally once consent is on", () => {
    localStorage.setItem("blaze_profile", JSON.stringify({ letNovaLearn: true }));
    const before = getNovaBrain().length;
    addNovaMemory({ type: "state", content: "allowed", source: "test", confidence: "high", canEdit: true });
    expect(getNovaBrain().length).toBe(before + 1);
  });
});
