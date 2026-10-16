// A small in-memory stand-in for the firebase-admin Firestore, built to
// support exactly the surface the route handlers under test actually use:
// nested collection/doc paths, get/set/update/delete, where('==')/where('>=')
// filtering, orderBy(desc) + limit, listCollections(), and recursiveDelete().
//
// It is deliberately NOT a general Firestore emulator. It exists so the
// route-level integration tests can exercise real handler logic - auth
// scoping, cooldown/limit queries, export/erasure completeness - against a
// controllable store, without a live backend. Anything a handler doesn't do
// is intentionally unimplemented rather than guessed at.

type DocData = Record<string, any>;

// Sentinels produced by the fake FieldValue and resolved inside set/update,
// mirroring how firebase-admin defers these to write time.
const SERVER_TIMESTAMP = Symbol('serverTimestamp');
interface ArrayOp { __arrayOp: 'union' | 'remove'; values: any[]; }
interface IncrementOp { __increment: number; }
const DELETE_FIELD = Symbol('deleteField');

export const FakeFieldValue = {
  serverTimestamp: () => SERVER_TIMESTAMP,
  arrayUnion: (...values: any[]): ArrayOp => ({ __arrayOp: 'union', values }),
  arrayRemove: (...values: any[]): ArrayOp => ({ __arrayOp: 'remove', values }),
  delete: () => DELETE_FIELD,
  increment: (n: number): IncrementOp => ({ __increment: n }),
};

let autoIdCounter = 0;
const nextAutoId = () => `auto_${(++autoIdCounter).toString(36)}_${Date.now().toString(36)}`;

// The fixed "now" the serverTimestamp sentinel resolves to. Kept as an ISO
// string so tests comparing timestamps stay deterministic; tests can move it.
let fakeNowIso = new Date('2026-01-01T00:00:00.000Z').toISOString();

// Resolves one write-value sentinel (or plain value) against whatever
// currently sits at that spot - shared by both the top-level-key path and
// the dotted-field-path below so a sentinel behaves identically either way.
function resolveValue(value: any, current: any): any {
  if (value === SERVER_TIMESTAMP) return fakeNowIso;
  if (value === DELETE_FIELD) return undefined; // caller deletes the key
  if (value && typeof value === 'object' && (value as ArrayOp).__arrayOp) {
    const op = value as ArrayOp;
    const arr: any[] = Array.isArray(current) ? current.slice() : [];
    if (op.__arrayOp === 'remove') return arr.filter((v) => !op.values.includes(v));
    for (const v of op.values) if (!arr.includes(v)) arr.push(v);
    return arr;
  }
  if (value && typeof value === 'object' && typeof (value as IncrementOp).__increment === 'number') {
    const base = typeof current === 'number' ? current : 0;
    return base + (value as IncrementOp).__increment;
  }
  return value;
}

// A key containing '.' is a real Firestore field-path update - it reaches
// into (creating, if absent) nested maps without disturbing sibling keys,
// exactly like the Admin SDK's update({'a.b': value}) does against real
// Firestore. This matters here because several routes (memberTeams.{uid},
// teamManagers.{uid}) rely on that exact semantic, and getting it wrong in
// this fake would silently pass a broken write path in every test.
function setAtPath(root: DocData, path: string, value: any): void {
  const segments = path.split('.');
  let node = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (typeof node[seg] !== 'object' || node[seg] === null || Array.isArray(node[seg])) {
      node[seg] = {};
    }
    node = node[seg];
  }
  const lastSeg = segments[segments.length - 1];
  const resolved = resolveValue(value, node[lastSeg]);
  if (resolved === undefined) delete node[lastSeg];
  else node[lastSeg] = resolved;
}

function resolveWrites(data: DocData, existing: DocData | undefined): DocData {
  const out: DocData = { ...(existing || {}) };
  for (const [key, value] of Object.entries(data)) {
    if (key.includes('.')) {
      setAtPath(out, key, value);
      continue;
    }
    const resolved = resolveValue(value, out[key]);
    if (resolved === undefined) delete out[key];
    else out[key] = resolved;
  }
  return out;
}

type WhereClause = [string, string, any];

function matchesWhere(data: DocData, [field, op, value]: WhereClause): boolean {
  const actual = data[field];
  switch (op) {
    case '==': return actual === value;
    case '!=': return actual !== value;
    case '>=': return actual >= value;
    case '>': return actual > value;
    case '<=': return actual <= value;
    case '<': return actual < value;
    default: throw new Error(`fake-firestore: unsupported where operator '${op}'`);
  }
}

