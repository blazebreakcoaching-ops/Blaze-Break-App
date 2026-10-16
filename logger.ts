// Structured logging for Cloud Run / Cloud Logging.
//
// Cloud Run ingests anything a container writes to stdout/stderr as a log
// entry automatically - no SDK, credentials, or extra dependency needed. If
// that line is a single JSON object, Cloud Logging parses it into
// `jsonPayload` and promotes a `severity` field to the entry's own severity,
// which is what makes log-based alerting/filtering in Cloud Monitoring and
// (for ERROR+ entries that include a stack trace) automatic Cloud Error
// Reporting extraction possible. Writing plain strings (console.log/error's
// default) still works, but loses all of that - every entry lands as
// severity DEFAULT with the whole line jammed into `textPayload`.
//
// This module is the one place that decides the on-the-wire shape; nothing
// else in the app should construct a log line by hand.

type Severity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface LogFields {
  requestId?: string;
  uid?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  stack?: string;
  [key: string]: unknown;
}

function write(severity: Severity, message: string, fields?: LogFields) {
  const entry = {
    severity,
    message,
    timestamp: new Date().toISOString(),
    ...fields,
  };
  const line = JSON.stringify(entry);
  // ERROR and CRITICAL go to stderr so they're visually distinct in any
  // terminal that's still tailing raw output (e.g. local `npm run dev`);
  // Cloud Logging reads both streams identically, so this has no effect
  // on severity there - that comes from the `severity` field above.
  if (severity === 'ERROR' || severity === 'CRITICAL') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, fields?: LogFields) => write('DEBUG', message, fields),
  info: (message: string, fields?: LogFields) => write('INFO', message, fields),
  warning: (message: string, fields?: LogFields) => write('WARNING', message, fields),
  error: (message: string, fields?: LogFields) => write('ERROR', message, fields),
  critical: (message: string, fields?: LogFields) => write('CRITICAL', message, fields),
};

export function errorFields(err: unknown): LogFields {
  if (err instanceof Error) {
    return { errorMessage: err.message, stack: err.stack };
  }
  return { errorMessage: String(err) };
}
