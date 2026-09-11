import { OrgRole, isOrgRole } from './org-rbac';

// Pure logic for Enterprise search with permission filtering - kept
// I/O-free and unit-tested, same pattern as the rest of this Enterprise
// backend. This is the actual security boundary for the whole chunk, so it
// carries the heaviest test coverage in the plan. server.ts owns reading
// organisations/{orgId}/searchable_resources from Firestore (already
// scoped to one org by the collection path it's read from) and calling
// searchOrgResources with the result; nothing in this file talks to a
// database.
//
// Firestore has no full-text or vector search engine in this stack today -
// query matching here is a deliberately simple keyword/substring matcher,
// explicitly documented in docs/ENTERPRISE_SEARCH.md as a placeholder for
// a real search backend (Algolia/Typesense/pgvector) later. The ACL layer
// is built provider-agnostic specifically so that swap never has to touch
// permission logic - only matchesQuery would ever need to change.

export interface SearchableResource {
  id: string;
  title: string;
  contentType: string;
  sourceConnectorId: string | null;
  chunkText: string;
  keywords: string[];
  // Every ACL array empty means "unrestricted" - visible to any member
  // with search access. Otherwise access is an inclusive OR across
  // whichever of these three are actually specified (see canAccessResource).
  aclUids: string[];
  aclRoles: OrgRole[];
  aclTeams: string[];
  indexedAt: string;
  indexStatus: 'indexed' | 'pending' | 'error';
}

export interface SearchRequester {
  uid: string;
  role: OrgRole;
  team: string | null;
}

// The actual security boundary: whether `requester` may see `resource` at
// all, independent of whether it matches any search query. A resource with
// no ACL entries at all is a real, valid, unrestricted state - not a gap.
// Otherwise, access is granted if the requester matches ANY ONE of the
// grants that ARE specified (the same inclusive-OR model as "shared with
// these people OR these teams"), not a requirement to satisfy every
// dimension that happens to be set.
export const canAccessResource = (resource: SearchableResource, requester: SearchRequester): boolean => {
  const hasAnyAcl = resource.aclUids.length > 0 || resource.aclRoles.length > 0 || resource.aclTeams.length > 0;
  if (!hasAnyAcl) return true;
  if (resource.aclUids.includes(requester.uid)) return true;
  if (resource.aclRoles.includes(requester.role)) return true;
  if (requester.team && resource.aclTeams.includes(requester.team)) return true;
  return false;
};

export interface SearchFilters {
  sourceConnectorId?: string;
  contentType?: string;
  dateFrom?: string;
  dateTo?: string;
}

const matchesFilters = (resource: SearchableResource, filters: SearchFilters | undefined): boolean => {
  if (!filters) return true;
  if (filters.sourceConnectorId && resource.sourceConnectorId !== filters.sourceConnectorId) return false;
  if (filters.contentType && resource.contentType !== filters.contentType) return false;
  if (filters.dateFrom && resource.indexedAt < filters.dateFrom) return false;
  if (filters.dateTo && resource.indexedAt > filters.dateTo) return false;
  return true;
};

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

const matchesQuery = (resource: SearchableResource, queryTokens: string[]): boolean => {
  if (queryTokens.length === 0) return true;
  const haystack = [resource.title, ...resource.keywords, resource.chunkText].join(' ').toLowerCase();
  return queryTokens.every((token) => haystack.includes(token));
};

export interface SearchResultItem {
  id: string;
  title: string;
  contentType: string;
  sourceConnectorId: string | null;
  snippet: string;
  indexedAt: string;
}

const MAX_SNIPPET_LENGTH = 500;

const toResultItem = (resource: SearchableResource): SearchResultItem => ({
  id: resource.id,
  title: resource.title,
  contentType: resource.contentType,
  sourceConnectorId: resource.sourceConnectorId,
  snippet: resource.chunkText.length > MAX_SNIPPET_LENGTH ? `${resource.chunkText.slice(0, MAX_SNIPPET_LENGTH)}…` : resource.chunkText,
  indexedAt: resource.indexedAt,
});

