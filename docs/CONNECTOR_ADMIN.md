# Enterprise connector admin

Part of the Blaze Break Enterprise backend foundation (depends on the role
system in `docs/ENTERPRISE_RBAC.md`).

## What this is

An org-level, admin-managed registry of content connectors —
`organisations/{orgId}/connectors/{id}` — distinct from the existing
per-user OAuth integrations under `/api/integrations/*` (Slack, Jira,
Asana, Calendly, Monday, connected by an individual member for their own
personal use). A connector here represents the *organisation's* own
administrative record for one of those same services, or for `local`, a
genuinely different type with nothing external to connect to at all.

`org-connectors.ts` is the pure logic: the registry of known connector
types (`ORG_CONNECTOR_TYPES`), validation for creating one, and — the part
worth reading carefully — `initialAuthStatus`, the single function that
decides what status a brand-new connector starts with.

## The honesty rule this chunk exists to enforce

**No route in this codebase ever marks a connector's `authStatus` as
`connected` without a real OAuth handshake actually happening.**

Today, that handshake does not exist at the org level. Creating a `slack`,
`jira`, `asana`, `calendly`, or `monday` connector registers the org's
intent to use that service and starts it at `not_connected` — an honest
statement of "not yet wired up," not a fake green checkmark. It stays
`not_connected` until a real per-org OAuth flow is built (see "What's
missing" below).

`local` is the one type that is not a placeholder: it represents locally
uploaded documents, has no external auth step at all, and is created with
`authStatus: not_applicable` — again, never `connected`, because nothing
was ever connected; there was simply nothing to connect.

## Status vs. auth status

Two independent fields track different things:

- `status` (`active` / `disabled` / `revoked`) — whether an admin has
  turned this connector on. Fully real and fully enforced today.
- `authStatus` (`not_connected` / `connected` / `error` / `not_applicable`)
  — whether it has a working credential. Honest, but for every OAuth-backed
  type, permanently `not_connected` until the real handshake ships.

`enable` sets `status: active`. `disable` sets `status: disabled` without
touching credentials (a temporary pause). `revoke` is the harder stop: it
sets `status: revoked` **and** resets `authStatus` back to its honest
starting point, since re-enabling an OAuth-backed connector after a revoke
will need a fresh handshake once one exists — never a resumed old one.

## Routes (all under `/api/org/:orgId/connectors...`)

- `GET /connectors` — `org.connectors.view` (owner, admin, connector_admin,
  and **viewer**, per `org-rbac.ts`). Returns the redacted status view for
  everyone; only a caller who also holds `org.connectors.manage` sees
  detail fields (`configuredBy`, `lastError`, reindex state).
- `POST /connectors` — `org.connectors.manage` (owner, admin,
  connector_admin only). Body: `{ type, displayName, restrictedToTeams? }`.
  `restrictedToTeams` reuses the free-text team labels already used by
  `organisations/{orgId}.memberTeams` to optionally scope a connector to
  specific teams; omitted means available to the whole org.
- `POST /connectors/:id/enable` / `/disable` / `/revoke` —
  `org.connectors.manage`.
- `POST /connectors/:id/reindex` — `org.connectors.manage`. Marks
  `reindexStatus: pending` and records when it was requested. **No
  background indexing worker exists in this codebase** — this route
  records the request; it does not process it. The response says so
  explicitly rather than implying a reindex happened.

Every mutating route is scoped by `orgId` in the Firestore path itself, so
one org's admin can never read or act on another org's connector — tested
directly in `org-connectors.route.test.ts`.

## What's missing to make this real

Turning an OAuth-backed connector `connected` requires an org-scoped
version of the same three-step flow `/api/integrations/*` already does per
user (signed state → provider redirect → token exchange), storing the
resulting token under `organisations/{orgId}/connectors/{id}` (or a
locked-down subdocument of it) rather than a personal `users/{uid}` path.
That flow is not built in this chunk — this chunk is the admin
registry, RBAC, and audit trail around connectors, ready for that flow to
plug into once it exists.

## Data lifecycle

`connectors` is a real Firestore subcollection nested under
`organisations/{orgId}`, not a top-level collection queried by `userId` —
so it needs no entry in `user-data-collections.ts`, and is deleted
automatically if the org document itself is ever deleted.

## Testing

- `org-connectors.test.ts` — pure unit tests: known-type validation,
  `initialAuthStatus` never returns `connected` for any registered type,
  `restrictedToTeams` validation.
- `org-connectors.route.test.ts` — RBAC matrix per role, detail redaction
  for non-managers, the enable/disable/revoke/reindex lifecycle, 404 on a
  nonexistent connector, cross-org tenant isolation, and audit-log
  correctness.
