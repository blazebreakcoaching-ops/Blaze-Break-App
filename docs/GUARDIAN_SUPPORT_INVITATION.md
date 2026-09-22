# Guardian Support Invitation

**Status:** Built, behind a default-off flag. Not yet specialist-reviewed - see
§7 before enabling for real users.

**Relationship to `docs/GUARDIAN_SUPPORT_SPEC.md`:** that document is the
fuller, earlier governance spec for Guardian Support generally (Tiers 1-3,
consent design, hazard analysis). This document covers the specific feature
built in this pass: an optional, user-controlled invitation Nova can offer
during a text or voice conversation, pointing back to the spec's own §0.1
constraint (no risk scoring, ever) and reusing its Tier 1 dispatch pipeline
rather than building a new one.

> **The one-line principle this whole feature is built around:**
> *Nova can help you reach out. It will never contact someone for you unless
> you choose and confirm that action.*

---

## 1. What this is, and isn't

**Is:** an optional, dismissible on-screen card Nova can offer during a
conversation, or that's always reachable manually, letting a user choose to
contact a Guardian they've already set up. Every send still goes through the
exact same manual, confirmed, one-tap dispatch Tier 1 already had.

**Is not:** crisis detection, risk scoring, automated escalation, or
autonomous messaging. Nothing here infers, stores, or displays a risk score,
risk level, or any classification of a user's mental state - see
`guardian-support-invitation.ts`'s own header comment, which quotes
`GUARDIAN_SUPPORT_SPEC.md §0.1` verbatim as the constraint this module is
bound by.

## 2. The two ways the card can appear

1. **User-led (always available).** A "Contact my Guardian" action embedded
   directly in the chat/voice UI, reachable any time - no model judgement
   involved at all.
2. **Nova-offered.** The `offer_guardian_support` tool (`server.ts`,
   `NOVA_TOOLS`) - a pure, no-I/O function the model can call when a
   conversation seems like it could benefit from the option, or when the
   user directly asks to reach someone they trust. It returns **only** a
   boolean-shaped suggestion (`{ offered: true, reason }`) for the UI to
   render as an optional card. It cannot read or write Firestore, cannot
   see the user's guardian list, and cannot send anything - see
   `executeOfferGuardianSupport` in `server.ts`. The same tool is wired into
   both `/api/nova/chat` (via `planTrace`, the same mechanism
   `suggest_feature` already uses) and the Nova Live voice WebSocket (via a
   `guardianSupportOffer` message, mirroring `featureSuggestion`'s existing
   relay) - one tool, one execute function, both surfaces.

Shown at most once per conversation/call unless the user raises it again
themselves (`guardianOfferShownRef` in `NovaChat.tsx` and
`useNovaLiveVoice.ts`).

## 3. Consent boundaries

- **Every send is a fresh, explicit user action.** Tapping the card only
  opens a review sheet (`GuardianConfirmSheet.tsx`); nothing is prepared or
  queued until the user taps "Send it now" there, having already seen the
  exact recipient (name + masked last-4-digits phone) and the exact message
  text.
- **No freeform message text.** Two pre-approved templates only
  (`GUARDIAN_SUPPORT_TEMPLATES` in `guardian-support-invitation.ts`) -
  see §6 for why this is narrower than what was originally requested.
- **Dispatch is the existing, hardened `POST /api/guardian/alert`** - no new
  send path was built. That endpoint already enforces: `uid` from the
  verified auth token only, server-side guardian lookup (never a
  client-supplied number), idempotency, per-contact cooldown, and a daily
  cap. It now additionally accepts an optional `templateId`, defaulting to
  the original Tier 1 message when omitted, so every existing caller
  (`NovaGuardianRelay.tsx`, `CrisisSupport.tsx`) is unaffected.
- **Voice never speaks the guardian's name or message content.** Only the
  visual card does, populated client-side from the user's own saved
  contacts. A spoken "yes" to Nova's offer only opens the card - it can
  never send anything by itself.
