# Observability

Status as of this document, Site Reliability Batch 1 (plus its Batch 2
follow-up, the full logger migration below). This is the first work on the
"Site Reliability" capability from the Operations Intelligence Hub audit —
application-side instrumentation only. It does not include any GCP console
configuration (alerting, uptime checks, dashboards), which no agent in this
environment has credentials to perform; those remain explicitly outstanding
below.

## What's shipped

- **Structured JSON logging** (`logger.ts`): every log line is one JSON
  object with a `severity` field (`DEBUG`/`INFO`/`WARNING`/`ERROR`/`CRITICAL`)
  and a `timestamp`, written to stdout (or stderr for `ERROR`/`CRITICAL`).
  Cloud Run ingests container stdout/stderr into Cloud Logging automatically
  — no SDK, API key, or extra dependency is needed for this to work in
  production. A JSON line gets parsed into `jsonPayload` with the `severity`
  field promoted to the log entry's own severity; a plain string lands as
  `DEFAULT` severity with everything crammed into `textPayload`. Every
  `console.log`/`console.warn`/`console.error` call site in `server.ts`
  (108 of them) has been migrated to `logger.info`/`logger.warning`/
  `logger.error` — there are no unstructured log lines left in this file.
  A handful that logged a raw HTTP response body instead of an error
  (`tokenBody`, `await res.text()`) now log it under an explicit
  `responseBody` field rather than through `errorFields()`, since it isn't
  an `Error` and stringifying it directly would have produced
  `[object Object]`.
- **Request correlation id**: every request gets an `X-Request-Id`, reusing
  Cloud Run's own `X-Cloud-Trace-Context` header when present so this app's
  request log and Cloud Trace refer to the same id for the same request.
  Every request is logged once, on completion, with method/path/status/
  duration (`INFO` under 400, `WARNING` 400-499, `ERROR` 500+).
- **Process-level crash visibility**: `uncaughtException` and
  `unhandledRejection` handlers log at `CRITICAL` with the full stack before
  Node's default (unstructured, easy-to-miss) behavior would otherwise run.
  `uncaughtException` exits the process afterward (the process state is
  undefined past that point — Cloud Run starts a fresh instance);
  `unhandledRejection` only logs, since in this codebase those are far more
  often a forgotten `await` on a non-critical path than a fatal error.
- **`GET /healthz`**: an unauthenticated liveness endpoint, registered ahead
  of CORS/App Check so it never depends on either being configured
  correctly. Nothing currently calls it (see below).
- **A final catch-all error handler**: the last middleware in `server.ts`,
  catching anything forwarded via `next(err)` that no per-route `try`/`catch`
  already handled, logging it at `ERROR` and returning a generic safe 500
  instead of leaking a stack trace or an unhandled framework default.

## What this gets for free, with no further code changes

- **Cloud Logging** already receives every request/error log line above,
  structured, the moment this ships — nothing to turn on.
- **Cloud Run's built-in metrics** (request count, request latency,
  container CPU/memory, instance count) are already collected by Cloud Run
  itself for every service, with no code or SDK — visible today in Cloud
  Monitoring's "Cloud Run" metrics, same as before this batch.
- **Cloud Error Reporting** can auto-extract from `ERROR`/`CRITICAL` log
  entries that include a stack trace, which every error logged via
  `errorFields()` does — but auto-extraction itself still needs the Error
  Reporting API enabled on the project (a console action, not code).

## Still outstanding (needs a human with GCP console/billing access, not application code)

- No Cloud Monitoring **uptime check** is configured against `/healthz` —
  the endpoint exists; nothing polls it yet.
- No **alerting policies** or **notification channels** exist (e.g. "page
  on sustained 5xx rate," "alert on uncaught-exception log entries").
- No **log-based metrics** or **dashboards** have been created in Cloud
  Monitoring.
- The **Error Reporting API** has not been confirmed enabled on either GCP
  project (`gen-lang-client-0537893432` production, `blaze-break-staging`).

No dashboards, alerts, or monitoring statistics are claimed as configured
anywhere in this document beyond what's listed under "shipped" above — the
items in this last section are real, confirmed gaps, not yet closed.
