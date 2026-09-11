# Enterprise SSO — schema and service boundary only

Part of the Blaze Break Enterprise backend foundation (depends on the role
system in `docs/ENTERPRISE_RBAC.md`).

## The real blocker, stated plainly

**There is no real SAML/OIDC assertion validation wired up in this
codebase, and this chunk does not add one.** Blaze Break's auth today is
Firebase Authentication. Making SSO actually work — validating a real SAML
assertion or OIDC token from a customer's identity provider and turning it
into a genuine, trusted Firebase session — requires one of:

1. **Upgrading to Google Cloud Identity Platform's paid tier**, which adds
   native SAML/OIDC federation on top of Firebase Auth, or
2. **A third-party identity broker/proxy** (e.g. an auth-as-a-service
   product) sitting in front of Firebase Auth, translating SAML/OIDC into
   something Firebase can consume.

Both are real infrastructure and cost decisions — not something a backend
PR can resolve on its own, and not something this plan decides on the
user's behalf (see the plan's "3 blockers deferred to the user"). Until
one is chosen, **SSO enforcement cannot be turned on for any organisation,
for anyone, ever** — not because of a bug, but because there is no working
login path behind it yet.

## What this chunk actually builds

`sso-config.ts` is the schema and service boundary that a real integration
would plug into later, built so that choosing an approach above only means
swapping in the actual assertion/token validation — not rearchitecting the
config model, encryption, or RBAC around it.

### Data model

`organisations/{orgId}/sso_config/config`:

| Field | Meaning |
|---|---|
| `providerType` | `saml` or `oidc`. |
| `issuer` | The IdP's issuer identifier. |
| `clientId` | The client/application ID registered with the IdP. |
| `metadataUrl` | Optional; must be `https://` if present. |
| `allowedDomains` | Email domains this org's SSO applies to. |
| `enforceSso` | **Always `false` unless explicitly enabled via the dedicated `/enforce` route** — see below. |
| `jitProvisioning` | Whether a first-time SSO login should auto-create a membership. |
| `defaultRole` | The role a JIT-provisioned member gets — restricted to `member` or `viewer` only. An identity provider asserting someone belongs to an org is never, by itself, grounds to hand them `owner`/`admin`/any specialised admin role. |
| `encryptedSecret` / `secretRef` | See "Secret handling" below. |

### Secret handling

A client secret is never stored in plain text. Two paths:

- **`secretRef`** — a string pointing at a secret stored elsewhere (a
  secret manager path, for example). Always accepted, regardless of server
  configuration, since this backend never needs to see the actual secret
  in that case.
- **`clientSecret`** (inline) — only accepted if `SSO_CONFIG_ENCRYPTION_KEY`
  is set on the server. If it is, the secret is immediately AES-256-GCM
  encrypted (`encryptSecret` in `sso-config.ts`, a real, tested
  encrypt/decrypt pair using Node's `crypto` module) before being written.
  **If the env var is unset, the write is refused outright** — nothing is
  ever stored raw, and nothing is ever "encrypted" with a fake or
  hardcoded key.

No response from any route — `GET /sso`, `POST /sso`, or the audit log —
ever includes the raw encrypted bytes or a decrypted secret.
`redactSsoConfig` is the single function responsible for that; the only
thing any response reveals is `hasSecret: true/false` and, if present, the
`secretRef` string itself (safe to show, since it's a pointer, not the
secret).

### The core guardrail: `enforceSso`

`POST /api/org/:orgId/sso` (create/update config) **never** touches
`enforceSso` — it's excluded from that write entirely, preserved as
whatever it already was. The only way to change it is
`POST /api/org/:orgId/sso/enforce`, and turning it **on** requires a
platform-wide feature flag (`public_feature_flags/sso_enforcement`) to be
explicitly enabled first. That flag does not exist enabled by default, and
nothing in this codebase sets it — until a real IdP integration exists and
someone deliberately turns it on. Turning enforcement **off** is never
gated, so it's always possible to back out of a bad state.

### "Test configuration" — also not a real handshake

`POST /api/org/:orgId/sso/test` checks that the stored config is
shape-valid and, if a `metadataUrl` is set, that it's actually reachable
over HTTPS. **It performs no SAML/OIDC handshake and validates no
assertion or token.** Its response says this explicitly (`note: "...it is
not a real authentication handshake..."`) so nothing downstream can
mistake a reachability check for a working login test.

## Routes (all under `/api/org/:orgId/sso...`, `org.sso.manage` only)

- `GET /sso` — redacted config, or `{ configured: false }`.
- `POST /sso` — create/update config (never `enforceSso`).
- `POST /sso/enforce` — body `{ enabled }`; gated as described above.
- `POST /sso/test` — shape + metadata reachability check.

`org.sso.manage` is held only by `owner`, `admin`, and `security_admin` —
tested directly to confirm `viewer`, `member`, `billing_admin`, and
`connector_admin` are all refused.

## What choosing a real path would require

1. Pick Identity Platform or a third-party proxy (a cost/infra decision
   for the user, not this backend).
2. Implement real assertion/token validation against that choice, turning
   a validated SSO login into a genuine Firebase session for the right
   `uid`.
3. Wire `jitProvisioning`/`defaultRole` into that login path so a
   first-time SSO user is actually granted the configured role.
4. Only then does turning on the `sso_enforcement` feature flag, and this
   chunk's existing `/enforce` route, become meaningful.

## Data lifecycle

`sso_config` is a real Firestore subcollection nested under
`organisations/{orgId}`, not a top-level collection queried by `userId` —
no entry needed in `user-data-collections.ts`.

## Testing

- `sso-config.test.ts` — validation (provider type, https metadata URL,
  domain format, JIT role restricted to member/viewer, secret-field
  mutual exclusivity), a real AES-256-GCM encrypt/decrypt round-trip
  (including tamper and wrong-key failure), the enforcement gate function,
  and `redactSsoConfig` never leaking encrypted bytes.
- `sso-config.route.test.ts` — RBAC (`org.sso.manage` boundary), the
  inline-secret-refused-without-a-key path, secrets never appearing
  verbatim in any response, config writes never touching `enforceSso`,
  the feature-flag gate blocking/allowing enforcement (and always allowing
  it to be turned off even after the flag changes), and audit-log
  correctness.