- **No guardian configured** doesn't dead-end: add a contact, copy a
  message manually, open crisis resources, or just keep chatting - all four
  are one tap away (`GuardianConfirmSheet.tsx`'s `no_guardian` step).

## 4. Data stored, and deliberately not stored

**Stored:** privacy-preserving analytics events only
(`guardian_support_events` subcollection, written by
`POST /api/guardian/support-event`), from a closed enum
(`GUARDIAN_SUPPORT_EVENT_TYPES`) - `invitation_shown`, `contact_flow_opened`,
`send_requested`, `send_succeeded`, etc. - plus an optional `contactId`
reference and `channel`. The actual send/history record is the existing
`guardian_alerts` collection, unchanged in shape.

**Deliberately not stored anywhere:** chat content, voice transcripts kept
for this feature specifically, an inferred emotional state, a reason the
card was shown beyond the model's own short justification string (which
itself is never persisted - it only ever reaches the client in the tool
response for that one turn), or anything resembling a risk label. Both
Firestore collections involved (`guardian_alerts`, `guardian_support_events`)
are fully locked in `firestore.rules` (`allow read, write: if false` -
server-only via the Admin SDK), matching every other server-authoritative
collection in this app.

## 5. Feature flag / kill switch

`GUARDIAN_SUPPORT_INVITATION_ENABLED` (env var), read by
`guardianSupportInvitationEnabled()` in `guardian-support-invitation.ts`,
exposed via `GET /api/guardian/config`'s `invitationEnabled` field.

- **Defaults OFF** (`envValue === 'true'` is the only way to enable it) -
  unlike the existing `GUARDIAN_ALERTS_ENABLED` flag (which defaults on,
  because Tier 1 dispatch was already live before that flag existed). This
  is a new, not-yet-specialist-reviewed surface, so it ships inert until
  someone deliberately turns it on.
- **Enforced server-side, not just reported.** `executeOfferGuardianSupport`
  checks the flag itself and returns `{ offered: false }` if it's off -
  the tool is always declared to the model, but silently does nothing
  useful when disabled, so a stale client can never get a different answer
  than the server actually allows.
- **Independent of `GUARDIAN_ALERTS_ENABLED`.** Turning the invitation flag
  off only stops Nova/the UI from *offering* the card - it never affects
  whether an alert can still be sent through the existing, separately-gated
  Tier 1 pipeline (Ally tab, the global crisis button). Turning
  `GUARDIAN_ALERTS_ENABLED` off, conversely, is checked directly inside
  `GuardianConfirmSheet.tsx` (`useGuardianAlertsEnabled`) - if the send
  pipeline itself is down, the sheet still opens (call/copy/open-messaging-app
  still work, since those are native OS handoffs, not the Twilio pipeline)
  but hides "Send it now" and says so, rather than claiming a capability
  that's actually off. `guardian-copy-safety.test.ts` enforces this
  structurally (an AST scan proving "Send it now" only renders inside an
  `alertsEnabled`-gated branch).
- **Who owns turning it on:** the product owner, once §7 below has real
  answers - this doc doesn't pre-empt that decision.

## 6. Deliberate scope narrowing from the original request

A few things were asked for that this pass intentionally did not build, each
for a specific, stated reason rather than by omission:

- **Freeform, user-editable message text** - not built. Two fixed,
  pre-approved templates only. `GUARDIAN_SUPPORT_SPEC.md §B.5` and hazard
  #18 both flag message wording (especially anything implying urgency) as
  needing clinical/safeguarding sign-off before it ships as something a
  user can freely rewrite - "wording that implies emergency may cause a
  guardian to call 999 on the user's behalf, a consequence the user did not
  choose." Both templates were also corrected during implementation to
  include the sender's name and a Blaze Break disclosure (the original
  drafted text only greeted the guardian by name, with no way to tell who
  sent it) - matching `§B.5`'s own hard requirement.