class FakeStore {
  // Flat map of full document path -> data. A path has an even number of
  // segments (collection/doc/collection/doc...).
  docs = new Map<string, DocData>();

  clear() { this.docs.clear(); }
}

class QuerySnapshot {
  constructor(public docs: DocSnapshot[]) {}
  get empty() { return this.docs.length === 0; }
  get size() { return this.docs.length; }
  forEach(cb: (d: DocSnapshot) => void) { this.docs.forEach(cb); }
}

class DocSnapshot {
  constructor(private store: FakeStore, public path: string, private raw: DocData | undefined) {}
  get id() { return this.path.split('/').pop() as string; }
  get exists() { return this.raw !== undefined; }
  get ref() { return new DocRef(this.store, this.path); }
  data() { return this.raw ? { ...this.raw } : undefined; }
}

class CollectionRef {
  private clauses: WhereClause[] = [];
  private order: { field: string; dir: 'asc' | 'desc' } | null = null;
  private limitN: number | null = null;

  constructor(private store: FakeStore, public path: string) {}

  get id() { return this.path.split('/').pop() as string; }

  doc(id?: string) {
    return new DocRef(this.store, `${this.path}/${id || nextAutoId()}`);
  }

  async add(data: DocData) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }

  where(field: string, op: string, value: any) {
    const q = this.clone();
    q.clauses.push([field, op, value]);
    return q;
  }

  orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
    const q = this.clone();
    q.order = { field, dir };
    return q;
  }

  limit(n: number) {
    const q = this.clone();
    q.limitN = n;
    return q;
  }

  private clone() {
    const q = new CollectionRef(this.store, this.path);
    q.clauses = this.clauses.slice();
    q.order = this.order;
    q.limitN = this.limitN;
    return q;
  }

  async get(): Promise<QuerySnapshot> {
    const depth = this.path.split('/').length; // collection path segment count
    let rows: DocSnapshot[] = [];
    for (const [docPath, data] of this.store.docs.entries()) {
      const segs = docPath.split('/');
      // A direct child document of this collection: exactly one more segment,
      // and the parent collection path matches.
      if (segs.length === depth + 1 && docPath.startsWith(this.path + '/')) {
        if (this.clauses.every((c) => matchesWhere(data, c))) {
          rows.push(new DocSnapshot(this.store, docPath, data));
        }
      }
    }
    if (this.order) {
      const { field, dir } = this.order;
      rows.sort((a, b) => {
        const av = (a.data() as DocData)[field];
        const bv = (b.data() as DocData)[field];
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * (dir === 'desc' ? -1 : 1);
      });
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    return new QuerySnapshot(rows);
  }

  // Real Firestore: null for a root collection, otherwise the document it's
  // nested under. Derived from the path string rather than tracked
  // separately, same as everything else in this file.
  get parent(): DocRef | null {
    const segs = this.path.split('/');
    return segs.length > 1 ? new DocRef(this.store, segs.slice(0, -1).join('/')) : null;
  }
}

// A collection-group query matches every document whose immediate parent
// collection id equals `collectionId`, at any depth/any parent document -
// unlike CollectionRef, which only matches direct children of one fixed
// path. Supports the where/get subset the routes under test actually use.
class CollectionGroupRef {
  private clauses: WhereClause[] = [];
  private limitN: number | null = null;

  constructor(private store: FakeStore, private collectionId: string) {}

  where(field: string, op: string, value: any) {
    const q = new CollectionGroupRef(this.store, this.collectionId);
    q.clauses = [...this.clauses, [field, op, value]];
    q.limitN = this.limitN;
    return q;
  }

  limit(n: number) {
    const q = new CollectionGroupRef(this.store, this.collectionId);
    q.clauses = this.clauses;
    q.limitN = n;
    return q;
  }

  async get(): Promise<QuerySnapshot> {
    const rows: DocSnapshot[] = [];
    for (const [docPath, data] of this.store.docs.entries()) {
      const segs = docPath.split('/');
      // Even length (…/collection/doc), and the collection segment right
      // before the doc id matches this group's collection id.
      if (segs.length % 2 === 0 && segs[segs.length - 2] === this.collectionId) {
        if (this.clauses.every((c) => matchesWhere(data, c))) {
          rows.push(new DocSnapshot(this.store, docPath, data));
          if (this.limitN !== null && rows.length >= this.limitN) break;
        }
      }
    }
    return new QuerySnapshot(rows);
  }
}

