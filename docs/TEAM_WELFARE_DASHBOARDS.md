# Manager & HR team-welfare dashboards

Part of the Enterprise backend (depends on the role/audit foundation in
`docs/ENTERPRISE_RBAC.md` and the aggregate math in `work-design-signals.ts`/
`org-team-management.ts`). This feature started as a product pitch —
a manager sees their team's aggregate stress and gets nudged toward a
supportive check-in; HR is looped in for duty-of-care escalation. The
version that shipped is deliberately narrower than the first draft of
that pitch, for reasons worth stating plainly.

## What was cut from the original pitch, and why

The original idea included **letting a manager see whether individual
team members are using the app**, since "the company is paying for it."
That was not built, on purpose. Three real problems with it:

1. **It breaks the product's own value proposition.** The moment someone
   knows their manager can see whether they opened a burnout-support tool,
   using it stops being safe — the same failure mode that makes corporate
   wellness benefits notoriously under-used industry-wide.
2. **UK ICO guidance treats systematic employee monitoring as processing
   "likely to result in high risk"** (mandatory DPIA under Article 35),
   and separately warns against monitoring that "pries into private
   lives" — exactly what named-individual usage tracking on a mental-
   health-adjacent tool would be.
3. **German works councils (Betriebsrat) have mandatory co-determination
   rights** (BetrVG §87(1)(6)) over any system technically capable of
   recording employee behaviour, triggered regardless of the employer's
   stated intent — a real gate on EU rollout, not a footnote.

What shipped instead carries no activity-tracking metric at all, named
or aggregate: a manager and HR see only real, structural Work Design
Signals (Meeting Pressure today - see `work-design-signals.ts`),
computed from calendar/task metadata, Work Design Debt, and
intervention status - never whether, or how much, anyone used the app.
(An earlier version of this surface computed a mood/climate-survey
"concern" trend across the team instead; that was retired in the Lane
Separation Remediation, since it read Private Recovery Vault data no
organisation-facing route should ever touch - see the Lane Separation
Remediation PR history, and the "Lane A"/"Lane B" comments in server.ts
immediately above `GET /api/org/:orgId/team-dashboard`.)

The pitch's other half — "HR holds the manager accountable" — was also
reframed. A metric a manager is *evaluated against* creates a direct
incentive to suppress it (Goodhart's Law): discourage reporting,
discourage engagement, make the number look good rather than making the
team's actual situation better. What shipped instead is a **factual
follow-through record** (see "Escalation acknowledgment" below) HR reads,
never a score computed on the manager.

## Data model

- `organisations/{orgId}.teamManagers: Record<uid, string[]>` — a flat
  map, parallel to the existing `memberTeams`. Deliberately **not** a new
  `OrgRole` in `org-rbac.ts` — a plain `member` can manage a team, and it
  grants none of `org-rbac.ts`'s org-wide `ORG_PERMISSIONS`. Assigned only
  by an org owner/admin, via `POST /api/org/:orgId/members/:memberUid/manage-teams`
  (full-replace, like every other Enterprise write route in this
  codebase — send the whole intended list, not a patch).
- `organisations/{orgId}.hrViewerUids: string[]` — a simple allow-list,
  same reasoning: someone can be an HR viewer regardless of their org
  role. Assigned via `GET`/`POST /api/org/:orgId/hr-viewers`.
- `organisations/{orgId}/team_escalation_acks/{id}` — one document per
  manager acknowledgment: `team, acknowledgedBy, acknowledgedByEmail,
  note (optional, ≤500 chars), createdAt`.

## Per-team k-anonymity — the same rule everywhere, deliberately

`org-team-management.ts`'s `computeQualifyingTeamGroups` is the single
function that decides which teams are ever allowed to show aggregate
data: consenting members grouped by `memberTeams` label, kept only if the
group clears `org.privacyThreshold` (default 5) — the same rule every
multi-team aggregate view in this codebase shares rather than
reimplements (today, the HR dashboard). A team under threshold is never
shown as "locked" in a multi-team list — it's silently absent, since
naming a small team as locked would itself reveal more about its size
than any of this should expose.

**One deliberate exception**: a manager's own single-team view
(`GET /api/org/:orgId/team-dashboard`) *does* show an explicit `locked:
true` state with the actual cohort size. This isn't a leak — a manager
asking about their own team already knows who's on it — and an explicit
"not enough people yet" is more honest UX than pretending the team
doesn't exist to someone who already knows it does.

## Escalation acknowledgment — a record, not a score

`team-escalation.ts`'s `describeFollowUp` decides whether a team's most
recent acknowledgment (from `team_escalation_acks`) counts as "recent
enough" (14-day window) — the one function every caller uses, so HR and
any future code always agree on what "acknowledged" means. This is
**not independently verified** — there's no way to confirm a real
conversation happened — and the code makes no attempt to pretend
otherwise. It exists to give HR a real, checkable trail instead of
nothing, not to grade a manager's actual performance.

Audit log entries for an acknowledgment (`acknowledge_team_signal`) store
only whether a note was provided, never the note text itself, matching
the existing "structured diffs, never raw content" rule from
`docs/ENTERPRISE_RBAC.md`.

## Routes

- `GET /api/org/:orgId/team-dashboard` — the manager's own team(s), from
  `org.teamManagers[uid]`. An org admin with no managed team of their own
  is let through rather than hard-blocked (support purposes), but still
  only ever sees teams they're actually assigned to.
- `POST /api/org/:orgId/team-dashboard/:team/acknowledge` — caller must
  manage `:team` (or be an org admin).
- `GET /api/org/:orgId/hr-dashboard` — every qualifying team at once,
  gated to `hrViewerUids` or org admin.
- `POST /api/org/:orgId/members/:memberUid/manage-teams`,
  `GET`/`POST /api/org/:orgId/hr-viewers` — admin-only assignment routes.

Every route follows the existing error-handling idiom
(`Forbidden` → 403, `not found` → 404, else 500) and audit-logs its
mutations via the existing `logOrgAuditAction`.

## The "consider a team check-in" nudge

`describeSignalsNeedingAttention` (server.ts) decides whether the banner
appears: it filters the team's real Work Design Signals down to those
reading `elevated` or `sustained`, caps the list at 3 (the "never 14
recommendations" doctrine applied to signals, not just Nova's copy), and
only then does a nudge appear. It is a dashboard banner, not a push
notification or email — computed when the manager opens their dashboard,
not via any new notification-delivery infrastructure.

## What a manager and HR do NOT see, ever

- Any named individual's mood, check-in, or content data.
- Whether a *specific* person used the app.
- Any team below the k-anonymity threshold's data (except the manager's
  own team, shown explicitly locked rather than silently hidden).
- A computed "grade" or score for a manager's follow-through — only the
  factual acknowledgment record.

## Testing

- `org-team-management.test.ts`, `team-escalation.test.ts` — pure logic.
- `org-team-management.route.test.ts` — manager/HR-viewer assignment RBAC
  and audit correctness.
- `team-dashboard.route.test.ts` — access control (a manager of Team A
  cannot see Team B even by crafting a request), the k-anonymity gate
  applied to a single team, and the Nova nudge banner's honest
  no-data-no-nudge behaviour.
- `team-escalation.route.test.ts` — acknowledgment RBAC and confirming
  the audit log never contains a note's actual text.
- `hr-dashboard.route.test.ts` — RBAC, seeing multiple teams at once
  (unlike the manager view), the org-wide lock-check taking precedence
  over any individual team's count, follow-up status flipping from
  "no_recent_acknowledgment" to "acknowledged" once a real ack is logged,
  and cross-org isolation.
