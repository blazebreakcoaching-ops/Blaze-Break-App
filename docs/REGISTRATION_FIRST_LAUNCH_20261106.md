# Registration-first launch (6 November 2026)

- One existing Blaze Break app; no new Firebase project or product.
- No automatic anonymous Firebase account on opening the welcome page.
- The main CTA opens registration; returning customers choose Sign in.
- Explicit "View a demo" creates an anonymous Firebase user only on demand. Unavailable demo auth shows a visible error and does not enter the app.
- Email marketing consent is a separate unticked checkbox on signup. It does not affect registration, login, or coaching.
- Marketing signup is recorded through a server-side consent API; sending marketing requires verified email, a dedicated Brevo marketing list and API key.
- Do not send burnout assessment details, journal entries or Nova conversations to marketing services.
- Do not deploy to production until real staging sign-in, App Check, MFA and privacy checks pass.
