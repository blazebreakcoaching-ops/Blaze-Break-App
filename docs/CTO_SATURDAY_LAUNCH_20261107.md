# Blaze Break — Saturday 7 November web launch: zero-surprises runbook
**Prepared 4 Nov 2026** · development branch only · NO approval to deploy

## Fixed launch scope
Existing Blaze Break web app: public landing, beta/demo, registered accounts, Nova text, currently implemented recovery flows, Settings, privacy, support and ordinary account controls. Stripe checkout, Zoom, Secret Me Brain and other not-yet-integrated systems are DEFERRED and must not be turned on, promised as live, or treated as blockers to publishing a safe free web beta. Do not silently enable NHEI specialist tools or write-capable integrations.

## Operator task before Friday (does not require Claude credits)
Use an account you control with authorised **read-only** permission for the production Firebase/GCloud project. Prefer Google Cloud Shell; do not paste credentials, OAuth tokens, service-account JSON or private key files into ChatGPT/GitHub.
- Open Google Cloud Console, choose project \`gen-lang-client-0537893432\`.
- Confirm Cloud Run service \`blaze-break\`, region \`europe-west2\`.
- Confirm named Firestore database \`ai-studio-67723f85-0bfc-4690-ac83-580d6face1fc\`; check rules and composite indexes.
- Note the **names, not values**, of relevant Secret Manager bindings. Confirm \`NODE_ENV=production\` and project isolation without sharing secrets.
- Check whether the separate \`blaze-break-staging\` project has been created, with matching Firebase web app, named database and Cloud Run staging service. The repository's tracked web config points to production; a staging build needs a separate staging-specific config.
- Run \`npm run verify:cloud:readonly -- --target production\` in a checked-out repository with Google Cloud CLI authorised; for staging use \`--target staging --web-config /path/to/staging-firebase-config.json\`. This reads project/service/database information only and **does not deploy, read secret values or move traffic**.

## Friday 6 November — Claude Code release candidate
1. Fetch latest \`cto/existing-features-stability-20261104\` and record FULL SHA. The previous green \`30faeb2\` test report does not validate subsequent changes.
2. On clean checkout run \`EXPECTED_RELEASE_SHA=<FULL_SHA> npm run verify:web:offline\`; report all 10 stages, exact exit codes, Playwright timing and logs. Run all-platforms gate only if native/Functions scope is being accepted; web launch is independent.
3. Review the MFA session-expiry UI gate plus direct Firestore SDK issue. **Server REST MFA protects only server REST calls**; Firestore owner rules check UID. The new client gate is not permission enforcement. Do not falsely declare this P0 closed; formulate a tested safe path for beta launch that does not expose existing MFA users and does not remove their data.
4. Reconcile open security PR #140, cloud project config and staging environment; check consent, account recovery, retention, privacy export/deletion, Nova text, demo-to-signup, mobile web and SEO.
5. Obtain a staging evidence report including actual service URL, revision, project/database, identity, App Check accept/reject, login/Nova/privacy smoke, and Firestore rules; masked secrets only.
6. Stage a rollback: record the previous Cloud Run ready revision and traffic split, plus the exact before/after Firestore rules version and index plan; a Cloud Run traffic rollback does **not** undo a Firestore Rules deployment.
7. Confirm the merged branch contains MANUAL-only deployment workflow BEFORE touching main. Old main still has an automatic production push workflow. No merge or deploy until owner approves a specific reviewed SHA and release plan.

## Saturday 7 November — go/no-go
**GO only when:** fresh source gate PASS; appropriate security issues contained with evidence; staging and authorised production project checks PASS; critical real browser journeys PASS; rollback ready; approved release SHA fixed.
**NO-GO if:** authentication/MFA controls may expose private data, Firestore target mismatches production, App Check is disabled or broken, staging config accidentally targets production, unexplained critical tests fail, or rollback cannot be executed.
Native iOS/Android store publication requires separate signing, attestation, devices and external store review and is NOT assumed possible on Saturday.

## Owner access options
- Claude Code can use Google Cloud CLI / Firebase CLI on the owner's authorised terminal after an interactive login. Grant only the permissions it needs; start read-only for verification.
- ChatGPT's GitHub connector cannot read GCloud just because GitHub is connected. If you choose to connect the official Firebase app/plugin later, approve it within ChatGPT's Plugins interface and start with read-only discovery. That is separate from Claude's terminal login and does not automatically grant production IAM permissions.
- NEVER paste credentials into a prompt. Do not grant broad Editor/Owner roles merely to make a deployment work.

## Status
Preflight script and handover prepared in GitHub. The CLI has NOT been run by this chat. No deployment, production branch merge or cloud permissions were changed.