class DocRef {
  constructor(private store: FakeStore, public path: string) {}
  get id() { return this.path.split('/').pop() as string; }
  collection(id: string) { return new CollectionRef(this.store, `${this.path}/${id}`); }
  // Real Firestore: a document's parent is always the collection it lives
  // in (never null) - see CollectionRef.parent for the other direction.
  get parent(): CollectionRef { return new CollectionRef(this.store, this.path.split('/').slice(0, -1).join('/')); }

  async get(): Promise<DocSnapshot> {
    return new DocSnapshot(this.store, this.path, this.store.docs.get(this.path));
  }

  async set(data: DocData, options?: { merge?: boolean }) {
    const existing = options?.merge ? this.store.docs.get(this.path) : undefined;
    this.store.docs.set(this.path, resolveWrites(data, existing));
  }

  async update(data: DocData) {
    const existing = this.store.docs.get(this.path);
    if (!existing) throw new Error(`fake-firestore: update on missing doc ${this.path}`);
    this.store.docs.set(this.path, resolveWrites(data, existing));
  }

  async delete() {
    this.store.docs.delete(this.path);
  }

  // Distinct immediate child collection ids under this document.
  async listCollections(): Promise<CollectionRef[]> {
    const prefix = this.path + '/';
    const childCollections = new Set<string>();
    const docDepth = this.path.split('/').length;
    for (const docPath of this.store.docs.keys()) {
      if (docPath.startsWith(prefix)) {
        const segs = docPath.split('/');
        // child collection id sits at index docDepth
        if (segs.length > docDepth) childCollections.add(segs[docDepth]);
      }
    }
    return [...childCollections].map((id) => new CollectionRef(this.store, `${this.path}/${id}`));
  }
}

// The fake is single-threaded and in-memory, so a "transaction" here needs
// no optimistic-concurrency/retry machinery - it just has to expose the same
// tx.get()/set()/update()/delete() surface real handler code calls, applying
// writes immediately against the shared store.
class FakeTransaction {
  constructor(private store: FakeStore) {}

  async get(ref: DocRef): Promise<DocSnapshot>;
  async get(ref: CollectionRef): Promise<QuerySnapshot>;
  async get(ref: DocRef | CollectionRef): Promise<DocSnapshot | QuerySnapshot> {
    if (ref instanceof CollectionRef) return ref.get();
    return new DocSnapshot(this.store, ref.path, this.store.docs.get(ref.path));
  }

  set(ref: DocRef, data: DocData, options?: { merge?: boolean }) {
    const existing = options?.merge ? this.store.docs.get(ref.path) : undefined;
    this.store.docs.set(ref.path, resolveWrites(data, existing));
    return this;
  }

  update(ref: DocRef, data: DocData) {
    const existing = this.store.docs.get(ref.path);
    if (!existing) throw new Error(`fake-firestore: update on missing doc ${ref.path}`);
    this.store.docs.set(ref.path, resolveWrites(data, existing));
    return this;
  }

  delete(ref: DocRef) {
    this.store.docs.delete(ref.path);
    return this;
  }
}

export class FakeFirestore {
  // FIFO queue so concurrent runTransaction calls below never interleave
  // their bodies - see the comment there for why this matters.
  private txQueue: Promise<void> = Promise.resolve();

  constructor(private store: FakeStore) {}
  collection(id: string) { return new CollectionRef(this.store, id); }
  collectionGroup(id: string) { return new CollectionGroupRef(this.store, id); }

  // Batched multi-doc read, same signature as the real Admin SDK's
  // db.getAll(...refs) - returns one DocSnapshot per ref, same order as
  // given.
  async getAll(...refs: DocRef[]): Promise<DocSnapshot[]> {
    return refs.map((ref) => new DocSnapshot(this.store, ref.path, this.store.docs.get(ref.path)));
  }

  // Deletes a document (or every doc within a collection) and everything
  // nested beneath it - the erasure the delete-account endpoint relies on.
  async recursiveDelete(ref: DocRef | CollectionRef) {
    const prefix = ref.path + '/';
    for (const docPath of [...this.store.docs.keys()]) {
      if (docPath === ref.path || docPath.startsWith(prefix)) {
        this.store.docs.delete(docPath);
      }
    }
  }

  // Real Firestore transactions are serialized against each other - two
  // concurrent calls never interleave their reads and writes. The fake has
  // no real I/O to naturally serialize on, and FakeTransaction.get is an
  // async function (so awaiting it already yields to the microtask queue),
  // so without this, two "concurrent" callers here could interleave at
  // that await point exactly the way a real race does - silently
  // defeating the whole point of a route using a transaction to close one.
  async runTransaction<T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    let release!: () => void;
    const prior = this.txQueue;
    this.txQueue = new Promise((resolve) => { release = resolve; });
    await prior;
    try {
      return await fn(new FakeTransaction(this.store));
    } finally {
      release();
    }
  }
}

