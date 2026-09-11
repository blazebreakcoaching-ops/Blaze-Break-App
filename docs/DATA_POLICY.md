# Organisation data-use policy — no model training by default

Part of the Blaze Break Enterprise backend foundation (see `docs/ENTERPRISE_RBAC.md`
for the role system this depends on).

## The default, in one sentence

Every organisation, with zero action required from anyone, has
`allowModelTraining: false`. There is no separate "opt out" step — that is
already the starting state for an org that has never touched this feature at
all.

## What this actually is

`org-data-policy.ts` defines the shape of an org's data-use policy
(`OrgDataPolicy`), its safe default (`DEFAULT_DATA_POLICY`), and a single
function — `getEffectiveDataPolicy(stored)` — that is meant to be the **only**
place in this codebase that ever answers "is this org allowed to do X with
its content?" It treats a missing or malformed stored value as `false` for
every boolean flag, never as "unset means allowed." An org doc that predates
this feature, or has simply never had the policy touched, resolves to exactly
`DEFAULT_DATA_POLICY`.

The four fields:

| Field | Default | Meaning |
|---|---|---|
| `allowModelTraining` | `false` | Whether the org's content may be used to train/fine-tune a model. |
| `allowProductAnalytics` | `false` | Whether the org's usage may feed product analytics beyond serving the org's own features. |
| `allowContentRetentionForDebugging` | `false` | Whether raw content may be retained for engineering debugging beyond normal operation. |
| `retentionPeriodDays` | `30` | How long retained content is kept, if any of the above are enabled. Bounded to 1–3650 days. |

## Routes

- `GET /api/org/:orgId/data-policy` — any member (`org.data_policy.view`,
  held by every role including `viewer`) can read the org's current
  effective policy.
- `POST /api/org/:orgId/data-policy` — `owner`, `admin`, or `security_admin`
  only (`org.data_policy.manage`). The full policy object is required on
  every write — a partial update is rejected by `validateDataPolicyUpdate`,
  so "turn on training but forget to set a retention period" can't happen.
  Every change is audit-logged via `logOrgAuditAction` with the real
  before/after diff.

An owner **can** turn `allowModelTraining` on for their own org if they
choose to. This is a real, honest toggle, not a switch that looks like it
does something but doesn't — nothing in this codebase currently reads this
flag to gate an actual training pipeline, because no such pipeline exists
yet (see "What is NOT yet true" below). The flag exists so that the moment
any future feature does touch training, it has one already-audited,
already-RBAC'd, already-defaulted-safe place to check first — rather than
that decision being invented ad hoc, or worse, never being asked at all.

## What is enforced in code today

- The default is genuinely safe: `getEffectiveDataPolicy(null)` and
  `getEffectiveDataPolicy(undefined)` both return the fully locked-down
  default — proven by `org-data-policy.test.ts`.
- A brand-new org that has never called the write route reports the safe
  default at the route level too — proven by
  `org-data-policy.route.test.ts`.
- Only `owner`/`admin`/`security_admin` can change the policy; every other
  role (including `billing_admin` and `connector_admin`, who might
  otherwise be assumed to have broad access) is forbidden.
- Every change is audit-logged with a structured before/after diff, readable
  via the org's own `GET /api/org/:orgId/audit-logs`.
- `retentionPeriodDays` is validated server-side (integer, 1–3650); out-of-
  range or malformed values are rejected outright, never silently clamped.

## What this does NOT cover yet — be precise about this

This module governs **Blaze Break's own future features that might touch
customer content for training/analytics/retention.** It does not, and
cannot, control what an underlying third-party AI provider does with API
requests Blaze Break sends them today (Nova's use of the Gemini API, and
optionally the Anthropic API — see `server.ts`'s Nova chat provider
selection).

For that, this codebase relies on — and does not itself enforce — the
providers' own published commitments:

- Google states that content sent through the **Gemini API** (paid API
  usage, as opposed to the free consumer Gemini app) is not used to train
  its models by default.
- Anthropic states that content sent through the **Claude API** is not used
  to train its models by default.

Those are the providers' own terms, not a guarantee this codebase enforces
in code — Blaze Break has no technical control over, or visibility into,
what happens after a request leaves this server. If either provider's terms
change, or if a future feature sends org content to a different provider or
endpoint, this document (and the org's actual data policy, if relevant to
that feature) needs to be revisited — not assumed to still hold.

## Data lifecycle

`dataPolicy` is a plain map field inline on `organisations/{orgId}` — the
same pattern already used for `privacyThreshold`. It is not a separate
collection, so it needs no entry in `user-data-collections.ts` and is
deleted automatically whenever the org document itself is deleted.

## Testing

- `org-data-policy.test.ts` — pure unit tests for `getEffectiveDataPolicy`
  and `validateDataPolicyUpdate`: safe defaults, no truthy coercion, no
  silent clamping, boundary values, missing/malformed input.
- `org-data-policy.route.test.ts` — route-level RBAC (viewer/member/
  billing_admin/connector_admin forbidden from writing; security_admin/
  admin/owner allowed), the fresh-org-defaults-safe property, validation
  errors, and audit-log correctness.
