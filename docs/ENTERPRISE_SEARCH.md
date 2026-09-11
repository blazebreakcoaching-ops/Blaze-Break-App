# Enterprise search with permission filtering

Part of the Blaze Break Enterprise backend foundation (depends on the role
system in `docs/ENTERPRISE_RBAC.md` and, for a real content source, the
connector registry in `docs/CONNECTOR_ADMIN.md`). This is the largest and
riskiest chunk in the plan — it's the one place a permission mistake means
someone sees content they shouldn't — and carries the heaviest test
coverage of any Enterprise module in this codebase.

## What's real, and what's a placeholder

**Real**: the permission boundary. `org-search.ts`'s `canAccessResource`
and `searchOrgResources` are pure, exhaustively tested functions that
decide — independent of anything about the query — whether a given
requester is allowed to see a given resource at all. That check runs
**unconditionally, before query matching**, so a resource that would
otherwise match perfectly is still excluded if the requester isn't
permitted to see it.

**A placeholder**: the actual query matching. Firestore has no full-text
or vector search engine in this stack — `matchesQuery` (internal to
`org-search.ts`) is a deliberately simple, case-insensitive,
every-token-must-appear substring matcher across a resource's title,
keywords, and body text. It is not ranked by relevance beyond that, and it
is not what a production enterprise search feature should ship with
long-term. A real search backend (Algolia, Typesense, or a vector store
like pgvector) would replace this specific function — and only this
function. The ACL layer was deliberately built provider-agnostic so that
swap never has to touch permission logic.

**Also a placeholder**: content ingestion. There is no automated pipeline
that pulls content from a connected Slack/Jira/Asana/etc. connector
(`docs/CONNECTOR_ADMIN.md`) and indexes it here. `POST
/api/org/:orgId/search/resources` is a manual/admin registration route —
the only way a resource becomes searchable today.

## Data model

`organisations/{orgId}/searchable_resources/{id}`:

| Field | Meaning |
|---|---|
| `title`, `contentType`, `chunkText`, `keywords[]` | The searchable content itself. |
| `sourceConnectorId` | Which connector (if any) this came from, or `null`. |
| `aclUids[]`, `aclRoles[]`, `aclTeams[]` | Access grants — see below. |
| `indexStatus` | `indexed` / `pending` / `error`. Only `indexed` resources are ever returned by search. |
| `indexedAt` | ISO timestamp. |

### Access control model

A resource with **all three ACL arrays empty** is unrestricted — visible to
any member who holds search access at all (which, per `org-rbac.ts`, is
every role except the specialised admin roles: `owner`, `admin`, `member`,
and `viewer` hold `org.search.query`; `billing_admin`, `security_admin`,
and `connector_admin` do not, and are refused the search route entirely).

Otherwise, access is an **inclusive OR** across whichever grants are
actually set — the same model as "shared with these people OR these
teams": the requester's `uid` is in `aclUids`, OR their `role` is in
`aclRoles`, OR their team (`organisations/{orgId}.memberTeams[uid]`, the
existing single-team-per-member label) is in `aclTeams`. Matching any one
is sufficient.

## Routes

- `POST /api/org/:orgId/search` — `org.search.query`. Body:
  `{ query, filters?: { sourceConnectorId?, contentType?, dateFrom?,
  dateTo? } }`. Fetches this org's `indexed` resources, resolves the
  caller's team from `org.memberTeams`, and runs `searchOrgResources` —
  ACL filter, then supplied filters, then query match, in that order.
  Response items carry a truncated `snippet` (max 500 characters), not the
  full stored `chunkText`.
- `POST /api/org/:orgId/search/resources` — registers a resource.
  Reuses `org.connectors.manage` (owner/admin/connector_admin) rather than
  introducing a new permission, since manual content registration is the
  same administrative act as managing what an org's connectors expose.
- `GET /api/org/:orgId/search/resources` — lists raw registered resources
  (admin visibility, same permission).
- `POST /api/org/:orgId/search/resources/:id/remove` — deletes one, same
  permission.

Every route is scoped by `orgId` in the Firestore path — `org-search.ts`'s
`searchOrgResources` itself has **no concept of organisation at all**; it
only ever sees whatever list of resources it's handed. Cross-org isolation
is therefore the caller's (`server.ts`'s) responsibility, enforced by only
ever querying one org's `searchable_resources` subcollection — verified
directly in `org-search.route.test.ts` by confirming org B's resources
never appear in org A's results even when both exist simultaneously.

## What audit logs never contain

`register_search_resource` and `remove_search_resource` audit entries
carry only `title`/`contentType` — never `chunkText`. This follows the
same rule already established in `docs/ENTERPRISE_RBAC.md`: audit entries
are structured field diffs, never raw content, even when the resource
itself is legitimately searchable content within the app.

## What a real implementation would need

1. A real search/indexing backend (Algolia, Typesense, or a vector store)
   behind `matchesQuery`'s current substring logic — swapping this in
   should not require touching `canAccessResource` or the ACL filtering
   order.
2. An actual ingestion pipeline connecting a connector's real OAuth
   handshake (once built — see `docs/CONNECTOR_ADMIN.md`) to
   automatically populate `searchable_resources`, replacing today's
   manual registration route.
3. Possibly, relevance ranking beyond the current all-or-nothing keyword
   match.

## Data lifecycle

`searchable_resources` is a real Firestore subcollection nested under
`organisations/{orgId}`, not a top-level collection queried by `userId` —
no entry needed in `user-data-collections.ts`.

## Testing

- `org-search.test.ts` — the heaviest unit coverage in this Enterprise
  backend: `canAccessResource`'s unrestricted/uid/role/team grants and
  inclusive-OR semantics, `searchOrgResources`'s unconditional ACL-before-
  query ordering, `indexStatus` filtering, tokenized AND-matching,
  per-dimension filter correctness, snippet truncation, and full
  `validateResourceCreate` validation.
- `org-search.route.test.ts` — the two highest-priority security
  properties from the plan: a role without a grant never sees a
  role-restricted resource (a permitted role does), and a Team A member
  never sees a Team B-only resource (a Team B member does) — plus RBAC on
  the registration routes, filter correctness at the route level, the
  removal lifecycle, cross-org isolation, and confirmation that no audit
  entry ever contains raw `chunkText`.
