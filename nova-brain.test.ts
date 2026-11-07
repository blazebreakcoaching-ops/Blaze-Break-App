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
// A switchable signed-in user, so account switching can be exercised.
const fakeAuth = vi.hoisted(() => ({ currentUser: null as null | { uid: string } }));
vi.mock("./src/lib/firebase", () => ({ auth: fakeAuth, db: {} }));

const {
  isNovaLearningAllowed, setNovaLearningAllowedForUid, novaLearningConsentKey,
  initNovaBrain, getNovaBrain, addNovaMemory, logJourney, updateNovaMemoryBySourceAndType,
} = await import("./src/lib/nova-brain");

const signIn = async (uid: string | null) => {
  fakeAuth.currentUser = uid ? { uid } : null;
  if (uid) await initNovaBrain(uid);
};

// Nova memory learning is OPT-IN per account (privacy by default). Consent
// is stored per Firebase UID, so one account's choice can never authorise
// learning for another account on the same browser.
describe("isNovaLearningAllowed", () => {
  beforeEach(async () => {
    (globalThis as any).localStorage.clear();
    await signIn(null);
  });

  it("is false when nobody is signed in", () => {
    expect(isNovaLearningAllowed()).toBe(false);
  });

  it("defaults to false for a signed-in account that has not opted in", async () => {
    await signIn("user_a");
    expect(isNovaLearningAllowed()).toBe(false);
  });

  it("is true only after this account explicitly opts in", async () => {
    await signIn("user_a");
    setNovaLearningAllowedForUid("user_a", true);
    expect(isNovaLearningAllowed()).toBe(true);
    setNovaLearningAllowedForUid("user_a", false);
    expect(isNovaLearningAllowed()).toBe(false);
  });

  it("ignores the legacy shared blaze_profile flag", async () => {
    await signIn("user_a");
    localStorage.setItem("blaze_profile", JSON.stringify({ letNovaLearn: true }));
    expect(isNovaLearningAllowed()).toBe(false);
  });

  it("treats a corrupted consent value as no consent", async () => {
    await signIn("user_a");
    localStorage.setItem(novaLearningConsentKey("user_a"), "{not json");
    expect(isNovaLearningAllowed()).toBe(false);
  });

  it("does not carry one account's consent over to the next account", async () => {
    await signIn("user_a");
    setNovaLearningAllowedForUid("user_a", true);
    await signIn("user_b");
    expect(isNovaLearningAllowed()).toBe(false);
  });
});

describe("memory writes respect the consent gate", () => {
  beforeEach(async () => {
    (globalThis as any).localStorage.clear();
    await signIn("user_a");
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

  it("addNovaMemory writes normally once this account has opted in", () => {
    setNovaLearningAllowedForUid("user_a", true);
    const before = getNovaBrain().length;
    addNovaMemory({ type: "state", content: "allowed", source: "test", confidence: "high", canEdit: true });
    expect(getNovaBrain().length).toBe(before + 1);
  });

  it("never shows the previous account's memories after switching accounts", async () => {
    setNovaLearningAllowedForUid("user_a", true);
    addNovaMemory({ type: "state", content: "private to A", source: "test", confidence: "high", canEdit: true });
    expect(getNovaBrain().some((m) => m.content === "private to A")).toBe(true);
    await signIn("user_b");
    expect(getNovaBrain().some((m) => m.content === "private to A")).toBe(false);
  });
});