// ---- Test harness surface -------------------------------------------------

const sharedStore = new FakeStore();
export const fakeDb = new FakeFirestore(sharedStore);

// Seed / inspect helpers for tests. seedDoc writes raw data at a full path
// (no sentinel resolution) so tests can set up fixtures directly.
export function seedDoc(path: string, data: DocData) {
  sharedStore.docs.set(path, { ...data });
}
export function getDocRaw(path: string): DocData | undefined {
  const d = sharedStore.docs.get(path);
  return d ? { ...d } : undefined;
}
export function allPaths(): string[] {
  return [...sharedStore.docs.keys()].sort();
}
export function resetStore() {
  sharedStore.clear();
  autoIdCounter = 0;
}
export function setFakeNow(iso: string) {
  fakeNowIso = iso;
}

// Forces one specific document's get/set/update/delete to reject, so a
// test can exercise a route's defensive catch-block (the "Firestore itself
// threw" backstop behind an already-tested happy path) without having to
// fake an entire outage. Scoped to a single doc path - every other
// document in the same request still behaves normally - by checking
// `this.path` inside the override before deciding whether to delegate to
// the real implementation. DocRef itself isn't exported (this file keeps
// its internals private), so the class is reached the same way any caller
// would reach an instance of it: off a real doc. No vitest import here -
// this file stays test-framework-agnostic; the returned restore function
// is what a test's own afterEach/try-finally calls.
export function forceDocError(path: string, method: 'get' | 'set' | 'update' | 'delete', error: Error): () => void {
  const probe = fakeDb.collection('__force_doc_error_probe__').doc('__probe__');
  const DocRefCtor = Object.getPrototypeOf(probe).constructor as any;
  const original = DocRefCtor.prototype[method];
  DocRefCtor.prototype[method] = function (this: any, ...args: any[]) {
    if (this.path === path) return Promise.reject(error);
    return original.apply(this, args);
  };
  return () => {
    DocRefCtor.prototype[method] = original;
  };
}

// Same idea for db.runTransaction(...) itself - the routes that read/write
// through a transaction (e.g. the MFA verify/disable lockout logic) never
// call DocRef.get()/.set() directly, so forceDocError above can't reach
// them.
export function forceTransactionError(error: Error): () => void {
  const original = FakeFirestore.prototype.runTransaction;
  FakeFirestore.prototype.runTransaction = function (): Promise<never> {
    return Promise.reject(error);
  };
  return () => {
    FakeFirestore.prototype.runTransaction = original;
  };
}

// Same idea as forceDocError, but for a collection-level call
// (`.get()` on a query, or `.add()`, which creates its own auto-id doc so
// there's no fixed doc path to target with forceDocError). Scoped to one
// exact collection path the same way - `this.path` check inside the
// override - so e.g. forcing `users/u1/guardian_alerts` to fail on `get`
// never touches a `guardian_alerts` collection under a different uid, or
// any other collection in the same request.
export function forceCollectionError(path: string, method: 'get' | 'add', error: Error): () => void {
  const probe = fakeDb.collection('__force_collection_error_probe__');
  const CollectionRefCtor = Object.getPrototypeOf(probe).constructor as any;
  const original = CollectionRefCtor.prototype[method];
  CollectionRefCtor.prototype[method] = function (this: any, ...args: any[]) {
    if (this.path === path) return Promise.reject(error);
    return original.apply(this, args);
  };
  return () => {
    CollectionRefCtor.prototype[method] = original;
  };
}

// Same idea again, but for db.collectionGroup(id).get() - a different
// class from CollectionRef (no fixed parent path, matches a collection id
// at any depth), used by the handful of routes that scan one collection
// id across every user/org rather than reading a single fixed path.
// Scoped by collection id rather than a path, since that's the only
// identifier a collection-group query has.
export function forceCollectionGroupError(collectionId: string, error: Error): () => void {
  const probe = fakeDb.collectionGroup('__force_collection_group_error_probe__');
  const CollectionGroupRefCtor = Object.getPrototypeOf(probe).constructor as any;
  const original = CollectionGroupRefCtor.prototype.get;
  CollectionGroupRefCtor.prototype.get = function (this: any, ...args: any[]) {
    if (this.collectionId === collectionId) return Promise.reject(error);
    return original.apply(this, args);
  };
  return () => {
    CollectionGroupRefCtor.prototype.get = original;
  };
}
