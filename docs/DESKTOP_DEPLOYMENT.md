# Enterprise desktop-deployment control plane

Part of the Blaze Break Enterprise backend foundation (depends on the role
system in `docs/ENTERPRISE_RBAC.md`).

## Say this plainly: there is no Blaze Break desktop client today

The only Blaze Break client that actually ships is the installable PWA
(the existing service worker + web app manifest). There is no separate
desktop binary, no auto-updater, no native app of any kind in this
codebase or repository.

This chunk is **backend only**: a control plane a future desktop client
could register against, report its version to, and be centrally managed
through. It exists so that work can start on the backend half of desktop
deployment without waiting on, or pretending to have, a client that
doesn't exist yet. Nothing here should be presented to a customer as "you
can deploy the Blaze Break desktop app" — that capability doesn't exist
until a real client is built.

## What's real today

`desktop-deployment.ts` is the pure logic: known channels (`stable`,
`beta`), semantic-version validation (`major.minor.patch` only — no
pre-release suffixes), and `evaluateUpdateStatus`, the single function that
decides whether a reported app version is below the enforced minimum
(`updateRequired`) or simply behind the latest release (`updateAvailable`)
for its channel.

### Data model

- `organisations/{orgId}/devices/{id}` — `ownerUid`, `channel`,
  `appVersion`, `deviceName`, `status` (`active`/`revoked`),
  `lastCheckIn`, `registeredAt`.
- `app_config/release_channels` — platform-wide, not org-scoped: one
  document with one field per channel, e.g.
  `{ stable: { minVersion, latestVersion } }`. Governs every org's devices
  on that channel at once, so only Blaze Break's own platform staff
  (`requireAdmin`) can write it.

### Routes

- `POST /api/org/:orgId/devices/register` — any org member (any of the
  seven roles) can self-register their own device. Not an admin action —
  the device is simply announcing itself.
- `GET /api/org/:orgId/devices` — the full roster, including every
  member's `ownerUid`. Gated to `org.devices.manage` (owner/admin only) —
  a member's own device list isn't something every other member should be
  able to browse.
- `POST /api/org/:orgId/devices/:id/revoke` — `org.devices.manage`.
- `POST /api/org/:orgId/devices/:id/check-for-update` — callable by the
  device's own `ownerUid`, or an org admin checking on a member's behalf.
  A revoked device is refused. Compares the device's stored `appVersion`
  against its channel's `app_config/release_channels` entry via
  `evaluateUpdateStatus` — if nobody has configured that channel yet, the
  response says so explicitly (`note: "This release channel has not been
  configured yet."`) rather than silently reporting "up to date."
- `GET /api/app-config/release-channels` — any authenticated user can read
  the current channel config (it's not sensitive).
- `POST /api/admin/release-channels` — Blaze Break platform staff only
  (`requireAdmin`), logged via the platform-wide `logAdminAction` (not the
  org audit log, since this isn't an org-scoped action).

Every org-scoped device route is isolated by the Firestore path itself —
one org's admin can never see or revoke another org's device — tested
directly in `desktop-deployment.route.test.ts`.

## What would need to be built for this to become real desktop deployment

1. An actual desktop client (Electron, Tauri, or similar) that calls
   `register` on first launch and `check-for-update` periodically.
2. A real update-delivery mechanism (signed installers, an auto-updater
   library) — this backend only ever reports whether an update is needed,
   it does not deliver one.
3. Org-level channel restriction, if wanted (e.g. "this org's devices may
   only use `stable`") — not built here; today a device simply registers
   whichever channel it likes.

## Data lifecycle

`devices` is a real Firestore subcollection nested under
`organisations/{orgId}`, not a top-level collection queried by `userId` —
no entry needed in `user-data-collections.ts`. `app_config/release_channels`
holds no personal data at all.

## Testing

- `desktop-deployment.test.ts` — pure unit tests: channel/version
  validation, the version-comparison math, and `evaluateUpdateStatus`'s
  honest handling of an unconfigured or malformed channel config.
- `desktop-deployment.route.test.ts` — registration RBAC, the admin-only
  full roster (a member/viewer cannot list other members' devices), revoke
  RBAC, check-for-update's owner-or-admin rule and revoked-device refusal,
  the platform-admin gate on the config write route, and — the
  highest-priority case — cross-org tenant isolation for both devices and
  the admin action against them.
