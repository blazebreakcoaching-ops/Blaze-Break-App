# Blaze Break staging sign-in investigation (6 November 2026)

The staging site is a private Cloud Run service using the separate Firebase project `blaze-break-staging`. Firebase Auth users in that project are **not** shared with the production Firebase project. Existing production accounts cannot be assumed to exist in staging.

Confirmed code issues fixed in this candidate:
- The email **sign-in** button was incorrectly disabled until a new Terms checkbox was ticked. Only account creation now requires that checkbox for the email path. Social sign-in still requires Terms acceptance because the same popup can create a new account.
- Google, Microsoft and Facebook popup errors were swallowed into the developer console. Visible, concise errors now explain unauthorised preview domains, blocked popups, disabled providers and other known failures, without displaying raw Firebase exception details or credentials.
- Email sign-in errors now use the same safe, comprehensible mapping.
- No Firebase Authentication settings, IAM, account data or production service changed.

Not yet determined from GitHub alone:
- Whether the Cloud Shell proxy hostname is in Firebase staging Authentication > Settings > Authorized Domains.
- Whether Google/Microsoft/Facebook, email/password and anonymous sign-in are enabled in **staging**.
- Whether a real staging test user exists, and whether backend MFA status/App Check are working.

Do not use a production user's credentials to conclude staging accounts are broken. Do not whitelist wildcard Cloud Shell preview domains or disable MFA/App Check just to make the page work. Authorise only the exact test hostname if needed, or use a stable staging domain.

Brevo is this project's transactional email/password reset provider. It is **not** the Firebase sign-in identity provider. Missing Brevo config can break account email flows but not the Firebase password verification itself.

After tests pass, deploy this updated SHA to PRIVATE staging only and test signup, login, MFA, logout and data persistence. Do not merge to main until verified.