- **A spoken "say confirm send" voice-only confirmation path** - not built.
  The visual confirmation sheet is already reachable and on-screen
  throughout a voice call, so this would have been a second, harder-to-
  verify confirmation surface (interruption handling, mishearing "confirm"
  vs "cancel") solving a problem that doesn't exist given the UI is already
  present.
- **A durable send queue + background worker + delivery webhooks** - not
  built. The existing `POST /api/guardian/alert` is a hardened, tested,
  *synchronous* dispatch (validate → persist queued → call Twilio → persist
  final state) - genuinely reused rather than routed around. Building the
  fuller async queue architecture `GUARDIAN_SUPPORT_SPEC.md §E.4-E.5`
  describes as aspirational infrastructure is a separable, larger piece of
  work, not required for this feature to work correctly today.

## 7. Requires specialist review before expansion

Per the standing instruction that built this feature: report what still
needs real clinical/safeguarding/legal sign-off, don't self-certify it.

- **Any future automatic Guardian contact** - explicitly excluded, not
  deferred. `GUARDIAN_SUPPORT_SPEC.md §0.1`/`§A` (Tier 3) already covers
  this in detail: out of scope until ten named governance workstreams
  (clinical, safeguarding, legal, privacy) and a documented, tested
  kill-switch exist. Nothing in this feature moves that gate.
- **Any future use of model inference to decide or prioritise which
  contact gets reached, or to alter message urgency** - not built and not
  designed for. `offer_guardian_support` only ever returns a boolean
  UI-rendering decision; it has no visibility into who the user's
  guardians are.
- **Any clinical-risk or crisis-assessment claim in this feature's own
  copy** - the copy throughout (`GuardianSupportInvitation.tsx`,
  `GuardianConfirmSheet.tsx`) avoids words like "detected," "risk," "Nova
  has decided," per the same standing constraint - worth an independent
  read-through by someone with clinical-safety training before this ships
  broadly, not just an engineering self-check.
- **Final message template wording and urgency framing** -
  `GUARDIAN_SUPPORT_SPEC.md §B.5`'s own open item; this pass used the
  wording given in the build brief, corrected only for the missing
  sender-identification requirement, not independently reviewed.
- **Use with minors or vulnerable adults** - entirely unaddressed here, as
  it is everywhere else in this codebase (`GUARDIAN_SUPPORT_SPEC.md §F.2`
  already lists this as an open, unresolved item). No age-gating or
  different flow exists.
- **Any broadening from a wellbeing tool into diagnosis, treatment, or
  clinical management** - out of scope by design; nothing in this feature
  should ever be extended in that direction without the same review this
  section is already asking for on the smaller pieces above.

## 8. Manual QA checklist

- [ ] With the flag off (default): `offer_guardian_support` never renders a
      card in chat or voice, even when asked directly to contact a guardian.
- [ ] With the flag on: asking Nova (text) to reach someone you trust shows
      the card; the card is not re-shown a second time in the same session
      unless you ask again.
- [ ] Voice: the offer is spoken generically (no guardian name, no message
      content); tapping "yes" only opens the visual card, never sends
      anything.
- [ ] Confirm sheet, 0 guardians configured: add/copy/explore-resources/
      continue-chatting all work; none of them silently fail.
- [ ] Confirm sheet, 1 guardian: skips straight to review; 2+: contact
      picker appears first.
- [ ] Review screen shows the real contact name, masked phone, and exact
      message text for both templates before any send.
- [ ] Call and Copy work regardless of `GUARDIAN_ALERTS_ENABLED`; "Send it
      now" disappears (with an explanatory line) when that flag is off.
- [ ] A successful send shows an honest "sent" state; a forced provider
      failure shows "couldn't get that through," never a false "sent."
- [ ] Escape / clicking outside / "Not right now" all cancel cleanly at
      every step, with no partial send.
- [ ] Keyboard-only: full flow completable via Tab/Enter/Escape; focus
      returns sensibly on close.
