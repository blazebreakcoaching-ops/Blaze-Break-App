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
const DELETE_FIELD = Symbol('deleteField');

export const FakeFieldValue = {
  serverTimestamp: () => SERVER_TIMESTAMP,
  arrayUnion: (...values: any[]): ArrayOp => ({ __arrayOp: 'union', values }),
  arrayRemove: (...values: any[]): ArrayOp => ({ __arrayOp: 'remove', values }),
  delete: () => DELETE_FIELD,
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
}

class DocRef {
  constructor(private store: FakeStore, public path: string) {}
  get id() { return this.path.split('/').pop() as string; }
  collection(id: string) { return new CollectionRef(this.store, `${this.path}/${id}`); }

  async get(): Promise<DocSnapshot> {
    return new DocSnapshot(this.store, this.path, this.store.docs.get(this.path));
  }

  async set(data: DocData) {
    this.store.docs.set(this.path, resolveWrites(data, undefined));
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

export class FakeFirestore {
  constructor(private store: FakeStore) {}
  collection(id: string) { return new CollectionRef(this.store, id); }

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