// The single entry point server.ts's search route calls: given every
// indexed resource in one org (already scoped by the Firestore path it was
// read from - this function has no cross-org awareness of its own and
// must never be handed resources from more than one org at once), the
// requester's identity, a free-text query, and optional filters - returns
// only resources the requester is BOTH allowed to see AND that match the
// query. ACL filtering always happens first and unconditionally, before
// query matching or any filter - a resource the requester can't see is
// excluded regardless of how well it matches.
export const searchOrgResources = (
  resources: SearchableResource[],
  requester: SearchRequester,
  query: string,
  filters?: SearchFilters
): SearchResultItem[] => {
  const queryTokens = tokenize(query || '');
  return resources
    .filter((r) => r.indexStatus === 'indexed')
    .filter((r) => canAccessResource(r, requester))
    .filter((r) => matchesFilters(r, filters))
    .filter((r) => matchesQuery(r, queryTokens))
    .map(toResultItem);
};

// ---- Validation for manually registering a searchable resource ----
// There is no automated content-ingestion pipeline in this codebase (see
// docs/ENTERPRISE_SEARCH.md) - this validates a manually/admin-registered
// entry, the only way a resource gets indexed today.

export interface ResourceValidationResult {
  valid: boolean;
  error?: string;
}

const MAX_TITLE_LENGTH = 300;
const MAX_CHUNK_TEXT_LENGTH = 20000;
const MAX_KEYWORDS = 50;
const MAX_ACL_ENTRIES = 100;

const validateStringArray = (value: unknown, field: string, max: number): ResourceValidationResult => {
  if (value === undefined) return { valid: true };
  if (!Array.isArray(value)) {
    return { valid: false, error: `"${field}" must be an array if provided.` };
  }
  if (value.length > max) {
    return { valid: false, error: `"${field}" cannot list more than ${max} entries.` };
  }
  if (value.some((v) => typeof v !== 'string' || v.trim().length === 0)) {
    return { valid: false, error: `"${field}" entries must be non-empty strings.` };
  }
  return { valid: true };
};

export const validateResourceCreate = (input: unknown): ResourceValidationResult => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'A searchable resource object is required.' };
  }
  const candidate = input as Record<string, unknown>;
  if (typeof candidate.title !== 'string' || candidate.title.trim().length === 0) {
    return { valid: false, error: '"title" must be a non-empty string.' };
  }
  if (candidate.title.length > MAX_TITLE_LENGTH) {
    return { valid: false, error: `"title" must be ${MAX_TITLE_LENGTH} characters or fewer.` };
  }
  if (typeof candidate.contentType !== 'string' || candidate.contentType.trim().length === 0) {
    return { valid: false, error: '"contentType" must be a non-empty string.' };
  }
  if (typeof candidate.chunkText !== 'string' || candidate.chunkText.trim().length === 0) {
    return { valid: false, error: '"chunkText" must be a non-empty string.' };
  }
  if (candidate.chunkText.length > MAX_CHUNK_TEXT_LENGTH) {
    return { valid: false, error: `"chunkText" must be ${MAX_CHUNK_TEXT_LENGTH} characters or fewer.` };
  }
  const keywordsResult = validateStringArray(candidate.keywords, 'keywords', MAX_KEYWORDS);
  if (!keywordsResult.valid) return keywordsResult;
  const aclUidsResult = validateStringArray(candidate.aclUids, 'aclUids', MAX_ACL_ENTRIES);
  if (!aclUidsResult.valid) return aclUidsResult;
  const aclTeamsResult = validateStringArray(candidate.aclTeams, 'aclTeams', MAX_ACL_ENTRIES);
  if (!aclTeamsResult.valid) return aclTeamsResult;
  if (candidate.aclRoles !== undefined) {
    if (!Array.isArray(candidate.aclRoles)) {
      return { valid: false, error: '"aclRoles" must be an array if provided.' };
    }
    if (candidate.aclRoles.some((r: unknown) => !isOrgRole(r))) {
      return { valid: false, error: '"aclRoles" entries must be valid organisation roles.' };
    }
  }
  if (candidate.sourceConnectorId !== undefined && candidate.sourceConnectorId !== null && typeof candidate.sourceConnectorId !== 'string') {
    return { valid: false, error: '"sourceConnectorId" must be a string or null.' };
  }
  return { valid: true };
};
