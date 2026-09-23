import express from "express";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import dns from "dns";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, Modality, LiveServerMessage } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import dotenv from "dotenv";
import twilio from "twilio";
import cron from "node-cron";
import { WebSocketServer } from 'ws';
import webpush from 'web-push';
import { NOVA_KNOWLEDGE_BASE } from './server-knowledge';
import { computeDimensionScores, computeArchetypeScores, pickDominantProfile, computeBlend } from './archetype-scoring';
import { SendMessageSchema, SetDndSchema, SetStatusSchema } from './boundary-autopilot-schemas';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAppCheck } from 'firebase-admin/app-check';
import cors from 'cors';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { memoryToolIsAllowed, searchMemories, isValidRecoveryDuration, validateMemoryWrite, validateFeatureSuggestion, SUGGESTABLE_FEATURES, toolsAreEnabled, liveVoiceIsEnabled, NovaMemoryDoc } from './nova-tools';
import { toClaudeTools, GeminiStyleToolDeclaration } from './nova-claude-tools';
import { computeClimateStrain, computeClimateStrainByDimension, computeMoodStrain, computeOverallStrain, computeTrend } from './org-risk-trend';
import { suggestRecognitionPrompts } from './positive-reinforcement';
import { isRealGuardian, isValidGuardianPhone, buildGuardianCallRequestMessage, extractFirstName, nudgeSchedulerIsEnabled, guardianAlertsEnabled } from './guardian-alert';
import { guardianSupportInvitationEnabled, validateGuardianSupportOffer, isValidGuardianSupportEventType, isValidGuardianSupportTemplateId, buildGuardianSupportMessage } from './guardian-support-invitation';
import { collectionsForExport, collectionsForErasure } from './user-data-collections';
import { htmlToPlainTextFallback, buildEmailVerificationEmail, buildPasswordResetEmail, buildPasswordChangedEmail, buildMfaEnabledEmail, buildMfaDisabledEmail, buildSupportRequestReceivedEmail } from './brevo-templates';
import { generateTotpSecret, buildOtpauthUri, verifyTotpCode, generateRecoveryCodes, hashRecoveryCode, encryptSecret as encryptTotpSecret, decryptSecret as decryptTotpSecret, isTotpLockedOut, nextLockoutState } from './totp-mfa';
import { isValidGad7Answers, scoreGad7, interpretGad7 } from './gad7';
import { OrgRole, isOrgRole, hasOrgPermission, canAssignRole, OrgPermission, ORG_ROLE_PERMISSIONS } from './org-rbac';
import { getEffectiveDataPolicy, validateDataPolicyUpdate } from './org-data-policy';
import { initialAuthStatus, validateConnectorCreate, canSeeConnectorDetail, ORG_CONNECTOR_TYPES } from './org-connectors';
import { isDeviceChannel, isValidAppVersion, validateDeviceRegistration, evaluateUpdateStatus, DEVICE_CHANNELS } from './desktop-deployment';
import { getEffectiveBillingState, validateBillingUpdate, checkSeatLimit, billingProvider } from './billing-adapter';
import { validateSsoConfigInput, encryptSecret, canEnableSsoEnforcement, redactSsoConfig, isBlockedIpAddress, StoredSsoConfig } from './sso-config';
import { searchOrgResources, validateResourceCreate, SearchableResource } from './org-search';
import {
  EntitlementRecord, EntitlementPlan, CapabilityId, CAPABILITIES, getEffectiveEntitlement,
  effectivePlan, checkQuota, getCapability, validateAdminGrant,
  minutesUsedForSession, PLAN_PRICING, annualSavingsGbp, PERFORMANCE_IS_MOST_POPULAR,
  PURCHASABLE_PLANS, isUpgrade, isDowngrade,
} from './entitlements';
import {
  SmsCategory, CATEGORIES_SUBJECT_TO_AGGREGATE_CAP, checkSmsQuota, estimateSmsSegments,
  smsGloballyEnabled, smsCategoryEnabled,
} from './sms-guardrails';
import { getEffectiveNotificationPreferences, routeNotification } from './notification-router';
import { UsageTotals, estimateCost } from './cost-estimates';

dotenv.config();

// Initialize Firebase Admin with Application Default Credentials
// In Cloud Run, this securely acquires credentials from the runtime metadata.
let firebaseConfigProject = undefined;
let firebaseConfigDatabaseId = undefined;
try {
  const firebaseConfigFile = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
  firebaseConfigProject = firebaseConfigFile.projectId;
  firebaseConfigDatabaseId = firebaseConfigFile.firestoreDatabaseId;
  
  // Force the Google Cloud Project to the one in the config so Firebase Auth accepts the tokens
  process.env.GOOGLE_CLOUD_PROJECT = firebaseConfigProject;
  process.env.GCLOUD_PROJECT = firebaseConfigProject;
} catch (e) {
  // firebase-applet-config.json is optional - if it's missing or invalid,
  // firebaseConfigProject/firebaseConfigDatabaseId just stay undefined and
  // initializeApp() below falls back to Application Default Credentials.
}

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfigProject || undefined
  });
}

const app = express();
app.set('trust proxy', 1);
// Read the port from the environment (Cloud Run and most hosts inject PORT,
// commonly 8080, and require the app to listen on it), falling back to 3000
// for local dev so nothing changes when running `npm run dev`.
const PORT = Number(process.env.PORT) || 3000;

// Set up CORS
const allowedOrigins = [
  "https://ais-dev-j3n2iqpfdg7zbjgfq4ixfo-398142886217.europe-west2.run.app",
  "https://ais-pre-j3n2iqpfdg7zbjgfq4ixfo-398142886217.europe-west2.run.app",
];
// Local dev origins are only trusted OUTSIDE production. Allowing localhost in
// a production deployment would let a page served from a developer's machine
// make cross-origin calls against the live API, so it's gated behind NODE_ENV.
if (process.env.NODE_ENV !== "production") {
  allowedOrigins.push(
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8081",
  );
}
// Comma-separated so a real production deploy can trust both the
// original *.run.app URL and a custom domain (or a bare domain plus its
// www. subdomain) at once - a single value still works exactly as
// before, since split(',') on a string with no comma just returns that
// one value.
if (process.env.APP_CHECK_DOMAIN) {
  allowedOrigins.push(
    ...process.env.APP_CHECK_DOMAIN.split(',')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => `https://${d}`)
  );
}

// Production-only: Vite's dev-mode HMR client injects its own inline
// bootstrap script into the page, which a strict script-src would block
// (confirmed locally — it breaks React Fast Refresh under `npm run dev`).
// The built production bundle has zero inline scripts (every script is an
// external module, including the service worker registration below), so
// the strict policy only needs to hold where it actually ships.
if (process.env.NODE_ENV === "production") {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // No 'unsafe-inline' for scripts — the one inline script this app had
        // (service worker registration) was moved to an external file
        // specifically so this could stay strict. apis.google.com/gstatic are
        // needed for Firebase Auth's Google sign-in popup flow (its helper
        // script); www.google.com specifically is where reCAPTCHA Enterprise's
        // own verification script actually loads from
        // (recaptcha/enterprise.js) - App Check silently can't produce a real
        // token without it, which cascades into Firestore looking "offline"
        // (it's not offline, it's waiting on a token that can never arrive).
        // Confirmed against a real deploy - www.gstatic.com alone wasn't enough.
        scriptSrc: ["'self'", "https://apis.google.com", "https://www.gstatic.com", "https://www.google.com"],
        // Tailwind/Framer Motion rely on inline style attributes at runtime;
        // disallowing that would require a much larger refactor than this
        // security pass covers, so this one directive stays permissive.
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"], // Slack avatars, Google profile photos, etc. are remote images
        connectSrc: [
          "'self'",
          "https://*.googleapis.com",   // Firebase Auth/Firestore + the direct Google Calendar API calls
          "https://*.firebaseio.com",
          "wss://*.firebaseio.com",
          // reCAPTCHA Enterprise's own script (allowed in scriptSrc above)
          // makes its own background network calls to this same host once
          // loaded (e.g. the /recaptcha/enterprise/clr risk-telemetry
          // call) - without it here too, those calls are blocked by this
          // policy, and App Check silently can't produce a token, which
          // cascades into every gated fetch (secure-api.ts's
          // getAppCheckToken) hanging/retrying instead of failing fast -
          // the same "looks offline/stuck loading" failure mode already
          // documented for scriptSrc above, just one directive short of
          // actually being fixed by it.
          "https://www.google.com",
          "ws:", "wss:",                // same-origin WebSocket (Nova live voice) — scheme itself, not a host, since it's same-origin
        ],
        // Firebase Auth's popup-based sign-in relays the OAuth result back to
        // this page via a hidden iframe hosted on the Firebase project's own
        // authDomain (<project>.firebaseapp.com/__/auth/iframe) - without an
        // explicit allowance it falls back to default-src 'self' and silently
        // breaks the sign-in popup handshake. www.google.com covers
        // reCAPTCHA Enterprise's own risk-assessment iframe (App Check),
        // which it uses even in invisible/score-only mode.
        frameSrc: ["'self'", "https://*.firebaseapp.com", "https://accounts.google.com", "https://www.google.com"],
        frameAncestors: ["'none'"], // Blocks clickjacking — this app should never be framed by another site
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    // Boundary Autopilot/OAuth flows open real popups/redirects to Slack, Google,
    // etc. — a default-strict Cross-Origin-Opener-Policy breaks that handoff.
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  }));
}

// Helmet (as of this version) doesn't ship a Permissions-Policy middleware,
// unlike its older deprecated Feature-Policy equivalent - set it directly.
// microphone is genuinely used (Nova Live Voice, Daily Voice Journal) and
// clipboard-write is used throughout (the many copy-to-clipboard buttons);
// everything else powerful this app has no use for is explicitly denied
// rather than left to each browser's default.
app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(self), geolocation=(), payment=(), usb=(), midi=(), ' +
    'magnetometer=(), gyroscope=(), accelerometer=(), display-capture=(), ' +
    'fullscreen=(self), clipboard-write=(self)'
  );
  next();
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

// Apply strict body size limits globally to block oversized payloads
app.use(express.json({ limit: '10kb' }));

// Set up rate limiting
//
// 100/15min (was the original value here) is too tight for genuine
// interactive use of this app, not just abuse - it's a global, per-IP
// ceiling shared across every /api/ route, and a single load of the
// admin "Live Activity & Access" screen alone fires 4 parallel requests
// (users, admin-users, audit-logs, orgs). A real, active session (or a
// shared office/NAT IP with multiple legitimate users) can exhaust 100
// requests in minutes through completely normal navigation, and because
// this is IP-based and server-side, neither a hard refresh nor an
// incognito window resets it - confirmed as the root cause of a live
// "Couldn't load live data" report that persisted through both. Raised
// to a ceiling that still meaningfully blocks scraping/abuse (roughly
// 40 requests/minute sustained) while comfortably covering real
// dashboard use.
// express-rate-limit never logs a 429 rejection on its own - previously
// every limiter below relied on its `message` response body alone, so a
// burst of rejected requests (a real signal for credential stuffing,
// scraping, or a misbehaving client) produced zero log output anywhere.
// A deterministic, non-clinical signal only - request rate against a
// fixed ceiling, never anything about what the request contained.
const logRateLimitExceeded = (limiterName: string) =>
  (req: express.Request, res: express.Response, _next: express.NextFunction, options: any) => {
    const uid = (req as any).user?.uid;
    console.warn(`[RATE LIMIT] ${limiterName} exceeded by IP ${req.ip}${uid ? ` (uid ${uid})` : ''} on ${req.method} ${req.originalUrl}`);
    res.status(options.statusCode).json(options.message);
  };

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 600, // limit each IP to 600 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true },
  handler: logRateLimitExceeded('apiLimiter'),
});

const oneLessThingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many requests, please try again shortly.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true },
  handler: logRateLimitExceeded('oneLessThingLimiter'),
});

const speechLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // stricter for speech
  message: { error: 'Too many speech requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true },
  handler: logRateLimitExceeded('speechLimiter'),
});

const smsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // SMS costs real money per message and could enable harassment if abused — stricter than any other endpoint.
  message: { error: 'Too many messaging requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true },
  handler: logRateLimitExceeded('smsLimiter'),
});

// Guardian alerts specifically: the Guardian Support spec (docs/GUARDIAN_SUPPORT_SPEC.md
// §D.3) sets 5/hour and 15/day per user as engineering placeholders pending
// safeguarding review, not a clinical judgement about how often someone in
// genuine crisis should be able to ask for help. This limiter enforces the
// hourly figure; the daily figure is enforced in-handler alongside the
// per-contact cooldown, since express-rate-limit doesn't support two windows
// on one route cleanly.
const guardianAlertLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "That's a lot of alerts in a short time. Please wait a little before sending another." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true },
  handler: logRateLimitExceeded('guardianAlertLimiter'),
});

// Nova text/diagnose/voice-journal previously relied on the generic
// 100/15min apiLimiter alone - fine for cheap routes, not for AI-model
// calls. These sit alongside the entitlement daily-quota check
// (checkAndReserveCapability): the quota is the cost/abuse ceiling, this
// limiter is the burst-protection floor (stops a tight retry loop from
// hammering the provider even within a day's quota).
const novaChatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many Nova messages, please slow down and try again shortly.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true },
  handler: logRateLimitExceeded('novaChatLimiter'),
});

const novaDiagnoseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many check-in requests, please try again shortly.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true },
  handler: logRateLimitExceeded('novaDiagnoseLimiter'),
});

const novaVoiceJournalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many voice journal requests, please try again shortly.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true },
  handler: logRateLimitExceeded('novaVoiceJournalLimiter'),
});

// Same shape as novaDiagnoseLimiter above - a comparable single-shot
// Gemini call from raw user text.
const resentmentAnalysisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many requests, please try again shortly.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true },
  handler: logRateLimitExceeded('resentmentAnalysisLimiter'),
});

// Same shape again - the executive report and manager coach are each a
// comparable single-shot Gemini call, and previously had no rate limiter
// at all (unlike nova/chat, diagnose, and every other AI-backed route).
const executiveReportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many requests, please try again shortly.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true },
  handler: logRateLimitExceeded('executiveReportLimiter'),
});

const managerCoachLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many requests, please try again shortly.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true },
  handler: logRateLimitExceeded('managerCoachLimiter'),
});

const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many export requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true },
  handler: logRateLimitExceeded('exportLimiter'),
});

const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many feedback submissions, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true },
  handler: logRateLimitExceeded('feedbackLimiter'),
});

// Account security routes (email verification, password reset, TOTP 2FA).
// passwordResetRequestLimiter is IP-keyed since there's no session yet at
// that point in the flow — every other limiter below is keyed by uid via
// uidKeyGenerator, which requires authenticateFirebaseUser to run BEFORE
// the limiter in those routes' middleware chain (a deliberate deviation
// from this file's usual limiter-first ordering, since the uid isn't known
// until auth has run).
const passwordResetRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many password reset requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true },
  handler: logRateLimitExceeded('passwordResetRequestLimiter'),
});

// express-rate-limit requires its own ipKeyGenerator helper (not raw req.ip)
// for any IP-based fallback in a custom keyGenerator, so IPv6 addresses get
// normalised the same safe way its own default keying does.
const uidKeyGenerator = (req: express.Request): string => (req as any).user?.uid || ipKeyGenerator(req.ip || '0.0.0.0');

const emailVerifySendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: uidKeyGenerator,
  message: { error: 'Too many verification emails requested, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true },
  handler: logRateLimitExceeded('emailVerifySendLimiter'),
});

const mfaEnrollLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: uidKeyGenerator,
  message: { error: 'Too many attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true },
  handler: logRateLimitExceeded('mfaEnrollLimiter'),
});

const mfaSigninVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyGenerator: uidKeyGenerator,
  message: { error: 'Too many verification attempts, please try again shortly.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true },
  handler: logRateLimitExceeded('mfaSigninVerifyLimiter'),
});

app.use('/api/', apiLimiter);

// Global Error Handler for safe JSON error returns (e.g. 413 Payload Too Large)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload Too Large. Request size exceeded safety limits.' });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Bad Request. Invalid JSON.' });
  }
  next(err);
});

// Firebase App Check Middleware (Enforced Mode)
const verifyAppCheck = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const appCheckToken = req.headers['x-firebase-appcheck'];
  // Deliberately NOT checking for a magic bypass string here anymore — a
  // fixed string is visible in the shipped client bundle to any user who
  // opens devtools, so anyone could send it directly to the API regardless
  // of NODE_ENV, bypassing App Check entirely even in real production. The
  // only thing that should ever skip this check is genuinely not being in
  // production — something only the developer running the server controls,
  // not something a request header can claim its way into.
  if (process.env.NODE_ENV !== "production") {
    return next();
  }

  if (!appCheckToken || typeof appCheckToken !== 'string') {
    res.status(401).json({ error: 'Unauthorized. Missing Firebase App Check token.' });
    return;
  }

  try {
    await getAppCheck().verifyToken(appCheckToken);
    (req as any).appCheckVerified = true;
    next();
  } catch (e) {
    console.warn(`[APP CHECK] Invalid token received from IP ${req.ip}`);
    res.status(401).json({ error: 'Unauthorized. Invalid Firebase App Check token.' });
    return;
  }
};

// Two routes a user must be able to reach with a valid-but-not-yet-MFA-
// verified session: checking whether they even need to challenge, and
// submitting that challenge. Every other authenticated route — including
// the 2FA enroll/disable routes themselves — requires an established MFA
// session once an account has 2FA enabled, specifically so a stolen-but-
// unverified ID token can't be used to silently re-enroll a new
// authenticator (overwriting the real one) or turn 2FA off without ever
// proving the existing code.
const MFA_GATE_EXEMPT_PATHS = new Set([
  '/api/auth/mfa/status',
  '/api/auth/mfa/totp/verify-at-signin',
]);

// Firebase ID Token Authentication Middleware for Nova API Layer Hardening
const authenticateFirebaseUser = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header. Bearer token required.' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    // checkRevoked: true so a password change or 2FA disable (both of
    // which call revokeRefreshTokens) immediately invalidates any ID
    // token already in flight, not just future token refreshes.
    const decodedToken = await getAuth().verifyIdToken(token, true);
    (req as any).user = decodedToken;

    // mfaEnabled is an account-level custom claim (kept in sync by the
    // enroll/confirm and disable routes) — cheap to check on every
    // request with no extra Firestore read. Whether *this session* has
    // actually cleared that challenge is a separate, session-scoped fact
    // proven by the signed X-MFA-Session-Token header, never by the ID
    // token itself (a custom claim is baked into every future token
    // Firebase mints for this uid, so it can't distinguish a verified
    // session from an attacker's own fresh, independently-obtained one).
    if (decodedToken.mfaEnabled === true && !MFA_GATE_EXEMPT_PATHS.has(req.path)) {
      const sessionToken = req.headers['x-mfa-session-token'];
      if (typeof sessionToken !== 'string' || !verifyMfaSessionToken(sessionToken, decodedToken.uid)) {
        return res.status(401).json({ error: 'Two-factor verification required for this session.', code: 'MFA_SESSION_REQUIRED' });
      }
    }

    next();
  } catch (error) {
    // Redacted logging: Do not log the token itself
    console.warn(`[AUTH] Invalid or expired Firebase ID token from IP ${req.ip}. Error:`, (error as Error).message);
    return res.status(401).json({ error: 'Invalid or expired Firebase ID token.' });
  }
};

// Twilio Initialization
let twilioClient: twilio.Twilio | null = null;
const initTwilio = () => {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (accountSid && authToken) {
      twilioClient = twilio(accountSid, authToken);
    }
  }
  return twilioClient;
};

// Brevo Initialization
const postToBrevoEmail = async (payload: Record<string, unknown>): Promise<boolean> => {
  const brevoKey = process.env.BREVO_API_KEY;
  if (!brevoKey) {
    console.warn("[BREVO] API key not found. Email not sent.");
    return false;
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': brevoKey
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.error("[BREVO] Failed to send email:", await res.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("[BREVO] Error sending email:", error);
    return false;
  }
};

const sendBrevoEmail = (toEmail: string, subject: string, textContent: string) =>
  postToBrevoEmail({
    sender: { name: "Blaze Break Support", email: "support@blazebreak.app" },
    to: [{ email: toEmail }],
    subject,
    textContent
  });

// This app's first HTML email sender - every other transactional email
// (support auto-reply, org invites, ally invites) stays plain-text via
// sendBrevoEmail above, untouched. Used for account-security emails
// (password reset, email verification, MFA change notices) that need a
// clickable link and a bit of branding rather than a raw URL in plaintext.
const sendBrevoHtmlEmail = (toEmail: string, subject: string, htmlContent: string) =>
  postToBrevoEmail({
    sender: { name: "Blaze Break Support", email: "support@blazebreak.app" },
    to: [{ email: toEmail }],
    subject,
    htmlContent,
    textContent: htmlToPlainTextFallback(htmlContent)
  });

// Support & Deletion Request Route
app.post("/api/support/request", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = (req as any).user.uid;
    const email = (req as any).user.email;
    const { type, details } = req.body;
    
    // Log to console (safe metadata only)
    console.log(`[SUPPORT] Support request received. Type: ${type}, UID: ${uid}`);
    
    const subject = `Blaze Break - ${type === 'deletion' ? 'Account Deletion' : 'Support'} Request`;
    const body = `
User email: ${email}
UID: ${uid}
Type: ${type}
Details: ${details || 'No details provided'}
    `.trim();

    // Send to admin
    await sendBrevoEmail("support@blazebreak.app", subject, body);
    
    // Auto-reply to user - branded HTML, unlike the plain-text admin copy
    // above, since this one actually reaches a real client's inbox.
    const { subject: replySubject, html: replyHtml } = buildSupportRequestReceivedEmail();
    await sendBrevoHtmlEmail(email, replySubject, replyHtml);

    res.json({ success: true });
  } catch (err: any) {
    console.error("[SUPPORT] Error processing support request:", err.message);
    res.status(500).json({ error: "Failed to process request" });
  }
});

// Feedback & Testimonials Route
const FeedbackSubmissionSchema = z.object({
  category: z.enum(['general', 'bug', 'feature_request', 'testimonial']),
  message: z.string().min(1).max(2000),
  rating: z.number().min(1).max(5).optional(),
  publicUseConsent: z.boolean().optional().default(false),
}).strict();

app.post("/api/feedback/submit", feedbackLimiter, verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const parsed = FeedbackSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid feedback submission." });
    }
    const user = requireAuth(req);
    const { category, message, rating, publicUseConsent } = parsed.data;
    // Consent to public use only means anything for a testimonial - forced
    // false for every other category regardless of what the client sends.
    const consentToRecord = category === 'testimonial' ? publicUseConsent : false;

    const db = getDb();
    const docRef = await db.collection("feedback_submissions").add({
      userId: user.uid,
      userEmail: user.email || "",
      category,
      message,
      rating: rating ?? null,
      publicUseConsent: consentToRecord,
      createdAt: FieldValue.serverTimestamp(),
    });

    console.log(`[FEEDBACK] Submission received. Category: ${category}, UID: ${user.uid}`);

    const subject = `Blaze Break - New ${category === 'testimonial' ? 'Testimonial' : 'Feedback'} Submission`;
    const body = `
User email: ${user.email}
UID: ${user.uid}
Category: ${category}
Rating: ${rating ?? 'n/a'}
Public-use consent: ${consentToRecord ? 'yes' : 'no'}

Message:
${message}
    `.trim();
    await sendBrevoEmail("support@blazebreak.app", subject, body);

    res.json({ success: true, id: docRef.id });
  } catch (err: any) {
    console.error("[FEEDBACK] Error processing submission:", err.message);
    res.status(500).json({ error: "Failed to submit feedback" });
  }
});

// API routes that use Twilio
const TwilioSendSchema = z.object({
  to: z.string().regex(/^\+[1-9]\d{6,14}$/, "Phone number must be in E.164 format, e.g. +15551234567"),
  message: z.string().min(1).max(500),
  useWhatsapp: z.boolean().optional().default(false),
}).strict();

// SEVERE FIX: this endpoint previously had zero authentication of any kind —
// anyone on the internet who found this URL could send arbitrary SMS/WhatsApp
// messages to arbitrary phone numbers using this app's own Twilio account,
// at real per-message cost, with no way to trace who did it. It was also
// completely unused by the frontend (confirmed via a full grep of src/) —
// pure risk with zero current value. Now: real auth, strict input validation
// (proper E.164 phone format, message length cap), a dedicated strict rate
// limit given the real cost per message, and an audit log entry so any use
// going forward is actually traceable to a real, authenticated user.
// Shared send logic - used by the authenticated route below and by the
// ally nudge scheduler. Deliberately does NOT bypass auth/rate-limiting for
// the route; the scheduler calls this directly since it already knows the
// message is legitimate (it was configured by an authenticated user earlier).
// Central SMS cost/abuse enforcement point - every Twilio send in this
// codebase goes through this one function, so this is the one place that
// needs to check the global/category kill switches and the per-user
// aggregate cap (see sms-guardrails.ts for why guardian_alert is exempt
// from the cap but not the global switch).
const SMS_GLOBALLY_ENABLED = smsGloballyEnabled(process.env.SMS_ENABLED);
const SMS_MANUAL_SEND_ENABLED = smsCategoryEnabled(process.env.SMS_MANUAL_SEND_ENABLED);

async function sendTwilioMessage(
  uid: string,
  to: string,
  message: string,
  useWhatsapp: boolean,
  category: SmsCategory = 'manual_send'
): Promise<{ success: boolean; sid?: string; error?: string }> {
  if (!SMS_GLOBALLY_ENABLED) {
    return { success: false, error: "Messaging is temporarily unavailable." };
  }
  if (category === 'manual_send' && !SMS_MANUAL_SEND_ENABLED) {
    return { success: false, error: "Direct messaging is temporarily unavailable." };
  }

  const db = getDb();
  const dayKey = usageCounterTodayKey();
  const monthKey = `month-${dayKey.slice(0, 7)}`;
  const usageSubjectToCap = CATEGORIES_SUBJECT_TO_AGGREGATE_CAP.includes(category);
  // Tier SMS allowance (sms_nudges) is checked here, inside the SAME
  // usageSubjectToCap branch as the pre-existing abuse-cap check below -
  // that branch is never entered for 'guardian_alert', so Guardian
  // Support SMS automatically inherits this exemption without any
  // separate bypass logic. See docs/FREE_PREMIUM_ENTITLEMENTS.md.
  let tierQuotaPlan: EntitlementPlan | null = null;
  if (usageSubjectToCap) {
    const [daySnap, monthSnap] = await Promise.all([
      db.collection("users").doc(uid).collection("usage_counters").doc(dayKey).get(),
      db.collection("users").doc(uid).collection("usage_counters").doc(monthKey).get(),
    ]);
    const quota = checkSmsQuota(category, Number(daySnap.data()?.smsCount) || 0, Number(monthSnap.data()?.smsCount) || 0);
    if (!quota.allowed) {
      return {
        success: false,
        error: quota.reason === 'monthly_limit_reached'
          ? "You've reached this month's messaging limit."
          : "You've reached today's messaging limit. It resets tomorrow.",
      };
    }

    const tierQuota = await checkCapabilityQuota(uid, 'sms_nudges');
    tierQuotaPlan = tierQuota.plan;
    if (!tierQuota.allowed) {
      return {
        success: false,
        error: "You've used this month's text nudges. They'll continue by push/in-app notification instead - upgrade for a higher monthly SMS allowance.",
      };
    }
  }

  const client = initTwilio();
  const fromPhone = process.env.TWILIO_PHONE_NUMBER;
  if (!client || !fromPhone) {
    return { success: false, error: "Messaging is unavailable because the support messaging system is not configured." };
  }
  const { segments, encoding } = estimateSmsSegments(message);
  try {
    const m = await client.messages.create({
      body: message,
      from: useWhatsapp ? `whatsapp:${fromPhone}` : fromPhone,
      to: useWhatsapp ? `whatsapp:${to}` : to,
    });
    await logAutopilotAction(uid, "sms_send", { to, useWhatsapp, category, segments, encoding }, true);
    if (usageSubjectToCap && tierQuotaPlan) {
      await Promise.all([
        db.collection("users").doc(uid).collection("usage_counters").doc(dayKey).set({ smsCount: FieldValue.increment(1) }, { merge: true }),
        db.collection("users").doc(uid).collection("usage_counters").doc(monthKey).set({ smsCount: FieldValue.increment(1) }, { merge: true }),
        recordCapabilityUsage(uid, 'sms_nudges', tierQuotaPlan, 1),
      ]);
    }
    return { success: true, sid: m.sid };
  } catch (error: any) {
    console.error("Twilio error:", error);
    await logAutopilotAction(uid, "sms_send", { error: error.message, category }, false);
    return { success: false, error: error.message };
  }
}

app.post("/api/twilio/send", smsLimiter, verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  const uid = requireAuth(req).uid;
  try {
    const parsed = TwilioSendSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request — a valid E.164 phone number and message are required." });
    }
    const { to, message, useWhatsapp } = parsed.data;
    const result = await sendTwilioMessage(uid, to, message, useWhatsapp, 'manual_send');
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    res.json({ success: true, sid: result.sid });
  } catch (error: any) {
    console.error("Twilio route error:", error);
    res.status(500).json({ error: error.message });
  }
});

// docs/GUARDIAN_SUPPORT_SPEC.md §E.7 point 1: "Copy is bound to flag state -
// the UI cannot render capability-claiming copy that is not owned by an
// enabled flag." The frontend cannot read process.env itself, so this is
// the one authoritative place it learns whether the real dispatch route
// below is actually live before it renders "Send" buttons or "will ask
// them to call you" copy. authenticateFirebaseUser only (no App Check) -
// this is a read of non-sensitive, non-per-user config, same trust level
// as any other UI-gating flag check in this app.
app.get("/api/guardian/config", authenticateFirebaseUser, async (_req, res) => {
  res.json({
    alertsEnabled: guardianAlertsEnabled(process.env.GUARDIAN_ALERTS_ENABLED),
    // Separate from alertsEnabled: that one gates whether a guardian alert
    // can be SENT at all (Tier 1, live since before this flag existed, so
    // it defaults on). This one gates whether Nova/the UI ever OFFERS the
    // Guardian Support Invitation card in the first place - a newer,
    // not-yet-specialist-reviewed surface, so it defaults off. Turning
    // this off never removes a user's ability to manually reach their
    // Guardian via the existing Ally tab or the always-available crisis
    // button - only the proactive offer.
    invitationEnabled: guardianSupportInvitationEnabled(process.env.GUARDIAN_SUPPORT_INVITATION_ENABLED),
  });
});

// ============ Guardian Support Invitation — privacy-preserving analytics ============
// Deliberately the only write path for these events (no direct client
// Firestore write) so the closed-enum validation is enforced in one place
// server-side, matching the "never trust the client's own claim about
// shape" pattern used throughout this file. Event types are a fixed list
// (guardian-support-invitation.ts) - there is no field here, or anywhere
// in this payload, that could carry chat content, an inferred emotional
// state, or anything resembling a risk label; see
// docs/GUARDIAN_SUPPORT_INVITATION.md for the full list and what each one
// means.
const GuardianSupportEventSchema = z.object({
  eventType: z.string(),
  contactId: z.string().max(200).optional(),
  channel: z.enum(['sms', 'whatsapp', 'call']).optional(),
}).strict();

app.post("/api/guardian/support-event", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const parsed = GuardianSupportEventSchema.safeParse(req.body);
    if (!parsed.success || !isValidGuardianSupportEventType(parsed.data.eventType)) {
      return res.status(400).json({ error: "Invalid or unrecognised event type." });
    }
    const uid = requireAuth(req).uid;
    const db = getDb();
    await db.collection("users").doc(uid).collection("guardian_support_events").add({
      eventType: parsed.data.eventType,
      contactId: parsed.data.contactId || null,
      channel: parsed.data.channel || null,
      createdAt: new Date().toISOString(),
    });
    res.json({ recorded: true });
  } catch (error: any) {
    // Non-fatal by design on the client side (this is analytics, not a
    // safety-critical write) - but still a real server error if it does fail.
    console.error("[Guardian support event] error:", error?.message || error);
    res.status(500).json({ error: "Could not record that." });
  }
});

// ============ Guardian Support — Tier 1: one-tap guardian call request ============
// Per docs/GUARDIAN_SUPPORT_SPEC.md. Deterministic dispatch only: no LLM is
// anywhere in this path, so §D.8's "an LLM may prepare but never dispatch"
// rule is trivially satisfied here - this endpoint exists purely for a
// direct user tap. Tier 2 (conversational, LLM-prepared, still
// human-confirmed) is a separate later piece, not this one.
type GuardianAlertState = "queued" | "provider_accepted" | "failed";
const GUARDIAN_STATE_COPY: Record<GuardianAlertState, string> = {
  queued: "Sending…",
  provider_accepted: "I've sent it — I can't confirm it's arrived yet.",
  failed: "I couldn't get that message through. That's a problem on this end, not yours.",
};

// Guards the window between the cooldown/idempotency/daily-cap Firestore
// reads below and the write that records them: those are separate
// round-trips, so two near-simultaneous requests from the same user - a
// genuine double-tap, or a client retry that (deliberately) generates a
// fresh idempotencyKey each call rather than reusing one - would otherwise
// both read "no recent alert" / "14 sent today" and both actually message
// a guardian, despite the cooldown/idempotency/cap comments below implying
// exactly one send and a hard ceiling. Keyed on uid alone (not
// uid:contactId) so this also closes the daily-cap race across DIFFERENT
// contacts, not just repeat sends to the same one - two alerts to two
// different guardians in the same instant would otherwise each see the cap
// as not-yet-reached and both proceed. Guardian alerts are a rare,
// deliberate action (not a UI a user fires rapidly in normal use), so
// serializing all of one user's requests has no real cost. This
// synchronous check-and-add closes the race for real (no await happens
// between the .has() check and the .add()); the key is released in a
// `finally` once the request finishes, success or failure.
const guardianAlertInFlight = new Set<string>();

// §E.7's capability-registered kill switch - see guardian-alert.ts for why
// this defaults enabled rather than following the spec's literal
// "ship new, default off" step. Checked first thing inside the handler,
// before any Firestore read or business logic below it.
app.post("/api/guardian/alert", guardianAlertLimiter, verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  if (!guardianAlertsEnabled(process.env.GUARDIAN_ALERTS_ENABLED)) {
    return res.status(503).json({ error: "Guardian alerts are temporarily unavailable. Please reach out to your contact directly for now." });
  }
  const uid = requireAuth(req).uid; // uid from the verified token only - never from req.body
  let inFlightKey: string | null = null;
  try {
    const { contactId, idempotencyKey, templateId } = req.body || {};
    if (typeof contactId !== "string" || !contactId) {
      return res.status(400).json({ error: "Missing contactId." });
    }
    if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8) {
      return res.status(400).json({ error: "Missing or invalid idempotencyKey." });
    }
    // Optional, and deliberately a closed enum (guardian-support-invitation.ts)
    // rather than freeform text - see that file's header comment on why
    // message wording stays pre-approved-templates-only for now. Omitting
    // it keeps every existing caller (NovaGuardianRelay.tsx, CrisisSupport.tsx)
    // working exactly as before, on the original fixed template.
    if (templateId !== undefined && !isValidGuardianSupportTemplateId(templateId)) {
      return res.status(400).json({ error: "Invalid templateId." });
    }

    inFlightKey = uid;
    if (guardianAlertInFlight.has(inFlightKey)) {
      return res.status(429).json({
        error: "cooldown",
        userMessage: "Already sending your last guardian alert request - hang on a moment before trying again.",
        canOverride: false,
      });
    }
    guardianAlertInFlight.add(inFlightKey);

    const db = getDb();
    const alertsRef = db.collection("users").doc(uid).collection("guardian_alerts");

    // Idempotency: the key is the document ID, so a retry or double-tap with
    // the same key can never create a second send - it just returns
    // whatever the first attempt already produced.
    const existingRef = alertsRef.doc(idempotencyKey);
    const existingSnap = await existingRef.get();
    if (existingSnap.exists) {
      const existing = existingSnap.data()!;
      return res.json({
        alertId: idempotencyKey,
        state: existing.state,
        userMessage: GUARDIAN_STATE_COPY[existing.state as GuardianAlertState] || "Already handled.",
        contactDisplayName: existing.contactName,
      });
    }

    // Load the user's own guardian contact server-side and look it up by id
    // - the phone number is never taken from the request body. A caller can
    // only ever message a contact that is genuinely their own, genuinely
    // marked as a guardian. Reads the validated support_circle subcollection
    // first (the real source of truth - see src/lib/support-circle.ts);
    // falls back to the legacy user_stats/core.supportCircle array for any
    // account that hasn't opened the app since the client-side migration to
    // that subcollection shipped, so a real alert send can't break during
    // that transition window. statsSnap is also needed below regardless, for
    // the sender's own name in the message template.
    const [contactDocSnap, statsSnap] = await Promise.all([
      db.collection("users").doc(uid).collection("support_circle").doc(contactId).get(),
      db.collection("users").doc(uid).collection("user_stats").doc("core").get(),
    ]);
    let contact: any = contactDocSnap.exists ? { id: contactDocSnap.id, ...contactDocSnap.data() } : null;
    if (!contact) {
      const legacySupportCircle: any[] = statsSnap.exists ? (statsSnap.data()?.supportCircle || []) : [];
      contact = legacySupportCircle.find(c => c?.id === contactId) || null;
    }
    if (!isRealGuardian(contact)) {
      return res.status(403).json({
        error: "not_a_guardian",
        userMessage: "I don't have that person set up as a guardian. You can add one in the Ally tab.",
      });
    }
    if (!isValidGuardianPhone(contact.contactMethod)) {
      return res.status(400).json({
        error: "invalid_number",
        userMessage: `${contact.name}'s number isn't in a valid format. Edit it and try again.`,
      });
    }

    // Cooldown: prevents accidental repeat sends to the same person, while
    // still letting a genuinely escalating situation try again immediately -
    // the client is expected to surface that choice rather than being
    // silently blocked (spec §D.3).
    const cooldownMs = 10 * 60 * 1000; // engineering placeholder, [REVIEW] per spec
    const cooldownSince = new Date(Date.now() - cooldownMs).toISOString();
    const recentToSameContact = await alertsRef
      .where("contactId", "==", contactId)
      .where("createdAt", ">=", cooldownSince)
      .limit(1)
      .get();
    if (!recentToSameContact.empty && req.body?.cooldownOverride !== true) {
      return res.status(429).json({
        error: "cooldown",
        userMessage: `You already asked ${contact.name} to call you a few minutes ago. Send it again if you still need to.`,
        canOverride: true,
      });
    }

    // Daily cap, enforced here since express-rate-limit only covers the
    // hourly window on this route (spec §D.3's second figure).
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const todaysAlerts = await alertsRef.where("createdAt", ">=", dayAgo).get();
    if (todaysAlerts.size >= 15) {
      return res.status(429).json({
        error: "daily_limit",
        userMessage: "You've reached today's limit for guardian alerts. Please try calling a crisis line if you need support right now.",
      });
    }

    // Persist as 'queued' before the provider call, so a crash between here
    // and the send is visible in history rather than silently lost.
    const userStats = statsSnap.exists ? statsSnap.data() : null;
    const firstName = extractFirstName(userStats?.profile?.fullName);
    const message = templateId
      ? buildGuardianSupportMessage(templateId, { guardianFirstName: extractFirstName(contact.name), senderFirstName: firstName })
      : buildGuardianCallRequestMessage(firstName);

    await existingRef.set({
      contactId,
      contactName: contact.name,
      triggerSource: "manual_button",
      state: "queued" as GuardianAlertState,
      createdAt: new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const result = await sendTwilioMessage(uid, contact.contactMethod, message, contact.notificationPreference === "whatsapp", 'guardian_alert');
    const finalState: GuardianAlertState = result.success ? "provider_accepted" : "failed";

    await existingRef.update({
      state: finalState,
      providerMessageId: result.sid || null,
      providerError: result.error || null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (!result.success) {
      return res.status(502).json({
        alertId: idempotencyKey,
        state: finalState,
        error: result.error,
        userMessage: GUARDIAN_STATE_COPY.failed,
      });
    }

    res.json({
      alertId: idempotencyKey,
      state: finalState,
      userMessage: GUARDIAN_STATE_COPY.provider_accepted,
      contactDisplayName: contact.name,
    });
  } catch (error: any) {
    console.error("[Guardian alert] error:", error?.message || error);
    res.status(500).json({ error: error.message, userMessage: GUARDIAN_STATE_COPY.failed });
  } finally {
    if (inFlightKey) guardianAlertInFlight.delete(inFlightKey);
  }
});

// Real, honest guardian alert history - deliberately excludes any
// conversation content (spec §D.7); this collection only ever stores
// alert metadata, never what the user said beforehand.
app.get("/api/guardian/alerts", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const db = getDb();
    const snap = await db.collection("users").doc(uid).collection("guardian_alerts")
      .orderBy("createdAt", "desc").limit(20).get();
    res.json({
      alerts: snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          contactName: data.contactName,
          state: data.state,
          userMessage: GUARDIAN_STATE_COPY[data.state as GuardianAlertState] || null,
          createdAt: data.createdAt,
        };
      }),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Nova voice-call continuity ============
// Records only METADATA about a voice call - when it ended, how long it ran,
// how many turns - never the transcript or anything that was said. This lets
// the next call greet the person as someone Nova knows without storing the
// contents of an intimate conversation. Nested under the user document, so
// the GDPR export/delete endpoints cover it automatically. See
// voice-continuity.ts for the pure logic that turns this into a greeting.
const VoiceSessionSchema = z.object({
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
  turnCount: z.number().int().min(0).max(100000),
}).strict();

app.post("/api/nova/voice-sessions", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const parsed = VoiceSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid voice session record." });
    }
    const db = getDb();
    await db.collection("users").doc(uid).collection("nova_voice_sessions").add({
      endedAt: new Date().toISOString(),
      durationMs: parsed.data.durationMs,
      turnCount: parsed.data.turnCount,
      createdAt: FieldValue.serverTimestamp(),
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/nova/voice-sessions", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const db = getDb();
    const snap = await db.collection("users").doc(uid).collection("nova_voice_sessions")
      .orderBy("endedAt", "desc").limit(50).get();
    res.json({
      sessions: snap.docs.map(d => {
        const data = d.data();
        return { endedAt: data.endedAt, durationMs: data.durationMs, turnCount: data.turnCount };
      }),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Personal wellbeing tracking — GAD-7 ============
// A validated self-report anxiety screener the user completes about
// themselves. Two hard rules, enforced here:
//   1. STRICTLY PRIVATE to the individual. Stored under the user document and
//      there is deliberately NO org/aggregate endpoint for it - a person's
//      GAD-7 result must never reach an employer dashboard.
//   2. Self-report, not diagnosis, not inference. The user rates themselves;
//      the server just validates, scores with the standard published bands
//      (see gad7.ts), and stores the history so they can see their own trend.
// Nested under the user, so the GDPR export/delete endpoints cover it
// automatically (it is health data and must be erasable).
const Gad7Schema = z.object({
  answers: z.array(z.number().int().min(0).max(3)).length(7),
  impairment: z.number().int().min(0).max(3).nullable().optional(),
}).strict();

app.post("/api/wellbeing/gad7", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const parsed = Gad7Schema.safeParse(req.body);
    if (!parsed.success || !isValidGad7Answers(parsed.data.answers)) {
      return res.status(400).json({ error: "Invalid GAD-7 submission." });
    }
    const score = scoreGad7(parsed.data.answers);
    const result = interpretGad7(score);
    const db = getDb();
    await db.collection("users").doc(uid).collection("gad7_assessments").add({
      answers: parsed.data.answers,
      impairment: parsed.data.impairment ?? null,
      score,
      severity: result.severity,
      createdAt: new Date().toISOString(),
      serverCreatedAt: FieldValue.serverTimestamp(),
    });
    res.json({ score, severity: result.severity, severityLabel: result.severityLabel, summary: result.summary, suggestsSupport: result.suggestsSupport });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/wellbeing/gad7", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const db = getDb();
    const snap = await db.collection("users").doc(uid).collection("gad7_assessments")
      .orderBy("createdAt", "desc").limit(60).get();
    res.json({
      assessments: snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, score: data.score, severity: data.severity, createdAt: data.createdAt };
      }),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Gemini Initialization
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
  console.warn("Warning: GEMINI_API_KEY is missing or placeholder. Nova AI features will fail until a valid key is provided in Settings > Secrets.");
}

const ai = new GoogleGenAI({
  apiKey: apiKey || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// The coaching persona for Nova's real-time voice sessions. This is the
// single biggest lever on whether Nova "sounds like a warm human coach": the
// Gemini Live model already produces expressive native audio, so this steers
// HOW it uses that - pacing, warmth, brevity, and the hard safety lines. Kept
// as a named constant so the voice persona is reviewable in one place rather
// than buried inline in the socket handler.
//
// Safety is deliberately explicit and non-negotiable here, matching the rest
// of this app: Nova is a coach, not a clinician, and in a real crisis the
// only right move is to hand off to real human help, not to counsel.
const NOVA_LIVE_VOICE_PERSONA = `You are Nova, a warm, human-sounding burnout-recovery coach at Blaze Break. You are having a live, spoken conversation - not writing a message.

How you sound:
- Speak like a real person who genuinely cares, not a script. Warm, grounded, unhurried.
- Keep turns SHORT - usually one or two sentences. This is a conversation; leave room for the person to talk. Never monologue.
- Use natural spoken language and light, genuine affirmations ("mm", "that makes sense", "yeah") - but sparingly, the way a good listener does, not as filler.
- Vary your rhythm. Slow down for something hard. It's fine to pause.
- Never read lists, headings, markdown, or URLs aloud. If you'd normally format something, just say it plainly.
- Ask one gentle, open question at a time rather than stacking questions.

How you coach:
- Listen first. Reflect back what you heard before offering anything.
- Favour one small, doable next step over a plan. Recovery is built from tiny, real actions.
- Draw on what you know about this person (their burnout fingerprint, recent history, and your memory of them) when it's given to you, but don't recite it at them.
- You are a coach and a steadying presence, not a therapist or doctor. Don't diagnose, and don't claim to treat anything.

Safety - this overrides everything above:
- If the person expresses thoughts of suicide, self-harm, harming someone else, or being in immediate danger, gently and directly encourage them to contact real human help right now - emergency services, or a crisis line like Samaritans on 116 123 in the UK and Ireland, or 988 in the US and Canada. Stay warm, take it seriously, and don't try to counsel them through a crisis yourself.
- Never fabricate clinical facts or promise outcomes you can't know.`;

// Vertex AI Initialization (same Gemini models, different access path)
// Reuses the GCP project this app already runs on via Firebase
// (firebaseConfigProject) rather than requiring a separate project to be
// created - every Firebase project is a GCP project underneath. No API
// key needed here: Vertex AI authenticates via Application Default
// Credentials (the standard google-auth-library flow), which the SDK
// picks up automatically when vertexai is true and no apiKey is passed.
// This "just works" if the server is deployed on Google Cloud
// infrastructure with the right IAM role on its runtime service account;
// if it's deployed elsewhere, it needs GOOGLE_APPLICATION_CREDENTIALS
// pointing at a service account key - something I can't verify from this
// sandbox, so this path fails at call time with a caught, clear error
// rather than assuming it works.
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "europe-west2"; // London
let aiVertex: GoogleGenAI | null = null;
if (firebaseConfigProject) {
  try {
    aiVertex = new GoogleGenAI({
      vertexai: true,
      project: firebaseConfigProject,
      location: VERTEX_LOCATION,
    });
  } catch (e) {
    console.warn("Note: Vertex AI client failed to initialize. Nova chat will continue running on the Gemini Developer API unless NOVA_CHAT_PROVIDER=vertex is unset.", e);
  }
} else {
  console.warn("Note: firebaseConfigProject is not set, so the Vertex AI client was not initialized. Set NOVA_CHAT_PROVIDER=vertex only once this resolves.");
}

// Anthropic (Claude) Initialization
// This provider is optional and feature-flagged (NOVA_CHAT_PROVIDER env
// var) - the app must keep working on Gemini alone if this key is never
// set, since Gemini is the existing, proven path every real user is
// currently on. See callClaudeNovaChat for where this is actually used.
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
if (!anthropicApiKey) {
  console.warn("Note: ANTHROPIC_API_KEY is not set. Nova chat will continue running on Gemini; set NOVA_CHAT_PROVIDER=claude and this key together to enable Claude for Nova chat.");
}
const anthropic = anthropicApiKey ? new Anthropic({ apiKey: anthropicApiKey }) : null;

// OpenAI Initialization
// Nothing in this codebase calls this client yet - it's plumbing only,
// added ahead of a specific feature (originally planned as DeepSeek's
// role - cheap bulk summarization - reassigned to OpenAI given DeepSeek's
// unresolved China data-transfer problem under UK GDPR). Deliberately not
// building the actual summarization feature until a real consumer for it
// exists in the app, matching the same reasoning that kept DeepSeek and
// Perplexity out of the multi-LLM routing work: integrating a provider
// with nothing to call it is the same premature-architecture mistake
// regardless of which provider it is.
const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  console.warn("Note: OPENAI_API_KEY is not set. No feature currently depends on this - it's unused until a real consumer is built.");
}
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const pushConfigured = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (pushConfigured) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@blazebreak.co",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
} else {
  console.warn("[Push] VAPID keys not configured — push notifications are disabled until they are.");
}

// API Routes
const NOVA_SYSTEM_PROMPT = `
You are Nova, an AI Burnout Recovery Coach for high achievers, grounded in the "Blaze Break" methodology.
Your central mantra is: "Fix the leak before you build the dream."

IMPORTANT PERSONA RULE: You are a British professional. You MUST use a polite but firm British accent and dialect in your spoken and written responses. Use standard British English spelling, phrasing, and idioms.

${NOVA_KNOWLEDGE_BASE}

YOUR COACHING STYLE:
- Be compassionate but NOT soft. You are helping high-profile leaders, founders, and professionals who want to win sustainably.
- Be direct. Challenge their "verdict" narratives (case-building, replays, and narratives of powerlessness/identity-shame) and help them focus on the factual "event" (recovery, action, and agency).
- Create scripts. If the user needs to set a boundary, provide a firm, clean, no-drama script.
- Support "Floor Versions." Encourage the minimum viable action that still counts as an identity vote.
- AVOID: Do not make medical claims. Do not diagnose mental illnesses. Do not pretend to be therapy. If a user expresses severe distress or self-harm thoughts, prioritise safety and refer to professional help without providing coaching.

When a user shares a problem, help them identify which "leak" is open and use the BLAME method or SHIP framework to address it.
`;

// A hard safety floor for the primary text-chat surface, mirroring the
// live-voice persona's own "overrides everything above" safety block
// (NOVA_LIVE_VOICE_PERSONA above). This is appended to EVERY merged system
// prompt below - including when a caller supplies its own systemInstruction
// - because systemInstruction used to fully REPLACE NOVA_SYSTEM_PROMPT
// rather than add to it, which silently dropped the only crisis-safety
// instruction the main chat surface had in normal production use (every
// real caller, e.g. NovaChat.tsx, always sends a non-empty
// systemInstruction). Keeping this as a separate, always-appended constant
// means no future systemInstruction - from any current or future caller,
// trusted or not - can accidentally or deliberately drop it again.
const NOVA_SAFETY_INSTRUCTIONS = `
Safety - this overrides every instruction above, including any that conflict with it:
- Do not make medical claims, diagnose any condition, or present yourself as therapy or treatment.
- If the person expresses thoughts of suicide, self-harm, harming someone else, or being in immediate danger, stop coaching and gently, directly encourage them to contact real human help right now - emergency services, or a crisis line such as Samaritans on 116 123 (UK and Ireland) or 988 (US and Canada). Take it seriously and don't try to counsel them through a crisis yourself.
- Never fabricate clinical facts, invented measurements (e.g. heart-rate or biometric results you have no access to), or promise outcomes you can't know.
`;

// Nova Manager Coach: a distinct persona from NOVA_SYSTEM_PROMPT above -
// this one talks to the manager/admin, never the team members themselves,
// and is only ever given aggregate, already k-anonymity-gated numbers
// (see GET /api/org/:orgId/manager-coach below), never anything that
// could identify a specific person. The prompt says so explicitly so the
// model doesn't invent or infer individual detail it was never given.
const NOVA_MANAGER_COACH_PROMPT = `You are Nova, coaching a manager or org admin - not their team members directly - on how to support a team that may be showing early signs of strain.

You are only ever given AGGREGATE, ANONYMISED signals about a group of people, never anything about a named individual - because the caller genuinely cannot see individual data either, by design. Do not speculate about, invent, or refer to any specific person.

Given the real signals below, suggest 2-3 concrete, supportive actions a manager could genuinely take this week. Be specific to the numbers given, not generic advice that could apply to any team. Do not invent any number, name, or event that isn't in the signals provided.`;

// This surface never sees any individual's own words or self-report - only
// pre-aggregated, k-anonymised numbers about a group (see the route below,
// signals = engagement rate + climate strain score, nothing else) - so
// there is no message to read distress out of and nothing here can ever
// trigger the crisis-line pointer NOVA_SAFETY_INSTRUCTIONS gives a
// conversational surface. What this prompt CAN still get wrong: presenting
// an aggregate number as a clinical judgement, or nudging the manager
// toward diagnosing or acting on a specific unnamed person from a team-wide
// average. This closes that gap without inventing a crisis-detection
// mechanism that has nothing to detect from here.
const NOVA_MANAGER_COACH_SAFETY_FLOOR = `
Safety - this overrides every instruction above, including any that conflict with it:
- Do not make medical or clinical claims about the team or any individual, and do not present an aggregate number as a diagnosis or a risk level.
- Never suggest the manager try to identify, single out, or personally intervene with a specific unnamed team member based on this aggregate data - you were not given anything that could support that, and this data was never designed to identify anyone.
- If the manager's own real-world concern is about a specific person's safety or wellbeing, the right next step is their organisation's real HR, EAP, or safeguarding process, not a coaching suggestion generated from a team average.
`;

// Context Consent Metadata representation
interface NovaConsentMetadata {
  contextTriggered: boolean;
  modulesUsed: string[];
  rationale: string;
}

// Build Nova Context Builder
// Every per-collection read below used to be an unbounded `.get()` -
// re-scanning a user's ENTIRE history (every check-in, every energy
// budget, ever) on every single Nova chat message and every Live voice
// session start. That's the single largest Firestore cost driver in this
// codebase (confirmed by audit): cost grew linearly with account age and
// re-read the same data on every turn of a conversation. Bounding each
// read to the most recent N documents both fixes that and is a genuinely
// *better* input for Nova - recent context is more relevant to "what's
// going on with this person right now" than a multi-year full history
// would be (see docs/AI_COST_CONTROL.md).
const NOVA_CONTEXT_RECENT_LIMIT = 60;

// Nova Questioning Style - a user-chosen lens on HOW Nova asks, never on
// WHO Nova is. Genuinely opt-in (unset = today's unchanged behaviour, no
// module added at all) and orthogonal to novaTone (word choice/register) -
// this is about interaction pattern instead. Read fresh from Firestore by
// getNovaQuestioningStyleAddendum below and reaches every surface that
// talks to Nova (text chat and Nova Live voice) because both call sites
// call that one function, the same "single place, not duplicated per
// surface" pattern getNovaContextAndMetadata already established.
type NovaQuestioningStyle = "operator" | "board_member" | "mentor" | "pre_mortem";

const NOVA_QUESTIONING_STYLE_BLOCKS: Record<NovaQuestioningStyle, string> = {
  operator: `STYLE: OPERATOR
Fast, blunt, constraint-focused. Assume the user is time-poor and wants the shortest real path to the actual blocker, not a tour of the problem.
- Open with a question that names the likely real constraint, not a generic "how are you feeling" opener.
- If the user gives a vague or diplomatic answer, name that it was vague and ask again more specifically. Do not accept a non-answer twice.
- Favour questions with a forced choice over open-ended ones where useful: "Is this a capacity problem or a boundary problem?" beats "tell me more."`,
  board_member: `STYLE: BOARD MEMBER
Strategic, second-order, outcome-focused. Ask as if evaluating a decision someone else will have to live with the consequences of.
- Ask about cost and consequence before asking about feelings: what does the status quo cost them, who else is absorbing the cost, what does "still true in six months" look like.
- Push toward a decision or a named trade-off, not just insight.`,
  mentor: `STYLE: MENTOR
Warmer, still direct, asks "why" before "what." Suited to someone who needs to be met before being challenged.
- Open by reflecting back what they said in one honest sentence before asking the next question - earn the challenge, don't skip to it.
- Still refuse to validate a self-limiting or powerlessness narrative; the warmth is in tone, not in agreement.`,
  pre_mortem: `STYLE: PRE-MORTEM
Stress-tests a plan or decision before it happens.
- Ask what would have to be true for the current plan to fail.
- Ask what the user is currently avoiding looking at directly.
- Do not soften this style with reassurance - its entire value is discomfort surfaced early, safely, before a real failure would.`,
};

function buildNovaQuestioningStyleModule(style: unknown): string {
  if (typeof style !== "string" || !(style in NOVA_QUESTIONING_STYLE_BLOCKS)) return "";
  const block = NOVA_QUESTIONING_STYLE_BLOCKS[style as NovaQuestioningStyle];
  return `
--- NOVA QUESTIONING STYLE (CHOSEN BY THE USER) ---
This changes HOW you ask, not WHO you are - you remain Nova. The style is a lens, not a costume change.

${block}

HOW TO ASK, REGARDLESS OF STYLE (this is what makes it feel like a real conversation instead of a script):
1. One question at a time. Never stack two questions in one message.
2. Every question must be built from what the user JUST said, not from a generic bank. If they mention a specific person, deadline, or number, your next question references that specific detail - never a templated follow-up that would fit any answer.
3. If an answer is surface-level, don't move on - ask one level deeper before advancing ("that's what happened - what did you actually do in the moment?").
4. Vary sentence length and rhythm like a real person would - not every line is a question; sometimes a single flat observation lands harder than another question.
5. Never ask a question you could answer yourself from context already given this session.

BOUNDARIES THAT APPLY TO THIS STYLE, NO EXCEPTIONS:
- This style may not probe for, infer, or imply a mental-health diagnosis, risk level, or clinical judgement about the user.
- "Advanced reasoning" here means well-sequenced, adaptive questioning - not claiming clinical insight, predicting outcomes you can't know, or fabricating certainty you don't have.
- If at any point the user's answer signals real distress or crisis, drop this style entirely and follow the safety instructions that govern this conversation - no style is worth continuing past that.
--------------------------------------------------------------`;
}

// Reads the user's chosen style fresh from Firestore rather than trusting
// a client-supplied value, same reasoning as every other prompt-shaping
// signal in this file (getNovaContextAndMetadata's consent reads, etc.) -
// keeps it out of the client's control and consistent across every device
// someone is signed into. Deliberately its own function, not folded into
// getNovaContextAndMetadata: that one is gated behind the user having a
// nova_permissions doc at all (no doc = no context, by design), but a
// self-chosen interaction style isn't recovery data being shared under
// consent - it should still apply even for an account with no permissions
// doc yet. Shared by both getNovaQuestioningStyleAddendum (conversational
// surfaces) and getNovaStyleToneAddendum (one-shot statement surfaces,
// below) - same stored preference, two different renderings of it.
async function getUserQuestioningStyle(uid: string, firestoreDb: any): Promise<unknown> {
  try {
    const statsSnap = await firestoreDb.collection("users").doc(uid).collection("user_stats").doc("core").get();
    return statsSnap.exists ? statsSnap.data()?.profile?.questioningStyle : undefined;
  } catch {
    return undefined;
  }
}

async function getNovaQuestioningStyleAddendum(uid: string, firestoreDb: any): Promise<string> {
  const style = await getUserQuestioningStyle(uid, firestoreDb);
  return buildNovaQuestioningStyleModule(style);
}

// Tone variant of the same four styles, for the one-shot statement
// surfaces (diagnose narrative, one-less-thing triage) where Nova never
// asks the user a question at all - NOVA_QUESTIONING_STYLE_BLOCKS above is
// written entirely around questioning cadence ("open with a question...",
// "ask about cost before feelings...") and has nothing to attach to on a
// surface that produces one paragraph or one fixed-shape decision. This
// reinterprets each style as a register/framing instruction for a single
// piece of writing instead. Same four-way enum, same user choice - just a
// different lens for a differently-shaped surface.
const NOVA_STYLE_TONE_BLOCKS: Record<NovaQuestioningStyle, string> = {
  operator: `TONE: OPERATOR
Blunt and constraint-focused. Name the real blocker in the first sentence, no throat-clearing. Prefer a forced, concrete framing ("this is a boundary problem, not a capacity one") over a hedged, exploratory one.`,
  board_member: `TONE: BOARD MEMBER
Strategic and consequence-focused. Frame the observation in terms of cost, trade-off, and what stays true in six months if nothing changes - not just how it currently feels.`,
  mentor: `TONE: MENTOR
Warmer, still direct. Reflect back what's actually happening in one honest sentence before delivering the harder part. The warmth is in the tone, never in a softened conclusion.`,
  pre_mortem: `TONE: PRE-MORTEM
Stress-test framing. Name what would have to be true for the current approach to fail, without layering reassurance on top of it.`,
};

function buildNovaStyleToneModule(style: unknown): string {
  if (typeof style !== "string" || !(style in NOVA_STYLE_TONE_BLOCKS)) return "";
  const block = NOVA_STYLE_TONE_BLOCKS[style as NovaQuestioningStyle];
  return `
--- NOVA STYLE (CHOSEN BY THE USER) ---
This changes the register of what you write, not who you are - you remain Nova, and the output format already specified above still applies exactly as given.

${block}

BOUNDARIES THAT APPLY TO THIS STYLE, NO EXCEPTIONS:
- This may not probe for, infer, or imply a mental-health diagnosis, risk level, or clinical judgement about the user.
- Never claim clinical insight, predict outcomes you can't know, or fabricate certainty you don't have.
--------------------------------------------------------------`;
}

async function getNovaStyleToneAddendum(uid: string, firestoreDb: any): Promise<string> {
  const style = await getUserQuestioningStyle(uid, firestoreDb);
  return buildNovaStyleToneModule(style);
}

// AUDIT (per-surface decision, recorded explicitly rather than by
// omission): every place in this file that builds a "You are Nova" prompt
// was checked against whether Nova is asking the user something directly,
// in their own conversation.
//
// APPLY (questioning-style, via getNovaQuestioningStyleAddendum - shapes
// HOW Nova asks): /api/nova/chat and the Nova Live voice route - the only
// two surfaces holding a live, turn-by-turn conversation.
//
// APPLY (style tone, via getNovaStyleToneAddendum - shapes the register of
// a single piece of writing, since neither of these ever asks the user a
// question to apply a "questioning" cadence to):
//   - the diagnose-narrative generator (~line 2358): a 3-4 sentence
//     coaching analysis of the user's own diagnostic result, addressed
//     directly to them.
//   - /api/nova/one-less-thing (~line 2668): a real coaching decision
//     (which of 4 actions to take on a task they named) put directly to
//     the user, plus advice and a ready-to-send template.
//
// DO NOT APPLY (neither module - no question or personal decision is put
// to the user, so there's nothing for either style axis to shape):
//   - /api/nova/voice-journal (~line 2572): transcribes and extracts
//     themes from the user's own voice memo - this is Nova analysing what
//     they said, not asking them anything.
//   - /api/nova/resentment-analysis (~line 9439): pattern extraction from
//     the user's raw venting text - same reasoning as voice-journal.
//   - /api/signals/executive-report (~line 9534): written FOR THE USER'S
//     MANAGER, not for the user - applying the employee's personal style
//     preference to a document a manager reads doesn't make sense, and no
//     question is asked to anyone in it. Confirmed manager-facing framing
//     still holds by reading the route directly, not just its name.
//   - NOVA_MANAGER_COACH_PROMPT (~line 7072): one-shot manager coaching
//     from k-anonymised aggregate signals, never an individual's content -
//     same reasoning as executive-report, plus there's no single user's
//     style preference that would even apply to an aggregate.
// PRE-EXISTING FINDING, NOW MOSTLY REMEDIATED: none of the six one-shot
// generators above originally appended NOVA_SAFETY_INSTRUCTIONS - each
// calls ai.models.generateContent with the persona text folded directly
// into `contents`, with no `systemInstruction` and no safety floor at all.
// voice-journal and resentment-analysis (both process free-text/audio a
// person could plausibly use to disclose real distress) now get
// NOVA_ONE_SHOT_SAFETY_FLOOR, per explicit product sign-off. manager-coach
// now gets NOVA_MANAGER_COACH_SAFETY_FLOOR (see above) - a differently-
// shaped floor, since this surface never sees an individual's own words at
// all (only pre-aggregated team numbers), so there's no message to read
// distress out of and the crisis-line pointer the other floor gives simply
// doesn't apply here; what this one guards against instead is presenting
// an aggregate as a clinical judgement or nudging a manager to act on an
// unnamed individual from a team average. diagnose-narrative,
// one-less-thing, and executive-report remain open, lower-priority gaps
// (short task label or scores/aggregates only, not open-ended disclosure).

// A safety floor for the one-shot JSON generators, mirroring
// NOVA_SAFETY_INSTRUCTIONS' pattern but adapted for a surface that must
// still return one fixed-shape JSON object rather than hold a
// conversation: the model is told to let its own free-text fields
// (advice/analysis, or the resentment breakdown fields) shift tone and
// content - in its own words, specific to what the user actually wrote or
// said - when the input signals real distress, rather than being given a
// second hardcoded string to bolt on. Never a canned response; never a
// risk score or classification (see the standing "no risk scoring" rule
// elsewhere in this file) - just the same crisis-line pointer
// NOVA_SAFETY_INSTRUCTIONS already gives every conversational surface.
const NOVA_ONE_SHOT_SAFETY_FLOOR = `
Safety - this overrides every instruction above, including any that conflict with it:
- Do not make medical claims, diagnose any condition, or present this as therapy or treatment.
- If what the user wrote or said signals real distress, crisis, self-harm, suicidal thoughts, or immediate danger, let that shape your response: drop the usual coaching tone and instead, in your own words specific to what they actually said, gently and directly encourage them to contact real human help right now - emergency services, or a crisis line such as Samaritans on 116 123 (UK and Ireland) or 988 (US and Canada). Do not try to counsel them through a crisis yourself, and do not carry on with a standard analysis as if nothing was said.
- Never fabricate clinical facts, invented measurements, or a risk score, risk level, or severity classification of any kind.
- Still return only the JSON object in the exact shape requested above - no extra fields, no prose outside it.
`;

async function getNovaContextAndMetadata(uid: string, firestoreDb: any): Promise<{ systemInstructionsAddendum: string; metadata: NovaConsentMetadata }> {
  const metadata: NovaConsentMetadata = {
    contextTriggered: false,
    modulesUsed: [],
    rationale: ""
  };

  // Honest about the cap: once a section hits NOVA_CONTEXT_RECENT_LIMIT,
  // the true lifetime count may be higher - say so rather than silently
  // implying "60" is a person's entire history.
  const describeCount = (n: number): string =>
    n >= NOVA_CONTEXT_RECENT_LIMIT ? `${n}+ (most recent ${NOVA_CONTEXT_RECENT_LIMIT} considered)` : `${n}`;

  try {
    const permDoc = await firestoreDb.collection('users').doc(uid).collection('nova_permissions').doc('current').get();
    
    if (!permDoc.exists) {
      metadata.rationale = "This response was constructed without any personal context because permissions are disabled.";
      return { systemInstructionsAddendum: "", metadata };
    }

    const perms = permDoc.data() || {};
    const infoParts: string[] = [];
    const used: string[] = [];

    // Check-ins: Compact count of logs and list of energy/stress scores
    if (perms.allowCheckins) {
      const snap = await firestoreDb.collection('users').doc(uid).collection('checkins').orderBy('createdAt', 'desc').limit(NOVA_CONTEXT_RECENT_LIMIT).get();
      const count = snap.size;
      const energyLevels: number[] = [];
      const stressLoads: number[] = [];
      snap.docs.forEach((doc: any) => {
        const data = doc.data();
        if (typeof data.energyLevel === 'number') energyLevels.push(data.energyLevel);
        if (typeof data.stressLoad === 'number') stressLoads.push(data.stressLoad);
      });
      infoParts.push(`Check-ins Summary:
- Number of logged check-ins: ${describeCount(count)}
- Self-reported Energy Levels over time: ${JSON.stringify(energyLevels)}
- Self-reported Stress Loads over time: ${JSON.stringify(stressLoads)}`);
      used.push("checkins");
    }

    // Energy Budgets: Log count and overall average capacity remaining
    if (perms.allowEnergyBudgets) {
      const snap = await firestoreDb.collection('users').doc(uid).collection('energy_budgets').orderBy('createdAt', 'desc').limit(NOVA_CONTEXT_RECENT_LIMIT).get();
      const count = snap.size;
      const remainingCapacities: number[] = [];
      snap.docs.forEach((doc: any) => {
        const data = doc.data();
        if (typeof data.remainingCapacity === 'number') remainingCapacities.push(data.remainingCapacity);
      });
      const avgRemaining = remainingCapacities.length > 0
        ? Math.round(remainingCapacities.reduce((a, b) => a + b, 0) / remainingCapacities.length)
        : null;
      infoParts.push(`Energy Budgets Summary:
- Number of logged budgets: ${describeCount(count)}
- Average remaining energy capacity across budgets: ${avgRemaining !== null ? avgRemaining + "%" : "N/A"}`);
      used.push("energy_budgets");
    }

    // Mood Pulses: Compact counts of labels and intensity list
    if (perms.allowMoodPulses) {
      const snap = await firestoreDb.collection('users').doc(uid).collection('mood_pulses').orderBy('createdAt', 'desc').limit(NOVA_CONTEXT_RECENT_LIMIT).get();
      const count = snap.size;
      const labelCounts: Record<string, number> = {};
      const intensities: number[] = [];
      snap.docs.forEach((doc: any) => {
        const data = doc.data();
        if (data.moodLabel) {
          labelCounts[data.moodLabel] = (labelCounts[data.moodLabel] || 0) + 1;
        }
        if (typeof data.intensity === 'number') intensities.push(data.intensity);
      });
      infoParts.push(`Mood Pulses Summary:
- Number of logged mood pulses: ${describeCount(count)}
- Self-reported Mood label occurrences: ${JSON.stringify(labelCounts)}
- Self-reported Mood Intensities over time: ${JSON.stringify(intensities)}`);
      used.push("mood_pulses");
    }

    // Body Checkins: Frequencies of somatic tension categories
    if (perms.allowBodyCheckins) {
      const snap = await firestoreDb.collection('users').doc(uid).collection('body_checkins').orderBy('createdAt', 'desc').limit(NOVA_CONTEXT_RECENT_LIMIT).get();
      const count = snap.size;
      const signalCounts: Record<string, number> = {};
      snap.docs.forEach((doc: any) => {
        const data = doc.data();
        const signals = data.signals || [];
        if (Array.isArray(signals)) {
          signals.forEach((s: string) => {
            signalCounts[s] = (signalCounts[s] || 0) + 1;
          });
        }
      });
      infoParts.push(`Body Check-ins Summary:
- Number of logged body check-ins: ${describeCount(count)}
- Logged Body Tension and Symptom Category counts: ${JSON.stringify(signalCounts)}`);
      used.push("body_checkins");
    }

    // Wins: Compact counts by category
    if (perms.allowWins) {
      const snap = await firestoreDb.collection('users').doc(uid).collection('wins').orderBy('createdAt', 'desc').limit(NOVA_CONTEXT_RECENT_LIMIT).get();
      const count = snap.size;
      const cateCounts: Record<string, number> = {};
      snap.docs.forEach((doc: any) => {
        const data = doc.data();
        if (data.category) {
          cateCounts[data.category] = (cateCounts[data.category] || 0) + 1;
        }
      });
      infoParts.push(`Wins Summary:
- Number of logged wins: ${describeCount(count)}
- Categories of wins logged: ${JSON.stringify(cateCounts)}`);
      used.push("wins");
    }

    // Weekly reviews: Review counts only
    if (perms.allowWeeklyReviews) {
      const snap = await firestoreDb.collection('users').doc(uid).collection('weekly_reviews').orderBy('createdAt', 'desc').limit(NOVA_CONTEXT_RECENT_LIMIT).get();
      infoParts.push(`Weekly Reviews Summary:
- Total number of completed weekly reviews: ${describeCount(snap.size)}`);
      used.push("weekly_reviews");
    }

    // Boundary Scripts: Scenario types and status tracking
    if (perms.allowBoundaryScripts) {
      const snap = await firestoreDb.collection('users').doc(uid).collection('boundary_scripts').orderBy('createdAt', 'desc').limit(NOVA_CONTEXT_RECENT_LIMIT).get();
      const count = snap.size;
      const scenarioCounts: Record<string, number> = {};
      const statusCounts: Record<string, number> = {};
      snap.docs.forEach((doc: any) => {
        const data = doc.data();
        if (data.scenarioType) {
          scenarioCounts[data.scenarioType] = (scenarioCounts[data.scenarioType] || 0) + 1;
        }
        if (data.status) {
          statusCounts[data.status] = (statusCounts[data.status] || 0) + 1;
        }
      });
      infoParts.push(`Boundary Scripts Summary:
- Total boundary scripts configured: ${describeCount(count)}
- Frequency of scenario types targeted: ${JSON.stringify(scenarioCounts)}
- Boundary script status counts: ${JSON.stringify(statusCounts)}`);
      used.push("boundary_scripts");
    }

    // Goals: Completed or active count tracking
    if (perms.allowGoals) {
      const snap = await firestoreDb.collection('users').doc(uid).collection('goals').orderBy('createdAt', 'desc').limit(NOVA_CONTEXT_RECENT_LIMIT).get();
      const count = snap.size;
      const statusCounts: Record<string, number> = {};
      const categoryCounts: Record<string, number> = {};
      snap.docs.forEach((doc: any) => {
        const data = doc.data();
        if (data.status) {
          statusCounts[data.status] = (statusCounts[data.status] || 0) + 1;
        }
        if (data.category) {
          categoryCounts[data.category] = (categoryCounts[data.category] || 0) + 1;
        }
      });
      infoParts.push(`Goals Summary:
- Total goals tracking: ${describeCount(count)}
- Goal status distribution: ${JSON.stringify(statusCounts)}
- Goal category distribution: ${JSON.stringify(categoryCounts)}`);
      used.push("goals");
    }

    // Derived Recovery Debt
    if (perms.allowRecoveryDebt) {
      const docSnap = await firestoreDb.collection('users').doc(uid).collection('derived').doc('recovery_debt').get();
      if (docSnap.exists) {
        const data = docSnap.data();
        infoParts.push(`Derived Recovery Debt:
- Status: ${data?.status || "N/A"}
- Value: ${data?.value !== undefined ? data.value : "N/A"}
- Direction: ${data?.direction || "N/A"}
- Confidence Level: ${data?.confidenceLevel || "N/A"}
- Indicator Explanation: ${data?.explanation || "No explanation provided."}`);
        used.push("recovery_debt");
      }
    }

    // Derived Recovery Velocity
    if (perms.allowRecoveryVelocity) {
      const docSnap = await firestoreDb.collection('users').doc(uid).collection('derived').doc('recovery_velocity').get();
      if (docSnap.exists) {
        const data = docSnap.data();
        infoParts.push(`Derived Recovery Velocity:
- Status: ${data?.status || "N/A"}
- Value: ${data?.value !== undefined ? data.value : "N/A"}
- Direction: ${data?.direction || "N/A"}
- Confidence Level: ${data?.confidenceLevel || "N/A"}
- Indicator Explanation: ${data?.explanation || "No explanation provided."}`);
        used.push("recovery_velocity");
      }
    }

    // Derived Energy Trend
    if (perms.allowEnergyTrend) {
      const docSnap = await firestoreDb.collection('users').doc(uid).collection('derived').doc('energy_trend').get();
      if (docSnap.exists) {
        const data = docSnap.data();
        infoParts.push(`Derived Energy Trend:
- Status: ${data?.status || "N/A"}
- Value: ${data?.value !== undefined ? data.value : "N/A"}
- Direction: ${data?.direction || "N/A"}
- Confidence Level: ${data?.confidenceLevel || "N/A"}
- Indicator Explanation: ${data?.explanation || "No explanation provided."}`);
        used.push("energy_trend");
      }
    }

    // Derived Mood Trend
    if (perms.allowMoodTrend) {
      const docSnap = await firestoreDb.collection('users').doc(uid).collection('derived').doc('mood_trend').get();
      if (docSnap.exists) {
        const data = docSnap.data();
        infoParts.push(`Derived Mood Trend:
- Status: ${data?.status || "N/A"}
- Value: ${data?.value !== undefined ? data.value : "N/A"}
- Direction: ${data?.direction || "N/A"}
- Confidence Level: ${data?.confidenceLevel || "N/A"}
- Indicator Explanation: ${data?.explanation || "No explanation provided."}`);
        used.push("mood_trend");
      }
    }

    // Broader "Nova sees the whole app" pass - the categories below fill in
    // modules the context builder never read from at all, so Nova was
    // context-blind to them even with every permission above already
    // granted. Same compact-aggregate-only rule as everything above: counts,
    // distributions, numeric summaries - never raw free text (trigger notes,
    // reflections, journal/venting content stay excluded, same as checkins'
    // note field and boundary_scripts' content already are). These flags are
    // newly added to nova_permissions/current, so an existing user's saved
    // doc may not have them set yet - `!== false` (not a strict truthy
    // check) keeps this genuinely default-on for them too, not just for
    // brand-new accounts, matching allowCalendarSignals' existing precedent
    // (src/lib/nova-brain.ts's isCalendarSignalConsentGranted).

    // Burnout Fingerprint / archetype - arguably the single most
    // foundational piece of "who is this person" that was missing.
    if (perms.allowFingerprint !== false) {
      const fpSnap = await firestoreDb.collection('users').doc(uid).collection('recovery').doc('fingerprint').get();
      if (fpSnap.exists) {
        const data = fpSnap.data();
        infoParts.push(`Burnout Fingerprint:
- Archetype: ${data?.archetype || "N/A"}`);
        used.push("fingerprint");
      }
    }

    // Recovery Plan progress - completion only, never the submitted journal text.
    if (perms.allowRecoveryPlanProgress !== false) {
      const planSnap = await firestoreDb.collection('users').doc(uid).collection('recovery_plan_progress').doc('state').get();
      if (planSnap.exists) {
        const data = planSnap.data()!;
        const allIds: string[] = Array.isArray(data.allActionIds) ? data.allActionIds : [];
        const completedIds: string[] = Array.isArray(data.completedIds) ? data.completedIds : [];
        if (allIds.length > 0) {
          infoParts.push(`Recovery Plan Progress:
- Completed: ${completedIds.length} of ${allIds.length} actions`);
          used.push("recovery_plan_progress");
        }
      }
    }

    // Post-check-in action plan progress, per burnout profile - completion
    // counts only, never the written reflections themselves.
    if (perms.allowDiagnosisProgress !== false) {
      const diagSnap = await firestoreDb.collection('users').doc(uid).collection('diagnosis_progress').get();
      const diagLines: string[] = [];
      diagSnap.docs.forEach((d: any) => {
        const data = d.data();
        const allActionIds: string[] = Array.isArray(data.allActionIds) ? data.allActionIds : [];
        const allBoundaryIds: string[] = Array.isArray(data.allBoundaryIds) ? data.allBoundaryIds : [];
        const completedActions: string[] = Array.isArray(data.completedActions) ? data.completedActions : [];
        const committedBoundaries: string[] = Array.isArray(data.committedBoundaries) ? data.committedBoundaries : [];
        if (allActionIds.length + allBoundaryIds.length > 0) {
          diagLines.push(`- ${d.id}: ${completedActions.length} of ${allActionIds.length} actions completed, ${committedBoundaries.length} of ${allBoundaryIds.length} boundary scripts committed`);
        }
      });
      if (diagLines.length > 0) {
        infoParts.push(`Action Plan Progress:\n${diagLines.join("\n")}`);
        used.push("diagnosis_progress");
      }
    }

    // Energy Commitments - real current active load, same figure the
    // recommendation engine already computes for the "your active load
    // looks heavy" nudge, now visible to Nova in conversation too.
    if (perms.allowEnergyCommitments !== false) {
      const commitSnap = await firestoreDb.collection('users').doc(uid).collection('energy_commitments').where('status', '==', 'active').get();
      if (!commitSnap.empty) {
        const totalDrain = commitSnap.docs.reduce((sum: number, d: any) => sum + (d.data().energyDrain || 0), 0);
        infoParts.push(`Energy Commitments Summary:
- Active commitments: ${commitSnap.size}
- Total active energy drain: ${totalDrain} units`);
        used.push("energy_commitments");
      }
    }

    // Stress Triggers - frequency and severity only, never the free-text note.
    if (perms.allowStressTriggers !== false) {
      const triggerSnap = await firestoreDb.collection('users').doc(uid).collection('stress_triggers').orderBy('createdAt', 'desc').limit(NOVA_CONTEXT_RECENT_LIMIT).get();
      if (!triggerSnap.empty) {
        const severities = triggerSnap.docs.map((d: any) => d.data().severity).filter((v: any) => typeof v === 'number');
        const avgSeverity = severities.length > 0 ? Math.round((severities.reduce((a: number, b: number) => a + b, 0) / severities.length) * 10) / 10 : null;
        infoParts.push(`Stress Triggers Summary:
- Number of logged triggers: ${describeCount(triggerSnap.size)}
- Average severity: ${avgSeverity !== null ? avgSeverity + "/10" : "N/A"}`);
        used.push("stress_triggers");
      }
    }

    // Weekly Habit Cycles
    if (perms.allowHabitCycles !== false) {
      const habitSnap = await firestoreDb.collection('users').doc(uid).collection('weekly_habit_cycles').orderBy('startedAt', 'desc').limit(NOVA_CONTEXT_RECENT_LIMIT).get();
      if (!habitSnap.empty) {
        const totalGoals = habitSnap.docs.reduce((sum: number, d: any) => sum + (Array.isArray(d.data().goals) ? d.data().goals.length : 0), 0);
        infoParts.push(`Weekly Habit Cycles Summary:
- Weeks tracked: ${describeCount(habitSnap.size)}
- Total habit goals set: ${totalGoals}`);
        used.push("habit_cycles");
      }
    }

    // Recovery Fuel Engine's daily physiological check-in
    if (perms.allowFuelLogs !== false) {
      const fuelSnap = await firestoreDb.collection('users').doc(uid).collection('recovery_fuel_logs').orderBy('createdAt', 'desc').limit(NOVA_CONTEXT_RECENT_LIMIT).get();
      if (!fuelSnap.empty) {
        const count = fuelSnap.size;
        const skippedBreakfast = fuelSnap.docs.filter((d: any) => d.data().skippedBreakfast === true).length;
        const hydrationValues = fuelSnap.docs.map((d: any) => d.data().hydrationGlasses).filter((v: any) => typeof v === 'number');
        const avgHydration = hydrationValues.length > 0 ? Math.round(hydrationValues.reduce((a: number, b: number) => a + b, 0) / hydrationValues.length) : null;
        infoParts.push(`Recovery Fuel Summary:
- Days logged: ${describeCount(count)}
- Skipped breakfast: ${skippedBreakfast} of ${count} logged days
- Average hydration: ${avgHydration !== null ? avgHydration + " glasses/day" : "N/A"}`);
        used.push("fuel_logs");
      }
    }

    // Focus Zone sessions
    if (perms.allowFocusSessions !== false) {
      const focusSnap = await firestoreDb.collection('users').doc(uid).collection('focus_sessions').orderBy('createdAt', 'desc').limit(NOVA_CONTEXT_RECENT_LIMIT).get();
      if (!focusSnap.empty) {
        const completed = focusSnap.docs.filter((d: any) => d.data().completed === true).length;
        const totalMinutes = focusSnap.docs.reduce((sum: number, d: any) => sum + (d.data().durationMinutes || 0), 0);
        infoParts.push(`Focus Sessions Summary:
- Sessions logged: ${describeCount(focusSnap.size)}
- Completed: ${completed}
- Total focused minutes: ${totalMinutes}`);
        used.push("focus_sessions");
      }
    }

    // Nervous System Reset (somatic reset) usage
    if (perms.allowSomaticResets !== false) {
      const somaticSnap = await firestoreDb.collection('users').doc(uid).collection('somatic_reset_sessions').orderBy('createdAt', 'desc').limit(NOVA_CONTEXT_RECENT_LIMIT).get();
      if (!somaticSnap.empty) {
        const totalSeconds = somaticSnap.docs.reduce((sum: number, d: any) => sum + (d.data().durationSeconds || 0), 0);
        infoParts.push(`Nervous System Reset Summary:
- Sessions completed: ${describeCount(somaticSnap.size)}
- Total duration: ${totalSeconds} seconds`);
        used.push("somatic_resets");
      }
    }

    // Recovery Ally - whether connected, and shared-goal activity. Never
    // the ally's own name/email, which belongs to the ally, not the coaching
    // context.
    if (perms.allowRecoveryAlly !== false) {
      const allySnap = await firestoreDb.collection('users').doc(uid).collection('recovery_ally').doc('state').get();
      const goalsSnap = await firestoreDb.collection('users').doc(uid).collection('ally_shared_goals').get();
      const allyConnected = allySnap.exists && allySnap.data()?.isInvited === true;
      if (allyConnected || !goalsSnap.empty) {
        infoParts.push(`Recovery Ally Summary:
- Ally connected: ${allyConnected ? "yes" : "no"}
- Shared goals: ${goalsSnap.size}`);
        used.push("recovery_ally");
      }
    }

    // Memory Usage
    if (perms.allowNovaMemory && perms.allowNovaUseSavedMemories) {
      // Ordering/limiting at the Firestore level (rather than fetching
      // every saved memory and sorting/slicing in JS) means this scales
      // with "5", not with how many memories Nova has ever saved.
      const memRef = firestoreDb.collection('users').doc(uid).collection('nova_memories').orderBy('updatedAt', 'desc').limit(5);
      const memSnap = await memRef.get();
      const memories = memSnap.docs.map((d: any) => d.data());

      const recentMemories = memories.filter((mem: any) => mem && typeof mem.content === 'string');

      if (recentMemories.length > 0) {
        const memTextList = recentMemories.map((m: any) => `- [${m.type}] ${m.content}${m.source ? ` (Source: ${m.source})` : ''}`);
        infoParts.push(`Nova's saved memories about this user:
${memTextList.join('\n')}`);
        used.push("memory");
      }
    }

    if (used.length > 0) {
      metadata.contextTriggered = true;
      metadata.modulesUsed = used;
      metadata.rationale = perms.allowNovaMemory ? "Nova used only memories you approved along with your permitted compact recovery aggregates. Your raw recovery journal and scripts remain completely blind to Nova." : "This suggestion was generated using only your permitted compact recovery aggregates. Your raw recovery journal and scripts remain completely blind to Nova.";

      const addendum = `
--- PERMITTED RECOVERY CONTEXT PACKET (CONSENTED TO BY USER) ---
${infoParts.join("\n\n")}
--------------------------------------------------------------
RESPONSE CONSTRAINTS (MANDATORY):
1. You are Nova, a direct, analytical, British high-performance recovery coach. Speak like a top-tier professional, using standard British spelling and terminal directness.
2. Ground your observations strictly inside the numerical logs and compact summaries provided in this context packet.
3. Completely respect privacy boundaries: highlight explicitly what data you CAN see (from the permitted sections above), and remind the user of what is completely INACCESSIBLE to you (raw journal entry texts, boundary script rehearsed scripts, specific personal names/details are completely hidden inside their private vault).
4. Do NOT make clinical or medical claims. Do NOT diagnose or prescribe. Keep focus 100% on performance, energy leaks, and metric restoration.
5. If "User-approved Nova memories" are provided, incorporate these preferences or patterns gracefully into your coaching approach. Do not explicitly announce that you are using a memory. Do not blindly praise the user. Instead, reference them as established context.
6. Think metacognitively in greater depth about the user's active emotional state, cognitive load, and life circumstances. Practice deep emotional mimicry understanding: adapt, mirror, and validate their energetic frequency so that they feel deeply understood, accepted, and seen, while maintaining your firm professional boundary coaching standard.
`;
      return { systemInstructionsAddendum: addendum, metadata };
    } else {
      metadata.rationale = "Nova Memory is off. This response was constructed without any personal context because permissions are disabled.";
      return { systemInstructionsAddendum: "", metadata };
    }
  } catch (err) {
    console.warn("Context Builder failed to retrieve or transform safely.", err);
    metadata.rationale = "This response was constructed without any personal context because permissions are disabled.";
    return { systemInstructionsAddendum: "", metadata };
  }
}

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z.array(z.any()).max(50).optional().default([]), // loose type for history, but limited size
  systemInstruction: z.string().max(3000).optional()
}).strict();

// Nova tool use, phase 1: read-only tools only. Nothing here writes,
// sends a message, or triggers any side effect - every real-action
// feature in this app (BoundaryAutopilot, calendar declines) explicitly
// requires the user to confirm before anything happens, and giving the
// model direct, unconfirmed access to those same endpoints would break
// that guarantee. A tool that proposes an action for the UI to render as
// a confirmable card is a reasonable future addition; a tool that
// executes one directly is not, for now.

// Independent kill switch for tool use, separate from which provider
// handles chat. If something goes wrong with a specific tool in
// production - most importantly remember_about_user, since that's the
// one capability that writes to a permanent user record - this can be
// set to 'false' to fall back to plain conversation (no function
// calling at all) across every provider, without needing to also change
// NOVA_CHAT_PROVIDER or take Nova chat down entirely.
const NOVA_TOOLS_ENABLED = toolsAreEnabled(process.env.NOVA_TOOLS_ENABLED);
const NOVA_LIVE_VOICE_ENABLED = liveVoiceIsEnabled(process.env.NOVA_LIVE_VOICE_ENABLED);
// Configurable, not hardcoded - see docs/AI_COST_CONTROL.md. Live voice is
// the single most expensive per-minute Nova surface, so both the hard
// session ceiling and the idle cutoff are env-tunable without a redeploy.
const NOVA_LIVE_MAX_SESSION_MS = Number(process.env.NOVA_LIVE_MAX_SESSION_MS) || 15 * 60 * 1000;
const NOVA_LIVE_IDLE_TIMEOUT_MS = Number(process.env.NOVA_LIVE_IDLE_TIMEOUT_MS) || 90 * 1000;

const NOVA_TOOLS: any[] = [
  {
    name: "search_nova_memories",
    description: "Search the user's own saved Nova memories (things Nova has noted about their profile, triggers, current state, coaching rules, and preferences) by keyword. Use this when the user references something they've told Nova before that isn't already in the current context, or asks what Nova remembers about a specific topic. Respects the user's memory consent setting - if the user hasn't enabled it, this returns no results rather than bypassing that choice.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "A keyword or short phrase to search for within the user's saved memories." },
      },
      required: ["query"],
    },
  },
  {
    name: "propose_recovery_action",
    description: "Propose one specific micro-recovery protocol from the app's real catalog, with a short reason tailored to what the user has described. This does not start or complete anything - it returns a suggestion for the user interface to show the user, who decides whether to act on it. The five real durations, and what each protocol actually is: 30s (rapid physiological interrupt - stand up, unclench jaw, one deep breath, look at something 20 feet away), 2m (a quick reset - stand up, drink water, remove one thing from today's list, send a boundary message), 5m (nervous system downshift - step away from the desk, 5 rounds of box breathing, stretch, review top 3 priorities), 10m (cognitive reset - walk outside, no phone, name 5 things you see, return and focus on one action), 20m (deep somatic rest). Pick the one that actually fits how much time and capacity the user has described, not always the shortest or longest option.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        duration: { type: Type.STRING, description: "One of: 30s, 2m, 5m, 10m, 20m - must match a real catalog entry exactly." },
        reason: { type: Type.STRING, description: "A short, specific reason this duration fits the user's stated situation right now." },
      },
      required: ["duration", "reason"],
    },
  },
  {
    name: "remember_about_user",
    description: "Save something durable and specific you've noticed about this user to Nova's long-term memory, for use in future conversations. Only use this for things worth remembering weeks from now: a pattern that has come up more than once, an explicitly stated preference or boundary, a recurring trigger, or a genuinely significant single disclosure like a stated goal. Do NOT use this for a single passing mention, small talk, or anything you're inferring without the user having actually said or clearly shown it - a one-off detail is not memory material. The user can review, edit, or delete anything saved here at any time, and nothing here overrides their own explicit statements if they ever conflict. Set confidence honestly: 'high' only if the user stated this directly and clearly; 'medium' if it's a reasonable inference from what they said; 'low' if you're genuinely uncertain but think it's still worth noting for a human to review.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING, description: "One of: profile (a stable fact about who they are or their situation), trigger (something that reliably provokes a stress/overload response), state (a notable current-state observation), rule (a coaching rule or boundary they've set for how Nova should behave), preference (a stated preference about their recovery, schedule, or communication style)." },
        content: { type: Type.STRING, description: "The memory itself: concise, specific, third-person, under 300 characters. E.g. 'Prefers ending meetings 5 minutes early to transition between calls.'" },
        confidence: { type: Type.STRING, description: "One of: low, medium, high - how directly the user stated this versus how much you're inferring." },
      },
      required: ["type", "content", "confidence"],
    },
  },
  {
    name: "suggest_feature",
    description: `When the conversation makes clear a specific other part of the app would genuinely help right now, suggest it - this renders as a real, tappable link the user can act on immediately, not just a name mentioned in text. Only suggest something the conversation actually calls for; do not use this reflexively or more than once in a normal exchange. The real, valid options and what each is for: plan (Recovery Plan - a personalized coaching plan for their current archetype and highest energy debt), diagnose (Check-in - a structured burnout self-assessment, not a diagnosis), recover (Recover - energy budget tracking and recovery debt), fuel (Nutrition - nutrition's effect on recovery), reset (Nervous System - breathing and nervous-system regulation tools), anxiety_reset (Anxiety Reset - in-the-moment anxiety de-escalation), communicate (Communicate - scripted help for a specific hard conversation or boundary), reflect (Reflect - weekly reflection and journaling), ally (Recovery Ally - trusted contacts and support network). Never suggest anything not in this exact list - if nothing here genuinely fits, don't call this tool.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        featureId: { type: Type.STRING, description: "One of: plan, diagnose, recover, fuel, reset, anxiety_reset, communicate, reflect, ally - must match exactly." },
        reason: { type: Type.STRING, description: "A short, specific reason tied to what the user just said - under 200 characters, not generic." },
      },
      required: ["featureId", "reason"],
    },
  },
  {
    name: "offer_guardian_support",
    description: "Offer the user an OPTIONAL, dismissible on-screen card letting them choose to contact a trusted person they've already set up (their Guardian) - never sends anything, never decides anything, never claims to know how the user is doing. Call this when the user directly asks to contact their Guardian or says they want to reach someone they trust, OR when what they've shared suggests they're feeling overwhelmed, alone, unsafe, or in need of real human support and offering this option would be genuinely supportive right now - the same conservative judgement you'd use offering any other real, optional next step, never a diagnosis or a classification of their state. Do not call this reflexively, more than once without the user raising it again, or as a substitute for actually responding to what they said - offer it alongside a real reply, not instead of one. This tool has no ability to contact anyone; it only shows an optional card the user may or may not act on.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        reason: { type: Type.STRING, description: "A short, specific reason tied to what the user just said - under 200 characters, not generic, never a diagnosis or risk claim." },
      },
      required: ["reason"],
    },
  },
];

// Mirrors the exact permission check and category filtering already
// established in getNovaContextAndMetadata for nova_memories, so this
// tool can't see anything the passive context injection wouldn't also
// be allowed to see.
async function executeSearchNovaMemories(uid: string, firestoreDb: any, query: string): Promise<{ results: string[] }> {
  const permDoc = await firestoreDb.collection('users').doc(uid).collection('nova_permissions').doc('current').get();
  const perms = permDoc.exists ? (permDoc.data() || {}) : {};
  if (!memoryToolIsAllowed(perms)) return { results: [] };

  const memRef = firestoreDb.collection('users').doc(uid).collection('nova_memories');
  const memSnap = await memRef.get();
  const memories: NovaMemoryDoc[] = memSnap.docs.map((d: any) => d.data());

  return { results: searchMemories(perms, memories, query) };
}

// No Firestore I/O needed here - this tool doesn't read or write anything,
// it only validates the model's proposed duration against the real catalog
// (isValidRecoveryDuration) so a hallucinated value like "15m" can't reach
// the UI dressed up as a real, executable protocol. The suggestion itself
// is not persisted or executed here; the frontend decides what to do with
// it, matching the confirm-before-anything-happens pattern used everywhere
// else real actions exist in this app.
function executeProposeRecoveryAction(args: Record<string, unknown>): { proposed: boolean; duration?: string; reason?: string; error?: string } {
  const duration = args.duration;
  const reason = typeof args.reason === "string" ? args.reason : "";
  if (!isValidRecoveryDuration(duration)) {
    return { proposed: false, error: `"${duration}" is not a real duration in the app's catalog. Valid options are 30s, 2m, 5m, 10m, 20m.` };
  }
  return { proposed: true, duration, reason };
}

// Pure, no I/O - validates against the same real, curated feature list
// the tool description itself lists, so a hallucinated or role-gated
// featureId is rejected here rather than reaching the UI as a dead link.
function executeSuggestFeature(args: Record<string, unknown>): { suggested: boolean; featureId?: string; label?: string; reason?: string; error?: string } {
  const validation = validateFeatureSuggestion(args);
  if (!validation.valid) {
    return { suggested: false, error: validation.error };
  }
  const featureId = args.featureId as string;
  return { suggested: true, featureId, label: SUGGESTABLE_FEATURES[featureId], reason: args.reason as string };
}

// The one place a Nova conversation can actually write to a user's
// permanent memory record. Every safeguard here matters: memoryToolIsAllowed
// is the same consent gate the read tool respects (a user who hasn't
// enabled memory can't have Nova write to it either), validateMemoryWrite
// rejects a hallucinated type, empty/oversized content, or a proposed
// 'verified' confidence a conversational inference has no right to claim,
// and canEdit is hardcoded true regardless of what the model sends - the
// user must always retain the ability to correct or delete anything Nova
// infers about them, full stop, not something a tool argument gets to
// override.
async function executeRememberAboutUser(uid: string, firestoreDb: any, args: Record<string, unknown>): Promise<{ saved: boolean; error?: string }> {
  const permDoc = await firestoreDb.collection('users').doc(uid).collection('nova_permissions').doc('current').get();
  const perms = permDoc.exists ? (permDoc.data() || {}) : {};
  if (!memoryToolIsAllowed(perms)) {
    return { saved: false, error: "The user hasn't enabled Nova memory, so nothing was saved." };
  }

  const validation = validateMemoryWrite(args);
  if (!validation.valid) {
    return { saved: false, error: validation.error };
  }

  const memRef = firestoreDb.collection('users').doc(uid).collection('nova_memories').doc();
  const now = new Date().toISOString();
  await memRef.set({
    type: args.type,
    content: args.content,
    source: "Nova Conversation",
    confidence: args.confidence,
    createdAt: now,
    updatedAt: now,
    canEdit: true,
  });

  return { saved: true };
}

// Pure gate-plus-validate, no I/O of its own - mirrors executeSuggestFeature
// exactly. The flag check lives HERE (inside the tool's own execute
// function, not in whether the tool is declared to the model) so this
// follows the same self-gating pattern every other consent/flag-aware tool
// in this file already uses (see executeSearchNovaMemories's
// memoryToolIsAllowed check) - the tool is always declared, but silently
// returns "not offered" when the feature is off, so a client that somehow
// still asks never gets a way to distinguish "off" from "not warranted"
// from the model's answer alone.
function executeOfferGuardianSupport(args: Record<string, unknown>): { offered: boolean; reason?: string; error?: string } {
  if (!guardianSupportInvitationEnabled(process.env.GUARDIAN_SUPPORT_INVITATION_ENABLED)) {
    return { offered: false };
  }
  const validation = validateGuardianSupportOffer(args);
  if (!validation.valid) {
    return { offered: false, error: validation.error };
  }
  return { offered: true, reason: args.reason as string };
}

async function executeNovaTool(name: string, args: Record<string, unknown>, uid: string | undefined, firestoreDb: any): Promise<Record<string, unknown>> {
  if (!uid) return { error: "No authenticated user for this tool call." };
  try {
    switch (name) {
      case "search_nova_memories":
        return await executeSearchNovaMemories(uid, firestoreDb, String(args.query || ""));
      case "propose_recovery_action":
        return executeProposeRecoveryAction(args);
      case "suggest_feature":
        return executeSuggestFeature(args);
      case "remember_about_user":
        return await executeRememberAboutUser(uid, firestoreDb, args);
      case "offer_guardian_support":
        return executeOfferGuardianSupport(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    // An unexpected failure inside a tool handler (a Firestore hiccup,
    // a network blip - anything the handler's own validation didn't
    // already anticipate) degrades to the same error-shaped result the
    // model already knows how to work with, rather than propagating up
    // and failing the entire conversation turn over one tool's transient
    // problem. Logged server-side for real visibility; the model only
    // sees a generic message, not internal error details.
    console.error(`Nova tool "${name}" threw unexpectedly:`, err);
    return { error: `The ${name} tool is temporarily unavailable. Continue without it if possible, or let the user know this specific capability isn't working right now.` };
  }
}

// Claude conversation loop for Nova chat, kept in exact behavioral parity
// with the Gemini loop below it: same MAX_TOOL_CALL_ROUNDS, same
// MAX_MEMORY_WRITES_PER_TURN checked synchronously before the async
// dispatch, same executeNovaTool dispatcher (the tools themselves don't
// know or care which provider is calling them), same planTrace shape
// returned to the caller. The only real difference is mechanical: Claude
// uses a growing messages array with tool_use/tool_result content blocks
// rather than Gemini's stateful chat object with functionCall/
// functionResponse parts.
//
// Feature-flagged via NOVA_CHAT_PROVIDER and gated on the anthropic
// client actually being configured - callers must check both before
// calling this, since it throws rather than silently falling back if
// invoked without a real API key.
async function callClaudeNovaChat(
  systemPrompt: string,
  history: any[],
  message: string,
  uid: string | undefined,
  firestoreDb: any,
  signal: AbortSignal
): Promise<{ text: string; planTrace: { tool: string; args: Record<string, unknown>; result: Record<string, unknown> }[] }> {
  if (!anthropic) {
    throw new Error("NOVA_CHAT_PROVIDER is set to claude but ANTHROPIC_API_KEY is not configured.");
  }

  const claudeTools = NOVA_TOOLS_ENABLED ? toClaudeTools(NOVA_TOOLS as GeminiStyleToolDeclaration[]) : undefined;

  // The incoming history matches Gemini's expected shape
  // ({ role: 'user' | 'model', parts: [{ text }] }), since that's what the
  // frontend has always sent for the existing Gemini-only endpoint.
  // Converted defensively - ChatRequestSchema validates history only as
  // z.array(z.any()), so a malformed entry shouldn't throw here, just
  // resolve to empty text.
  const claudeMessages: Anthropic.MessageParam[] = (history || []).map((h: any) => ({
    role: h?.role === 'model' ? 'assistant' : 'user',
    content: Array.isArray(h?.parts) ? h.parts.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('') : '',
  }));
  claudeMessages.push({ role: 'user', content: message });

  const MODEL = "claude-sonnet-5";
  const MAX_TOKENS = 2048;

  let response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    tools: claudeTools,
    messages: claudeMessages,
  }, { signal });

  let toolCallRounds = 0;
  const MAX_TOOL_CALL_ROUNDS = 5;
  const MAX_MEMORY_WRITES_PER_TURN = 2;
  let memoryWriteCount = 0;
  const planTrace: { tool: string; args: Record<string, unknown>; result: Record<string, unknown> }[] = [];

  while (response.stop_reason === 'tool_use' && toolCallRounds < MAX_TOOL_CALL_ROUNDS) {
    toolCallRounds++;

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    // Echo the model's own turn back exactly as received (text + tool_use
    // blocks together) before appending the tool results - Claude's API
    // requires the full prior assistant turn to stay in the transcript.
    claudeMessages.push({ role: 'assistant', content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (block): Promise<Anthropic.ToolResultBlockParam> => {
        const args = (block.input && typeof block.input === 'object' ? block.input : {}) as Record<string, unknown>;
        let output: Record<string, unknown>;
        if (block.name === "remember_about_user") {
          // Checked and incremented synchronously, before the await below,
          // matching the same race-safety reasoning as the Gemini loop.
          if (memoryWriteCount >= MAX_MEMORY_WRITES_PER_TURN) {
            output = { saved: false, error: `Already saved ${MAX_MEMORY_WRITES_PER_TURN} memories this turn - that's enough for one conversation. Wait for a future message if there's more worth remembering.` };
          } else {
            memoryWriteCount++;
            output = await executeNovaTool(block.name, args, uid, firestoreDb);
          }
        } else {
          output = await executeNovaTool(block.name, args, uid, firestoreDb);
        }
        planTrace.push({ tool: block.name, args, result: output });
        return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(output) };
      })
    );

    claudeMessages.push({ role: 'user', content: toolResults });

    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: claudeTools,
      messages: claudeMessages,
    }, { signal });
  }

  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  );
  const text = textBlocks.map((block) => block.text).join('');

  return { text, planTrace };
}

// Every AI-route catch block below logs through this instead of either
// swallowing the error entirely or logging only a fixed label - both of
// which happened at various points across these routes, and made a real,
// currently-live failure (every Nova chat message 500ing) completely
// undiagnosable from Cloud Run logs, which showed nothing but the literal
// string "Gemini Chat Error" with no way to tell an expired API key from
// a renamed model from a network timeout. Deliberately logs only the
// exception's own name/message/status/code - never the error object
// wholesale (some SDKs attach the original request payload to a verbose
// error, which could include the user's own message text) and never
// anything from req.body - so this stays consistent with the actual
// reason this redaction existed in the first place (keeping conversation
// content out of logs), while no longer discarding the one thing an
// operator actually needs to fix a live bug. Still never reaches the
// client - the res.json() calls at each site keep their own generic,
// unchanged "safe operational error occurred" message.
function logRouteError(label: string, error: any): void {
  console.error(
    label,
    JSON.stringify({
      name: error?.name,
      message: error?.message,
      status: error?.status ?? error?.code,
    })
  );
}

app.post("/api/nova/chat", novaChatLimiter, verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const parsedParams = ChatRequestSchema.safeParse(req.body);
    if (!parsedParams.success) {
      return res.status(400).json({ error: "Invalid request payload or forbidden fields detected.", details: (parsedParams as any).error?.errors || [] });
    }
    const { message, history, systemInstruction } = parsedParams.data;

    // Provider selection: Gemini's Developer API remains the default,
    // proven path every real user is currently on. Claude and Vertex each
    // only activate when both the environment explicitly requests them
    // AND their respective client was successfully initialized - if
    // either condition fails for either provider, this falls straight
    // through to the existing Gemini Developer API path rather than
    // erroring, so a misconfiguration can't take Nova chat down entirely.
    const useClaudeForThisChat = process.env.NOVA_CHAT_PROVIDER === 'claude' && anthropic !== null;
    const useVertexForThisChat = process.env.NOVA_CHAT_PROVIDER === 'vertex' && aiVertex !== null;

    if (!useClaudeForThisChat && !useVertexForThisChat && (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY")) {
      return res.status(401).json({ error: "Gemini API key not configured. Please add your key in the app settings secrets." });
    }

    const verifiedUser = (req as any).user;
    const uid = verifiedUser?.uid;

    if (uid) {
      const quota = await checkAndReserveCapability(uid, 'nova_text');
      if (!quota.allowed) {
        return res.status(429).json({
          error: quota.plan === 'free'
            ? "You've reached today's free Nova chat limit. It resets tomorrow, or upgrade to Blaze Break Premium for a much higher daily allowance."
            : "You've reached today's Nova chat fair-use limit. It resets tomorrow.",
          code: 'capability_limit_reached',
          capability: 'nova_text',
        });
      }
    }

    // This is the real, consent-gated read of the person's actual recovery
    // data - mood, energy, boundaries, goals, wins, and more, each only
    // included if they've explicitly opted in via their own Privacy Centre.
    // This was previously built in full but never actually called here, so
    // every response was generated blind regardless of what someone had
    // consented to share.
    let contextAddendum = "";
    let contextMetadata: NovaConsentMetadata = { contextTriggered: false, modulesUsed: [], rationale: "" };
    if (uid) {
      try {
        const db = getDb();
        const [contextResult, styleAddendum] = await Promise.all([
          getNovaContextAndMetadata(uid, db),
          getNovaQuestioningStyleAddendum(uid, db),
        ]);
        contextAddendum = contextResult.systemInstructionsAddendum + styleAddendum;
        contextMetadata = contextResult.metadata;
      } catch (e) {
        console.warn("Nova context build failed - continuing without it.", e);
      }
    }

    const mergedSystemPrompt = (systemInstruction || NOVA_SYSTEM_PROMPT) + contextAddendum + NOVA_SAFETY_INSTRUCTIONS;

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 25000); // 25s timeout - raised from 15s to accommodate one or more tool-call round-trips

    if (useClaudeForThisChat) {
      try {
        const claudeResult = await callClaudeNovaChat(mergedSystemPrompt, history || [], message, uid, getDb(), abortController.signal);
        clearTimeout(timeoutId);
        return res.json({ text: claudeResult.text, privacyMetadata: contextMetadata, planTrace: claudeResult.planTrace });
      } catch (modelError: any) {
        clearTimeout(timeoutId);
        if (modelError.name === 'AbortError') {
          return res.status(504).json({ error: "Request timed out." });
        }
        throw modelError;
      }
    }

    // Vertex AI uses the exact same chats.create/sendMessage shape as the
    // Developer API client (same SDK, same method calls) - no separate
    // loop needed here the way Claude required, just a different client
    // instance to call it on.
    const geminiClient = useVertexForThisChat && aiVertex ? aiVertex : ai;

    try {
      const chat = geminiClient.chats.create({
        model: "gemini-3.5-flash",
        config: {
          systemInstruction: mergedSystemPrompt,
          tools: NOVA_TOOLS_ENABLED ? [{ functionDeclarations: NOVA_TOOLS }] : undefined,
        },
        history: history || [],
      });

      let result = await chat.sendMessage({ message });

      // Bounded loop: execute any requested tool calls, send results back,
      // and let the model continue - capped so a misbehaving model can't
      // hold this request open indefinitely. planTrace is a transparent,
      // inspectable record of what actually happened this turn (which
      // tools were called, with what arguments, and what came back) -
      // returned to the caller rather than only living in server logs, so
      // it's available for a future "how Nova got to this answer" view
      // and for privacy/audit purposes, not just debugging.
      let toolCallRounds = 0;
      const MAX_TOOL_CALL_ROUNDS = 5;
      const MAX_MEMORY_WRITES_PER_TURN = 2;
      let memoryWriteCount = 0;
      const planTrace: { tool: string; args: Record<string, unknown>; result: Record<string, unknown> }[] = [];
      while (result.functionCalls && result.functionCalls.length > 0 && toolCallRounds < MAX_TOOL_CALL_ROUNDS) {
        toolCallRounds++;
        const db = getDb();
        const responseParts = await Promise.all(
          result.functionCalls.map(async (call) => {
            let output: Record<string, unknown>;
            if (call.name === "remember_about_user") {
              // Checked and incremented synchronously, before the await below,
              // so this stays correct even with multiple writes requested in
              // the same round via Promise.all.
              if (memoryWriteCount >= MAX_MEMORY_WRITES_PER_TURN) {
                output = { saved: false, error: `Already saved ${MAX_MEMORY_WRITES_PER_TURN} memories this turn - that's enough for one conversation. Wait for a future message if there's more worth remembering.` };
              } else {
                memoryWriteCount++;
                output = await executeNovaTool(call.name || "", call.args || {}, uid, db);
              }
            } else {
              output = await executeNovaTool(call.name || "", call.args || {}, uid, db);
            }
            planTrace.push({ tool: call.name || "unknown", args: call.args || {}, result: output });
            return { functionResponse: { name: call.name, response: output } };
          })
        );
        result = await chat.sendMessage({ message: responseParts });
      }

      clearTimeout(timeoutId);
      res.json({ text: result.text, privacyMetadata: contextMetadata, planTrace });
    } catch (modelError: any) {
      clearTimeout(timeoutId);
      if (modelError.name === 'AbortError') {
        return res.status(504).json({ error: "Request timed out." });
      }
      throw modelError;
    }
  } catch (error: any) {
    logRouteError("Gemini Chat Error", error);
    // The specific, real cause behind an incident where every chat message
    // failed: the underlying Gemini API key was still on Google's free
    // tier (20 requests/day, for the whole app combined, not per user) and
    // had run out for the day - a billing/quota configuration issue, not a
    // bug in this route. That surfaces here as a 429 from the provider
    // itself. Distinguishing it from a genuine server error both gives the
    // user an honest, actionable message instead of a scary generic one,
    // and makes this specific failure mode instantly recognisable in
    // Cloud Run logs by its distinct status code, without needing to
    // re-read the full logRouteError payload every time.
    if (error?.status === 429) {
      return res.status(503).json({ error: "Nova is at capacity right now and can't respond - this is a temporary usage limit, not a problem with your account. Please try again shortly." });
    }
    res.status(500).json({ error: `Nova Chat Sync Failure: A safe operational error occurred.` });
  }
});

const DiagnoseRequestSchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.number()])).optional().default({}),
  letNovaLearn: z.boolean().optional().default(true),
}).strict();

app.post("/api/nova/diagnose", novaDiagnoseLimiter, verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  // Nova personal recovery context remains disabled until secure private-data storage and consent-controlled processing are approved.
  try {
    const parsedParams = DiagnoseRequestSchema.safeParse(req.body);
    if (!parsedParams.success) {
        return res.status(400).json({ error: "Invalid request payload or forbidden fields detected.", details: (parsedParams as any).error?.errors || [] });
    }
    const { answers, letNovaLearn } = parsedParams.data;
    const diagnoseUid = requireAuth(req).uid;

    const dims = computeDimensionScores(answers);
    const {
      workload: workloadScore,
      boundaries: boundariesScore,
      peoplePleasing: peoplePleasingScore,
      guilt: guiltScore,
      sleep: sleepScore,
      emotionalOverload: emotionalScore,
      meaning: meaningScore,
      selfDoubt: selfDoubtScore,
      delegationControl: delegationControlScore,
      maskingLoad: maskingLoadScore,
      caregivingLoad: caregivingLoadScore,
      crisisDependency: crisisDependencyScore,
      emotionalPerformance: emotionalPerformanceScore,
      responsibilityCreep: responsibilityCreepScore,
    } = dims;

    const archScores = computeArchetypeScores(dims);
    const profile = pickDominantProfile(archScores);

    let description = '';
    let priorities: string[] = [];

    if (profile === 'Founder on Fire') {
      description = 'You have completely fused your nervous system with your venture or project. Every single minor setback feels like a mortal threat to your identity. You view workload as an endless war, and rest feels like a sign of failure. You wear exhaustion as armour, and it is burning you to a cinder.';
      priorities = ['Firm identity decoupling from venture performance', 'Enforced 24-hour weekly digital blackouts', 'Immediate delegation of operational noise'];
    } else if (profile === 'Over-Giver') {
      description = 'Your primary energy leak is other people. You are currently acting as a giant shock absorber for everyone else\'s poor planning and emotional needs. Your boundaries are like Swiss cheese because your self-worth has been fused with "being helpful". Fawning is your default stress response.';
      priorities = ['Saying "No" as an indispensable service', 'Structured "Inaccessible Hours"', 'Deliberate somatic grounding when requests arrive'];
    } else if (profile === 'Silent Resenter') {
      description = 'You are still "performing" your tasks, but you have lost the "why". Your cynicism is not a bad attitude—it is the biological self-defence mechanism of a nervous system that has been pushed past its limits. You are screaming inside while smiling outside. Your core purpose has been hijacked.';
      priorities = ['Drastic load shedding of non-essential commitments', 'Values alignment and boundary rehearsal', 'Practising radical candour over quiet compliance'];
    } else if (profile === 'Manager in the Middle') {
      description = 'You are caught in a permanent squeeze play, absorbing immense weight from senior leaders above while desperately trying to shield and support your team below. Your energy is being entirely vapourised by mediation rather than creation. You have zero space left to breathe, let alone recover.';
      priorities = ['Rehearsing boundary negotiation upwards', 'Establishing rigorous operational gates', 'Daily micro-recovery somatic pauses'];
    } else {
      // High-Functioning Exhausted
      description = 'You are technically succeeding, but at a metabolic cost you cannot sustain for much longer. Your engine is screaming green and red-line, yet you keep driving by sheer force of habit. You are running on cortisol, sheer grit, and caffeine. Your sleep is severely compromised—you are "wired but tired" because your nervous system refuses to drop its guard. This is a baseline stability leakage.';
      priorities = ['Institute mandatory boredom zones', 'Hard cutoff on evening screen exposure', 'Transition from recovery intensity to consistent stability'];
    }

    if (profile === 'The Impostor') {
      description = "Your exhaustion isn't really coming from your workload — it's coming from the constant, quiet effort of trying to prove you deserve to be here. Every win gets discounted almost as fast as it happens, so you keep adding more evidence, and the finish line keeps moving. You are not underqualified. You are over-proving.";
      priorities = ['Keep a running record of wins you cannot mentally discount', 'Notice when "proving it again" is optional, not required', 'Practice letting a success stand without immediately chasing the next one'];
    } else if (profile === 'The Perfectionist') {
      description = "Your energy leak isn't other people's demands — it's your own standards. You would rather redo something yourself than risk it being anything less than right, so delegation quietly stops happening. The cost isn't visible as \"overwork\" on paper. It shows up as never actually putting anything down.";
      priorities = ['Define "good enough" explicitly for low-stakes tasks', 'Practice handing off one task without reviewing the outcome', "Separate your worth from the flawlessness of the output"];
    } else if (profile === 'The Constant Adapter') {
      description = "A significant share of your energy goes into managing how you come across and staying on top of a world that isn't built around how you naturally work — separate from the actual work itself. This isn't a motivation problem. It's the cost of running two jobs at once: the one everyone sees, and the constant calibration underneath it.";
      priorities = ['Protect real recovery time after high-effort or high-stimulation stretches', 'Treat quiet, low-input time as necessary, not optional', 'Stop treating "just push through" advice as the standard you should meet'];
    } else if (profile === 'The Second Shift') {
      description = "Your day doesn't end when you log off. There is a second, unpaid job waiting — caring for someone who depends on you — and it runs with no real recovery window between the two. Colleagues likely have no visibility into this at all. The guilt of not doing either role perfectly follows you into both.";
      priorities = ['Name the caregiving hours explicitly, even just to yourself', 'Look for any real handoff or respite option, even a partial one', 'Let "good enough" apply to both roles rather than demanding excellence in either'];
    } else if (profile === 'Crisis Sprinter') {
      description = "Your nervous system has learned to run on urgency. Calm stretches don't feel restful — they feel like something's about to go wrong, so you find, or quietly create, the next fire to fight. You're genuinely excellent in a crisis, which is exactly the problem: the skill that makes you valuable in an emergency is training your body to need one.";
      priorities = ['Practice sitting in a genuinely calm period without manufacturing urgency to fill it', 'Notice the physical discomfort of stillness without immediately reaching for a new fire', 'Treat a quiet week as a success, not a warning sign'];
    } else if (profile === 'People-Pleasing Performer') {
      description = "You've gotten very good at performing \"fine.\" Whatever you're actually feeling — stressed, doubtful, exhausted — a composed, agreeable version of you shows up instead, because the performance keeps things running smoothly for everyone around you. The cost is that fewer people, including you, know what's actually underneath it.";
      priorities = ['Practice naming one honest internal state out loud each day, even a small one', 'Notice the specific moments the performance switches on, and what triggers it', 'Let one interaction be less polished than usual, on purpose'];
    } else if (profile === 'Responsibility Addict') {
      description = "If something's wrong nearby, some part of you has already decided it's yours to fix — whether or not it's actually your role, your task, or something you can control. Being needed has quietly become what makes you feel secure, which means letting something be someone else's problem can feel like a small identity threat.";
      priorities = ['Practice identifying whose responsibility something actually is before stepping in', 'Let one thing go wrong without your intervention, and observe what actually happens', 'Practice the sentence "I trust this will get handled without me"'];
    }

    let analysis = '';
    const geminiKey = process.env.GEMINI_API_KEY;
    // AI narrative is a cost-gated enhancement, not the diagnose feature
    // itself - the deterministic archetype/scores above always compute
    // regardless of quota. Over quota, this simply falls through to the
    // static fallback analysis below rather than blocking the route,
    // matching the same graceful-degradation pattern already used when
    // Gemini itself is unavailable.
    const diagnoseQuota = await checkAndReserveCapability(diagnoseUid, 'diagnose');
    if (diagnoseQuota.allowed && geminiKey && geminiKey !== "MY_GEMINI_API_KEY") {
      try {
        const styleToneAddendum = await getNovaStyleToneAddendum(diagnoseUid, getDb());
        const prompt = `
          You are Nova, an analytical and direct British high-performance recovery coach for high achievers who have burned out.
          The user has completed their diagnostic and been assigned the archetype: "${profile}".
          CRITICAL: Do not attempt to invent, rename or override their assigned archetype in your response. Stick exclusively to the assigned type.
          Here are their detailed scores (from 1 to 4, where 4 is most severe):
          - Workload: ${workloadScore}/4
          - Boundaries: ${boundariesScore}/4
          - People-pleasing: ${peoplePleasingScore}/4
          - Guilt: ${guiltScore}/4
          - Sleep: ${sleepScore}/4
          - Emotional Overload: ${emotionalScore}/4
          - Sense of Meaning: ${meaningScore}/4
          - Self-Doubt/Impostor Feelings: ${selfDoubtScore}/4
          - Delegation/Control: ${delegationControlScore}/4
          - Masking/Adaptation Load: ${maskingLoadScore}/4
          - Caregiving Load: ${caregivingLoadScore}/4
          - Crisis Dependency: ${crisisDependencyScore}/4
          - Emotional Performance: ${emotionalPerformanceScore}/4
          - Responsibility Creep: ${responsibilityCreepScore}/4

          Provide a brief, direct, and slightly provocative coaching analysis (3-4 sentences maximum).
          Do NOT use generic platitudes, emotional cheerleading, or medical advice.
          Identify their primary "leak" (e.g. boundaries, sleep pattern, fawning) based on their highest scores.
          Use British English spelling (e.g., dialled, rationalise, prioritising, behaviour, defence, vapourised) and terminology.
          Write in first person as Nova ("I see...", "Let's patch this leak."). Do not use markdown bullet points. Return only the plain English paragraph.
        ${styleToneAddendum}`;

        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 10000);

        try {
          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
          });
          clearTimeout(timeoutId);
          if (response.text) {
            analysis = response.text.trim();
          }
        } catch (modelError: any) {
          clearTimeout(timeoutId);
          logRouteError("Diagnose model timeout/error observation", modelError);
        }
      } catch (gem_err) {
        logRouteError("Gemini diagnose error observation", gem_err);
      }
    }

    // Default static fallback if Gemini fails or is not configured
    if (!analysis) {
      analysis = `Having analysed your metrics, your primary energy leak is completely clear. With a workload score of ${workloadScore}/4, a boundaries rating of ${boundariesScore}/4, and a sleep disruption score of ${sleepScore}/4, you are trying to rationalise a metabolic deficit that is biologically impossible to sustain. We need to focus on establishing baseline stability and boundary rehearsals immediately. Let's patch this leak.`;
    }

    // The blend: rather than reducing someone to one label, show the real mix.
    // Coefficients for every archetype sum to 9 (see archScores above), so raw
    // scores are already on a comparable 9-36 scale — renormalizing the top 3
    // to sum to 100% gives an honest "62% X, 24% Y, 14% Z" style breakdown.
    const blend = computeBlend(archScores);

    // Persisting a baseline is what makes archetype evolution possible (drift
    // detection needs something durable to drift *from*), which is exactly what
    // the "consent-controlled processing" gate above was waiting for — so this
    // write only happens if the user has actually opted into it via Settings.
    //
    // The consent check itself trusts the stored users/{uid}/nova_permissions/current
    // doc, not the client-supplied `letNovaLearn` boolean above - a tampered
    // client could otherwise always claim consent regardless of what the user
    // actually chose. Falls back to the request value only if no permissions
    // doc exists yet (shouldn't happen from onboarding onward - see
    // nova-brain.ts's initNovaPermissionsForNewUser).
    let allowLearning = letNovaLearn;
    try {
      const permSnap = await getDb().collection("users").doc(diagnoseUid).collection("nova_permissions").doc("current").get();
      if (permSnap.exists) {
        allowLearning = permSnap.data()?.allowNovaMemory !== false;
      }
    } catch (e) {
      // Non-fatal - falls back to the request-supplied value above.
    }
    if (allowLearning) {
      try {
        await getDb().collection("users").doc(diagnoseUid).collection("diagnostics").doc("latest").set({
          archScores,
          profile,
          scores: {
            workload: workloadScore, boundaries: boundariesScore, peoplePleasing: peoplePleasingScore,
            guilt: guiltScore, sleep: sleepScore, emotionalOverload: emotionalScore, meaning: meaningScore,
            selfDoubt: selfDoubtScore, delegationControl: delegationControlScore, maskingLoad: maskingLoadScore,
            caregivingLoad: caregivingLoadScore, crisisDependency: crisisDependencyScore,
            emotionalPerformance: emotionalPerformanceScore, responsibilityCreep: responsibilityCreepScore,
          },
          computedAt: new Date().toISOString(),
        });
      } catch (persistErr: any) {
        // Don't fail the whole diagnosis just because the baseline write hiccuped.
        console.error("[Diagnose] baseline persistence error:", persistErr.message);
      }
    }

    res.json({
      profile,
      description,
      priorities,
      blend,
      scores: {
        workload: workloadScore,
        boundaries: boundariesScore,
        peoplePleasing: peoplePleasingScore,
        guilt: guiltScore,
        sleep: sleepScore,
        emotionalOverload: emotionalScore,
        meaning: meaningScore,
        selfDoubt: selfDoubtScore,
        delegationControl: delegationControlScore,
        maskingLoad: maskingLoadScore,
        caregivingLoad: caregivingLoadScore,
        crisisDependency: crisisDependencyScore,
        emotionalPerformance: emotionalPerformanceScore,
        responsibilityCreep: responsibilityCreepScore
      },
      analysis
    });
  } catch (error: any) {
    logRouteError("Diagnose Sync Failure", error);
    res.status(500).json({ error: "Diagnose Sync Failure: A safe operational error occurred." });
  }
});

const SpeechRequestSchema = z.object({
  text: z.string().min(1).max(2000)
}).strict();

app.post("/api/nova/speech", verifyAppCheck, speechLimiter, authenticateFirebaseUser, async (req, res) => {
  // Nova personal recovery context remains disabled until secure private-data storage and consent-controlled processing are approved.
  try {
    const parsedParams = SpeechRequestSchema.safeParse(req.body);
    if (!parsedParams.success) {
        return res.status(400).json({ error: "Invalid request payload or forbidden fields detected.", details: (parsedParams as any).error?.errors || [] });
    }
    const { text } = parsedParams.data;

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY") {
      return res.status(401).json({ error: "Gemini API key not configured for TTS." });
    }
    
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 15000);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Aoede" },
            },
            // Blaze Break is a British-branded app - Nova should sound like
            // it, not defer to the model's US-English default.
            languageCode: "en-GB",
          },
        },
      });
      clearTimeout(timeoutId);

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      
      if (base64Audio) {
        res.json({ audio: base64Audio });
      } else {
        throw new Error("No audio generated");
      }
    } catch (modelError: any) {
      clearTimeout(timeoutId);
      if (modelError.name === 'AbortError') {
        return res.status(504).json({ error: "Request timed out." });
      }
      throw modelError;
    }
  } catch (error: any) {
    logRouteError("TTS Error Observation", error);
    res.status(500).json({ error: "TTS Sync Failure: A safe operational error occurred." });
  }
});

const VoiceJournalRequestSchema = z.object({
  audioData: z.string().min(1),
  mimeType: z.string().min(1)
}).strict();

app.post("/api/nova/voice-journal", novaVoiceJournalLimiter, verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const parsedParams = VoiceJournalRequestSchema.safeParse(req.body);
    if (!parsedParams.success) {
      return res.status(400).json({ error: "Invalid request payload.", details: (parsedParams as any).error?.errors || [] });
    }
    const { audioData, mimeType } = parsedParams.data;

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY") {
      return res.status(401).json({ error: "Gemini API key not configured for Voice Journal." });
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 20000);

    try {
      const audioPart = {
        inlineData: {
          mimeType: mimeType,
          data: audioData
        }
      };

      const promptPart = {
        text: `You are Nova, an analytical, direct, British high-performance recovery coach.
You have received a 60-second daily voice journal memo from the user.
Your job is to:
1. Transcribe their spoken words exactly.
2. Identify 1 to 3 key recurring burnout themes or energy leaks from their spoken words.
3. Provide a direct, slightly provocative coaching analysis (2-3 sentences max) matching Nova's high-performance persona.
4. Give actionable, firm, custom recovery advice or a boundary script (2 sentences max).
5. Name the single dominant emotional tone you hear in their voice and words, in 2-4 plain words (e.g. "wired but exhausted", "quietly resentful", "cautiously hopeful").

You MUST respond strictly in the following JSON format. Do not include markdown codeblocks or wrap it in anything. Just return the JSON object:
{
  "transcription": "A complete, accurate transcription of the user's audio",
  "themes": ["Theme 1", "Theme 2"],
  "analysis": "Nova's direct, slightly provocative coaching feedback in British English",
  "advice": "Actionable, firm, custom recovery advice or script",
  "emotionalTone": "A short, plain-language description of the dominant emotional tone"
}
${NOVA_ONE_SHOT_SAFETY_FLOOR}`
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: { parts: [audioPart, promptPart] },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              transcription: { type: Type.STRING },
              themes: { type: Type.ARRAY, items: { type: Type.STRING } },
              analysis: { type: Type.STRING },
              advice: { type: Type.STRING },
              emotionalTone: { type: Type.STRING }
            },
            required: ["transcription", "themes", "analysis", "advice", "emotionalTone"]
          }
        }
      });
      clearTimeout(timeoutId);

      const text = response.text;
      if (text) {
        res.json(JSON.parse(text));
      } else {
        throw new Error("Empty response from Gemini model.");
      }
    } catch (modelError: any) {
      clearTimeout(timeoutId);
      console.error("Voice Journal Gemini error:", modelError);
      if (modelError.name === 'AbortError') {
        return res.status(504).json({ error: "Voice analysis request timed out." });
      }
      throw modelError;
    }
  } catch (error: any) {
    console.error("Voice Journal API error:", error);
    res.status(500).json({ error: "Voice Journal analysis failed. Please try speaking clearly." });
  }
});

// ============ One Less Thing: real Nova analysis ============
// The "One Less Thing" emergency-relief button used to label a fixed,
// client-side keyword match (if the task mentions "meeting", suggest
// Delete; etc.) as "Nova's Recommendation" / "Nova is processing" - real
// UI copy claiming real-time AI reasoning that was never actually
// happening. This endpoint makes that claim true: an actual Gemini call
// reads the task and picks the action. The four possible actions and their
// meanings are unchanged from the original heuristic; only the reasoning
// behind the pick is now real. The client keeps its original heuristic as
// an honestly-labelled fallback if this call fails - never presented as
// live analysis when it isn't.
const OneLessThingRequestSchema = z.object({
  task: z.string().trim().min(1).max(300),
}).strict();

const ONE_LESS_THING_ACTIONS = ['Delete', 'Delay', 'Delegate', 'Simplify'] as const;

app.post("/api/nova/one-less-thing", oneLessThingLimiter, verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const parsed = OneLessThingRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request." });
    }
    const { task } = parsed.data;
    const oneLessThingUid = requireAuth(req).uid;

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY") {
      return res.status(401).json({ error: "Nova analysis is not configured on this server." });
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 15000);

    try {
      const styleToneAddendum = await getNovaStyleToneAddendum(oneLessThingUid, getDb());
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: {
          parts: [{
            text: `You are Nova, a direct, warm burnout-recovery coach. The user is overloaded right now and has named ONE thing weighing on them. Your job is triage: pick the single fastest way to genuinely take it off their plate today.

The thing on their plate: "${task}"

Choose exactly ONE action:
- Delete: it doesn't need to happen at all, or not today. Cancel it or make it optional.
- Delay: it's not actually urgent - move it to a specific later time without guilt.
- Delegate: someone else can genuinely do this, even imperfectly.
- Simplify: it must happen, but at far lower effort/fidelity than they're planning.

Then write:
1. advice: 2 sentences, direct and specific to what they described, in Nova's voice - not generic.
2. template: a real, ready-to-send message they could copy and paste right now to actually make this happen (e.g. to cancel, delegate, or push back). It must be complete and usable exactly as written - never include a bracket placeholder like "[Tuesday]" or "[name]" that still needs filling in; if you need a day or person, invent a concrete, generic one that reads naturally (e.g. "early next week", "whoever's free").

Respond strictly as JSON, no markdown:
{"action": "Delete" | "Delay" | "Delegate" | "Simplify", "advice": "...", "template": "..."}
${styleToneAddendum}`,
          }],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              action: { type: Type.STRING },
              advice: { type: Type.STRING },
              template: { type: Type.STRING },
            },
            required: ["action", "advice", "template"],
          },
        },
      });
      clearTimeout(timeoutId);

      const text = response.text;
      if (!text) throw new Error("Empty response from Gemini model.");
      const parsedModel = JSON.parse(text);

      // Never trust the model's own claim about its output shape - validate
      // for real, same as every other tool/model-output path in this app.
      if (!ONE_LESS_THING_ACTIONS.includes(parsedModel.action) || typeof parsedModel.advice !== "string" || typeof parsedModel.template !== "string") {
        throw new Error("Model returned an unexpected shape.");
      }

      res.json({
        action: parsedModel.action,
        advice: parsedModel.advice.slice(0, 500),
        template: parsedModel.template.slice(0, 500),
      });
    } catch (modelError: any) {
      clearTimeout(timeoutId);
      if (modelError.name === "AbortError") {
        return res.status(504).json({ error: "Nova's analysis timed out." });
      }
      throw modelError;
    }
  } catch (error: any) {
    console.error("One Less Thing API error:", error);
    res.status(500).json({ error: "Could not reach Nova for analysis right now." });
  }
});

// Reusable Helper Guards and Roles
const requireAuth = (req: any) => {
  if (!req.user) {
    throw new Error("Unauthorized. Missing user authentication.");
  }
  return req.user;
};

// Bootstrap platform-owner access for the founder account by email, so the
// very first admin login works before any custom claim has been set on it.
// Configurable via env var (comma-separated) rather than a literal address
// hardcoded at every call site - defaults to the two addresses already in
// use today, so this doesn't change current deployed behavior, just gives
// it one source of truth instead of four independently-maintained copies.
const OWNER_BOOTSTRAP_EMAILS = (process.env.OWNER_BOOTSTRAP_EMAILS || 'teampublication@gmail.com,teampublication@googlemail.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
const isOwnerBootstrapEmail = (email: string | null | undefined) =>
  !!email && OWNER_BOOTSTRAP_EMAILS.includes(email.toLowerCase());

const requireAdmin = (req: any) => {
  const user = requireAuth(req);
  const isSuperAdmin = user.platform_admin === true || user.admin === true || user.role === 'platform_owner' || isOwnerBootstrapEmail(user.email);
  if (!isSuperAdmin) {
    throw new Error("Forbidden: Admin privileges required.");
  }
  return user;
};

const requireRole = (req: any, allowedRoles: string[]) => {
  const user = requireAuth(req);
  const role = user.role || (isOwnerBootstrapEmail(user.email) ? 'platform_owner' : 'user');
  if (!allowedRoles.includes(role) && !allowedRoles.includes(user.role)) {
    throw new Error(`Forbidden: Role in ${allowedRoles.join(', ')} required.`);
  }
  return user;
};

const requirePlatformOwner = (req: any) => {
  const user = requireAuth(req);
  const isOwner = user.platformOwner === true || isOwnerBootstrapEmail(user.email) || user.role === 'platform_owner';
  if (!isOwner) {
    throw new Error("Forbidden: Platform Owner privileges required.");
  }
  return user;
};

const assertNotLastPlatformOwner = async (targetUid: string, databaseId: string | undefined) => {
  const db = getDb();
  const ownersSnap = await db.collection('admin_users').where('role', '==', 'platform_owner').get();
  if (ownersSnap.size <= 1) {
    const isTargetOwner = ownersSnap.docs.some(doc => doc.id === targetUid);
    if (isTargetOwner) {
      throw new Error("Operation Rejected: Cannot remove or downgrade the last Platform Owner.");
    }
  }
};

const getDb = () => {
  return getFirestore(firebaseConfigDatabaseId);
};

const getPermissionsForRole = (role: string): string[] => {
  switch (role) {
    case 'platform_owner':
      return [
        "admin.full_access", "users.read", "users.manage", "content.manage", 
        "nova.manage", "b2b.manage", "billing.manage", "safety.read", 
        "audit.read", "settings.manage"
      ];
    case 'platform_admin':
      return [
        "users.read", "users.manage", "content.manage", "nova.manage", 
        "b2b.manage", "billing.manage", "safety.read", "audit.read"
      ];
    case 'support_admin':
      return ["users.read", "safety.read"];
    case 'content_admin':
      return ["content.manage", "nova.manage"];
    case 'coach_admin':
      return ["content.manage", "users.read"];
    case 'b2b_admin':
      return ["b2b.manage", "audit.read"];
    case 'viewer_admin':
      return ["users.read", "audit.read"];
    default:
      return [];
  }
};

const logAdminAction = async (req: any, action: string, targetUid: string, targetEmail: string, metadata: any) => {
  const actor = req.user;
  const entry = {
    actorUid: actor?.uid || "system",
    actorEmail: actor?.email || "system",
    actorRole: actor?.role || (isOwnerBootstrapEmail(actor?.email) ? "platform_owner" : "platform_admin"),
    action,
    targetUid,
    targetEmail,
    createdAt: FieldValue.serverTimestamp(),
    metadata,
    ipAddress: req.ip || "",
    userAgent: req.headers["user-agent"] || ""
  };
  try {
    const db = getDb();
    await db.collection("admin_audit_logs").add(entry);
  } catch (err: any) {
    // The admin action this logs already happened by the time we get here -
    // we can't roll it back, and blocking the response on a retry would
    // punish the admin for an audit-log outage they can't fix. But a
    // swallowed failure here means an admin mutation (including entitlement
    // grants and role changes) leaves zero trace, so log the full entry
    // inline - not just the error - so it's recoverable from Cloud Run logs
    // even though it never reached Firestore.
    console.error("Failed to write admin audit log:", err.message, JSON.stringify(entry));
  }
};

// ============================================================================
// Account security: email verification, password reset (Brevo-routed), TOTP 2FA
// ============================================================================
// Email/password sign-up itself happens entirely client-side (Firebase Auth
// SDK, src/lib/auth.tsx) — the routes below cover what the client SDK can't
// do on its own: sending these two emails through this app's own Brevo
// integration instead of Firebase's default mailer (matching every other
// transactional email this app sends), and the custom TOTP second factor
// (Firebase's native MFA needs a paid Identity Platform upgrade this
// project doesn't have — see docs/SSO_INTEGRATION_PLAN.md for the same
// tier wall hit by an earlier, unrelated feature).

// Where the link Firebase generates should land — a page this app owns
// (src/components/AuthActionPage.tsx, wired in src/main.tsx) rather than
// Firebase's own hosted action-handling page, exactly like the existing
// /ally/:token top-level route.
const authActionUrl = (): string => {
  const appBase = (process.env.APP_URL || "").replace(/\/$/, "");
  return `${appBase}/auth/action`;
};

// generatePasswordResetLink()/generateEmailVerificationLink() additionally
// require the Cloud Run runtime service account to hold
// roles/iam.serviceAccountTokenCreator (self-bound), because signing the
// link needs iam.serviceAccounts.signBlob — a permission Application
// Default Credentials via the metadata server does not implicitly grant.
// This app has no service-account key file (see the Admin SDK init above),
// so this is a real, separate IAM grant that can't be verified from inside
// this codebase. Logged distinctly so it's diagnosable in Cloud Run logs
// rather than surfacing as an unexplained generic failure.
const ACCOUNT_LINK_PERMISSION_HINT =
  'If this is a permission error, the Cloud Run runtime service account likely needs roles/iam.serviceAccountTokenCreator (self-bound) granted — see docs/DEPLOY.md.';

app.post("/api/auth/verify-email/send", verifyAppCheck, authenticateFirebaseUser, emailVerifySendLimiter, async (req, res) => {
  try {
    const user = requireAuth(req);
    if (!user.email) {
      return res.status(400).json({ error: "This account has no email address to verify." });
    }
    // A social sign-in (Google/Microsoft/Facebook) arrives with
    // email_verified already true when the provider itself vouches for
    // the address - LandingPage.tsx never calls this route for a social
    // sign-in in the first place, but this guard makes that true
    // regardless of caller, so a pre-verified account is never sent a
    // pointless "please verify" email.
    if (user.email_verified) {
      return res.json({ success: true, alreadyVerified: true });
    }
    try {
      const link = await getAuth().generateEmailVerificationLink(user.email, {
        url: authActionUrl(),
        handleCodeInApp: true,
      });
      const { subject, html } = buildEmailVerificationEmail(link);
      await sendBrevoHtmlEmail(user.email, subject, html);
    } catch (linkError: any) {
      // Soft-fail like every other Brevo-backed send in this app — the
      // person can just ask to resend, rather than seeing a hard error for
      // something that isn't actionable from their side.
      console.error(`[AUTH] generateEmailVerificationLink failed. ${ACCOUNT_LINK_PERMISSION_HINT}`, linkError?.message || linkError);
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error("[AUTH] verify-email/send error:", error.message);
    res.status(500).json({ error: "Could not send verification email right now." });
  }
});

const PasswordResetRequestSchema = z.object({
  email: z.string().email().max(254),
}).strict();

// No session exists at this point in the flow, so this is verifyAppCheck-
// only (no authenticateFirebaseUser) — the same shape as the public
// /api/ally/view/:token routes. Always resolves to the identical generic
// response regardless of whether the email is malformed, unregistered, or
// a real account — a caller must never be able to learn which emails have
// a Blaze Break account from this endpoint's behaviour.
app.post("/api/auth/password-reset/request", verifyAppCheck, passwordResetRequestLimiter, async (req, res) => {
  const genericResponse = { success: true, message: "If that email has a Blaze Break account, we've sent a password reset link." };
  const parsed = PasswordResetRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.json(genericResponse);
  }
  // Deliberately not awaited before responding. A real account takes a
  // real, measurably longer path here (Admin SDK link generation + a
  // Brevo API call) than a non-existent one (an instant auth/user-not-
  // found) — awaiting either before responding would leak exactly the
  // account-enumeration signal the identical response body is meant to
  // hide, just via response latency instead of content. Firing this off
  // and responding immediately keeps the response time identical either
  // way; the actual send still happens, just without the caller waiting
  // on (or being able to time) it.
  (async () => {
    try {
      const link = await getAuth().generatePasswordResetLink(parsed.data.email, {
        url: authActionUrl(),
        handleCodeInApp: true,
      });
      const { subject, html } = buildPasswordResetEmail(link);
      await sendBrevoHtmlEmail(parsed.data.email, subject, html);
    } catch (error: any) {
      // auth/user-not-found is the expected, silent case for an email with
      // no account — anything else (most likely the signBlob IAM permission)
      // is worth a clear, actionable log line.
      if (error?.code !== 'auth/user-not-found') {
        console.error(`[AUTH] generatePasswordResetLink failed. ${ACCOUNT_LINK_PERMISSION_HINT}`, error?.message || error);
      }
    }
  })();
  res.json(genericResponse);
});

const PasswordResetConfirmNotifySchema = z.object({
  email: z.string().email().max(254),
}).strict();

// Fired by AuthActionPage.tsx right after a successful client-side
// confirmPasswordReset() — standard security hygiene (notify the account
// owner their password changed) via the same Brevo HTML pipeline. Also
// unauthenticated by design: by this point the person has just proven
// control of the account via the one-time reset code, not a session token.
app.post("/api/auth/password-reset/confirm-notify", verifyAppCheck, passwordResetRequestLimiter, async (req, res) => {
  const parsed = PasswordResetConfirmNotifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request." });
  }
  const { subject, html } = buildPasswordChangedEmail();
  await sendBrevoHtmlEmail(parsed.data.email, subject, html);
  res.json({ success: true });
});

// ---- TOTP two-factor authentication (opt-in "extra security") ------------
// users/{uid}/security/mfa_totp holds: an AES-256-GCM-encrypted secret
// (never the plaintext), a pending secret set only during enrollment,
// hashed single-use recovery codes, and a durable (Firestore, not
// in-memory) failed-attempt/lockout counter. firestore.rules locks this
// collection to server/Admin-SDK access only - see MFA_DOC below.
const MFA_DOC = 'mfa_totp';

const getMfaDocRef = (db: FirebaseFirestore.Firestore, uid: string) =>
  db.collection('users').doc(uid).collection('security').doc(MFA_DOC);

// MFA_ENCRYPTION_KEY must be 32 random bytes, base64-encoded (e.g.
// `openssl rand -base64 32`), set on the Cloud Run service. Deliberately a
// hard failure (unlike Brevo's soft-fail) — silently storing an
// unencrypted TOTP secret would be a real security regression, not a
// missed nice-to-have.
const getMfaEncryptionKey = (): Buffer => {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('[MFA] MFA_ENCRYPTION_KEY is not set on this server — TOTP enrollment cannot proceed. Generate one with `openssl rand -base64 32` and set it in the Cloud Run service environment.');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`[MFA] MFA_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}) — generate one with \`openssl rand -base64 32\`.`);
  }
  return key;
};

// A session-scoped, short-lived, HMAC-signed proof that *this session*
// (not just this uid, ever) has cleared a 2FA challenge. Self-verifying —
// no Firestore read needed on every gated request — and deliberately
// reuses MFA_ENCRYPTION_KEY as the HMAC key rather than requiring a new
// secret, since both already carry the same "TOTP-subsystem-only, never
// exposed to the client" sensitivity.
const MFA_SESSION_TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const signMfaSessionToken = (uid: string): string => {
  const expiresAtMs = Date.now() + MFA_SESSION_TOKEN_TTL_MS;
  const payload = `${uid}.${expiresAtMs}`;
  const sig = crypto.createHmac('sha256', getMfaEncryptionKey()).update(payload).digest('hex');
  return `${payload}.${sig}`;
};

const verifyMfaSessionToken = (token: string, uid: string): boolean => {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [tokenUid, expiresAtStr, sig] = parts;
  if (tokenUid !== uid) return false;
  const expiresAtMs = Number(expiresAtStr);
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) return false;
  let expectedSig: string;
  try {
    expectedSig = crypto.createHmac('sha256', getMfaEncryptionKey()).update(`${tokenUid}.${expiresAtStr}`).digest('hex');
  } catch {
    return false;
  }
  const expectedBuf = Buffer.from(expectedSig, 'hex');
  const actualBuf = Buffer.from(sig, 'hex');
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
};

// Keeps the account-level "does this uid have 2FA on" fact (used by the
// cheap per-request gate check in authenticateFirebaseUser) in sync with
// the Firestore record that's the actual source of truth. Best-effort: a
// failure here shouldn't fail the enroll/disable request itself, since the
// Firestore write is what actually matters — it's logged so a stuck claim
// (which would either wrongly gate or wrongly not-gate future requests
// until it's retried) doesn't fail silently.
const setMfaEnabledClaim = async (uid: string, enabled: boolean) => {
  try {
    const existing = await getAuth().getUser(uid);
    await getAuth().setCustomUserClaims(uid, { ...(existing.customClaims || {}), mfaEnabled: enabled });
  } catch (error) {
    console.error(`[MFA] Failed to sync mfaEnabled claim for ${uid} to ${enabled}:`, (error as Error).message);
  }
};

app.get("/api/auth/mfa/status", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
    const db = getDb();
    const snap = await getMfaDocRef(db, user.uid).get();
    const data = snap.exists ? snap.data() : undefined;
    res.json({ enabled: data?.enabled === true, enrolledAt: data?.enrolledAt || null });
  } catch (error: any) {
    console.error("[MFA] status error:", error.message);
    res.status(500).json({ error: "Could not check two-factor status right now." });
  }
});

app.post("/api/auth/mfa/totp/enroll/start", verifyAppCheck, authenticateFirebaseUser, mfaEnrollLimiter, async (req, res) => {
  try {
    const user = requireAuth(req);
    if (!user.email) {
      return res.status(400).json({ error: "This account needs an email address before enabling two-factor authentication." });
    }
    const key = getMfaEncryptionKey();
    const secret = generateTotpSecret();
    const otpauthUri = buildOtpauthUri(secret, user.email);
    const db = getDb();
    // A fresh enroll/start always overwrites any earlier pending secret —
    // only the most recently started enrollment attempt can be confirmed,
    // so an abandoned QR scan can't be confirmed later with a stale code.
    await getMfaDocRef(db, user.uid).set({
      pendingSecretEncrypted: encryptTotpSecret(secret, key),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    res.json({ otpauthUri, secretForManualEntry: secret });
  } catch (error: any) {
    console.error("[MFA] enroll/start error:", error.message);
    res.status(500).json({ error: "Could not start two-factor setup right now." });
  }
});

const MfaEnrollConfirmSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
}).strict();

app.post("/api/auth/mfa/totp/enroll/confirm", verifyAppCheck, authenticateFirebaseUser, mfaEnrollLimiter, async (req, res) => {
  try {
    const parsed = MfaEnrollConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Please enter the 6-digit code from your authenticator app." });
    }
    const user = requireAuth(req);
    const key = getMfaEncryptionKey();
    const db = getDb();
    const docRef = getMfaDocRef(db, user.uid);
    const snap = await docRef.get();
    const data = snap.data();
    if (!data?.pendingSecretEncrypted) {
      return res.status(400).json({ error: "No two-factor setup in progress. Please start again." });
    }
    const secret = decryptTotpSecret(data.pendingSecretEncrypted, key);
    const valid = await verifyTotpCode(secret, parsed.data.code);
    if (!valid) {
      return res.status(400).json({ error: "That code didn't match. Please try again." });
    }

    const recoveryCodes = generateRecoveryCodes();
    const now = new Date().toISOString();
    await docRef.set({
      secretEncrypted: data.pendingSecretEncrypted,
      pendingSecretEncrypted: null,
      enabled: true,
      enrolledAt: now,
      lastVerifiedAt: now,
      recoveryCodesHashed: recoveryCodes.map((code) => ({ hash: hashRecoveryCode(code), usedAt: null })),
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: now,
    }, { merge: true });

    await setMfaEnabledClaim(user.uid, true);

    if (user.email) {
      const { subject, html } = buildMfaEnabledEmail();
      await sendBrevoHtmlEmail(user.email, subject, html);
    }

    // Enrolling proves the user just cleared a real 2FA challenge (the
    // code from their new authenticator) — issue a session token now so
    // they aren't immediately re-challenged by the gate this same
    // request's mfaEnabled claim will start enforcing on their next call.
    // Returned once, at the moment of enrollment, and never again — the
    // server only ever stores their hashes from this point on.
    res.json({ recoveryCodes, mfaSessionToken: signMfaSessionToken(user.uid) });
  } catch (error: any) {
    console.error("[MFA] enroll/confirm error:", error.message);
    res.status(500).json({ error: "Could not confirm two-factor setup right now." });
  }
});

const MfaCodeOrRecoverySchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits").optional(),
  recoveryCode: z.string().min(8).max(20).optional(),
}).strict().refine((d) => Boolean(d.code) !== Boolean(d.recoveryCode), {
  message: "Provide either a 6-digit code or a recovery code, not both.",
});

interface MfaVerifyResult {
  ok: boolean;
  reason?: 'locked' | 'not_enrolled' | 'invalid';
}

// Shared by verify-at-signin and disable below — both need the identical
// "check lockout, verify a code or a single-use recovery code, record the
// attempt" logic, differing only in what happens after a success. The
// failed-attempt/lockout counters live in Firestore (not express-rate-
// limit's in-memory store) specifically so they survive Cloud Run scaling
// an instance to zero or running more than one instance at once.
const verifyMfaAttempt = async (
  db: FirebaseFirestore.Firestore,
  uid: string,
  input: { code?: string; recoveryCode?: string }
): Promise<MfaVerifyResult> => {
  const docRef = getMfaDocRef(db, uid);
  // A transaction, not a plain get-then-set, so two concurrent attempts
  // (e.g. an attacker script racing requests) can't both read the same
  // failedAttempts count before either write lands and slip past the
  // lockout threshold.
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const data = snap.data();
    if (!data?.enabled || !data.secretEncrypted) {
      return { ok: false, reason: 'not_enrolled' };
    }
    if (isTotpLockedOut(data.lockedUntil || null)) {
      return { ok: false, reason: 'locked' };
    }

    let success = false;
    let recoveryCodesHashed: { hash: string; usedAt: string | null }[] | undefined = data.recoveryCodesHashed;
    if (input.code) {
      const key = getMfaEncryptionKey();
      const secret = decryptTotpSecret(data.secretEncrypted, key);
      success = await verifyTotpCode(secret, input.code);
    } else if (input.recoveryCode) {
      const hash = hashRecoveryCode(input.recoveryCode);
      const matchIndex = (recoveryCodesHashed || []).findIndex((rc) => rc.hash === hash && rc.usedAt === null);
      if (matchIndex !== -1) {
        success = true;
        const now = new Date().toISOString();
        recoveryCodesHashed = recoveryCodesHashed!.map((rc, i) => (i === matchIndex ? { ...rc, usedAt: now } : rc));
      }
    }

    const lockout = nextLockoutState(data.failedAttempts || 0, success);
    const now = new Date().toISOString();
    tx.set(docRef, {
      failedAttempts: lockout.failedAttempts,
      lockedUntil: lockout.lockedUntil,
      ...(success ? { lastVerifiedAt: now } : {}),
      ...(recoveryCodesHashed ? { recoveryCodesHashed } : {}),
      updatedAt: now,
    }, { merge: true });

    // Deterministic signal only (attempt count, lockout state) — never a
    // record of what was guessed or any inference about the person.
    if (!success) {
      console.warn(`[MFA] Failed verification attempt for uid ${uid} (failedAttempts=${lockout.failedAttempts}${lockout.lockedUntil ? ', now locked out until ' + lockout.lockedUntil : ''}).`);
    }

    return success ? { ok: true } : { ok: false, reason: 'invalid' };
  });
};

app.post("/api/auth/mfa/totp/verify-at-signin", verifyAppCheck, authenticateFirebaseUser, mfaSigninVerifyLimiter, async (req, res) => {
  try {
    const parsed = MfaCodeOrRecoverySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Provide either a 6-digit code or a recovery code." });
    }
    const user = requireAuth(req);
    const db = getDb();
    const result = await verifyMfaAttempt(db, user.uid, parsed.data);
    if (!result.ok) {
      if (result.reason === 'locked') {
        return res.status(429).json({ error: "Too many incorrect attempts. Please wait a few minutes and try again." });
      }
      // Deliberately the same generic 401 whether the code was wrong or
      // 2FA somehow isn't enrolled — no reason to tell an attacker which.
      return res.status(401).json({ error: "That code didn't match. Please try again." });
    }
    res.json({ verified: true, mfaSessionToken: signMfaSessionToken(user.uid) });
  } catch (error: any) {
    console.error("[MFA] verify-at-signin error:", error.message);
    res.status(500).json({ error: "Could not verify your code right now." });
  }
});

app.post("/api/auth/mfa/totp/disable", verifyAppCheck, authenticateFirebaseUser, mfaEnrollLimiter, async (req, res) => {
  try {
    const parsed = MfaCodeOrRecoverySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Provide either a 6-digit code or a recovery code." });
    }
    const user = requireAuth(req);
    const db = getDb();
    const result = await verifyMfaAttempt(db, user.uid, parsed.data);
    if (!result.ok) {
      if (result.reason === 'not_enrolled') {
        return res.status(400).json({ error: "Two-factor authentication isn't turned on." });
      }
      if (result.reason === 'locked') {
        return res.status(429).json({ error: "Too many incorrect attempts. Please wait a few minutes and try again." });
      }
      return res.status(401).json({ error: "That code didn't match. Please try again." });
    }

    await getMfaDocRef(db, user.uid).set({
      enabled: false,
      secretEncrypted: null,
      pendingSecretEncrypted: null,
      recoveryCodesHashed: [],
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    await setMfaEnabledClaim(user.uid, false);
    // Revoke every refresh token issued before this moment. Without this,
    // an already-open session elsewhere (e.g. an attacker's, if this
    // disable itself was unauthorized) would keep working indefinitely on
    // its existing ID token even after 2FA protection is removed — this
    // forces every session, including this one, to re-authenticate.
    await getAuth().revokeRefreshTokens(user.uid);

    // Sent regardless of who triggered this — a security notice for a
    // change the account owner didn't make is exactly when this matters
    // most, same reasoning as the password-changed notice above.
    if (user.email) {
      const { subject, html } = buildMfaDisabledEmail();
      await sendBrevoHtmlEmail(user.email, subject, html);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("[MFA] disable error:", error.message);
    res.status(500).json({ error: "Could not turn off two-factor authentication right now." });
  }
});

// ============================================================================
// Free/Premium Entitlements (server-authoritative)
// ============================================================================
// See entitlements.ts for the pure model this wraps with I/O. The single
// source of truth is users/{uid}/entitlements/status, which firestore.rules
// makes `allow write: if false` - only the Admin SDK (this file) ever
// writes it, so nothing here ever needs to distrust its own read. Every
// route that gates on Premium/usage quotas goes through
// getEntitlementRecord/checkAndReserveCapability, never a client-supplied
// field (that was the actual bug this system replaces - see the AA rule
// comment in firestore.rules).

const getEntitlementRecord = async (uid: string): Promise<EntitlementRecord> => {
  const db = getDb();
  const snap = await db.collection("users").doc(uid).collection("entitlements").doc("status").get();
  return getEffectiveEntitlement(snap.exists ? (snap.data() as Partial<EntitlementRecord>) : null);
};

const usageCounterTodayKey = () => new Date().toISOString().slice(0, 10);
// Same 'month-YYYY-MM' key shape sendTwilioMessage's pre-existing
// SMS aggregate-cap counters already use - one convention for every
// monthly-reset counter in this codebase, not a second one invented here.
const usageCounterMonthKey = () => `month-${usageCounterTodayKey().slice(0, 7)}`;

const usageCounterRef = (db: FirebaseFirestore.Firestore, uid: string, resetPeriod: 'daily' | 'monthly' | undefined) => {
  const key = resetPeriod === 'monthly' ? usageCounterMonthKey() : usageCounterTodayKey();
  return db.collection("users").doc(uid).collection("usage_counters").doc(key);
};

const getCapabilityUsage = async (uid: string, capability: CapabilityId, plan: EntitlementPlan): Promise<number> => {
  const db = getDb();
  const cap = getCapability(plan, capability);
  const usageSnap = await usageCounterRef(db, uid, cap.resetPeriod).get();
  return Number(usageSnap.data()?.[capability]) || 0;
};

// Increments a capability's usage-period counter by `amount` (1 for a
// plain event count, or the real elapsed minutes for a duration-based
// capability like nova_voice_minutes) without checking/enforcing a
// limit itself - the caller decides when recording is appropriate (see
// nova_voice_minutes, which is checked at session START but only
// recorded at session END, once the real duration is known).
const recordCapabilityUsage = async (uid: string, capability: CapabilityId, plan: EntitlementPlan, amount: number): Promise<void> => {
  if (amount <= 0) return;
  const db = getDb();
  const cap = getCapability(plan, capability);
  await usageCounterRef(db, uid, cap.resetPeriod).set({ [capability]: FieldValue.increment(amount), updatedAt: new Date().toISOString() }, { merge: true });
};

// Checks this period's usage of `capability` against the account's plan
// and, if allowed, immediately increments the counter by 1. This is a
// best-effort fair-use guard, not a billing-grade lock: two requests
// racing in the same instant could both pass, which is an accepted
// trade-off (the goal is stopping runaway/abusive usage, not metering to
// the exact request - "soft quotas, generous for legitimate users").
// Consuming the quota unconditionally on allow, rather than only after a
// downstream AI call succeeds, is the same simplification the existing
// express-rate-limit limiters in this file already make. Not used for
// nova_voice_minutes - see checkCapabilityQuota + recordCapabilityUsage
// for that capability's check-at-start/record-at-end shape instead.
const checkAndReserveCapability = async (
  uid: string,
  capability: CapabilityId
): Promise<{ allowed: boolean; limit: number | null; used: number; plan: EntitlementPlan }> => {
  const record = await getEntitlementRecord(uid);
  const plan = effectivePlan(record);
  const usedThisPeriod = await getCapabilityUsage(uid, capability, plan);
  const result = checkQuota(plan, capability, usedThisPeriod);
  if (result.allowed) {
    await recordCapabilityUsage(uid, capability, plan, 1);
  }
  return { ...result, plan };
};

// Read-only version of the check above, for a capability whose usage is
// recorded separately (nova_voice_minutes: checked before a session is
// allowed to start, recorded only once the session actually ends with a
// real duration - see the Nova Live WebSocket handler).
const checkCapabilityQuota = async (
  uid: string,
  capability: CapabilityId
): Promise<{ allowed: boolean; limit: number | null; used: number; plan: EntitlementPlan }> => {
  const record = await getEntitlementRecord(uid);
  const plan = effectivePlan(record);
  const usedThisPeriod = await getCapabilityUsage(uid, capability, plan);
  const result = checkQuota(plan, capability, usedThisPeriod);
  return { ...result, plan };
};

app.get("/api/entitlements/me", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = (req as any).user?.uid;
    if (!uid) throw new Error("Unauthorized.");
    const record = await getEntitlementRecord(uid);
    const plan = effectivePlan(record);
    const db = getDb();
    const [dailySnap, monthlySnap] = await Promise.all([
      db.collection("users").doc(uid).collection("usage_counters").doc(usageCounterTodayKey()).get(),
      db.collection("users").doc(uid).collection("usage_counters").doc(usageCounterMonthKey()).get(),
    ]);
    const dailyUsage = dailySnap.data() || {};
    const monthlyUsage = monthlySnap.data() || {};
    const capabilities: Record<string, { enabled: boolean; limit: number | null; resetPeriod?: string; unit?: string; used: number }> = {};
    (['nova_text', 'nova_voice', 'nova_voice_minutes', 'diagnose', 'exports', 'resentment_analysis', 'executive_report', 'sms_nudges', 'nova_manager_coach'] as CapabilityId[]).forEach((id) => {
      const cap = getCapability(plan, id);
      const usageData = cap.resetPeriod === 'monthly' ? monthlyUsage : dailyUsage;
      capabilities[id] = { enabled: cap.enabled, limit: cap.limit, resetPeriod: cap.resetPeriod, unit: cap.unit, used: Number(usageData[id]) || 0 };
    });
    res.json({ plan, status: record.status, billingSource: record.billingSource, entitlementEnd: record.entitlementEnd, renewalDate: record.renewalDate, cancelAtPeriodEnd: record.cancelAtPeriodEnd, capabilities });
  } catch (err: any) {
    res.status(err.message?.includes("Unauthorized") ? 401 : 500).json({ error: err.message });
  }
});

// Data-driven pricing/tier matrix for the pricing page - reads entirely
// from entitlements.ts's PLAN_PRICING/CAPABILITIES so the page can never
// drift from what checkQuota/getCapability actually enforce. Behind
// authenticateFirebaseUser like every other route in this file (every
// visitor already has an anonymous Firebase session by the time the app
// renders - see src/lib/auth.tsx - so this doesn't gate the pricing page
// behind a real sign-up). legacy_premium is deliberately excluded - it's
// not a plan a visitor can choose, see entitlements.ts.
app.get("/api/entitlements/pricing", verifyAppCheck, authenticateFirebaseUser, async (_req, res) => {
  try {
    const plans = PURCHASABLE_PLANS.map((plan) => ({
      plan,
      pricing: PLAN_PRICING[plan as Exclude<EntitlementPlan, 'legacy_premium'>],
      annualSavingsGbp: annualSavingsGbp(plan as Exclude<EntitlementPlan, 'legacy_premium'>),
      mostPopular: plan === 'performance' && PERFORMANCE_IS_MOST_POPULAR,
      capabilities: Object.fromEntries(
        (Object.keys(CAPABILITIES) as CapabilityId[]).map((id) => [id, getCapability(plan, id)])
      ),
    }));
    res.json({ plans });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Third-Party OAuth Integrations (Slack, Jira, Asana, Calendly, Monday.com)
// ============================================================================
// Each provider requires its own registered OAuth app (Client ID + Secret),
// configured via environment variables. See .env.example for the full list
// and docs/INTEGRATIONS_SETUP.md for exact redirect URIs and scopes to
// register with each provider. Google is handled separately via Firebase Auth
// (see src/lib/auth.tsx) and does not go through this module.

type OAuthTokenStyle = "form" | "json";

interface OAuthProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  tokenStyle: OAuthTokenStyle;
  // Extra static query params always sent on the authorize redirect (e.g. Atlassian's audience/prompt).
  extraAuthorizeParams?: Record<string, string>;
  // Scope value sent as `scope` (bot/app-level scopes for Slack; regular scopes for others).
  scope?: string;
  // Slack-specific: user-level scopes sent as a separate `user_scope` param.
  userScope?: string;
  // Extracts the token fields from that provider's token-endpoint JSON response,
  // since Slack nests the user token under `authed_user` while others return it flat.
  extractTokens: (body: any) => { accessToken: string | null; refreshToken: string | null; expiresIn: number | null };
}

const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  slack: {
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
    tokenStyle: "form",
    userScope: "dnd:write,dnd:read,users.profile:write,users:read,channels:read,groups:read,im:read,mpim:read,channels:history,groups:history,im:history,mpim:history,chat:write",
    extractTokens: (body) => ({
      accessToken: body?.authed_user?.access_token || null,
      refreshToken: body?.authed_user?.refresh_token || null,
      expiresIn: body?.authed_user?.expires_in || null,
    }),
  },
  jira: {
    authorizeUrl: "https://auth.atlassian.com/authorize",
    tokenUrl: "https://auth.atlassian.com/oauth/token",
    clientIdEnv: "JIRA_CLIENT_ID",
    clientSecretEnv: "JIRA_CLIENT_SECRET",
    tokenStyle: "json",
    scope: "read:jira-work read:jira-user offline_access",
    extraAuthorizeParams: { audience: "api.atlassian.com", prompt: "consent" },
    extractTokens: (body) => ({
      accessToken: body?.access_token || null,
      refreshToken: body?.refresh_token || null,
      expiresIn: body?.expires_in || null,
    }),
  },
  asana: {
    authorizeUrl: "https://app.asana.com/-/oauth_authorize",
    tokenUrl: "https://app.asana.com/-/oauth_token",
    clientIdEnv: "ASANA_CLIENT_ID",
    clientSecretEnv: "ASANA_CLIENT_SECRET",
    tokenStyle: "form",
    extractTokens: (body) => ({
      accessToken: body?.access_token || null,
      refreshToken: body?.refresh_token || null,
      expiresIn: body?.expires_in || null,
    }),
  },
  calendly: {
    authorizeUrl: "https://auth.calendly.com/oauth/authorize",
    tokenUrl: "https://auth.calendly.com/oauth/token",
    clientIdEnv: "CALENDLY_CLIENT_ID",
    clientSecretEnv: "CALENDLY_CLIENT_SECRET",
    tokenStyle: "form",
    extractTokens: (body) => ({
      accessToken: body?.access_token || null,
      refreshToken: body?.refresh_token || null,
      expiresIn: body?.expires_in || null,
    }),
  },
  monday: {
    authorizeUrl: "https://auth.monday.com/oauth2/authorize",
    tokenUrl: "https://auth.monday.com/oauth2/token",
    clientIdEnv: "MONDAY_CLIENT_ID",
    clientSecretEnv: "MONDAY_CLIENT_SECRET",
    tokenStyle: "form",
    scope: "me:read boards:read",
    extractTokens: (body) => ({
      accessToken: body?.access_token || null,
      refreshToken: body?.refresh_token || null,
      expiresIn: body?.expires_in || null,
    }),
  },
};

// Stateless, signed `state` param: binds the OAuth callback back to the Firebase
// user who initiated it (a plain browser redirect can't carry an Authorization
// header, so this is how we know whose Firestore doc to write tokens to) and
// prevents CSRF/replay by signing + expiring it. Requires OAUTH_STATE_SECRET.
const signOAuthState = (uid: string, service: string): string => {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error("OAUTH_STATE_SECRET is not configured on the server.");
  }
  const payload = JSON.stringify({ uid, service, exp: Date.now() + 10 * 60 * 1000 });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
};

const verifyOAuthState = (state: string, expectedService: string): { uid: string } => {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error("OAUTH_STATE_SECRET is not configured on the server.");
  }
  const [payloadB64, sig] = String(state || "").split(".");
  if (!payloadB64 || !sig) {
    throw new Error("Malformed state parameter.");
  }
  const expectedSig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    throw new Error("State signature mismatch — possible CSRF attempt.");
  }
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
  if (payload.service !== expectedService) {
    throw new Error("State was issued for a different service.");
  }
  if (Date.now() > payload.exp) {
    throw new Error("State has expired. Please try connecting again.");
  }
  return { uid: payload.uid };
};

const getOAuthRedirectUri = (service: string): string => {
  const base = (process.env.APP_URL || "").replace(/\/$/, "");
  if (!base) {
    throw new Error("APP_URL is not configured on the server — required to build OAuth redirect URIs.");
  }
  return `${base}/api/integrations/callback/${service}`;
};

// Step 1: authenticated SPA call — returns the URL to redirect the browser to.
app.post("/api/integrations/:service/connect", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const service = req.params.service;
    const provider = OAUTH_PROVIDERS[service];
    if (!provider) {
      return res.status(404).json({ error: `Unknown integration: ${service}` });
    }
    const clientId = process.env[provider.clientIdEnv];
    if (!clientId) {
      return res.status(503).json({
        error: `${service} integration is not configured yet. Missing ${provider.clientIdEnv} on the server.`,
      });
    }
    const uid = requireAuth(req).uid;
    const state = signOAuthState(uid, service);
    const redirectUri = getOAuthRedirectUri(service);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      ...(provider.scope ? { scope: provider.scope } : {}),
      ...(provider.userScope ? { user_scope: provider.userScope } : {}),
      ...(provider.extraAuthorizeParams || {}),
    });

    res.json({ authorizeUrl: `${provider.authorizeUrl}?${params.toString()}` });
  } catch (err: any) {
    console.error(`[Integrations] connect error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Step 2: provider redirects the browser here after user consent. Not behind
// authenticateFirebaseUser — the browser can't attach a Bearer header on a
// top-level navigation, so the signed `state` param is what verifies identity.
app.get("/api/integrations/callback/:service", async (req, res) => {
  const service = req.params.service;
  const appBase = (process.env.APP_URL || "").replace(/\/$/, "");
  const failRedirect = (reason: string) =>
    res.redirect(`${appBase}/?integration=${service}&status=error&reason=${encodeURIComponent(reason)}`);

  try {
    const provider = OAUTH_PROVIDERS[service];
    if (!provider) return failRedirect("unknown_service");

    const { code, state, error: providerError } = req.query;
    if (providerError) return failRedirect(String(providerError));
    if (!code || typeof code !== "string") return failRedirect("missing_code");

    const { uid } = verifyOAuthState(String(state || ""), service);

    const clientId = process.env[provider.clientIdEnv];
    const clientSecret = process.env[provider.clientSecretEnv];
    if (!clientId || !clientSecret) return failRedirect("not_configured");

    const redirectUri = getOAuthRedirectUri(service);
    const tokenParams = {
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    };

    let tokenResponse: Response;
    if (provider.tokenStyle === "json") {
      tokenResponse = await fetch(provider.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tokenParams),
      });
    } else {
      tokenResponse = await fetch(provider.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(tokenParams as Record<string, string>).toString(),
      });
    }

    const tokenBody = await tokenResponse.json();
    if (!tokenResponse.ok || tokenBody?.ok === false || tokenBody?.error) {
      console.error(`[Integrations] ${service} token exchange failed:`, tokenBody);
      return failRedirect("token_exchange_failed");
    }

    const { accessToken, refreshToken, expiresIn } = provider.extractTokens(tokenBody);
    if (!accessToken) {
      console.error(`[Integrations] ${service} response had no access token:`, tokenBody);
      return failRedirect("no_access_token");
    }

    const db = getDb();
    const now = new Date().toISOString();

    // Raw tokens: locked down in firestore.rules, never client-readable. Admin
    // SDK writes here regardless of rules (rules only govern client SDK access).
    await db.collection("users").doc(uid).collection("integration_tokens").doc(service).set({
      accessToken,
      refreshToken,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      updatedAt: now,
    });

    // Redacted status doc: client-readable, contains no secrets.
    await db.collection("users").doc(uid).collection("integrations").doc(service).set({
      service,
      connected: true,
      connectedAt: now,
    });

    res.redirect(`${appBase}/?integration=${service}&status=connected`);
  } catch (err: any) {
    console.error(`[Integrations] ${service} callback error:`, err.message);
    return failRedirect("internal_error");
  }
});

// Returns connection status (never raw tokens) for every known provider.
app.get("/api/integrations/status", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const db = getDb();
    const snap = await db.collection("users").doc(uid).collection("integrations").get();
    const statusByService: Record<string, { connected: boolean; connectedAt?: string }> = {};
    snap.forEach((doc) => {
      const data = doc.data();
      statusByService[doc.id] = { connected: !!data.connected, connectedAt: data.connectedAt };
    });
    for (const service of Object.keys(OAUTH_PROVIDERS)) {
      if (!statusByService[service]) statusByService[service] = { connected: false };
    }
    res.json({ integrations: statusByService });
  } catch (err: any) {
    console.error("[Integrations] status error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/integrations/:service/disconnect", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const service = req.params.service;
    if (!OAUTH_PROVIDERS[service]) {
      return res.status(404).json({ error: `Unknown integration: ${service}` });
    }
    const uid = requireAuth(req).uid;
    const db = getDb();
    await db.collection("users").doc(uid).collection("integration_tokens").doc(service).delete();
    await db.collection("users").doc(uid).collection("integrations").doc(service).set({
      service,
      connected: false,
      disconnectedAt: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Integrations] disconnect error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Real Signals: Slack message-volume (slow incremental scan)
// ============================================================================
// Slack rate-limits conversations.history to 1 request/minute for apps outside
// the Marketplace (as of May 2025), so a full workspace scan cannot happen
// synchronously. Instead this advances one conversation per "tick", called
// opportunistically from the client (e.g. on app load). A full pass through
// all of a user's conversations produces one complete 7-day snapshot; between
// full passes, the in-progress counts are provisional. This is a genuine
// signal that builds up over real usage, not an instant one-time read.
const SLACK_TICK_MIN_INTERVAL_MS = 60 * 1000;

app.post("/api/signals/slack/tick", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const db = getDb();

    const tokenDoc = await db.collection("users").doc(uid).collection("integration_tokens").doc("slack").get();
    if (!tokenDoc.exists) {
      return res.status(404).json({ error: "Slack is not connected." });
    }
    const slackToken = tokenDoc.data()?.accessToken;
    if (!slackToken) {
      return res.status(404).json({ error: "Slack is not connected." });
    }

    const signalRef = db.collection("users").doc(uid).collection("live_signals").doc("slack");
    const signalDoc = await signalRef.get();
    let state = signalDoc.exists ? signalDoc.data()! : null;

    const now = Date.now();
    if (state?.lastTickAt && now - new Date(state.lastTickAt).getTime() < SLACK_TICK_MIN_INTERVAL_MS) {
      // Respecting Slack's rate limit - not an error, just nothing to do yet.
      return res.json({ ticked: false, reason: "rate_limited", state: redactSlackState(state) });
    }

    const slackFetch = async (method: string, params: Record<string, string>) => {
      const url = new URL(`https://slack.com/api/${method}`);
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${slackToken}` } });
      return r.json();
    };

    // First-ever tick (or after a full cycle): establish who we are and the
    // conversation list to scan, and roll any in-progress counts into the
    // last-completed snapshot.
    if (!state || !state.conversationIds || state.scanIndex >= state.conversationIds.length) {
      let selfUserId = state?.selfUserId;
      if (!selfUserId) {
        const authTest = await slackFetch("auth.test", {});
        if (!authTest.ok) {
          return res.status(502).json({ error: "Could not verify Slack identity.", detail: authTest.error });
        }
        selfUserId = authTest.user_id;
      }

      const convList = await slackFetch("conversations.list", {
        types: "public_channel,private_channel,mpim,im",
        limit: "100",
        exclude_archived: "true",
      });
      if (!convList.ok) {
        return res.status(502).json({ error: "Could not list Slack conversations.", detail: convList.error });
      }
      const conversationIds: string[] = (convList.channels || []).map((c: any) => c.id);

      const completed = state ? {
        totalMessages7d: state.inProgressTotal || 0,
        afterHoursMessages7d: state.inProgressAfterHours || 0,
        weekendMessages7d: state.inProgressWeekend || 0,
        completedAt: new Date().toISOString(),
      } : null;

      state = {
        selfUserId,
        conversationIds,
        scanIndex: 0,
        inProgressTotal: 0,
        inProgressAfterHours: 0,
        inProgressWeekend: 0,
        lastCompleted: completed || state?.lastCompleted || null,
        lastTickAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
      };

      if (conversationIds.length === 0) {
        await signalRef.set(state);
        return res.json({ ticked: true, note: "No conversations to scan yet.", state: redactSlackState(state) });
      }
    }

    const conversationId = state.conversationIds[state.scanIndex];
    const oldestTs = Math.floor((now - 7 * 24 * 60 * 60 * 1000) / 1000).toString();
    const history = await slackFetch("conversations.history", {
      channel: conversationId,
      oldest: oldestTs,
      limit: "200",
    });

    if (history.ok) {
      const messages = history.messages || [];
      for (const msg of messages) {
        if (msg.user !== state.selfUserId) continue;
        state.inProgressTotal += 1;
        const msgDate = new Date(parseFloat(msg.ts) * 1000);
        const hour = msgDate.getUTCHours();
        const day = msgDate.getUTCDay(); // 0 = Sunday, 6 = Saturday
        if (hour < 8 || hour >= 18) state.inProgressAfterHours += 1;
        if (day === 0 || day === 6) state.inProgressWeekend += 1;
      }
    }
    // If a single conversation's history call fails (e.g. missing scope for
    // that conversation type), skip it rather than aborting the whole scan.

    state.scanIndex += 1;
    state.lastTickAt = new Date(now).toISOString();
    state.updatedAt = new Date(now).toISOString();

    await signalRef.set(state);
    res.json({ ticked: true, state: redactSlackState(state) });
  } catch (err: any) {
    console.error("[Signals] slack tick error:", err.message);
    res.status(500).json({ error: "Could not update Slack signal." });
  }
});

app.get("/api/signals/slack", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const db = getDb();
    const signalDoc = await db.collection("users").doc(uid).collection("live_signals").doc("slack").get();
    if (!signalDoc.exists) {
      return res.json({ state: null });
    }
    res.json({ state: redactSlackState(signalDoc.data()!) });
  } catch (err: any) {
    console.error("[Signals] slack read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Returns a currently-valid access token for the given service, refreshing
// it first if it's expired (or close to expiring). Without this, any
// integration relying on short-lived OAuth tokens (Jira and Asana tokens
// both expire in roughly an hour) would silently stop working the first
// time someone used it more than an hour after connecting.
async function getValidAccessToken(uid: string, service: string): Promise<string | null> {
  const db = getDb();
  const tokenRef = db.collection("users").doc(uid).collection("integration_tokens").doc(service);
  const tokenDoc = await tokenRef.get();
  if (!tokenDoc.exists) return null;
  const data = tokenDoc.data()!;

  const expiringSoon = data.expiresAt && new Date(data.expiresAt).getTime() < Date.now() + 60 * 1000;
  if (!expiringSoon) return data.accessToken || null;

  if (!data.refreshToken) return data.accessToken || null; // Nothing to refresh with - let the caller's API call fail naturally.

  const provider = OAUTH_PROVIDERS[service];
  const clientId = process.env[provider.clientIdEnv];
  const clientSecret = process.env[provider.clientSecretEnv];
  if (!clientId || !clientSecret) return data.accessToken || null;

  try {
    const refreshParams = {
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: data.refreshToken,
    };
    const tokenResponse = provider.tokenStyle === "json"
      ? await fetch(provider.tokenUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(refreshParams) })
      : await fetch(provider.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(refreshParams).toString() });

    const body = await tokenResponse.json();
    if (!tokenResponse.ok || body?.error) {
      console.error(`[Integrations] ${service} token refresh failed:`, body);
      return data.accessToken || null;
    }
    const { accessToken, refreshToken, expiresIn } = provider.extractTokens(body);
    if (!accessToken) return data.accessToken || null;

    await tokenRef.set({
      accessToken,
      refreshToken: refreshToken || data.refreshToken, // Some providers don't rotate the refresh token.
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return accessToken;
  } catch (e) {
    console.error(`[Integrations] ${service} token refresh error:`, e);
    return data.accessToken || null;
  }
}

// ============================================================================
// Real Signals: Jira (genuinely fetched, not just an unused stored token)
// ============================================================================

app.post("/api/signals/jira/refresh", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const accessToken = await getValidAccessToken(uid, "jira");
    if (!accessToken) {
      return res.status(404).json({ error: "Jira is not connected." });
    }

    const resourcesRes = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    const resources = await resourcesRes.json();
    if (!resourcesRes.ok || !Array.isArray(resources) || resources.length === 0) {
      return res.status(502).json({ error: "Could not find an accessible Jira site for this account." });
    }
    const cloudId = resources[0].id;
    const siteName = resources[0].name || resources[0].url;

    const jql = "assignee = currentUser() AND resolution = Unresolved ORDER BY duedate ASC";
    const searchRes = await fetch(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=100&fields=duedate,priority,status`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
    );
    const searchBody = await searchRes.json();
    if (!searchRes.ok) {
      return res.status(502).json({ error: "Could not fetch Jira issues.", detail: searchBody?.errorMessages });
    }

    const issues = searchBody.issues || [];
    const todayStr = new Date().toISOString().split("T")[0];
    const overdueCount = issues.filter((i: any) => i.fields?.duedate && i.fields.duedate < todayStr).length;
    const highPriorityCount = issues.filter((i: any) =>
      ["Highest", "High"].includes(i.fields?.priority?.name)
    ).length;

    const signal = {
      siteName,
      totalOpenIssues: issues.length,
      overdueIssues: overdueCount,
      highPriorityOpen: highPriorityCount,
      updatedAt: new Date().toISOString(),
    };

    const db = getDb();
    await db.collection("users").doc(uid).collection("live_signals").doc("jira").set(signal);

    res.json({ refreshed: true, state: signal });
  } catch (err: any) {
    console.error("[Signals] jira refresh error:", err.message);
    res.status(500).json({ error: "Could not refresh Jira data." });
  }
});

app.get("/api/signals/jira", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const db = getDb();
    const signalDoc = await db.collection("users").doc(uid).collection("live_signals").doc("jira").get();
    if (!signalDoc.exists) {
      return res.json({ state: null });
    }
    res.json({ state: signalDoc.data() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Real Signals: Asana (genuinely fetched, not just an unused stored token)
// ============================================================================

app.post("/api/signals/asana/refresh", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const accessToken = await getValidAccessToken(uid, "asana");
    if (!accessToken) {
      return res.status(404).json({ error: "Asana is not connected." });
    }

    const meRes = await fetch("https://app.asana.com/api/1.0/users/me?opt_fields=name,workspaces.gid", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meBody = await meRes.json();
    if (!meRes.ok || !meBody?.data) {
      return res.status(502).json({ error: "Could not verify Asana identity.", detail: meBody?.errors });
    }
    const workspaceGid = meBody.data.workspaces?.[0]?.gid;
    if (!workspaceGid) {
      return res.status(502).json({ error: "No accessible Asana workspace found." });
    }

    const tasksRes = await fetch(
      `https://app.asana.com/api/1.0/tasks?assignee=me&workspace=${workspaceGid}&completed_since=now&opt_fields=due_on,name&limit=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const tasksBody = await tasksRes.json();
    if (!tasksRes.ok) {
      return res.status(502).json({ error: "Could not fetch Asana tasks.", detail: tasksBody?.errors });
    }

    const tasks = tasksBody.data || [];
    const todayStr = new Date().toISOString().split("T")[0];
    const overdueCount = tasks.filter((t: any) => t.due_on && t.due_on < todayStr).length;

    const signal = {
      totalIncompleteTasks: tasks.length,
      overdueTasks: overdueCount,
      updatedAt: new Date().toISOString(),
    };

    const db = getDb();
    await db.collection("users").doc(uid).collection("live_signals").doc("asana").set(signal);

    res.json({ refreshed: true, state: signal });
  } catch (err: any) {
    console.error("[Signals] asana refresh error:", err.message);
    res.status(500).json({ error: "Could not refresh Asana data." });
  }
});

app.get("/api/signals/asana", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const db = getDb();
    const signalDoc = await db.collection("users").doc(uid).collection("live_signals").doc("asana").get();
    if (!signalDoc.exists) {
      return res.json({ state: null });
    }
    res.json({ state: signalDoc.data() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Real Signals: Monday.com (genuinely fetched, not just an unused stored token)
// ============================================================================
// Monday's GraphQL API doesn't have a single "my open items" concept the way
// Jira/Asana do, since assignment lives inside per-board "person" columns
// that vary by board. Rather than guess at column IDs (which would be
// fragile and board-specific), this counts genuinely real signals that work
// consistently across any board layout: total active items across accessible
// boards, and how many have a date-type column value already in the past.

app.post("/api/signals/monday/refresh", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const accessToken = await getValidAccessToken(uid, "monday");
    if (!accessToken) {
      return res.status(404).json({ error: "Monday.com is not connected." });
    }

    const query = `query {
      boards (limit: 15, order_by: used_at) {
        id
        name
        items_page (limit: 50) {
          items {
            id
            column_values (types: [date]) {
              text
            }
          }
        }
      }
    }`;

    const gqlRes = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "API-Version": "2024-10" },
      body: JSON.stringify({ query }),
    });
    const gqlBody = await gqlRes.json();
    if (!gqlRes.ok || gqlBody.errors) {
      return res.status(502).json({ error: "Could not fetch Monday.com boards.", detail: gqlBody.errors });
    }

    const boards = gqlBody.data?.boards || [];
    const todayStr = new Date().toISOString().split("T")[0];
    let totalItems = 0;
    let overdueItems = 0;
    for (const board of boards) {
      const items = board.items_page?.items || [];
      totalItems += items.length;
      for (const item of items) {
        const hasOverdueDate = (item.column_values || []).some((cv: any) => cv.text && cv.text < todayStr);
        if (hasOverdueDate) overdueItems++;
      }
    }

    const signal = {
      boardsScanned: boards.length,
      totalActiveItems: totalItems,
      overdueItems,
      updatedAt: new Date().toISOString(),
    };

    const db = getDb();
    await db.collection("users").doc(uid).collection("live_signals").doc("monday").set(signal);

    res.json({ refreshed: true, state: signal });
  } catch (err: any) {
    console.error("[Signals] monday refresh error:", err.message);
    res.status(500).json({ error: "Could not refresh Monday.com data." });
  }
});

app.get("/api/signals/monday", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const db = getDb();
    const signalDoc = await db.collection("users").doc(uid).collection("live_signals").doc("monday").get();
    if (!signalDoc.exists) {
      return res.json({ state: null });
    }
    res.json({ state: signalDoc.data() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Real Signals: Calendly (genuinely fetched, not just an unused stored token)
// ============================================================================

app.post("/api/signals/calendly/refresh", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const accessToken = await getValidAccessToken(uid, "calendly");
    if (!accessToken) {
      return res.status(404).json({ error: "Calendly is not connected." });
    }

    const meRes = await fetch("https://api.calendly.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meBody = await meRes.json();
    if (!meRes.ok || !meBody?.resource?.uri) {
      return res.status(502).json({ error: "Could not verify Calendly identity.", detail: meBody?.message });
    }
    const userUri = meBody.resource.uri;

    const now = new Date();
    const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const eventsUrl = new URL("https://api.calendly.com/scheduled_events");
    eventsUrl.searchParams.set("user", userUri);
    eventsUrl.searchParams.set("status", "active");
    eventsUrl.searchParams.set("min_start_time", now.toISOString());
    eventsUrl.searchParams.set("max_start_time", sevenDaysOut.toISOString());
    eventsUrl.searchParams.set("count", "100");

    const eventsRes = await fetch(eventsUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const eventsBody = await eventsRes.json();
    if (!eventsRes.ok) {
      return res.status(502).json({ error: "Could not fetch Calendly events.", detail: eventsBody?.message });
    }

    const events = eventsBody.collection || [];
    let totalMinutes = 0;
    let backToBackCount = 0;
    const starts = events
      .map((e: any) => ({ start: new Date(e.start_time).getTime(), end: new Date(e.end_time).getTime() }))
      .sort((a: any, b: any) => a.start - b.start);
    for (let i = 0; i < starts.length; i++) {
      totalMinutes += (starts[i].end - starts[i].start) / 60000;
      if (i > 0 && starts[i].start - starts[i - 1].end <= 5 * 60000) backToBackCount++;
    }

    const signal = {
      upcomingBookings7d: events.length,
      bookedHours7d: Math.round((totalMinutes / 60) * 10) / 10,
      backToBackCount,
      updatedAt: new Date().toISOString(),
    };

    const db = getDb();
    await db.collection("users").doc(uid).collection("live_signals").doc("calendly").set(signal);

    res.json({ refreshed: true, state: signal });
  } catch (err: any) {
    console.error("[Signals] calendly refresh error:", err.message);
    res.status(500).json({ error: "Could not refresh Calendly data." });
  }
});

app.get("/api/signals/calendly", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const db = getDb();
    const signalDoc = await db.collection("users").doc(uid).collection("live_signals").doc("calendly").get();
    if (!signalDoc.exists) {
      return res.json({ state: null });
    }
    res.json({ state: signalDoc.data() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Never expose the Slack user ID or raw conversation ID list to the client -
// only the aggregate counts and scan progress it actually needs.
function redactSlackState(state: any) {
  return {
    scanProgress: state.conversationIds ? `${state.scanIndex}/${state.conversationIds.length}` : "0/0",
    inProgress: {
      totalMessages: state.inProgressTotal || 0,
      afterHoursMessages: state.inProgressAfterHours || 0,
      weekendMessages: state.inProgressWeekend || 0,
    },
    lastCompleted: state.lastCompleted || null,
    updatedAt: state.updatedAt,
  };
}

// ============================================================================
// Real Signals: Calendar (computed client-side, stored here)
// ============================================================================
// Unlike Slack, Google Calendar's API supports direct browser calls with the
// user's own OAuth token (see src/lib/calendar-signals.ts), so the 7-day
// aggregate is computed client-side and just persisted through this endpoint,
// matching the existing pattern already used in MicroRecovery.tsx.
const CalendarSignalSchema = z.object({
  totalMeetingHours: z.number(),
  meetingCount: z.number(),
  backToBackCount: z.number(),
  eveningMeetingCount: z.number(),
  weekendMeetingCount: z.number(),
  windowDays: z.number(),
}).strict();

app.post("/api/signals/calendar", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const parsed = CalendarSignalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid calendar signal payload.", details: (parsed as any).error?.errors || [] });
    }
    const uid = requireAuth(req).uid;
    const db = getDb();
    await db.collection("users").doc(uid).collection("live_signals").doc("calendar").set({
      ...parsed.data,
      updatedAt: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Signals] calendar write error:", err.message);
    res.status(500).json({ error: "Could not save calendar signal." });
  }
});

app.get("/api/signals/calendar", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const db = getDb();
    const doc = await db.collection("users").doc(uid).collection("live_signals").doc("calendar").get();
    res.json({ state: doc.exists ? doc.data() : null });
  } catch (err: any) {
    console.error("[Signals] calendar read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Real Signals: Gmail (genuinely fetched, not the "inbox shielding" claim
// this used to make - honestly scoped to real inbox-load tracking instead)
// ============================================================================
const GmailSignalSchema = z.object({
  unreadCount: z.number(),
  totalInboxCount: z.number(),
}).strict();

app.post("/api/signals/gmail", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const parsed = GmailSignalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid Gmail signal payload.", details: (parsed as any).error?.errors || [] });
    }
    const uid = requireAuth(req).uid;
    const db = getDb();
    await db.collection("users").doc(uid).collection("live_signals").doc("gmail").set({
      ...parsed.data,
      updatedAt: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Signals] gmail write error:", err.message);
    res.status(500).json({ error: "Could not save Gmail signal." });
  }
});

app.get("/api/signals/gmail", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const db = getDb();
    const doc = await db.collection("users").doc(uid).collection("live_signals").doc("gmail").get();
    res.json({ state: doc.exists ? doc.data() : null });
  } catch (err: any) {
    console.error("[Signals] gmail read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Archetype evolution: blend the quiz baseline with real behavioral signals
// ============================================================================
// The quiz gives a point-in-time snapshot. Real signals (calendar load, Slack
// message volume) let the blend actually drift toward what someone's doing
// right now, not just what they answered once. Every nudge below is modest
// relative to the 9-36 raw-score range, and every nudge has a plain-language
// note attached — this is the lightweight version of "explainable"; the full
// causal-narrative treatment is a separate, later piece of work.
const DRIFT_NUDGE = 4;

app.get("/api/signals/blend", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const db = getDb();

    const [baselineDoc, calendarDoc, slackDoc] = await Promise.all([
      db.collection("users").doc(uid).collection("diagnostics").doc("latest").get(),
      db.collection("users").doc(uid).collection("live_signals").doc("calendar").get(),
      db.collection("users").doc(uid).collection("live_signals").doc("slack").get(),
    ]);

    if (!baselineDoc.exists) {
      return res.json({
        blend: null,
        driftNotes: [],
        hasQuizBaseline: false,
        hasCalendarSignal: calendarDoc.exists,
        hasSlackSignal: slackDoc.exists,
        note: "Complete the burnout check-in first — the blend evolves from that baseline.",
      });
    }

    const baseline = baselineDoc.data()!;
    const archScores: Record<string, number> = { ...baseline.archScores };
    const driftNotes: string[] = [];

    const calendarSignal = calendarDoc.exists ? calendarDoc.data() : null;
    if (calendarSignal) {
      if (calendarSignal.backToBackCount >= 5) {
        ["Founder on Fire", "Manager in the Middle", "Crisis Sprinter"].forEach((p) => {
          if (archScores[p] !== undefined) archScores[p] += DRIFT_NUDGE;
        });
        driftNotes.push(`Your calendar shows ${calendarSignal.backToBackCount} back-to-back meetings this week — nudging your blend toward Manager in the Middle and Crisis Sprinter.`);
      }
      const offHoursMeetings = (calendarSignal.eveningMeetingCount || 0) + (calendarSignal.weekendMeetingCount || 0);
      if (offHoursMeetings >= 3) {
        ["High-Functioning Exhausted", "Crisis Sprinter"].forEach((p) => {
          if (archScores[p] !== undefined) archScores[p] += DRIFT_NUDGE;
        });
        driftNotes.push(`${offHoursMeetings} of your meetings this week were evenings or weekends — nudging your blend toward High-Functioning Exhausted.`);
      }
    }

    const slackState = slackDoc.exists ? slackDoc.data() : null;
    const slackCompleted = slackState?.lastCompleted;
    if (slackCompleted && slackCompleted.totalMessages7d > 0) {
      const afterHoursRatio = slackCompleted.afterHoursMessages7d / slackCompleted.totalMessages7d;
      if (afterHoursRatio >= 0.3) {
        ["Over-Giver", "People-Pleasing Performer", "Responsibility Addict"].forEach((p) => {
          if (archScores[p] !== undefined) archScores[p] += DRIFT_NUDGE;
        });
        driftNotes.push(`${Math.round(afterHoursRatio * 100)}% of your Slack messages this week were after-hours — nudging your blend toward Over-Giver and Responsibility Addict.`);
      }
    }

    const blend = computeBlend(archScores);

    res.json({
      blend,
      driftNotes,
      hasQuizBaseline: true,
      hasCalendarSignal: !!calendarSignal,
      hasSlackSignal: !!slackCompleted,
      baselineComputedAt: baseline.computedAt,
    });
  } catch (err: any) {
    console.error("[Signals] blend error:", err.message);
    res.status(500).json({ error: "Could not compute archetype blend." });
  }
});

// ============================================================================
// Explainable Recovery Score
// ============================================================================
// The existing client-side calculateRecoveryScore() in App.tsx is a blind
// accumulator — it produces a number with no memory of what pushed it there.
// This endpoint runs the *same* underlying factors (so the score itself stays
// consistent with what's already shown elsewhere in the app) but tracks each
// one as a labeled, signed contribution, then layers the real calendar/Slack
// signals on top the same way — so the final breakdown is a genuine causal
// chain a person can act on, not just a number.
const RecoveryExplainRequestSchema = z.object({
  energyLevel: z.number().min(0).max(100).optional(),
  debtCount: z.number().int().min(0).optional(),
  isHighFunctioningExhausted: z.boolean().optional(),
  hasClaimedDaily: z.boolean().optional(),
  rehearsalCount: z.number().int().min(0).optional(),
  streak: z.number().int().min(0).optional(),
  moodPositive: z.boolean().nullable().optional(),
  triggerCount: z.number().int().min(0).optional(),
  socialBattery: z.number().min(0).max(100).nullable().optional(),
  winsCount: z.number().int().min(0).optional(),
  symptomsCount: z.number().int().min(0).optional(),
  focusShieldActive: z.boolean().optional(),
}).strict();

app.post("/api/signals/recovery-explain", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const parsed = RecoveryExplainRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid recovery-explain payload.", details: (parsed as any).error?.errors || [] });
    }
    const input = parsed.data;
    const uid = requireAuth(req).uid;
    const db = getDb();

    const factors: { label: string; delta: number; source: "self-report" | "calendar" | "slack" }[] = [];
    let score = 50;
    factors.push({ label: "Baseline", delta: 50, source: "self-report" });

    if (input.energyLevel !== undefined) {
      if (input.energyLevel > 60) {
        score += 15; factors.push({ label: "Energy check-in above 60%", delta: 15, source: "self-report" });
      } else if (input.energyLevel < 30) {
        score -= 15; factors.push({ label: "Energy check-in below 30%", delta: -15, source: "self-report" });
      }
    }
    if (input.debtCount) {
      const penalty = Math.min(input.debtCount * 5, 20);
      score -= penalty;
      factors.push({ label: `${input.debtCount} uncleared recovery debt${input.debtCount === 1 ? "" : "s"}`, delta: -penalty, source: "self-report" });
    }
    if (input.isHighFunctioningExhausted) {
      score -= 5;
      factors.push({ label: "High-Functioning Exhausted archetype", delta: -5, source: "self-report" });
    }
    if (input.hasClaimedDaily) {
      score += 10;
      factors.push({ label: "Completed today's check-in", delta: 10, source: "self-report" });
    }
    if (input.rehearsalCount) {
      score += 5;
      factors.push({ label: "Practised a boundary rehearsal", delta: 5, source: "self-report" });
    }
    if (input.streak !== undefined && input.streak > 3) {
      score += 5;
      factors.push({ label: `${input.streak}-day streak`, delta: 5, source: "self-report" });
    }
    if (input.moodPositive !== null && input.moodPositive !== undefined) {
      const delta = input.moodPositive ? 15 : -10;
      score += delta;
      factors.push({ label: input.moodPositive ? "Recent mood log was positive" : "Recent mood log was negative", delta, source: "self-report" });
    }
    if (input.triggerCount) {
      const penalty = Math.min(25, input.triggerCount * 5);
      score -= penalty;
      factors.push({ label: `${input.triggerCount} logged trigger${input.triggerCount === 1 ? "" : "s"} recently`, delta: -penalty, source: "self-report" });
    }
    if (input.socialBattery !== null && input.socialBattery !== undefined) {
      if (input.socialBattery > 60) {
        score += 10; factors.push({ label: "Social battery above 60%", delta: 10, source: "self-report" });
      } else if (input.socialBattery < 30) {
        score -= 15; factors.push({ label: "Social battery below 30%", delta: -15, source: "self-report" });
      }
    }
    if (input.winsCount) {
      const bonus = Math.min(25, input.winsCount * 8);
      score += bonus;
      factors.push({ label: `${input.winsCount} logged win${input.winsCount === 1 ? "" : "s"}`, delta: bonus, source: "self-report" });
    }
    if (input.symptomsCount) {
      const penalty = Math.min(20, input.symptomsCount * 4);
      score -= penalty;
      factors.push({ label: `${input.symptomsCount} logged symptom${input.symptomsCount === 1 ? "" : "s"}`, delta: -penalty, source: "self-report" });
    }
    if (input.focusShieldActive) {
      score += 10;
      factors.push({ label: "Focus Shield active", delta: 10, source: "self-report" });
    }

    // Real behavioral signals — the part self-report can't see.
    const [calendarDoc, slackDoc] = await Promise.all([
      db.collection("users").doc(uid).collection("live_signals").doc("calendar").get(),
      db.collection("users").doc(uid).collection("live_signals").doc("slack").get(),
    ]);
    const calendarSignal = calendarDoc.exists ? calendarDoc.data() : null;
    const slackState = slackDoc.exists ? slackDoc.data() : null;
    const slackCompleted = slackState?.lastCompleted;
    let hasRealSignals = false;

    if (calendarSignal) {
      hasRealSignals = true;
      if (calendarSignal.backToBackCount >= 5) {
        score -= 8;
        factors.push({ label: `${calendarSignal.backToBackCount} back-to-back meetings this week`, delta: -8, source: "calendar" });
      }
      const offHours = (calendarSignal.eveningMeetingCount || 0) + (calendarSignal.weekendMeetingCount || 0);
      if (offHours >= 3) {
        score -= 6;
        factors.push({ label: `${offHours} evening or weekend meetings this week`, delta: -6, source: "calendar" });
      }
      if (calendarSignal.totalMeetingHours >= 25) {
        score -= 7;
        factors.push({ label: `${calendarSignal.totalMeetingHours}h in meetings this week`, delta: -7, source: "calendar" });
      }
    }
    if (slackCompleted && slackCompleted.totalMessages7d > 0) {
      hasRealSignals = true;
      const afterHoursRatio = slackCompleted.afterHoursMessages7d / slackCompleted.totalMessages7d;
      if (afterHoursRatio >= 0.3) {
        score -= 8;
        factors.push({ label: `${Math.round(afterHoursRatio * 100)}% of your Slack messages were after-hours`, delta: -8, source: "slack" });
      }
    }

    score = Math.max(10, Math.min(100, score));

    res.json({ score, factors, hasRealSignals });
  } catch (err: any) {
    console.error("[Signals] recovery-explain error:", err.message);
    res.status(500).json({ error: "Could not compute explainable recovery score." });
  }
});

// ============================================================================
// Boundary Autopilot: real actions, not just rehearsal scripts
// ============================================================================
// Every action here is consequential (sends a real message, changes real
// account state) and irreversible in the way a rehearsal script never is, so
// every endpoint: (1) requires a fresh, explicit confirmation from the client
// — this is not something that fires automatically, (2) logs what happened to
// an audit trail the user can review, and (3) fails loudly rather than
// silently if the Slack token is missing or the API call fails, since a
// silent failure here would mean someone believes a boundary was set when it
// wasn't.

const slackApiCall = async (accessToken: string, method: string, params: Record<string, string>, httpMethod: "GET" | "POST" = "GET") => {
  if (httpMethod === "GET") {
    const url = new URL(`https://slack.com/api/${method}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    return r.json();
  }
  const r = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return r.json();
};

const getSlackTokenOrFail = async (uid: string, res: any): Promise<string | null> => {
  const db = getDb();
  const tokenDoc = await db.collection("users").doc(uid).collection("integration_tokens").doc("slack").get();
  if (!tokenDoc.exists || !tokenDoc.data()?.accessToken) {
    res.status(400).json({ error: "Slack is not connected. Connect it in Settings first." });
    return null;
  }
  return tokenDoc.data()!.accessToken;
};

const logAutopilotAction = async (uid: string, action: string, detail: Record<string, any>, success: boolean) => {
  try {
    await getDb().collection("users").doc(uid).collection("autopilot_actions").add({
      action,
      detail,
      success,
      takenAt: new Date().toISOString(),
    });
  } catch (e) {
    // A logging failure shouldn't mask the actual action's result to the caller.
    console.error("[Boundary Autopilot] audit log failed:", e);
  }
};

// Recipient picker: list workspace members so the user can pick who to message
// by name rather than needing to know a Slack ID.
app.get("/api/boundary-autopilot/slack/users", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const accessToken = await getSlackTokenOrFail(uid, res);
    if (!accessToken) return;

    const result = await slackApiCall(accessToken, "users.list", { limit: "200" });
    if (!result.ok) {
      return res.status(502).json({ error: `Could not list Slack users: ${result.error || "unknown error"}` });
    }
    const members = (result.members || [])
      .filter((m: any) => !m.is_bot && !m.deleted && m.id !== "USLACKBOT")
      .map((m: any) => ({ id: m.id, name: m.real_name || m.name, avatar: m.profile?.image_48 }));
    res.json({ members });
  } catch (err: any) {
    console.error("[Boundary Autopilot] slack users error:", err.message);
    res.status(500).json({ error: "Could not load Slack contacts." });
  }
});

app.post("/api/boundary-autopilot/slack/send", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  const uid = requireAuth(req).uid;
  try {
    const parsed = SendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid send request — a recipient, message, and explicit confirmation are required." });
    }
    const { recipientId, recipientName, message } = parsed.data;
    const accessToken = await getSlackTokenOrFail(uid, res);
    if (!accessToken) return;

    // Open (or reuse) a DM channel with the recipient, then post to it.
    const openResult = await slackApiCall(accessToken, "conversations.open", { users: recipientId }, "POST");
    if (!openResult.ok) {
      await logAutopilotAction(uid, "slack_send", { recipientId, recipientName, message }, false);
      return res.status(502).json({ error: `Could not open a conversation: ${openResult.error || "unknown error"}` });
    }

    const sendResult = await slackApiCall(accessToken, "chat.postMessage", {
      channel: openResult.channel.id,
      text: message,
    }, "POST");
    if (!sendResult.ok) {
      await logAutopilotAction(uid, "slack_send", { recipientId, recipientName, message }, false);
      return res.status(502).json({ error: `Slack rejected the message: ${sendResult.error || "unknown error"}` });
    }

    await logAutopilotAction(uid, "slack_send", { recipientId, recipientName, message }, true);
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Boundary Autopilot] slack send error:", err.message);
    await logAutopilotAction(uid, "slack_send", { error: err.message }, false);
    res.status(500).json({ error: "Could not send the message." });
  }
});

app.post("/api/boundary-autopilot/slack/dnd", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  const uid = requireAuth(req).uid;
  try {
    const parsed = SetDndSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid DND request — a duration in minutes and explicit confirmation are required." });
    }
    const { minutes } = parsed.data;
    const accessToken = await getSlackTokenOrFail(uid, res);
    if (!accessToken) return;

    const result = await slackApiCall(accessToken, "dnd.setSnooze", { num_minutes: String(minutes) }, "POST");
    if (!result.ok) {
      await logAutopilotAction(uid, "slack_dnd", { minutes }, false);
      return res.status(502).json({ error: `Slack rejected the DND request: ${result.error || "unknown error"}` });
    }

    await logAutopilotAction(uid, "slack_dnd", { minutes }, true);
    res.json({ success: true, snoozeEndtime: result.snooze_endtime });
  } catch (err: any) {
    console.error("[Boundary Autopilot] slack dnd error:", err.message);
    await logAutopilotAction(uid, "slack_dnd", { error: err.message }, false);
    res.status(500).json({ error: "Could not set Do Not Disturb." });
  }
});

app.post("/api/boundary-autopilot/slack/status", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  const uid = requireAuth(req).uid;
  try {
    const parsed = SetStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid status request — status text and explicit confirmation are required." });
    }
    const { statusText, statusEmoji } = parsed.data;
    const accessToken = await getSlackTokenOrFail(uid, res);
    if (!accessToken) return;

    const result = await slackApiCall(accessToken, "users.profile.set", {
      profile: JSON.stringify({ status_text: statusText, status_emoji: statusEmoji, status_expiration: 0 }),
    }, "POST");
    if (!result.ok) {
      await logAutopilotAction(uid, "slack_status", { statusText, statusEmoji }, false);
      return res.status(502).json({ error: `Slack rejected the status update: ${result.error || "unknown error"}` });
    }

    await logAutopilotAction(uid, "slack_status", { statusText, statusEmoji }, true);
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Boundary Autopilot] slack status error:", err.message);
    await logAutopilotAction(uid, "slack_status", { error: err.message }, false);
    res.status(500).json({ error: "Could not update your Slack status." });
  }
});

const LogCalendarDeclineSchema = z.object({
  eventSummary: z.string().max(300),
}).strict();

// The actual decline happens entirely client-side (the user's own Google
// token calls Calendar's API directly) — this endpoint exists purely so that
// action shows up in the same audit trail as the Slack actions, since a
// user reviewing "what has this taken action on my behalf" should see all
// four action types in one place, not three out of four.
app.post("/api/boundary-autopilot/log-calendar-decline", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const parsed = LogCalendarDeclineSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request." });
    }
    const uid = requireAuth(req).uid;
    await logAutopilotAction(uid, "calendar_decline", { eventSummary: parsed.data.eventSummary }, true);
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Boundary Autopilot] calendar decline log error:", err.message);
    res.status(500).json({ error: "Could not log this action." });
  }
});

app.get("/api/boundary-autopilot/history", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const snap = await getDb().collection("users").doc(uid).collection("autopilot_actions")
      .orderBy("takenAt", "desc").limit(20).get();
    res.json({ actions: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err: any) {
    console.error("[Boundary Autopilot] history error:", err.message);
    res.status(500).json({ error: "Could not load action history." });
  }
});

// ============================================================================
// Push notifications: reaching someone even when the app isn't open
// ============================================================================
// The existing "Pulse Alert" in App.tsx only fires while the tab is already
// open (new Notification(...) with no service worker involved) — which means
// it can never reach the person who's stopped opening the app, exactly the
// moment it matters most. This closes that gap two ways: (1) real Web Push
// subscriptions so a notification can be delivered by the OS/browser even
// with the app fully closed, and (2) a lightweight scheduled check that
// doesn't depend on the client running at all, using pulse data the client
// now reports here specifically so this check has something to look at.

const sendPushToUser = async (uid: string, payload: { title: string; body: string }): Promise<void> => {
  if (!pushConfigured) return;
  const db = getDb();
  const subsSnap = await db.collection("users").doc(uid).collection("push_subscriptions").get();
  for (const doc of subsSnap.docs) {
    try {
      await webpush.sendNotification(doc.data() as any, JSON.stringify(payload));
    } catch (err: any) {
      // A 404/410 means the subscription is dead (browser data cleared, uninstalled, etc.) — clean it up.
      if (err.statusCode === 404 || err.statusCode === 410) {
        await doc.ref.delete();
      } else {
        console.error(`[Push] send failed for uid ${uid}:`, err.message);
      }
    }
  }
};

app.get("/api/push/vapid-public-key", verifyAppCheck, (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY, configured: pushConfigured });
});

const PushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  // PushSubscription.toJSON() (what the client actually sends — see
  // src/lib/push-notifications.ts) always includes this key, even when its
  // value is null, so it must be accepted here or every real subscription
  // gets rejected by .strict() before push notifications can ever work.
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
}).strict();

app.post("/api/push/subscribe", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const parsed = PushSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid push subscription payload." });
    }
    const uid = requireAuth(req).uid;
    // Keyed by a hash of the endpoint so re-subscribing the same device updates
    // rather than duplicates, and multiple real devices can coexist per user.
    const subId = crypto.createHash("sha256").update(parsed.data.endpoint).digest("hex").slice(0, 32);
    await getDb().collection("users").doc(uid).collection("push_subscriptions").doc(subId).set({
      ...parsed.data,
      subscribedAt: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Push] subscribe error:", err.message);
    res.status(500).json({ error: "Could not save your push subscription." });
  }
});

app.post("/api/push/unsubscribe", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = requireAuth(req).uid;
    const endpoint = req.body?.endpoint;
    if (endpoint) {
      const subId = crypto.createHash("sha256").update(String(endpoint)).digest("hex").slice(0, 32);
      await getDb().collection("users").doc(uid).collection("push_subscriptions").doc(subId).delete();
    } else {
      // No endpoint provided — remove all of this user's subscriptions rather than silently no-op.
      const snap = await getDb().collection("users").doc(uid).collection("push_subscriptions").get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Push] unsubscribe error:", err.message);
    res.status(500).json({ error: "Could not remove your push subscription." });
  }
});

const PulseReportSchema = z.object({
  score: z.number().min(0).max(100),
}).strict();

// The client already computes this locally on every home-screen load —
// this just gives the server a copy to check against later without the
// client needing to be running at that later moment.
app.post("/api/pulse/report", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const parsed = PulseReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid pulse report." });
    }
    const uid = requireAuth(req).uid;
    await getDb().collection("users").doc(uid).collection("pulse_status").doc("latest").set({
      score: parsed.data.score,
      reportedAt: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Pulse] report error:", err.message);
    res.status(500).json({ error: "Could not report pulse status." });
  }
});

// Scheduled check: runs in-process every 6 hours, looking for two real,
// server-visible conditions — a score that's stayed low, or a check-in that's
// gone stale — and sends a real push either way. A 48-hour cooldown per user
// (tracked via lastPushSentAt) keeps this a gentle nudge, not spam.
const PULSE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STALE_CHECKIN_HOURS = 48;
const LOW_SCORE_THRESHOLD = 30;
const PUSH_COOLDOWN_HOURS = 48;

const runScheduledPulseCheck = async () => {
  if (!pushConfigured) return;
  try {
    const db = getDb();
    const now = Date.now();
    const staleCutoffIso = new Date(now - STALE_CHECKIN_HOURS * 60 * 60 * 1000).toISOString();

    // Two narrow collection-group queries instead of reading every user doc
    // plus a per-user sub-read (that pattern cost 2 reads per user on every
    // run, regardless of whether they'd ever qualify). These only pull back
    // docs that are actually candidates — cost now scales with how many
    // people are stale or low, not with total signups. Needs the
    // COLLECTION_GROUP field overrides on pulse_status in firestore.indexes.json.
    const [staleSnap, lowSnap] = await Promise.all([
      db.collectionGroup("pulse_status").where("reportedAt", "<", staleCutoffIso).get(),
      db.collectionGroup("pulse_status").where("score", "<", LOW_SCORE_THRESHOLD).get(),
    ]);

    const candidates = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const doc of [...staleSnap.docs, ...lowSnap.docs]) {
      const uid = doc.ref.parent.parent?.id;
      if (uid) candidates.set(uid, doc);
    }

    for (const [uid, pulseDoc] of candidates) {
      const pulse = pulseDoc.data()!;
      const reportedAt = new Date(pulse.reportedAt).getTime();
      const hoursSinceReport = (now - reportedAt) / (1000 * 60 * 60);

      const isStale = hoursSinceReport >= STALE_CHECKIN_HOURS;
      const isLow = pulse.score < LOW_SCORE_THRESHOLD && hoursSinceReport < STALE_CHECKIN_HOURS;
      if (!isStale && !isLow) continue;

      const lastPush = pulse.lastPushSentAt ? new Date(pulse.lastPushSentAt).getTime() : 0;
      if ((now - lastPush) / (1000 * 60 * 60) < PUSH_COOLDOWN_HOURS) continue;

      // Route through the same preference/quiet-hours logic every other
      // notification category uses (notification-router.ts), rather than
      // firing unconditionally - this was the one scheduled notification
      // in the codebase that never consulted preferences/notifications at
      // all (that doc previously only governed the in-app banner).
      const [prefsSnap, profileSnap] = await Promise.all([
        db.collection("users").doc(uid).collection("preferences").doc("notifications").get(),
        db.collection("users").doc(uid).collection("user_stats").doc("core").get(),
      ]);
      const prefs = getEffectiveNotificationPreferences(prefsSnap.exists ? prefsSnap.data() : null);
      const timeZone = profileSnap.data()?.profile?.timeZone;
      let localHour = new Date().getUTCHours();
      if (typeof timeZone === 'string' && timeZone) {
        try {
          localHour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hour12: false }).format(new Date()), 10);
        } catch (e) {
          // Invalid/unrecognized timezone string - fall back to UTC hour above rather than failing the whole check.
        }
      }
      const routing = routeNotification('checkin_reminder', prefs, localHour, 0, { push: true, email: false, sms: false });
      if (!routing.send) continue;

      await sendPushToUser(uid, isStale
        ? { title: "Nova hasn't heard from you in a while", body: "No pressure — just checking in. Your recovery tools are here whenever you're ready." }
        : { title: "Nova: your recovery score has been low", body: "Things look tough right now. A short reset might help — Blaze Break is here." }
      );
      await pulseDoc.ref.set({ lastPushSentAt: new Date().toISOString() }, { merge: true });
    }
  } catch (err: any) {
    console.error("[Push] scheduled pulse check error:", err.message);
  }
};

if (pushConfigured && process.env.TEST_MODE !== 'true') {
  setInterval(runScheduledPulseCheck, PULSE_CHECK_INTERVAL_MS);
}

// Admin Dashboard Summary Metrics API
// Lightweight operating visibility (section 39/40 of the hardening brief),
// built entirely from the usage_counters this same batch of work started
// writing (checkAndReserveCapability, sendTwilioMessage) - not a live read
// of actual Gemini/Twilio billing, since neither provider is wired up
// here with a queryable cost API. Every number in the response is
// explicitly labelled an estimate; see cost-estimates.ts/docs/
// COST_MONITORING.md for the rates and their sourcing.
app.get("/api/admin/cost-usage", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requireAdmin(req);
    const db = getDb();
    const periodDays = 7;
    const sinceIso = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();

    const totals: UsageTotals = { novaTextCount: 0, novaVoiceCount: 0, diagnoseCount: 0, smsSegmentCount: 0 };
    // Nova usage broken down by plan tier - the one real, non-sensitive
    // commercial signal this pass can honestly report for the B2C
    // pricing brief's "Nova Live usage by tier" analytics ask. Built from
    // the same usage_counters snapshot below (no extra reads for the
    // counts themselves), cross-referenced against each distinct active
    // uid's real entitlement record - one extra read per uid active in
    // the period, the same "how many people used the app this week"
    // scale the unbounded collectionGroup query below already assumes.
    const byTier: Record<EntitlementPlan, { novaTextCount: number; novaVoiceCount: number; novaVoiceMinutes: number }> = {
      free: { novaTextCount: 0, novaVoiceCount: 0, novaVoiceMinutes: 0 },
      core: { novaTextCount: 0, novaVoiceCount: 0, novaVoiceMinutes: 0 },
      performance: { novaTextCount: 0, novaVoiceCount: 0, novaVoiceMinutes: 0 },
      executive: { novaTextCount: 0, novaVoiceCount: 0, novaVoiceMinutes: 0 },
      legacy_premium: { novaTextCount: 0, novaVoiceCount: 0, novaVoiceMinutes: 0 },
    };
    try {
      const snap = await db.collectionGroup("usage_counters").where("updatedAt", ">=", sinceIso).get();
      const uidToDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
      snap.docs.forEach((doc: any) => {
        const data = doc.data();
        totals.novaTextCount += Number(data.nova_text) || 0;
        totals.novaVoiceCount += Number(data.nova_voice) || 0;
        totals.diagnoseCount += Number(data.diagnose) || 0;
        // smsCount tracks messages sent, not exact provider segments (segment
        // count isn't persisted per-send) - treated here as ~1 segment each,
        // a conservative underestimate for any longer message.
        totals.smsSegmentCount += Number(data.smsCount) || 0;

        // usage_counters docs always live at users/{uid}/usage_counters/{key}
        // - read the uid directly from the path segment rather than
        // doc.ref.parent.parent, which the lightweight Firestore test
        // double doesn't implement (this still works identically against
        // the real Admin SDK, which uses the same path shape).
        const pathSegs = doc.ref.path.split('/');
        const uid = pathSegs.length === 4 && pathSegs[0] === 'users' ? pathSegs[1] : undefined;
        if (uid) {
          if (!uidToDocs.has(uid)) uidToDocs.set(uid, []);
          uidToDocs.get(uid)!.push(doc);
        }
      });

      const uids = Array.from(uidToDocs.keys());
      const plans = await Promise.all(uids.map((uid) =>
        getEntitlementRecord(uid).then((r) => effectivePlan(r)).catch(() => 'free' as EntitlementPlan)
      ));
      uids.forEach((uid, i) => {
        const plan = plans[i];
        for (const doc of uidToDocs.get(uid)!) {
          const data = doc.data();
          byTier[plan].novaTextCount += Number(data.nova_text) || 0;
          byTier[plan].novaVoiceCount += Number(data.nova_voice) || 0;
          byTier[plan].novaVoiceMinutes += Number(data.nova_voice_minutes) || 0;
        }
      });
    } catch (e) {
      // This is an estimate/visibility endpoint, not a critical path -
      // degrade to zeros rather than failing the whole admin view.
    }

    // Admin-driven plan changes - the only real "conversion"-adjacent
    // event that exists today, since there is no live checkout to source
    // a real signup/purchase event from. Genuine signup counts, monthly-
    // vs-annual split, cancellations/churn, and ARPU all require a live
    // payment provider to mean anything real, and are deliberately NOT
    // fabricated here - see docs/FREE_PREMIUM_ENTITLEMENTS.md and the
    // final report's honest accounting of what analytics could and
    // couldn't be built without one.
    const planChangesPeriodDays = 30;
    const planChanges: { upgrade: number; downgrade: number; lateral: number; byPlan: Record<string, number> } =
      { upgrade: 0, downgrade: 0, lateral: 0, byPlan: {} };
    try {
      const sinceLogsIso = new Date(Date.now() - planChangesPeriodDays * 24 * 60 * 60 * 1000).toISOString();
      const logsSnap = await db.collection("admin_audit_logs")
        .where("action", "==", "grant_entitlement")
        .limit(500)
        .get();
      logsSnap.docs.forEach((doc) => {
        const data = doc.data();
        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null;
        if (createdAt && createdAt < sinceLogsIso) return;
        const change = data.metadata?.planChange;
        if (change === 'upgrade' || change === 'downgrade' || change === 'lateral') planChanges[change as 'upgrade' | 'downgrade' | 'lateral']++;
        const plan = data.metadata?.plan;
        if (typeof plan === 'string') planChanges.byPlan[plan] = (planChanges.byPlan[plan] || 0) + 1;
      });
    } catch (e) {
      // This is an estimate/visibility endpoint, not a critical path -
      // degrade to zeros rather than failing the whole admin view.
    }

    res.json({
      periodDays,
      isEstimate: true,
      note: "Rough internal estimates from captured usage counts, not live provider billing data. See docs/COST_MONITORING.md.",
      usage: totals,
      estimatedCostUsd: estimateCost(totals),
      byTier,
      planChanges: {
        ...planChanges,
        periodDays: planChangesPeriodDays,
        note: "Admin-driven plan grants/changes only - there is no live checkout yet, so there is no real signup/purchase event to source true conversion, monthly-vs-annual split, cancellation, or ARPU data from.",
      },
    });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

app.get("/api/admin/summary", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requireAdmin(req);
    const db = getDb();
    
    // Fetch users and metrics
    let totalUsersCount = 0;
    let usersList: any[] = [];
    try {
      const usersSnap = await db.collection("users").limit(100).get();
      totalUsersCount = Math.max(usersSnap.size, 1);
      usersList = usersSnap.docs.map(doc => doc.data());
    } catch (e) {
      totalUsersCount = 1;
    }

    // Diagnostic completions
    let diagnosticCompletions = 0;
    try {
      const fingerprintsSnap = await db.collectionGroup("fingerprint").get();
      diagnosticCompletions = fingerprintsSnap.size;
    } catch (e) {
      // This admin-stats endpoint reports several independent metrics;
      // one query failing shouldn't take the others down, so this one
      // just stays at its 0 default.
    }

    // Active Feature Flags
    let activeFeatureFlags = 0;
    try {
      const flagsSnap = await db.collection("public_feature_flags").where("enabled", "==", true).get();
      activeFeatureFlags = flagsSnap.size;
    } catch (e) {
      // Same reasoning as the diagnosticCompletions query above - degrade
      // to the 0 default rather than failing the whole stats response.
    }

    // B2B Orgs
    let orgsCount = 0;
    try {
      const orgsSnap = await db.collection("organisations").get();
      orgsCount = orgsSnap.size;
    } catch (e) {
      // Same reasoning as the diagnosticCompletions query above - degrade
      // to the 0 default rather than failing the whole stats response.
    }

    // Anxiety Reset Event Metrics
    let resetsToday = 0;
    let resetsThisWeek = 0;
    let totalBefore = 0;
    let totalAfter = 0;
    let countWithIntensity = 0;
    let completedCount = 0;
    let totalResets = 0;
    let safetyEscalations = 0;
    let crisisReferrals = 0;
    const triggerCounts: Record<string, number> = {};
    const toolCounts: Record<string, number> = {};

    try {
      const resetsSnap = await db.collection("anxiety_reset_events").get();
      totalResets = resetsSnap.size;
      const todayStart = new Date();
      todayStart.setHours(0,0,0,0);
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);

      resetsSnap.forEach(doc => {
        const data = doc.data();
        const date = data.createdAt ? data.createdAt.toDate() : new Date();
        
        if (date >= todayStart) resetsToday++;
        if (date >= weekStart) resetsThisWeek++;

        if (data.intensityBefore !== undefined && data.intensityAfter !== undefined) {
          totalBefore += Number(data.intensityBefore);
          totalAfter += Number(data.intensityAfter);
          countWithIntensity++;
        }

        if (data.completed) completedCount++;
        
        if (data.safetyLevel && data.safetyLevel !== 'normal_support') {
          safetyEscalations++;
        }
        if (data.safetyLevel === 'possible_crisis' || data.safetyLevel === 'immediate_danger') {
          crisisReferrals++;
        }

        if (data.triggerType) {
          triggerCounts[data.triggerType] = (triggerCounts[data.triggerType] || 0) + 1;
        }

        if (data.selectedTool) {
          toolCounts[data.selectedTool] = (toolCounts[data.selectedTool] || 0) + 1;
        }
      });
    } catch (e) {
      // Same reasoning as the other stats queries in this endpoint -
      // degrade to the defaults declared above rather than failing
      // the whole response over one metrics query.
    }

    const mostCommonTrigger = Object.keys(triggerCounts).reduce((a, b) => triggerCounts[a] > triggerCounts[b] ? a : b, 'None');
    const mostUsedResetTool = Object.keys(toolCounts).reduce((a, b) => toolCounts[a] > toolCounts[b] ? a : b, 'None');

    res.json({
      totalUsers: totalUsersCount,
      activeUsers: totalUsersCount, // Active in current session config
      newSignups: totalUsersCount, 
      activeSubscriptions: Math.ceil(totalUsersCount * 0.35), // Mock B2C B2B paid tier ratio
      burnoutDiagnosticCompletions: diagnosticCompletions,
      novaMessagesToday: 24, // Mock counter for metrics
      safetyEvents: safetyEscalations,
      contentItems: 12,
      knowledgeChunks: NOVA_KNOWLEDGE_BASE.length,
      b2bOrganisations: orgsCount,
      featureFlagsActive: activeFeatureFlags,
      
      // GAD-informed Anxiety reset metrics
      anxietyResetsToday: resetsToday,
      anxietyResetsThisWeek: resetsThisWeek,
      avgIntensityBefore: countWithIntensity > 0 ? Number((totalBefore / countWithIntensity).toFixed(1)) : 0,
      avgIntensityAfter: countWithIntensity > 0 ? Number((totalAfter / countWithIntensity).toFixed(1)) : 0,
      avgIntensityReduction: countWithIntensity > 0 ? Number(((totalBefore - totalAfter) / countWithIntensity).toFixed(1)) : 0,
      mostCommonTrigger,
      mostUsedResetTool,
      toolCounts,
      completionRate: totalResets > 0 ? Math.round((completedCount / totalResets) * 100) : 100,
      totalResets,
      safetyEscalations,
      crisisReferrals
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Dashboard - Account Operations Only
const ADMIN_USERS_PAGE_LIMIT = 100;

app.get("/api/admin/users", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requireAdmin(req);
    const db = getDb();
    const usersSnap = await db.collection("users").limit(ADMIN_USERS_PAGE_LIMIT).get();
    // Email/join-date/last-active come from the real Firebase Auth record,
    // not the Firestore users/{uid} doc - that doc's own `email` field
    // isn't reliably populated, and trusting it produced the exact
    // "unknown@example.com" / "today" placeholders this page's own error
    // banner says it refuses to show. authUser.metadata is always real for
    // an account that genuinely exists, the same source
    // GET /api/admin/users/:uid already uses correctly for one account.
    const users = await Promise.all(usersSnap.docs.map(async (doc) => {
      try {
        const authUser = await getAuth().getUser(doc.id);
        return {
          uid: doc.id,
          email: authUser.email || null,
          createdAt: authUser.metadata.creationTime,
          lastSignIn: authUser.metadata.lastSignInTime,
          accessStatus: authUser.disabled ? "disabled" : "active",
        };
      } catch (e) {
        // A Firestore doc with no matching live Auth account (e.g.
        // deleted directly in the Auth console) - surfaced honestly
        // rather than papered over with a fabricated email/date.
        return { uid: doc.id, email: null, createdAt: null, lastSignIn: null, accessStatus: "unknown" };
      }
    }));
    // This route has always been capped at ADMIN_USERS_PAGE_LIMIT with no
    // pagination - `capped` tells the client honestly when the real count
    // exceeds what was fetched, so "Registered Professionals: 100" doesn't
    // silently become a permanently-wrong number once the user base grows
    // past the page size, instead of a real (if approximate) "100+".
    res.json({ users, total: users.length, capped: usersSnap.size >= ADMIN_USERS_PAGE_LIMIT });
  } catch (err: any) {
    console.error("[ADMIN] Error fetching users:", err.message);
    res.status(500).json({ error: "Failed to fetch admin data." });
  }
});

app.get("/api/admin/users/:uid", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requireAdmin(req);
    const targetUid = req.params.uid;
    const db = getDb();
    
    const authUser = await getAuth().getUser(targetUid);
    const userDoc = await db.collection("users").doc(targetUid).get();
    const fingerprintDoc = await db.collection("users").doc(targetUid).collection("recovery").doc("fingerprint").get();
    
    res.json({
      uid: targetUid,
      email: authUser.email,
      displayName: authUser.displayName,
      createdAt: authUser.metadata.creationTime,
      lastSignIn: authUser.metadata.lastSignInTime,
      accessStatus: authUser.disabled ? 'disabled' : 'active',
      profile: userDoc.exists ? userDoc.data() : null,
      fingerprint: fingerprintDoc.exists ? fingerprintDoc.data() : null
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// The app-facing AuthRole union (src/types.ts) - kept in sync by hand since
// that file isn't imported here. Previously this route stored/claimed
// whatever string the request body sent verbatim - a typo or a malicious
// value would silently become this user's role with no rejection.
const APP_USER_ROLES = [
  'individual', 'employee', 'recovery_ally', 'manager', 'organisation_admin',
  'executive', 'platform_admin', 'security_admin', 'platform_owner',
  'support_admin', 'content_admin', 'coach_admin', 'b2b_admin', 'viewer_admin', 'user',
] as const;
const AppUserRoleSchema = z.object({ role: z.enum(APP_USER_ROLES) }).strict();

app.post("/api/admin/users/:uid/role", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requirePlatformOwner(req);
    const parsed = AppUserRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: `"role" must be one of: ${APP_USER_ROLES.join(', ')}.` });
    }
    const targetUid = req.params.uid;
    const { role } = parsed.data;

    await getAuth().setCustomUserClaims(targetUid, { role });
    
    const db = getDb();
    await db.collection("users").doc(targetUid).collection("entitlements").doc("status").set({
      role: role,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    
    await logAdminAction(req, "update_user_role", targetUid, "", { role });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// The one real, working way to grant Premium today, pending a live
// Stripe/Apple/Google integration: a platform admin sets it directly
// (beta testers, support cases, manual comps, or - until organisation-
// sponsored access is reconciled automatically - an org's Premium seat).
// billingSource is always forced to 'admin' here, never taken from the
// request body, so an admin grant can never be mistaken for a real
// provider record reconciled by a webhook.
app.post("/api/admin/users/:uid/entitlement", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requireAdmin(req);
    const targetUid = req.params.uid;
    const validation = validateAdminGrant(req.body || {});
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    const { plan, status, durationDays } = req.body;
    const now = new Date();
    const entitlementEnd = typeof durationDays === 'number'
      ? new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const db = getDb();
    const entitlementRef = db.collection("users").doc(targetUid).collection("entitlements").doc("status");
    const previousPlan = effectivePlan(getEffectiveEntitlement((await entitlementRef.get()).data()));
    await entitlementRef.set({
      plan,
      status,
      billingSource: 'admin',
      entitlementStart: now.toISOString(),
      entitlementEnd,
      renewalDate: null,
      lastVerifiedAt: now.toISOString(),
    }, { merge: true });

    const planChange = isUpgrade(previousPlan, plan) ? 'upgrade' : isDowngrade(previousPlan, plan) ? 'downgrade' : 'lateral';
    await logAdminAction(req, "grant_entitlement", targetUid, "", { plan, status, durationDays: durationDays ?? null, previousPlan, planChange });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

const AdminSuspendSchema = z.object({ suspend: z.boolean() }).strict();

app.post("/api/admin/users/:uid/suspend", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requireAdmin(req);
    const parsed = AdminSuspendSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: '"suspend" must be a boolean.' });
    }
    const targetUid = req.params.uid;
    const { suspend } = parsed.data;

    await getAuth().updateUser(targetUid, { disabled: suspend });
    await logAdminAction(req, suspend ? "suspend_user" : "unsuspend_user", targetUid, "", {});
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/admin-users", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requireAdmin(req);
    const db = getDb();
    const snap = await db.collection("admin_users").get();
    const admins = snap.docs.map(doc => doc.data());
    res.json({ admins });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// The admin-panel role vocabulary getPermissionsForRole() above actually
// knows how to map to permissions - narrower than APP_USER_ROLES (an admin
// account is never 'individual', 'employee', etc.). Previously unvalidated:
// an invalid role string would still set admin:true on the account and
// create/update an admin_users doc, just with getPermissionsForRole()'s
// default: [] - a real admin account with a nonsense role and no
// permissions, silently.
const ADMIN_PANEL_ROLES = [
  'platform_owner', 'platform_admin', 'support_admin',
  'content_admin', 'coach_admin', 'b2b_admin', 'viewer_admin',
] as const;
const AdminPanelRoleSchema = z.object({ role: z.enum(ADMIN_PANEL_ROLES) }).strict();

app.post("/api/admin/admin-users", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requirePlatformOwner(req);
    const { email, displayName } = req.body;
    const parsedRole = AdminPanelRoleSchema.safeParse({ role: req.body.role });
    if (!parsedRole.success) {
      return res.status(400).json({ error: `"role" must be one of: ${ADMIN_PANEL_ROLES.join(', ')}.` });
    }
    const { role } = parsedRole.data;

    const authUser = await getAuth().getUserByEmail(email);
    const targetUid = authUser.uid;
    
    await getAuth().setCustomUserClaims(targetUid, {
      admin: true,
      role: role,
      platformOwner: role === 'platform_owner'
    });
    
    const db = getDb();
    await db.collection("admin_users").doc(targetUid).set({
      uid: targetUid,
      email: email,
      displayName: displayName || authUser.displayName || "Admin User",
      role: role,
      status: "active",
      permissions: getPermissionsForRole(role),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: (req as any).user.email
    }, { merge: true });
    
    await logAdminAction(req, "create_admin_user", targetUid, email, { role });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/admin-users/:uid/role", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requirePlatformOwner(req);
    const parsed = AdminPanelRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: `"role" must be one of: ${ADMIN_PANEL_ROLES.join(', ')}.` });
    }
    const targetUid = req.params.uid;
    const { role } = parsed.data;

    await assertNotLastPlatformOwner(targetUid, firebaseConfigDatabaseId);
    
    await getAuth().setCustomUserClaims(targetUid, {
      admin: true,
      role: role,
      platformOwner: role === 'platform_owner'
    });
    
    const db = getDb();
    await db.collection("admin_users").doc(targetUid).update({
      role: role,
      permissions: getPermissionsForRole(role),
      updatedAt: FieldValue.serverTimestamp()
    });
    
    await logAdminAction(req, "update_admin_role", targetUid, "", { role });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/admin-users/:uid", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requirePlatformOwner(req);
    const targetUid = req.params.uid;
    
    await assertNotLastPlatformOwner(targetUid, firebaseConfigDatabaseId);
    await getAuth().setCustomUserClaims(targetUid, null);
    
    const db = getDb();
    await db.collection("admin_users").doc(targetUid).delete();
    
    await logAdminAction(req, "remove_admin_user", targetUid, "", {});
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/audit-logs", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requireAdmin(req);
    const db = getDb();
    const snap = await db.collection("admin_audit_logs").orderBy("createdAt", "desc").limit(100).get();
    const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/feedback", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requireAdmin(req);
    const db = getDb();
    const snap = await db.collection("feedback_submissions").orderBy("createdAt", "desc").limit(200).get();
    const submissions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ submissions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/feature-flags", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requireAdmin(req);
    const { featureId, enabled } = req.body;
    const db = getDb();
    await db.collection("public_feature_flags").doc(featureId).set({
      enabled,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    
    await logAdminAction(req, "manage_feature_flags", "", featureId, { enabled });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/nova-settings", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requireAdmin(req);
    const { settings } = req.body;
    const db = getDb();
    await db.collection("app_config").doc("nova_settings").set({
      ...settings,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    
    await logAdminAction(req, "manage_nova_settings", "", "", { settings });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/knowledge-chunks", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requireAdmin(req);
    const { chunks } = req.body;
    const db = getDb();
    await db.collection("app_config").doc("knowledge_chunks").set({
      chunks,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    
    await logAdminAction(req, "manage_knowledge_chunks", "", "", { chunkCount: chunks?.length });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/content-library", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requireAdmin(req);
    const { content } = req.body;
    const db = getDb();
    await db.collection("app_config").doc("content_library").set({
      content,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    
    await logAdminAction(req, "manage_content_library", "", "", { contentType: typeof content });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Matches AdminDashboard.tsx's own client-side sanitization
// (newOrgId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')) - the server
// previously trusted that sanitization entirely and used whatever string
// arrived verbatim as a Firestore document ID, with no validation of its
// own for a caller that bypasses the UI.
const OrgIdSchema = z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'orgId must contain only lowercase letters, numbers, and hyphens.');

app.post("/api/admin/orgs", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requireAdmin(req);
    const { orgId, name, privacyThreshold, initialAdminEmail } = req.body;
    const parsedOrgId = OrgIdSchema.safeParse(orgId);
    if (!parsedOrgId.success) {
      return res.status(400).json({ error: 'orgId must be 1-100 characters: lowercase letters, numbers, and hyphens only.' });
    }
    const db = getDb();

    let initialAdminUid: string | null = null;
    if (initialAdminEmail) {
      try {
        const adminUserRecord = await getAuth().getUserByEmail(initialAdminEmail);
        initialAdminUid = adminUserRecord.uid;
      } catch (e) {
        return res.status(400).json({ error: `No existing account found for ${initialAdminEmail}. They need to sign up for Blaze Break first, then be designated as this org's admin.` });
      }
    }

    const existingOrgDoc = await db.collection("organisations").doc(orgId).get();
    // Join code is generated once, on first creation, and kept stable across
    // updates - regenerating it on every edit would silently invalidate any
    // invite links already sent out to employees.
    const joinCode = existingOrgDoc.exists && existingOrgDoc.data()?.joinCode
      ? existingOrgDoc.data()!.joinCode
      : Math.random().toString(36).substring(2, 8).toUpperCase();

    const updatePayload: any = {
      name,
      privacyThreshold: privacyThreshold || 5,
      joinCode,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!existingOrgDoc.exists) {
      updatePayload.createdAt = FieldValue.serverTimestamp();
      updatePayload.memberUids = initialAdminUid ? [initialAdminUid] : [];
      updatePayload.adminUids = initialAdminUid ? [initialAdminUid] : [];
    } else if (initialAdminUid) {
      updatePayload.adminUids = FieldValue.arrayUnion(initialAdminUid);
      updatePayload.memberUids = FieldValue.arrayUnion(initialAdminUid);
    }

    await db.collection("organisations").doc(orgId).set(updatePayload, { merge: true });

    if (initialAdminUid) {
      await db.collection("users").doc(initialAdminUid).set({
        organisationId: orgId,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      // The initial admin's granular Enterprise role - owner, since they're
      // the org's first real member and the legacy adminUids fallback would
      // resolve them to 'owner' anyway. Written explicitly rather than left
      // to the fallback so this org has a real members/ record from day one.
      await db.collection("organisations").doc(orgId).collection("members").doc(initialAdminUid).set({
        role: 'owner',
        status: 'active',
        email: initialAdminEmail,
        joinedAt: FieldValue.serverTimestamp(),
        invitedBy: (req as any).user?.uid || 'system',
      }, { merge: true });
    }

    await logAdminAction(req, "manage_organisation", "", orgId, { name, privacyThreshold });
    res.json({ success: true, joinCode });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// A member removing themselves from their organisation - the reverse of
// /api/org/join. Their own wellbeing data is entirely unaffected; this only
// touches the membership link itself.
app.post("/api/org/leave", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
    const db = getDb();
    const userDoc = await db.collection("users").doc(user.uid).get();
    const orgId = userDoc.exists ? userDoc.data()?.organisationId : null;
    if (!orgId) {
      return res.status(400).json({ error: "You're not currently part of an organisation." });
    }

    await db.collection("users").doc(user.uid).set({
      organisationId: FieldValue.delete(),
      shareAnonymizedDataWithOrg: false,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await db.collection("organisations").doc(orgId).update({
      memberUids: FieldValue.arrayRemove(user.uid),
      adminUids: FieldValue.arrayRemove(user.uid),
    });
    // Clean up the granular Enterprise role record too - otherwise it
    // silently outlives the membership it describes, the same class of bug
    // user-data-collections.ts's own history warns against.
    await db.collection("organisations").doc(orgId).collection("members").doc(user.uid).delete();
    // Same reasoning for any desktop-deployment device this user registered
    // under the org they're leaving (organisations/{orgId}/devices, keyed by
    // ownerUid) - otherwise it silently outlives the membership too.
    const devicesSnap = await db.collection("organisations").doc(orgId).collection("devices")
      .where("ownerUid", "==", user.uid).get();
    await Promise.all(devicesSnap.docs.map((d: any) => d.ref.delete()));

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============ Organisation Membership & Aggregate Dashboard ============
// Everything below reads/writes the top-level `organisations` collection and
// other users' `users/{uid}` docs via the Admin SDK, which is why none of it
// needs (or has) client-facing Firestore rules - a hand-written security rule
// complex enough to safely express "return an aggregate, never a record" is
// much harder to get right than an explicit, testable server check. Org
// admins never get direct Firestore read access to another member's data;
// they only ever see what these endpoints choose to compute and return.

// ============ Enterprise: organisation-level RBAC & audit logging ============
// A genuinely new layer on top of the org membership model above, not a
// rename of it. See org-rbac.ts for the role/permission table itself - this
// section only wires that pure logic to real Firestore reads and to the
// existing requireAuth/logAdminAction conventions.

// Resolves a member's granular Enterprise role. Prefers the real per-member
// record (organisations/{orgId}/members/{uid}); if that subdocument doesn't
// exist yet - an org created, or a member who joined, before this feature
// existed - falls back to the legacy binary adminUids/memberUids arrays so
// every existing org and member keeps working with zero migration.
const getOrgMemberRole = async (db: any, orgId: string, org: any, uid: string): Promise<OrgRole | null> => {
  const memberDoc = await db.collection("organisations").doc(orgId).collection("members").doc(uid).get();
  if (memberDoc.exists) {
    const role = memberDoc.data()?.role;
    if (isOrgRole(role)) return role;
  }
  const adminUids: string[] = org.adminUids || [];
  const memberUids: string[] = org.memberUids || [];
  if (adminUids.includes(uid)) return 'owner';
  if (memberUids.includes(uid)) return 'member';
  return null;
};

// Shared by every Enterprise guard below - one real org existence check and
// one real role resolution, not three copies of the same Firestore reads.
const loadOrgAndCallerRole = async (req: any, orgId: string) => {
  const user = requireAuth(req);
  const db = getDb();
  const orgDoc = await db.collection("organisations").doc(orgId).get();
  if (!orgDoc.exists) {
    throw new Error("Organisation not found.");
  }
  const org = orgDoc.data()!;
  const role = await getOrgMemberRole(db, orgId, org, user.uid);
  return { user, db, org, role };
};

const requireOrgRole = async (req: any, orgId: string, allowedRoles: OrgRole[]) => {
  const { user, org, role } = await loadOrgAndCallerRole(req, orgId);
  if (!role || !allowedRoles.includes(role)) {
    throw new Error("Forbidden: Insufficient organisation role for this action.");
  }
  return { user, org, role };
};

// A permission-based variant for routes better expressed as "needs this
// capability" than "needs to be one of these specific roles" - e.g. both
// owner and billing_admin can view billing without every such route having
// to enumerate every role that happens to hold that permission.
const requireOrgPermission = async (req: any, orgId: string, permission: OrgPermission) => {
  const { user, db, org, role } = await loadOrgAndCallerRole(req, orgId);
  if (!hasOrgPermission(role, permission)) {
    throw new Error("Forbidden: Insufficient organisation permissions for this action.");
  }
  return { user, db, org, role };
};

// Prevents an org from ever being left with zero owners - the same
// reasoning as assertNotLastPlatformOwner above, scoped to one org's
// members subcollection instead of the platform-wide admin_users one.
//
// This must mirror getOrgMemberRole's own resolution rules, not just query
// the members subcollection for role=='owner' - a legacy org (or a legacy
// owner who has never had a granular members/{uid} doc written) resolves
// to 'owner' entirely via the org.adminUids fallback, with no matching
// members doc at all. Querying the subcollection alone would find zero
// owners for such an org and silently let its actual last owner be
// demoted or removed with no protection whatsoever.
const assertNotLastOrgOwner = async (db: any, orgId: string, org: any, targetUid: string) => {
  const membersSnap = await db.collection("organisations").doc(orgId).collection("members").get();
  const resolvedRoleByUid = new Map<string, string>();
  membersSnap.docs.forEach((d: any) => {
    const role = d.data()?.role;
    if (isOrgRole(role)) resolvedRoleByUid.set(d.id, role);
  });
  const ownerUids = new Set<string>();
  resolvedRoleByUid.forEach((role, uid) => {
    if (role === 'owner') ownerUids.add(uid);
  });
  // Anyone in the legacy adminUids array who does NOT have a granular
  // members doc (or whose doc has no valid role) still resolves to 'owner'
  // via getOrgMemberRole's fallback, and must count as one here too.
  const adminUids: string[] = org?.adminUids || [];
  adminUids.forEach((uid) => {
    if (!resolvedRoleByUid.has(uid)) ownerUids.add(uid);
  });
  if (ownerUids.has(targetUid) && ownerUids.size <= 1) {
    throw new Error("Operation Rejected: Cannot remove or downgrade the last owner of this organisation.");
  }
};

// Org-scoped counterpart to logAdminAction above - same shape (actor,
// action, target, timestamp, IP/user agent), plus orgId and structured
// before/after diffs, written to the ORG's OWN audit trail
// (organisations/{orgId}/audit_logs) rather than the platform-wide one, so
// an org's own admins can read their org's history without ever touching
// - or being able to read - Blaze Break's platform-staff audit log.
// before/after must stay structured field diffs, never raw free-text
// content (e.g. never a full document body or chat message).
const logOrgAuditAction = async (
  req: any,
  orgId: string,
  action: string,
  targetResourceType: string,
  targetResourceId: string,
  before: Record<string, unknown> | null = null,
  after: Record<string, unknown> | null = null,
) => {
  const actor = req.user;
  const entry = {
    actorUid: actor?.uid || "system",
    actorEmail: actor?.email || "system",
    orgId,
    action,
    targetResourceType,
    targetResourceId,
    before,
    after,
    createdAt: FieldValue.serverTimestamp(),
    ipAddress: req.ip || "",
    userAgent: req.headers?.["user-agent"] || "",
  };
  try {
    const db = getDb();
    await db.collection("organisations").doc(orgId).collection("audit_logs").add(entry);
  } catch (err: any) {
    // Same tradeoff as logAdminAction: the org action already happened, so
    // we log the full entry inline rather than block/retry - otherwise a
    // Firestore hiccup here leaves an org's own compliance trail with a
    // silent gap and nothing pointing to what was missed.
    console.error("Failed to write org audit log:", err.message, JSON.stringify(entry));
  }
};

// Kept as the exact function existing call sites already depend on (~19 of
// them), now a thin wrapper: 'admin' is a new, distinct granular role from
// the legacy adminUids array, so this now also admits a real admin-role
// member who was never added to that array - a real capability expansion,
// not just a rename - while every existing owner (via the adminUids
// fallback in getOrgMemberRole) keeps working unchanged.
const requireOrgAdmin = async (req: any, orgId: string) => {
  const { user, org } = await requireOrgRole(req, orgId, ['owner', 'admin']);
  return { user, org };
};

// Shared by every endpoint that aggregates member wellbeing data
// (dashboard, climate, risk-trend below) - a member only counts if they've
// explicitly opted in via shareAnonymizedDataWithOrg, and the caller is
// responsible for checking the returned list against org.privacyThreshold
// before using any of it, the same k-anonymity gate every one of these
// endpoints already enforces.
const getConsentingMemberUids = async (db: any, memberUids: string[]): Promise<string[]> => {
  const consentingUids: string[] = [];
  await Promise.all(memberUids.map(async (uid) => {
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.exists && userDoc.data()?.shareAnonymizedDataWithOrg === true) {
      consentingUids.push(uid);
    }
  }));
  return consentingUids;
};

// Employee redeems a join code to link themselves to their employer's org.
// This is the only way `organisationId` ever gets set on a user - the
// Firestore rules explicitly block clients from setting it directly, so
// nobody can self-assign into a company they don't actually work for.
app.post("/api/org/join", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
    const { joinCode } = req.body;
    if (!joinCode || typeof joinCode !== 'string') {
      return res.status(400).json({ error: "A join code is required." });
    }
    const db = getDb();

    const existingUserDoc = await db.collection("users").doc(user.uid).get();
    if (existingUserDoc.exists && existingUserDoc.data()?.organisationId) {
      return res.status(400).json({ error: "You're already part of an organisation. Contact support to switch." });
    }

    const orgsSnap = await db.collection("organisations").where("joinCode", "==", joinCode.trim().toUpperCase()).limit(1).get();
    if (orgsSnap.empty) {
      return res.status(404).json({ error: "That join code doesn't match any organisation. Double-check with your admin." });
    }
    const orgDoc = orgsSnap.docs[0];

    await db.collection("users").doc(user.uid).set({
      organisationId: orgDoc.id,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await db.collection("organisations").doc(orgDoc.id).update({
      memberUids: FieldValue.arrayUnion(user.uid),
    });
    // Real per-member Enterprise role record, not just the legacy array -
    // a fresh join always starts at 'member'; an owner/admin upgrades them
    // later via the role-management route below.
    await db.collection("organisations").doc(orgDoc.id).collection("members").doc(user.uid).set({
      role: 'member',
      status: 'active',
      email: user.email || '',
      joinedAt: FieldValue.serverTimestamp(),
      invitedBy: 'join_code',
    }, { merge: true });

    // If this person was invited by email, that invite is now resolved -
    // clean it up so the admin's pending list only shows people still
    // waiting to join, not everyone who's ever been invited.
    if (user.email) {
      try {
        await db.collection("organisations").doc(orgDoc.id).collection("pending_invites").doc(user.email.toLowerCase()).delete();
      } catch (e) {
        // Non-critical - joining itself already succeeded above.
      }
    }

    res.json({ success: true, organisationId: orgDoc.id, organisationName: orgDoc.data().name });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// The current user's own org membership status - which org (if any), whether
// they're that org's admin, and their own consent setting. Drives which UI
// the frontend shows; carries no information about anyone else.
app.get("/api/org/me", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
    const db = getDb();
    const userDoc = await db.collection("users").doc(user.uid).get();
    const orgId = userDoc.exists ? userDoc.data()?.organisationId : null;
    if (!orgId) {
      return res.json({ organisationId: null });
    }
    const orgDoc = await db.collection("organisations").doc(orgId).get();
    if (!orgDoc.exists) {
      return res.json({ organisationId: null });
    }
    const org = orgDoc.data()!;
    const isOrgAdmin = (org.adminUids || []).includes(user.uid);
    res.json({
      organisationId: orgId,
      organisationName: org.name,
      isOrgAdmin,
      joinCode: isOrgAdmin ? org.joinCode : undefined,
      privacyThreshold: isOrgAdmin ? (org.privacyThreshold || 5) : undefined,
      shareAnonymizedDataWithOrg: userDoc.data()?.shareAnonymizedDataWithOrg === true,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// The real, server-side aggregation. This is the only place any individual
// member's wellbeing data is ever read for org-reporting purposes, and it
// never returns individual records - only aggregate counts. It refuses to
// return anything at all below the organisation's configured minimum cohort
// size, checked against the actual consenting count for this specific
// request, not the org's total headcount.
app.get("/api/org/:orgId/dashboard", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { org } = await requireOrgAdmin(req, orgId);
    const db = getDb();

    const threshold = org.privacyThreshold || 5;
    const memberUids: string[] = org.memberUids || [];

    // Only members who've explicitly opted in count toward anything below.
    const consentingUids = await getConsentingMemberUids(db, memberUids);

    if (consentingUids.length < threshold) {
      return res.json({ locked: true, cohortSize: consentingUids.length, threshold });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let moodPositive = 0, moodNegative = 0, moodNeutral = 0, moodIntensitySum = 0, moodCount = 0;
    let activeMembers = 0;
    const bodySignalCounts: Record<string, number> = {};

    await Promise.all(consentingUids.map(async (uid) => {
      let hadActivity = false;

      const moodSnap = await db.collection("users").doc(uid).collection("mood_pulses")
        .where("createdAt", ">=", sevenDaysAgo).get();
      moodSnap.forEach(doc => {
        const d = doc.data();
        hadActivity = true;
        moodCount++;
        moodIntensitySum += d.intensity || 0;
        if (d.moodLabel === 'calm' || d.moodLabel === 'hopeful' || d.moodLabel === 'focused') moodPositive++;
        else if (d.moodLabel === 'overwhelmed' || d.moodLabel === 'frustrated' || d.moodLabel === 'pressured' || d.moodLabel === 'tired') moodNegative++;
        else moodNeutral++;
      });

      const bodySnap = await db.collection("users").doc(uid).collection("body_checkins")
        .where("createdAt", ">=", sevenDaysAgo).get();
      bodySnap.forEach(doc => {
        hadActivity = true;
        const signals: string[] = doc.data().signals || [];
        signals.forEach(s => {
          if (s === 'calm_settled') return;
          bodySignalCounts[s] = (bodySignalCounts[s] || 0) + 1;
        });
      });

      if (hadActivity) activeMembers++;
    }));

    const topBodySignals = Object.entries(bodySignalCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([signal, count]) => ({ signal, count }));

    res.json({
      locked: false,
      cohortSize: consentingUids.length,
      threshold,
      windowDays: 7,
      engagementRate: Math.round((activeMembers / consentingUids.length) * 100),
      moodDistribution: { positive: moodPositive, negative: moodNegative, neutral: moodNeutral },
      avgMoodIntensity: moodCount > 0 ? Number((moodIntensitySum / moodCount).toFixed(1)) : null,
      topBodySignals,
    });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

// Positive Reinforcement Engine: suggests recognition prompts for the wall
// below, built entirely from the same k-anonymity-gated engagement-rate
// signal the dashboard endpoint above already computes - never a named
// individual, and refuses below the org's cohort threshold exactly like
// every other aggregate endpoint in this file. Suggestions are just text
// for a human to review/edit/discard in the composer; nothing here posts
// anything on anyone's behalf.
app.get("/api/org/:orgId/recognition-suggestions", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { org } = await requireOrgAdmin(req, orgId);
    const db = getDb();

    const threshold = org.privacyThreshold || 5;
    const memberUids: string[] = org.memberUids || [];
    const consentingUids = await getConsentingMemberUids(db, memberUids);

    if (consentingUids.length < threshold) {
      return res.json({ locked: true, cohortSize: consentingUids.length, threshold, suggestions: [] });
    }

    // Existence-only checks (limit 1), unlike the dashboard endpoint's full
    // scan - all this needs is "did this member show any activity in this
    // window", not the full mood/body distribution.
    const countActiveInWindow = async (sinceIso: string, untilIso: string): Promise<number> => {
      let active = 0;
      await Promise.all(consentingUids.map(async (uid) => {
        const moodSnap = await db.collection("users").doc(uid).collection("mood_pulses")
          .where("createdAt", ">=", sinceIso).where("createdAt", "<", untilIso).limit(1).get();
        if (!moodSnap.empty) { active++; return; }
        const bodySnap = await db.collection("users").doc(uid).collection("body_checkins")
          .where("createdAt", ">=", sinceIso).where("createdAt", "<", untilIso).limit(1).get();
        if (!bodySnap.empty) active++;
      }));
      return active;
    };

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

    const [currentActive, previousActive] = await Promise.all([
      countActiveInWindow(oneWeekAgo, nowIso),
      countActiveInWindow(twoWeeksAgo, oneWeekAgo),
    ]);

    const current = { engagementRate: Math.round((currentActive / consentingUids.length) * 100) };
    const previous = { engagementRate: Math.round((previousActive / consentingUids.length) * 100) };

    res.json({
      locked: false,
      cohortSize: consentingUids.length,
      threshold,
      suggestions: suggestRecognitionPrompts(current, previous),
    });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

// Team recognition wall. Unlike the aggregate dashboard above, these posts
// ARE attributed by design - naming who you're thanking is the point of a
// recognition, not a privacy concern the way individual wellbeing data is.
app.post("/api/org/:orgId/recognition", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const user = requireAuth(req);
    const db = getDb();
    const orgDoc = await db.collection("organisations").doc(orgId).get();
    if (!orgDoc.exists || !(orgDoc.data()?.memberUids || []).includes(user.uid)) {
      return res.status(403).json({ error: "You're not a member of this organisation." });
    }
    const { message, isAnonymous } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0 || message.length > 300) {
      return res.status(400).json({ error: "Message must be 1-300 characters." });
    }
    const userDoc = await db.collection("users").doc(user.uid).get();
    const fromName = isAnonymous ? "Anonymous" : (userDoc.data()?.displayName || userDoc.data()?.preferredName || "A teammate");

    const ref = await db.collection("organisations").doc(orgId).collection("recognition_wall").add({
      from: fromName,
      message: message.trim(),
      createdAt: FieldValue.serverTimestamp(),
    });
    res.json({ success: true, id: ref.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/org/:orgId/recognition", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const user = requireAuth(req);
    const db = getDb();
    const orgDoc = await db.collection("organisations").doc(orgId).get();
    if (!orgDoc.exists || !(orgDoc.data()?.memberUids || []).includes(user.uid)) {
      return res.status(403).json({ error: "You're not a member of this organisation." });
    }
    const snap = await db.collection("organisations").doc(orgId).collection("recognition_wall")
      .orderBy("createdAt", "desc").limit(20).get();
    const items = snap.docs.map(d => {
      const data = d.data();
      const reactedUids: string[] = data.reactedUids || [];
      return {
        id: d.id,
        from: data.from,
        message: data.message,
        createdAt: data.createdAt,
        reactionCount: reactedUids.length,
        reacted: reactedUids.includes(user.uid),
      };
    });
    res.json({ items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/org/:orgId/recognition/:recognitionId/react", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId, recognitionId } = req.params;
    const user = requireAuth(req);
    const db = getDb();
    const orgDoc = await db.collection("organisations").doc(orgId).get();
    if (!orgDoc.exists || !(orgDoc.data()?.memberUids || []).includes(user.uid)) {
      return res.status(403).json({ error: "You're not a member of this organisation." });
    }
    const ref = db.collection("organisations").doc(orgId).collection("recognition_wall").doc(recognitionId);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "That post no longer exists." });
    }
    const reactedUids: string[] = doc.data()?.reactedUids || [];
    const alreadyReacted = reactedUids.includes(user.uid);
    await ref.update({
      reactedUids: alreadyReacted ? FieldValue.arrayRemove(user.uid) : FieldValue.arrayUnion(user.uid),
    });
    res.json({ success: true, reacted: !alreadyReacted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============ Anonymous Team Voice ============
// Genuinely, structurally anonymous - the write itself never includes the
// submitter's uid, not even transiently, so there's nothing for an org
// admin (or anyone with database access) to trace back. The endpoint is
// still authenticated to confirm the submitter is a real member and to
// apply basic rate/content limits, but that check never touches what
// actually gets stored.
app.post("/api/org/:orgId/suggestions", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const user = requireAuth(req);
    const db = getDb();
    const orgDoc = await db.collection("organisations").doc(orgId).get();
    if (!orgDoc.exists || !(orgDoc.data()?.memberUids || []).includes(user.uid)) {
      return res.status(403).json({ error: "You're not a member of this organisation." });
    }
    const { message } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0 || message.length > 500) {
      return res.status(400).json({ error: "Message must be 1-500 characters." });
    }
    await db.collection("organisations").doc(orgId).collection("anonymous_suggestions").add({
      message: message.trim(),
      createdAt: FieldValue.serverTimestamp(),
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/org/:orgId/suggestions", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const user = requireAuth(req);
    const db = getDb();
    const orgDoc = await db.collection("organisations").doc(orgId).get();
    if (!orgDoc.exists || !(orgDoc.data()?.memberUids || []).includes(user.uid)) {
      return res.status(403).json({ error: "You're not a member of this organisation." });
    }
    const snap = await db.collection("organisations").doc(orgId).collection("anonymous_suggestions")
      .orderBy("createdAt", "desc").limit(30).get();
    const suggestions = snap.docs.map(d => ({ id: d.id, message: d.data().message, createdAt: d.data().createdAt }));
    res.json({ suggestions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// The org admin's own real figures for the cost-of-pressure calculator. This
// replaces what used to be entirely fabricated example numbers - real
// figures in, a calculation out, rather than a made-up ROI claim.
app.post("/api/org/:orgId/cost-inputs", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { org } = await requireOrgAdmin(req, orgId);
    const { annualSicknessDays, avgDailyCostPerEmployee, headcount } = req.body;
    if (
      typeof annualSicknessDays !== 'number' || annualSicknessDays < 0 ||
      typeof avgDailyCostPerEmployee !== 'number' || avgDailyCostPerEmployee < 0 ||
      typeof headcount !== 'number' || headcount < 0
    ) {
      return res.status(400).json({ error: "All three figures must be non-negative numbers." });
    }
    const db = getDb();
    const costInputs = { annualSicknessDays, avgDailyCostPerEmployee, headcount };
    await db.collection("organisations").doc(orgId).update({
      costInputs,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await logOrgAuditAction(req, orgId, "update_cost_inputs", "organisation", orgId, org.costInputs || null, costInputs);
    // Also appended to a real history log, not just overwritten - this is
    // what makes the "track your trend over months" claim already shown in
    // the UI an honest one rather than another insinuated-but-missing
    // capability.
    await db.collection("organisations").doc(orgId).collection("cost_input_history").add({
      annualSicknessDays, avgDailyCostPerEmployee, headcount,
      enteredAt: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

app.get("/api/org/:orgId/cost-inputs", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const user = requireAuth(req);
    const db = getDb();
    const orgDoc = await db.collection("organisations").doc(orgId).get();
    if (!orgDoc.exists || !(orgDoc.data()?.memberUids || []).includes(user.uid)) {
      return res.status(403).json({ error: "You're not a member of this organisation." });
    }
    const historySnap = await db.collection("organisations").doc(orgId).collection("cost_input_history")
      .orderBy("enteredAt", "asc").limit(24).get();
    const history = historySnap.docs.map(d => d.data());
    res.json({ costInputs: orgDoc.data()?.costInputs || null, history });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Platform admin's list of all provisioned customer organisations - powers
// the onboarding UI so Blaze Break's own team can see what already exists
// before creating something new or looking up a join code to resend.
app.get("/api/admin/orgs", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requireAdmin(req);
    const db = getDb();
    const snap = await db.collection("organisations").orderBy("createdAt", "desc").limit(200).get();
    const orgs = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name,
        joinCode: data.joinCode,
        privacyThreshold: data.privacyThreshold || 5,
        memberCount: (data.memberUids || []).length,
        adminCount: (data.adminUids || []).length,
        createdAt: data.createdAt,
      };
    });
    res.json({ orgs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============ Team Climate Survey (real HSE-aligned aggregation) ============
// Individual responses live in each member's own climate_survey_responses
// subcollection (Firestore rules let them write directly, same as
// mood_pulses). This endpoint is the only place those get read across
// members, and - exactly like the pulse dashboard - it only ever returns
// averaged numbers, gated by the same minimum cohort size.

app.get("/api/org/:orgId/climate", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { org } = await requireOrgAdmin(req, orgId);
    const db = getDb();

    const threshold = org.privacyThreshold || 5;
    const memberUids: string[] = org.memberUids || [];

    const consentingUids = await getConsentingMemberUids(db, memberUids);

    if (consentingUids.length < threshold) {
      return res.json({ locked: true, cohortSize: consentingUids.length, threshold, responseCount: 0 });
    }

    // Climate surveys are periodic, not daily - a 90-day window catches a
    // quarter's worth of responses rather than the last-7-days window used
    // for mood/body signals.
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const dimensions = ['demands', 'control', 'support', 'relationships', 'role', 'change'] as const;
    const sums: Record<string, number> = { demands: 0, control: 0, support: 0, relationships: 0, role: 0, change: 0 };
    let responseCount = 0;
    const respondedUids = new Set<string>();

    await Promise.all(consentingUids.map(async (uid) => {
      const snap = await db.collection("users").doc(uid).collection("climate_survey_responses")
        .where("createdAt", ">=", ninetyDaysAgo).orderBy("createdAt", "desc").limit(1).get();
      if (!snap.empty) {
        const d = snap.docs[0].data();
        dimensions.forEach(dim => { sums[dim] += d[dim] || 0; });
        responseCount++;
        respondedUids.add(uid);
      }
    }));

    if (responseCount < threshold) {
      return res.json({ locked: true, cohortSize: responseCount, threshold, responseCount });
    }

    const averages: Record<string, number> = {};
    dimensions.forEach(dim => { averages[dim] = Number((sums[dim] / responseCount).toFixed(1)); });

    res.json({
      locked: false,
      cohortSize: consentingUids.length,
      responseCount,
      threshold,
      averages,
      responseRate: Math.round((responseCount / consentingUids.length) * 100),
    });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

// ============ Wellbeing Risk Trend (real, from existing aggregates - not a trained model) ============
// Deliberately not a predictive model: this is a transparent trend
// indicator built entirely from the same real, consented, k-anonymous
// aggregates the dashboard and climate endpoints already compute (mood
// pulses, the HSE-aligned climate survey). It tells an admin whether
// things are trending better or worse and by how much - it does not
// claim a probability of absenteeism or any other number this app has
// no real, validated basis to produce. See org-risk-trend.ts for the
// actual calculation and why each choice was made.

// Field names below (moodConcern, climateConcern, etc.) are the actual
// Firestore/API wire format, kept as-is even though the computation layer
// (org-risk-trend.ts) and the UI (OrgDashboard.tsx) were renamed away from
// "Concern" per docs/GUARDIAN_SUPPORT_SPEC.md Appendix B. Renaming these
// persisted field names would silently break trend continuity for any
// organisation with existing risk_trend_history documents written under
// the old names - a real data-compatibility cost the vocabulary change
// doesn't need to pay. If a full schema rename is ever wanted, it needs
// an explicit migration, not a find-and-replace.
interface OrgStrainSnapshot {
  cohortSize: number;
  moodConcern: number | null;
  climateConcern: number | null;
  climateConcernByDimension: Record<string, number> | null;
  overallConcern: number | null;
}

// Architectural boundary (docs/GUARDIAN_SUPPORT_SPEC.md Appendix B): this
// snapshot is aggregate-only and must never be computed or exposed for an
// individual. The k-anonymity gate in the route handler below (dropping
// any cohort - org or team - under the configured threshold before this
// is ever called) IS that boundary. Do not add a per-member field here,
// and do not call this with a uids list that could resolve to one person.
//
// Computes the full strain snapshot for one set of member uids - called
// once for the whole org and once per team below, so a team's number is
// calculated exactly the same way the org-wide one is, not a different
// or lighter-weight version.
const computeStrainSnapshotForCohort = async (db: any, uids: string[]): Promise<OrgStrainSnapshot> => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let moodPositive = 0, moodNegative = 0, moodNeutral = 0;
  await Promise.all(uids.map(async (uid) => {
    const moodSnap = await db.collection("users").doc(uid).collection("mood_pulses")
      .where("createdAt", ">=", sevenDaysAgo).get();
    moodSnap.forEach((doc: any) => {
      const label = doc.data().moodLabel;
      if (label === 'calm' || label === 'hopeful' || label === 'focused') moodPositive++;
      else if (label === 'overwhelmed' || label === 'frustrated' || label === 'pressured' || label === 'tired') moodNegative++;
      else moodNeutral++;
    });
  }));
  const moodConcern = computeMoodStrain(moodPositive, moodNegative, moodNeutral);

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const climateDims = ['demands', 'control', 'support', 'relationships', 'role', 'change'] as const;
  const climateSums: Record<string, number> = { demands: 0, control: 0, support: 0, relationships: 0, role: 0, change: 0 };
  let climateResponseCount = 0;
  await Promise.all(uids.map(async (uid) => {
    const snap = await db.collection("users").doc(uid).collection("climate_survey_responses")
      .where("createdAt", ">=", ninetyDaysAgo).orderBy("createdAt", "desc").limit(1).get();
    if (!snap.empty) {
      const d = snap.docs[0].data();
      climateDims.forEach(dim => { climateSums[dim] += d[dim] || 0; });
      climateResponseCount++;
    }
  }));
  const climateAverages = climateResponseCount > 0
    ? {
        demands: climateSums.demands / climateResponseCount,
        control: climateSums.control / climateResponseCount,
        support: climateSums.support / climateResponseCount,
        relationships: climateSums.relationships / climateResponseCount,
        role: climateSums.role / climateResponseCount,
        change: climateSums.change / climateResponseCount,
      }
    : null;
  const climateConcern = computeClimateStrain(climateAverages);
  const climateConcernByDimension = computeClimateStrainByDimension(climateAverages);

  return {
    cohortSize: uids.length,
    moodConcern,
    climateConcern,
    climateConcernByDimension,
    overallConcern: computeOverallStrain(climateConcern, moodConcern),
  };
};

app.get("/api/org/:orgId/risk-trend", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { org } = await requireOrgAdmin(req, orgId);
    const db = getDb();

    const threshold = org.privacyThreshold || 5;
    const memberUids: string[] = org.memberUids || [];
    const memberTeams: Record<string, string> = org.memberTeams || {};
    const consentingUids = await getConsentingMemberUids(db, memberUids);

    if (consentingUids.length < threshold) {
      return res.json({ locked: true, cohortSize: consentingUids.length, threshold });
    }

    const orgSnapshot = await computeStrainSnapshotForCohort(db, consentingUids);

    // Team breakdown: group consenting members by their assigned team,
    // then only compute (and only ever expose) a snapshot for teams that
    // independently clear the same k-anonymity threshold as the org as a
    // whole. A team with too few consenting members just doesn't appear
    // in teamBreakdown at all - not shown as "locked", simply absent,
    // since listing a locked team by name would itself say more about a
    // small team's participation than this feature should ever reveal.
    const teamGroups: Record<string, string[]> = {};
    consentingUids.forEach((uid) => {
      const team = memberTeams[uid];
      if (team) {
        if (!teamGroups[team]) teamGroups[team] = [];
        teamGroups[team].push(uid);
      }
    });
    // A team only qualifies for its own breakdown entry if BOTH it, and
    // the rest of the org once it's excluded (the "complement"), clear the
    // threshold. Checking team size alone is not enough: the org-wide
    // aggregate is already shown once the org clears its own threshold, so
    // an admin who can see both the org total and a team sized N-1 (every
    // consenting member except one target person) can back-calculate that
    // one person's aggregate signal by subtraction - collapsing the
    // "aggregate >= threshold" guarantee to an effectively single-person
    // cohort for whoever was excluded, entirely within what each
    // individual check allows. Team labels are admin-assigned and
    // reassignable at any time (see the member-management UI), so this
    // isn't a hypothetical: an admin can construct exactly this team on
    // purpose. This check closes that specific, demonstrated attack; it
    // does not (yet) defend against a slower attack built from many
    // overlapping team combinations - see docs/PRODUCT_SAFETY_PRIVACY.md.
    const qualifyingTeams = Object.entries(teamGroups).filter(([, uids]) => {
      if (uids.length < threshold) return false;
      const complementSize = consentingUids.length - uids.length;
      return complementSize === 0 || complementSize >= threshold;
    });
    const teamSnapshots: Record<string, OrgStrainSnapshot> = {};
    await Promise.all(qualifyingTeams.map(async ([team, uids]) => {
      teamSnapshots[team] = await computeStrainSnapshotForCohort(db, uids);
    }));

    // Snapshot handling: read history first so today's write (if any)
    // doesn't contaminate the "previous" comparison, and only ever write
    // once per UTC day regardless of how many times this is loaded.
    const historySnap = await db.collection("organisations").doc(orgId).collection("risk_trend_history")
      .orderBy("recordedAt", "desc").limit(90).get();
    const history = historySnap.docs.map((d: any) => d.data() as {
      recordedAt: string;
      overallConcern: number | null;
      moodConcern: number | null;
      climateConcern: number | null;
      teamConcerns?: Record<string, number | null>;
    });

    const todayUtc = new Date().toISOString().slice(0, 10);
    const alreadySnapshottedToday = history.some((h: any) => h.recordedAt.slice(0, 10) === todayUtc);
    if (!alreadySnapshottedToday && orgSnapshot.overallConcern !== null) {
      const teamConcerns: Record<string, number | null> = {};
      Object.entries(teamSnapshots).forEach(([team, snap]) => { teamConcerns[team] = snap.overallConcern; });
      await db.collection("organisations").doc(orgId).collection("risk_trend_history").add({
        recordedAt: new Date().toISOString(),
        overallConcern: orgSnapshot.overallConcern,
        moodConcern: orgSnapshot.moodConcern,
        climateConcern: orgSnapshot.climateConcern,
        teamConcerns,
      });
    }

    // Compare against whichever snapshot sits closest to ~28 days back -
    // a genuine month-over-month read, not noisy day-to-day movement in
    // a signal built on overlapping 7-day windows.
    const twentyEightDaysAgo = Date.now() - 28 * 24 * 60 * 60 * 1000;
    const findClosestPrior = (getValue: (h: any) => number | null | undefined) => history
      .filter((h: any) => new Date(h.recordedAt).getTime() <= twentyEightDaysAgo && getValue(h) != null)
      .sort((a: any, b: any) => Math.abs(new Date(a.recordedAt).getTime() - twentyEightDaysAgo) - Math.abs(new Date(b.recordedAt).getTime() - twentyEightDaysAgo))[0];

    const priorOrgSnapshot = findClosestPrior((h: any) => h.overallConcern);
    const orgTrend = computeTrend(orgSnapshot.overallConcern, priorOrgSnapshot?.overallConcern ?? null);

    // Per-signal direction of travel, for the leading-indicators view. Mood
    // and climate move at different speeds (mood is the faster, more
    // volatile early signal), so showing each one's trend separately is the
    // point - "mood is worsening while climate holds steady" is exactly the
    // kind of early, structural read this view exists to surface. Aggregate
    // only; never per person.
    const priorMood = findClosestPrior((h: any) => h.moodConcern);
    const moodTrend = computeTrend(orgSnapshot.moodConcern, priorMood?.moodConcern ?? null);
    const priorClimate = findClosestPrior((h: any) => h.climateConcern);
    const climateTrend = computeTrend(orgSnapshot.climateConcern, priorClimate?.climateConcern ?? null);

    const teamBreakdown: Record<string, OrgStrainSnapshot & { trend: ReturnType<typeof computeTrend> }> = {};
    Object.entries(teamSnapshots).forEach(([team, snap]) => {
      const priorTeamSnapshot = findClosestPrior((h: any) => h.teamConcerns?.[team]);
      teamBreakdown[team] = { ...snap, trend: computeTrend(snap.overallConcern, priorTeamSnapshot?.teamConcerns?.[team] ?? null) };
    });

    res.json({
      locked: false,
      cohortSize: consentingUids.length,
      threshold,
      moodConcern: orgSnapshot.moodConcern,
      climateConcern: orgSnapshot.climateConcern,
      climateConcernByDimension: orgSnapshot.climateConcernByDimension,
      overallConcern: orgSnapshot.overallConcern,
      trend: orgTrend,
      moodTrend,
      climateTrend,
      comparedAgainst: priorOrgSnapshot?.recordedAt || null,
      history: history.slice().reverse().map((h: any) => ({ recordedAt: h.recordedAt, overallConcern: h.overallConcern })),
      teamBreakdown,
    });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

// ============ Team Challenges (real creation & participation) ============

app.post("/api/org/:orgId/challenges", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    await requireOrgAdmin(req, orgId);
    const { title, description } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0 || title.length > 100) {
      return res.status(400).json({ error: "Title must be 1-100 characters." });
    }
    if (description && (typeof description !== 'string' || description.length > 300)) {
      return res.status(400).json({ error: "Description must be under 300 characters." });
    }
    const db = getDb();
    const ref = await db.collection("organisations").doc(orgId).collection("challenges").add({
      title: title.trim(),
      description: (description || '').trim(),
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      participantUids: [],
    });
    res.json({ success: true, id: ref.id });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

app.get("/api/org/:orgId/challenges", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const user = requireAuth(req);
    const db = getDb();
    const orgDoc = await db.collection("organisations").doc(orgId).get();
    if (!orgDoc.exists || !(orgDoc.data()?.memberUids || []).includes(user.uid)) {
      return res.status(403).json({ error: "You're not a member of this organisation." });
    }
    const memberCount = (orgDoc.data()?.memberUids || []).length;
    const snap = await db.collection("organisations").doc(orgId).collection("challenges")
      .orderBy("createdAt", "desc").limit(20).get();
    const challenges = snap.docs.map(d => {
      const data = d.data();
      const participantUids: string[] = data.participantUids || [];
      return {
        id: d.id,
        title: data.title,
        description: data.description,
        active: data.active,
        participantCount: participantUids.length,
        participationRate: memberCount > 0 ? Math.round((participantUids.length / memberCount) * 100) : 0,
        joined: participantUids.includes(user.uid),
      };
    });
    res.json({ challenges });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/org/:orgId/challenges/:challengeId/join", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId, challengeId } = req.params;
    const user = requireAuth(req);
    const db = getDb();
    const orgDoc = await db.collection("organisations").doc(orgId).get();
    if (!orgDoc.exists || !(orgDoc.data()?.memberUids || []).includes(user.uid)) {
      return res.status(403).json({ error: "You're not a member of this organisation." });
    }
    await db.collection("organisations").doc(orgId).collection("challenges").doc(challengeId).update({
      participantUids: FieldValue.arrayUnion(user.uid),
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/org/:orgId/challenges/:challengeId/leave", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId, challengeId } = req.params;
    const user = requireAuth(req);
    const db = getDb();
    await db.collection("organisations").doc(orgId).collection("challenges").doc(challengeId).update({
      participantUids: FieldValue.arrayRemove(user.uid),
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============ Org Admin: Member Management & Settings ============

app.get("/api/org/:orgId/members", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { org } = await requireOrgAdmin(req, orgId);
    const memberUids: string[] = org.memberUids || [];
    const adminUids: string[] = org.adminUids || [];
    const memberTeams: Record<string, string> = org.memberTeams || {};

    const members = await Promise.all(memberUids.map(async (uid) => {
      try {
        const authUser = await getAuth().getUser(uid);
        return {
          uid,
          email: authUser.email || null,
          displayName: authUser.displayName || null,
          isAdmin: adminUids.includes(uid),
          team: memberTeams[uid] || null,
        };
      } catch (e) {
        return { uid, email: null, displayName: null, isAdmin: adminUids.includes(uid), team: memberTeams[uid] || null };
      }
    }));

    res.json({ members });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

app.post("/api/org/:orgId/members/:memberUid/remove", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId, memberUid } = req.params;
    const { user, org } = await requireOrgAdmin(req, orgId);
    if (memberUid === user.uid) {
      return res.status(400).json({ error: "Use 'Leave Organisation' from your own Privacy Centre to remove yourself." });
    }
    const db = getDb();
    await assertNotLastOrgOwner(db, orgId, org, memberUid);
    await db.collection("users").doc(memberUid).set({
      organisationId: FieldValue.delete(),
      shareAnonymizedDataWithOrg: false,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await db.collection("organisations").doc(orgId).update({
      memberUids: FieldValue.arrayRemove(memberUid),
      adminUids: FieldValue.arrayRemove(memberUid),
      [`memberTeams.${memberUid}`]: FieldValue.delete(),
    });
    // Clean up the granular Enterprise role record too - see /api/org/leave
    // above for why this matters.
    await db.collection("organisations").doc(orgId).collection("members").doc(memberUid).delete();
    // Same reasoning for any desktop-deployment device this member
    // registered under the org (organisations/{orgId}/devices, keyed by
    // ownerUid) - otherwise it silently outlives the membership too.
    const devicesSnap = await db.collection("organisations").doc(orgId).collection("devices")
      .where("ownerUid", "==", memberUid).get();
    await Promise.all(devicesSnap.docs.map((d: any) => d.ref.delete()));
    await logOrgAuditAction(req, orgId, "remove_member", "member", memberUid);
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("Rejected") ? 400 : 500).json({ error: err.message });
  }
});

// Team assignment - a freeform label an admin sets per member, stored on
// the org document itself (memberTeams: { [uid]: teamName }) rather than
// on the member's own user document, matching the same admin-managed-
// metadata pattern costInputs already uses. This is the only place
// "team" exists anywhere in this app - there's no separate team entity,
// no team-creation flow; a team is simply whichever members share the
// same label. Powers the per-team risk-trend breakdown below, gated by
// the exact same k-anonymity threshold as every other aggregate in this
// app - a team with too few consenting members to clear it just doesn't
// appear, the same way the org-wide dashboard locks below threshold.
app.post("/api/org/:orgId/members/:memberUid/team", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId, memberUid } = req.params;
    const { org } = await requireOrgAdmin(req, orgId);
    if (!(org.memberUids || []).includes(memberUid)) {
      return res.status(400).json({ error: "That person isn't a member of this organisation." });
    }
    const { team } = req.body;
    if (team !== null && (typeof team !== 'string' || team.length > 60)) {
      return res.status(400).json({ error: "Team name must be text under 60 characters, or null to clear it." });
    }
    const previousTeam: string | null = (org.memberTeams || {})[memberUid] || null;
    const trimmed = typeof team === 'string' ? team.trim() : null;
    const nextTeam = trimmed && trimmed.length > 0 ? trimmed : null;
    const db = getDb();
    const fieldPath = `memberTeams.${memberUid}`;
    await db.collection("organisations").doc(orgId).update({
      [fieldPath]: nextTeam ?? FieldValue.delete(),
    });
    await logOrgAuditAction(req, orgId, "assign_member_team", "member", memberUid, { team: previousTeam }, { team: nextTeam });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

app.post("/api/org/:orgId/members/:memberUid/make-admin", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId, memberUid } = req.params;
    await requireOrgAdmin(req, orgId);
    const db = getDb();
    const orgDoc = await db.collection("organisations").doc(orgId).get();
    if (!(orgDoc.data()?.memberUids || []).includes(memberUid)) {
      return res.status(400).json({ error: "That person isn't a member of this organisation." });
    }
    await db.collection("organisations").doc(orgId).update({
      adminUids: FieldValue.arrayUnion(memberUid),
    });
    // Keep the granular Enterprise role record in sync with the legacy
    // array - otherwise a member with an existing members/ doc would have
    // this promotion silently ignored, since getOrgMemberRole prefers the
    // granular record over the array fallback.
    await db.collection("organisations").doc(orgId).collection("members").doc(memberUid).set({
      role: 'admin',
    }, { merge: true });
    await logOrgAuditAction(req, orgId, "grant_admin", "member", memberUid, null, { role: 'admin' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

app.post("/api/org/:orgId/members/:memberUid/revoke-admin", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId, memberUid } = req.params;
    const { user, org } = await requireOrgAdmin(req, orgId);
    if (memberUid === user.uid) {
      return res.status(400).json({ error: "You can't revoke your own admin access - ask another admin to do it." });
    }
    if ((org.adminUids || []).length <= 1) {
      return res.status(400).json({ error: "This organisation needs at least one admin - promote someone else first." });
    }
    const db = getDb();
    await db.collection("organisations").doc(orgId).update({
      adminUids: FieldValue.arrayRemove(memberUid),
    });
    // Same sync reasoning as /make-admin above - demote in the granular
    // record too, back to plain member rather than leaving a stale 'admin'.
    await db.collection("organisations").doc(orgId).collection("members").doc(memberUid).set({
      role: 'member',
    }, { merge: true });
    await logOrgAuditAction(req, orgId, "revoke_admin", "member", memberUid, { role: 'admin' }, { role: 'member' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

// ============ Enterprise: granular org roles ============
// The 7-role system (owner/admin/billing_admin/security_admin/
// connector_admin/member/viewer) layered on top of the legacy binary
// adminUids/memberUids arrays above. See org-rbac.ts for the role/
// permission table and getOrgMemberRole/requireOrgRole/requireOrgPermission
// above for how a caller's role is resolved.

const MemberRoleChangeSchema = z.object({
  role: z.enum(['owner', 'admin', 'billing_admin', 'security_admin', 'connector_admin', 'member', 'viewer']),
}).strict();

// Every member's granular role, for the org's own admin UI. Anyone who can
// read the org at all (viewer+) can see this - it's who has what access,
// not sensitive content.
app.get("/api/org/:orgId/members/roles", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { db } = await requireOrgPermission(req, orgId, 'org.audit.read');
    const membersSnap = await db.collection("organisations").doc(orgId).collection("members").get();
    const roles = membersSnap.docs.map((d: any) => ({ uid: d.id, ...d.data() }));
    res.json({ members: roles });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

app.post("/api/org/:orgId/members/:memberUid/role", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId, memberUid } = req.params;
    const { user, org, role: actorRole } = await requireOrgRole(req, orgId, ['owner', 'admin', 'security_admin']);
    const parsed = MemberRoleChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "A valid role is required." });
    }
    const { role: nextRole } = parsed.data;
    if (!canAssignRole(actorRole, nextRole)) {
      return res.status(403).json({ error: `Forbidden: only an owner can grant or revoke the '${nextRole}' role.` });
    }
    if (!(org.memberUids || []).includes(memberUid) && memberUid !== user.uid) {
      return res.status(400).json({ error: "That person isn't a member of this organisation." });
    }
    const db = getDb();
    const memberRef = db.collection("organisations").doc(orgId).collection("members").doc(memberUid);
    const beforeDoc = await memberRef.get();
    const beforeRole = beforeDoc.exists ? beforeDoc.data()?.role : null;
    // Demoting away from 'owner' must never leave the org with zero owners.
    // Resolved via getOrgMemberRole (not the raw beforeRole above) because a
    // legacy owner who only exists in org.adminUids - with no granular
    // members/{uid} doc yet - has beforeRole===null even though they
    // currently resolve to 'owner'; checking the raw field alone would skip
    // this guard entirely for every org that predates the granular role
    // system and silently allow its actual last owner to be demoted.
    const effectiveBeforeRole = await getOrgMemberRole(db, orgId, org, memberUid);
    if (effectiveBeforeRole === 'owner' && nextRole !== 'owner') {
      await assertNotLastOrgOwner(db, orgId, org, memberUid);
    }
    await memberRef.set({ role: nextRole }, { merge: true });
    await logOrgAuditAction(req, orgId, "change_member_role", "member", memberUid, { role: beforeRole }, { role: nextRole });
    res.json({ success: true, role: nextRole });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("Rejected") ? 400 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

app.post("/api/org/:orgId/members/:memberUid/suspend", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId, memberUid } = req.params;
    await requireOrgRole(req, orgId, ['owner', 'admin', 'security_admin']);
    const db = getDb();
    const memberRef = db.collection("organisations").doc(orgId).collection("members").doc(memberUid);
    await memberRef.set({ status: 'suspended' }, { merge: true });
    await logOrgAuditAction(req, orgId, "suspend_member", "member", memberUid, { status: 'active' }, { status: 'suspended' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

app.post("/api/org/:orgId/members/:memberUid/reactivate", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId, memberUid } = req.params;
    await requireOrgRole(req, orgId, ['owner', 'admin', 'security_admin']);
    const db = getDb();
    const memberRef = db.collection("organisations").doc(orgId).collection("members").doc(memberUid);
    await memberRef.set({ status: 'active' }, { merge: true });
    await logOrgAuditAction(req, orgId, "reactivate_member", "member", memberUid, { status: 'suspended' }, { status: 'active' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

// Paginated read of this org's own Enterprise audit trail - never the
// platform-wide admin_audit_logs collection, which this endpoint has no
// access to and never queries.
app.get("/api/org/:orgId/audit-logs", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { db } = await requireOrgPermission(req, orgId, 'org.audit.read');
    const limitN = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 200);
    const snap = await db.collection("organisations").doc(orgId).collection("audit_logs")
      .orderBy("createdAt", "desc").limit(limitN).get();
    const logs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    res.json({ logs });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

// Workplace Governance Console: a single read combining the org's real
// privacy threshold, its members' real assigned roles (resolved via
// getOrgMemberRole, so legacy orgs without a granular members/{uid} doc
// yet still resolve correctly), and the static role->permission
// reference table from org-rbac.ts - generated from the real source of
// truth, never a hand-duplicated copy that could drift out of sync.
// Gated the same as the audit log below, since this is the same
// "who can do what, and who's actually assigned what" surface.
app.get("/api/org/:orgId/governance", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { db, org } = await requireOrgPermission(req, orgId, 'org.audit.read');
    const memberUids: string[] = org.memberUids || [];
    const members = await Promise.all(memberUids.map(async (uid) => {
      const role = await getOrgMemberRole(db, orgId, org, uid);
      try {
        const authUser = await getAuth().getUser(uid);
        return { uid, email: authUser.email || null, displayName: authUser.displayName || null, role };
      } catch (e) {
        return { uid, email: null, displayName: null, role };
      }
    }));
    res.json({
      privacyThreshold: org.privacyThreshold || 5,
      members,
      roleReference: ORG_ROLE_PERMISSIONS,
    });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

// Nova Manager Coach: single-shot AI suggestions for the org admin, fed
// only the same real, already k-anonymity-gated aggregate signals the
// climate/dashboard endpoints above already compute the same way -
// never a named individual, and never returned below the org's cohort
// threshold. No conversation history, no tool use, no memory writes -
// just today's real numbers in, 2-3 grounded suggestions out.
app.get("/api/org/:orgId/manager-coach", managerCoachLimiter, verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { user, org } = await requireOrgAdmin(req, orgId);
    const db = getDb();

    const threshold = org.privacyThreshold || 5;
    const memberUids: string[] = org.memberUids || [];
    const consentingUids = await getConsentingMemberUids(db, memberUids);

    if (consentingUids.length < threshold) {
      return res.json({ locked: true, cohortSize: consentingUids.length, threshold, suggestions: [] });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY") {
      return res.status(401).json({ error: "Gemini API key not configured." });
    }

    const quota = await checkAndReserveCapability(user.uid, 'nova_manager_coach');
    if (!quota.allowed) {
      return res.status(429).json({
        error: quota.plan === 'free'
          ? "You've reached today's free Nova Manager Coach limit. It resets tomorrow, or upgrade to Blaze Break Premium for more."
          : "You've reached today's Nova Manager Coach fair-use limit. It resets tomorrow.",
        code: 'capability_limit_reached',
        capability: 'nova_manager_coach',
      });
    }

    // Engagement rate this week - same existence-only check as the
    // Positive Reinforcement Engine's suggestion endpoint above.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();
    let activeMembers = 0;
    await Promise.all(consentingUids.map(async (uid) => {
      const moodSnap = await db.collection("users").doc(uid).collection("mood_pulses")
        .where("createdAt", ">=", sevenDaysAgo).where("createdAt", "<", nowIso).limit(1).get();
      if (!moodSnap.empty) { activeMembers++; return; }
      const bodySnap = await db.collection("users").doc(uid).collection("body_checkins")
        .where("createdAt", ">=", sevenDaysAgo).where("createdAt", "<", nowIso).limit(1).get();
      if (!bodySnap.empty) activeMembers++;
    }));
    const engagementRate = Math.round((activeMembers / consentingUids.length) * 100);

    // Real climate-survey averages, same 90-day window and aggregation as
    // GET /api/org/:orgId/climate above.
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const climateDims = ['demands', 'control', 'support', 'relationships', 'role', 'change'] as const;
    const climateSums: Record<string, number> = { demands: 0, control: 0, support: 0, relationships: 0, role: 0, change: 0 };
    let climateResponseCount = 0;
    await Promise.all(consentingUids.map(async (uid) => {
      const snap = await db.collection("users").doc(uid).collection("climate_survey_responses")
        .where("createdAt", ">=", ninetyDaysAgo).orderBy("createdAt", "desc").limit(1).get();
      if (!snap.empty) {
        const d = snap.docs[0].data();
        climateDims.forEach((dim) => { climateSums[dim] += d[dim] || 0; });
        climateResponseCount++;
      }
    }));
    const climateAverages = climateResponseCount > 0
      ? { demands: climateSums.demands / climateResponseCount, control: climateSums.control / climateResponseCount, support: climateSums.support / climateResponseCount, relationships: climateSums.relationships / climateResponseCount, role: climateSums.role / climateResponseCount, change: climateSums.change / climateResponseCount }
      : null;
    const climateStrain = computeClimateStrain(climateAverages);

    const signals: string[] = [`Engagement this week: ${engagementRate}% of ${consentingUids.length} consenting team members showed any activity`];
    if (climateStrain !== null) {
      signals.push(`Team climate strain score: ${climateStrain} out of 100 (0 = no strain, 100 = high strain), from ${climateResponseCount} recent survey responses`);
    } else {
      signals.push('No recent team climate survey responses yet');
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 15000);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `${NOVA_MANAGER_COACH_PROMPT}\n\nReal signals for this team:\n${signals.join('\n')}\n${NOVA_MANAGER_COACH_SAFETY_FLOOR}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: { suggestions: { type: Type.ARRAY, items: { type: Type.STRING } } },
            required: ["suggestions"],
          },
        },
      });
      clearTimeout(timeoutId);
      const text = response.text;
      if (!text) throw new Error("Empty response from Gemini model.");
      const parsed = JSON.parse(text);
      res.json({ locked: false, cohortSize: consentingUids.length, threshold, suggestions: parsed.suggestions || [] });
    } catch (modelError: any) {
      clearTimeout(timeoutId);
      if (modelError.name === 'AbortError') {
        return res.status(504).json({ error: "Request timed out." });
      }
      throw modelError;
    }
  } catch (err: any) {
    logRouteError("[Nova Manager Coach] error", err);
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: "Nova Manager Coach Sync Failure: A safe operational error occurred." });
  }
});

// ============ Enterprise: no-model-training-by-default data policy ============
// See org-data-policy.ts and docs/DATA_POLICY.md. getEffectiveDataPolicy is
// the ONLY place in this codebase that should ever be treated as the source
// of truth for what an org has actually consented to - it defaults every
// field to the safe/off setting, so an org that never touches this at all
// is exactly as protected as one that explicitly locked it down.

// Any org member (viewer+) can see the org's own data policy - it's a
// stated commitment to the org, not sensitive content.
app.get("/api/org/:orgId/data-policy", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { org } = await requireOrgPermission(req, orgId, 'org.data_policy.view');
    res.json({ policy: getEffectiveDataPolicy(org.dataPolicy) });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

app.post("/api/org/:orgId/data-policy", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { db, org } = await requireOrgPermission(req, orgId, 'org.data_policy.manage');
    const before = getEffectiveDataPolicy(org.dataPolicy);
    // The caller sends the full intended policy (never a partial patch -
    // see org-data-policy.ts for why), validated as a whole object before
    // anything is written.
    const validation = validateDataPolicyUpdate(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    const after = getEffectiveDataPolicy(req.body);
    await db.collection("organisations").doc(orgId).update({ dataPolicy: after });
    await logOrgAuditAction(req, orgId, "update_data_policy", "data_policy", orgId, { ...before }, { ...after });
    res.json({ success: true, policy: after });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

// ============ Enterprise: org-level connector admin ============
// See org-connectors.ts and docs/CONNECTOR_ADMIN.md. A connector here is
// the org's own administrative registration for an external service (or,
// for `local`, a genuine no-auth-needed stub) - distinct from an
// individual member's personal OAuth connection under
// /api/integrations/*. No route in this section ever marks a connector's
// authStatus as "connected" without a real handshake actually happening -
// today, that handshake doesn't exist yet at the org level, so every
// OAuth-backed connector honestly reports "not_connected" until it does.

const redactConnector = (id: string, data: Record<string, any>, showDetail: boolean) => {
  const base = {
    id,
    type: data.type,
    displayName: data.displayName,
    status: data.status,
    enabled: data.enabled,
    authStatus: data.authStatus,
    isLocal: data.isLocal,
    restrictedToTeams: data.restrictedToTeams || [],
    createdAt: data.createdAt,
  };
  if (!showDetail) return base;
  return {
    ...base,
    configuredBy: data.configuredBy,
    lastSync: data.lastSync || null,
    lastError: data.lastError || null,
    reindexStatus: data.reindexStatus || null,
    lastReindexRequestedAt: data.lastReindexRequestedAt || null,
  };
};

app.get("/api/org/:orgId/connectors", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { db, role } = await requireOrgPermission(req, orgId, 'org.connectors.view');
    const showDetail = canSeeConnectorDetail(hasOrgPermission(role, 'org.connectors.manage'));
    const snap = await db.collection("organisations").doc(orgId).collection("connectors").get();
    const connectors = snap.docs.map((d: any) => redactConnector(d.id, d.data(), showDetail));
    res.json({ connectors, availableTypes: Object.keys(ORG_CONNECTOR_TYPES) });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

app.post("/api/org/:orgId/connectors", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { user, db } = await requireOrgPermission(req, orgId, 'org.connectors.manage');
    const validation = validateConnectorCreate(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    const { type, displayName, restrictedToTeams } = req.body;
    const isLocal = ORG_CONNECTOR_TYPES[type].isLocal;
    const now = new Date().toISOString();
    const record = {
      type,
      displayName,
      status: "active",
      enabled: true,
      isLocal,
      authStatus: initialAuthStatus(type),
      configuredBy: user.uid,
      restrictedToTeams: restrictedToTeams || [],
      lastSync: null,
      lastError: null,
      reindexStatus: null,
      lastReindexRequestedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const ref = await db.collection("organisations").doc(orgId).collection("connectors").add(record);
    await logOrgAuditAction(req, orgId, "create_connector", "connector", ref.id, null, { type, displayName });
    res.json({ success: true, connector: redactConnector(ref.id, record, true) });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

const loadOrgConnector = async (db: any, orgId: string, connectorId: string) => {
  const ref = db.collection("organisations").doc(orgId).collection("connectors").doc(connectorId);
  const doc = await ref.get();
  if (!doc.exists) {
    throw new Error("Connector not found.");
  }
  return { ref, data: doc.data() };
};

app.post("/api/org/:orgId/connectors/:connectorId/enable", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId, connectorId } = req.params;
    const { db } = await requireOrgPermission(req, orgId, 'org.connectors.manage');
    const { ref, data } = await loadOrgConnector(db, orgId, connectorId);
    const before = { status: data.status, enabled: data.enabled };
    await ref.update({ status: "active", enabled: true, updatedAt: new Date().toISOString() });
    await logOrgAuditAction(req, orgId, "enable_connector", "connector", connectorId, before, { status: "active", enabled: true });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

app.post("/api/org/:orgId/connectors/:connectorId/disable", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId, connectorId } = req.params;
    const { db } = await requireOrgPermission(req, orgId, 'org.connectors.manage');
    const { ref, data } = await loadOrgConnector(db, orgId, connectorId);
    const before = { status: data.status, enabled: data.enabled };
    await ref.update({ status: "disabled", enabled: false, updatedAt: new Date().toISOString() });
    await logOrgAuditAction(req, orgId, "disable_connector", "connector", connectorId, before, { status: "disabled", enabled: false });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

// Revoke is a harder stop than disable: it also resets authStatus back to
// its honest starting point, since any future re-enable of an OAuth-backed
// connector will need a fresh real handshake, not a resumed old one.
app.post("/api/org/:orgId/connectors/:connectorId/revoke", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId, connectorId } = req.params;
    const { db } = await requireOrgPermission(req, orgId, 'org.connectors.manage');
    const { ref, data } = await loadOrgConnector(db, orgId, connectorId);
    const before = { status: data.status, enabled: data.enabled, authStatus: data.authStatus };
    const after = { status: "revoked", enabled: false, authStatus: initialAuthStatus(data.type) };
    await ref.update({ ...after, updatedAt: new Date().toISOString() });
    await logOrgAuditAction(req, orgId, "revoke_connector", "connector", connectorId, before, after);
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

// No background indexing worker exists in this codebase yet - this marks a
// job as requested so a future worker has something real to pick up. It
// never claims the reindex actually happened.
app.post("/api/org/:orgId/connectors/:connectorId/reindex", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId, connectorId } = req.params;
    const { db } = await requireOrgPermission(req, orgId, 'org.connectors.manage');
    const { ref } = await loadOrgConnector(db, orgId, connectorId);
    const now = new Date().toISOString();
    await ref.update({ reindexStatus: "pending", lastReindexRequestedAt: now });
    await logOrgAuditAction(req, orgId, "request_connector_reindex", "connector", connectorId, null, { reindexStatus: "pending" });
    res.json({ success: true, reindexStatus: "pending", note: "No background indexing worker is wired up yet - this request is recorded but not yet processed." });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

// ============ Enterprise: desktop deployment control plane ============
// See desktop-deployment.ts and docs/DESKTOP_DEPLOYMENT.md. There is no
// real Blaze Break desktop client shipping today - the installable PWA is
// the only client that exists. This is a backend control plane only,
// built so a future desktop client has somewhere real to register, report
// its version, and be centrally managed - never presented as proof such a
// client exists.

// Any org member can self-register their own device - this isn't an admin
// action, it's the device announcing itself.
app.post("/api/org/:orgId/devices/register", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { user, db, role } = await loadOrgAndCallerRole(req, orgId);
    if (!role) {
      return res.status(403).json({ error: "Forbidden: not a member of this organisation." });
    }
    const validation = validateDeviceRegistration(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    const { channel, appVersion, deviceName } = req.body;
    const now = new Date().toISOString();
    const record = {
      ownerUid: user.uid,
      channel,
      appVersion,
      deviceName: deviceName || null,
      status: "active",
      lastCheckIn: now,
      registeredAt: now,
    };
    const ref = await db.collection("organisations").doc(orgId).collection("devices").add(record);
    await logOrgAuditAction(req, orgId, "register_device", "device", ref.id, null, { channel, appVersion });
    res.json({ success: true, device: { id: ref.id, ...record } });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

// Full device roster, including every member's ownerUid - an org-admin
// action, not something every member can see about each other.
app.get("/api/org/:orgId/devices", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { db } = await requireOrgPermission(req, orgId, 'org.devices.manage');
    const snap = await db.collection("organisations").doc(orgId).collection("devices").get();
    const devices = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    res.json({ devices });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

app.post("/api/org/:orgId/devices/:deviceId/revoke", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId, deviceId } = req.params;
    const { db } = await requireOrgPermission(req, orgId, 'org.devices.manage');
    const ref = db.collection("organisations").doc(orgId).collection("devices").doc(deviceId);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Device not found." });
    }
    const before = { status: doc.data().status };
    await ref.update({ status: "revoked", revokedAt: new Date().toISOString() });
    await logOrgAuditAction(req, orgId, "revoke_device", "device", deviceId, before, { status: "revoked" });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

// A device calls this itself (or an org admin, checking on a member's
// behalf) to report it's alive and learn whether it's below the enforced
// minimum version or simply behind the latest.
app.post("/api/org/:orgId/devices/:deviceId/check-for-update", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId, deviceId } = req.params;
    const { user, db, role } = await loadOrgAndCallerRole(req, orgId);
    if (!role) {
      return res.status(403).json({ error: "Forbidden: not a member of this organisation." });
    }
    const ref = db.collection("organisations").doc(orgId).collection("devices").doc(deviceId);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Device not found." });
    }
    const device = doc.data();
    const isOwner = device.ownerUid === user.uid;
    if (!isOwner && !hasOrgPermission(role, 'org.devices.manage')) {
      return res.status(403).json({ error: "Forbidden: you may only check updates for your own device." });
    }
    if (device.status === "revoked") {
      return res.status(403).json({ error: "This device has been revoked and can no longer check for updates." });
    }
    await ref.update({ lastCheckIn: new Date().toISOString() });
    const configDoc = await db.collection("app_config").doc("release_channels").get();
    const channelConfig = configDoc.exists ? (configDoc.data()?.[device.channel] || null) : null;
    res.json(evaluateUpdateStatus(device.appVersion, channelConfig));
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

// Platform-wide release channel config (app_config/release_channels) -
// read by any authenticated member's device check, written only by Blaze
// Break's own platform staff, since it governs every org's devices at once.
app.get("/api/app-config/release-channels", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const db = getDb();
    const doc = await db.collection("app_config").doc("release_channels").get();
    res.json({ channels: doc.exists ? doc.data() : {} });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/release-channels", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requireAdmin(req);
    const { channel, minVersion, latestVersion } = req.body;
    if (!isDeviceChannel(channel)) {
      return res.status(400).json({ error: `"channel" must be one of: ${DEVICE_CHANNELS.join(', ')}.` });
    }
    if (!isValidAppVersion(minVersion) || !isValidAppVersion(latestVersion)) {
      return res.status(400).json({ error: '"minVersion" and "latestVersion" must be semantic version strings like "1.2.3".' });
    }
    const db = getDb();
    await db.collection("app_config").doc("release_channels").set({ [channel]: { minVersion, latestVersion } }, { merge: true });
    await logAdminAction(req, "update_release_channel", "", channel, { channel, minVersion, latestVersion });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============ Enterprise: central billing & administration ============
// See billing-adapter.ts and docs/BILLING_ADMIN.md. There is no Stripe (or
// any) payment provider wired up in this codebase - `billingProvider` is
// the explicit NullBillingProvider, which reports exactly what's already
// stored on the org and never pretends a charge or subscription happened.

app.get("/api/org/:orgId/billing", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { org } = await requireOrgPermission(req, orgId, 'org.billing.view');
    res.json({ billing: getEffectiveBillingState(org.billing), provider: billingProvider.name });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

app.post("/api/org/:orgId/billing", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { db, org } = await requireOrgPermission(req, orgId, 'org.billing.manage');
    const before = getEffectiveBillingState(org.billing);
    const validation = validateBillingUpdate(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    // Provider identifiers are never accepted from the request body (see
    // billing-adapter.ts) - only a real provider integration would ever
    // set those, and none exists yet, so they're carried over unchanged.
    const after = {
      ...getEffectiveBillingState(req.body),
      providerCustomerId: before.providerCustomerId,
      providerSubscriptionId: before.providerSubscriptionId,
    };
    await db.collection("organisations").doc(orgId).update({ billing: after });
    await logOrgAuditAction(req, orgId, "update_billing", "billing", orgId, { ...before }, { ...after });
    res.json({ success: true, billing: after });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

// ============ Enterprise: SSO (schema/service boundary only) ============
// See sso-config.ts and docs/SSO_INTEGRATION_PLAN.md. There is no real
// SAML/OIDC assertion validation wired up in this codebase - that would
// require either a paid Identity Platform upgrade or a third-party IdP
// proxy, both real infrastructure decisions outside this backend
// foundation's authority. This is schema, encryption, and RBAC only.

const getSsoConfigDoc = (db: any, orgId: string) =>
  db.collection("organisations").doc(orgId).collection("sso_config").doc("config");

app.get("/api/org/:orgId/sso", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { db } = await requireOrgPermission(req, orgId, 'org.sso.manage');
    const doc = await getSsoConfigDoc(db, orgId).get();
    if (!doc.exists) {
      return res.json({ configured: false });
    }
    res.json({ configured: true, config: redactSsoConfig(doc.data() as StoredSsoConfig) });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

// Creates or replaces the SSO config. Deliberately never touches
// `enforceSso` - that is only ever changed via the dedicated /enforce
// route below, so this route can never accidentally turn enforcement on.
app.post("/api/org/:orgId/sso", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { user, db } = await requireOrgPermission(req, orgId, 'org.sso.manage');
    const encryptionKey = process.env.SSO_CONFIG_ENCRYPTION_KEY;
    const validation = validateSsoConfigInput(req.body, !!encryptionKey);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    const existingDoc = await getSsoConfigDoc(db, orgId).get();
    const existing = existingDoc.exists ? (existingDoc.data() as StoredSsoConfig) : null;
    const { providerType, issuer, clientId, metadataUrl, allowedDomains, jitProvisioning, defaultRole, clientSecret, secretRef } = req.body;

    const record: StoredSsoConfig = {
      providerType,
      issuer,
      clientId,
      metadataUrl: metadataUrl || null,
      allowedDomains: allowedDomains || [],
      enforceSso: existing?.enforceSso === true, // never set here - preserved as-is
      jitProvisioning: jitProvisioning === true,
      defaultRole: defaultRole || 'member',
      encryptedSecret: clientSecret ? encryptSecret(clientSecret, encryptionKey as string) : (secretRef ? null : existing?.encryptedSecret || null),
      secretRef: secretRef || (clientSecret ? null : existing?.secretRef || null),
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    };
    await getSsoConfigDoc(db, orgId).set(record);
    await logOrgAuditAction(req, orgId, "update_sso_config", "sso_config", orgId,
      existing ? { providerType: existing.providerType, issuer: existing.issuer } : null,
      { providerType: record.providerType, issuer: record.issuer }
    );
    res.json({ success: true, config: redactSsoConfig(record) });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

// The single most important guardrail in this chunk: enforceSso can only
// ever be switched ON while the platform-wide `sso_enforcement` feature
// flag is explicitly enabled - flipping it today, with no real SAML/OIDC
// validation wired up, would lock every one of an org's members out with
// no working login path. Turning it OFF is never gated.
app.post("/api/org/:orgId/sso/enforce", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { db } = await requireOrgPermission(req, orgId, 'org.sso.manage');
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '"enabled" must be true or false.' });
    }
    const configDoc = await getSsoConfigDoc(db, orgId).get();
    if (!configDoc.exists) {
      return res.status(400).json({ error: "Configure SSO for this organisation before enabling enforcement." });
    }
    if (enabled) {
      const flagDoc = await db.collection("public_feature_flags").doc("sso_enforcement").get();
      const flagEnabled = flagDoc.exists && flagDoc.data()?.enabled === true;
      if (!canEnableSsoEnforcement(flagEnabled)) {
        return res.status(403).json({
          error: "SSO enforcement is not available yet - no real SAML/OIDC validation is wired up on this server. See docs/SSO_INTEGRATION_PLAN.md.",
        });
      }
    }
    const before = { enforceSso: configDoc.data()?.enforceSso === true };
    await getSsoConfigDoc(db, orgId).update({ enforceSso: enabled, updatedAt: new Date().toISOString() });
    await logOrgAuditAction(req, orgId, enabled ? "enable_sso_enforcement" : "disable_sso_enforcement", "sso_config", orgId, before, { enforceSso: enabled });
    res.json({ success: true, enforceSso: enabled });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

// Checks that the stored config is shape-valid and, if a metadataUrl is
// set, that it's actually reachable - nothing more. This is explicitly
// NOT a real authentication handshake; no assertion or token is ever
// validated here.
app.post("/api/org/:orgId/sso/test", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { db } = await requireOrgPermission(req, orgId, 'org.sso.manage');
    const doc = await getSsoConfigDoc(db, orgId).get();
    if (!doc.exists) {
      return res.status(400).json({ error: "No SSO configuration exists for this organisation yet." });
    }
    const config = doc.data() as StoredSsoConfig;
    let metadataReachable: boolean | null = null;
    if (config.metadataUrl) {
      try {
        // https:// is already required at config-save time, but that says
        // nothing about where the URL actually points - resolve it and
        // refuse to fetch if any resolved address is private/loopback/
        // link-local/cloud-metadata, so this reachability check can't be
        // used as an internal-network probe. Folded into the same generic
        // `false` result as any other failure below (never a distinct
        // "blocked" response) so it can't be used to distinguish a
        // blocked address from a genuinely unreachable one either.
        const hostname = new URL(config.metadataUrl).hostname;
        const addresses = await dns.promises.lookup(hostname, { all: true });
        const isBlocked = addresses.length === 0 || addresses.some((a) => isBlockedIpAddress(a.address));
        if (isBlocked) {
          metadataReachable = false;
        } else {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const response = await fetch(config.metadataUrl, { method: "GET", signal: controller.signal });
          clearTimeout(timeout);
          metadataReachable = response.ok;
        }
      } catch {
        metadataReachable = false;
      }
    }
    res.json({
      shapeValid: true,
      metadataReachable,
      note: "This checks configuration shape and metadata URL reachability only - it is not a real authentication handshake and does not validate any SAML/OIDC assertion.",
    });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

// ============ Enterprise: search with permission filtering ============
// See org-search.ts and docs/ENTERPRISE_SEARCH.md. Query matching is a
// deliberately simple keyword/substring matcher - there is no full-text or
// vector search engine in this stack. The ACL filtering in org-search.ts
// is the real security boundary here and is unconditional: a resource the
// requester can't see is excluded before query matching ever runs.

// Manually registers a searchable resource. There is no automated content-
// ingestion pipeline in this codebase - this is the only way a resource
// gets indexed today, and it's marked "indexed" immediately since nothing
// asynchronous processes it afterward.
app.post("/api/org/:orgId/search/resources", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { user, db } = await requireOrgPermission(req, orgId, 'org.connectors.manage');
    const validation = validateResourceCreate(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    const { title, contentType, chunkText, keywords, aclUids, aclRoles, aclTeams, sourceConnectorId } = req.body;
    const now = new Date().toISOString();
    const record = {
      title,
      contentType,
      chunkText,
      keywords: keywords || [],
      aclUids: aclUids || [],
      aclRoles: aclRoles || [],
      aclTeams: aclTeams || [],
      sourceConnectorId: sourceConnectorId || null,
      indexStatus: "indexed",
      indexedAt: now,
      registeredBy: user.uid,
    };
    const ref = await db.collection("organisations").doc(orgId).collection("searchable_resources").add(record);
    // Audit the metadata, never the chunkText itself - see
    // docs/ENTERPRISE_RBAC.md's rule that audit entries stay structured
    // field diffs, not raw content.
    await logOrgAuditAction(req, orgId, "register_search_resource", "searchable_resource", ref.id, null, { title, contentType });
    res.json({ success: true, resource: { id: ref.id, ...record } });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

app.get("/api/org/:orgId/search/resources", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { db } = await requireOrgPermission(req, orgId, 'org.connectors.manage');
    const snap = await db.collection("organisations").doc(orgId).collection("searchable_resources").get();
    const resources = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    res.json({ resources });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

app.post("/api/org/:orgId/search/resources/:resourceId/remove", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId, resourceId } = req.params;
    const { db } = await requireOrgPermission(req, orgId, 'org.connectors.manage');
    const ref = db.collection("organisations").doc(orgId).collection("searchable_resources").doc(resourceId);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Searchable resource not found." });
    }
    await ref.delete();
    await logOrgAuditAction(req, orgId, "remove_search_resource", "searchable_resource", resourceId, { title: doc.data().title }, null);
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

app.post("/api/org/:orgId/search", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { user, db, org, role } = await requireOrgPermission(req, orgId, 'org.search.query');
    const { query, filters } = req.body || {};
    if (query !== undefined && typeof query !== 'string') {
      return res.status(400).json({ error: '"query" must be a string.' });
    }
    const snap = await db.collection("organisations").doc(orgId).collection("searchable_resources")
      .where("indexStatus", "==", "indexed").get();
    const resources: SearchableResource[] = snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as SearchableResource[];
    const team = (org.memberTeams && org.memberTeams[user.uid]) || null;
    const results = searchOrgResources(resources, { uid: user.uid, role, team }, query || '', filters);
    res.json({ results });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : err.message?.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

app.post("/api/org/:orgId/regenerate-join-code", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    await requireOrgAdmin(req, orgId);
    const db = getDb();
    const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    await db.collection("organisations").doc(orgId).update({
      joinCode: newCode,
      updatedAt: FieldValue.serverTimestamp(),
    });
    res.json({ success: true, joinCode: newCode });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

app.post("/api/org/:orgId/settings", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { org } = await requireOrgAdmin(req, orgId);
    const { name, privacyThreshold } = req.body;
    const update: any = { updatedAt: FieldValue.serverTimestamp() };
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
        return res.status(400).json({ error: "Name must be 1-100 characters." });
      }
      update.name = name.trim();
      before.name = org.name;
      after.name = update.name;
    }
    if (privacyThreshold !== undefined) {
      if (typeof privacyThreshold !== 'number' || privacyThreshold < 3 || privacyThreshold > 100) {
        return res.status(400).json({ error: "Minimum cohort size must be between 3 and 100." });
      }
      update.privacyThreshold = privacyThreshold;
      before.privacyThreshold = org.privacyThreshold || 5;
      after.privacyThreshold = privacyThreshold;
    }
    const db = getDb();
    await db.collection("organisations").doc(orgId).update(update);
    await logOrgAuditAction(req, orgId, "update_org_settings", "organisation", orgId, before, after);
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

// ============ Email Invites ============
// Sends real invite emails via the existing Brevo integration and tracks
// pending invites so an org admin can see who's been asked but hasn't
// joined yet, without needing to cross-reference anything manually. This is
// a convenience layer on top of the join code, not a replacement for it -
// join-by-code still works even if an invite email never arrives.

app.post("/api/org/:orgId/invite", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { org } = await requireOrgAdmin(req, orgId);
    const { emails } = req.body;
    const emailList: string[] = Array.isArray(emails) ? emails : (typeof emails === 'string' ? [emails] : []);
    const cleaned = Array.from(new Set(
      emailList
        .map(e => (typeof e === 'string' ? e.trim().toLowerCase() : ''))
        .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    ));

    if (cleaned.length === 0) {
      return res.status(400).json({ error: "Provide at least one valid email address." });
    }
    if (cleaned.length > 50) {
      return res.status(400).json({ error: "You can invite up to 50 people at once." });
    }

    const db = getDb();

    // Enforced seat limit: this org's plan (billing-adapter.ts) allows only
    // so many seats, counting both active members and people already
    // invited but not yet joined. A real billing provider would report the
    // allowance itself; the null provider reports back the org's own
    // stored seatCount.
    const pendingInvitesSnap = await db.collection("organisations").doc(orgId).collection("pending_invites").get();
    const seatAllowance = billingProvider.getSeatAllowance(getEffectiveBillingState(org.billing));
    const seatCheck = checkSeatLimit((org.memberUids || []).length, pendingInvitesSnap.size, cleaned.length, seatAllowance);
    if (!seatCheck.allowed) {
      return res.status(400).json({ error: seatCheck.error });
    }

    const results: { email: string; sent: boolean }[] = [];

    for (const email of cleaned) {
      const sent = await sendBrevoEmail(
        email,
        `You're invited to ${org.name} on Blaze Break`,
        `${org.name} has set up Blaze Break, a burnout recovery tool, for their team.\n\nTo join, sign in to Blaze Break and enter this code in your Privacy Centre under "Organisation Participation":\n\n${org.joinCode}\n\nJoining is entirely optional, and any data sharing with ${org.name} is off by default and fully within your control.`
      );
      results.push({ email, sent });
      await db.collection("organisations").doc(orgId).collection("pending_invites").doc(email).set({
        email,
        invitedAt: FieldValue.serverTimestamp(),
        emailSent: sent,
      });
    }

    res.json({ success: true, results });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

app.get("/api/org/:orgId/invites", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    await requireOrgAdmin(req, orgId);
    const db = getDb();
    const snap = await db.collection("organisations").doc(orgId).collection("pending_invites")
      .orderBy("invitedAt", "desc").limit(100).get();
    const invites = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ invites });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

app.post("/api/org/:orgId/invites/:email/cancel", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId, email } = req.params;
    await requireOrgAdmin(req, orgId);
    const db = getDb();
    await db.collection("organisations").doc(orgId).collection("pending_invites").doc(email).delete();
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

// ============ Moderation ============

app.post("/api/org/:orgId/recognition/:recognitionId/delete", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId, recognitionId } = req.params;
    await requireOrgAdmin(req, orgId);
    const db = getDb();
    await db.collection("organisations").doc(orgId).collection("recognition_wall").doc(recognitionId).delete();
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

app.post("/api/org/:orgId/challenges/:challengeId/toggle-active", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId, challengeId } = req.params;
    await requireOrgAdmin(req, orgId);
    const db = getDb();
    const challengeDoc = await db.collection("organisations").doc(orgId).collection("challenges").doc(challengeId).get();
    if (!challengeDoc.exists) {
      return res.status(404).json({ error: "Challenge not found." });
    }
    const newActive = !challengeDoc.data()?.active;
    await db.collection("organisations").doc(orgId).collection("challenges").doc(challengeId).update({ active: newActive });
    res.json({ success: true, active: newActive });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

app.post("/api/org/:orgId/challenges/:challengeId/edit", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const { orgId, challengeId } = req.params;
    await requireOrgAdmin(req, orgId);
    const { title, description } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0 || title.length > 100) {
      return res.status(400).json({ error: "Title must be 1-100 characters." });
    }
    if (description !== undefined && (typeof description !== 'string' || description.length > 300)) {
      return res.status(400).json({ error: "Description must be under 300 characters." });
    }
    const db = getDb();
    const challengeRef = db.collection("organisations").doc(orgId).collection("challenges").doc(challengeId);
    const challengeDoc = await challengeRef.get();
    if (!challengeDoc.exists) {
      return res.status(404).json({ error: "Challenge not found." });
    }
    await challengeRef.update({ title: title.trim(), description: (description || '').trim() });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
  }
});

// Counts consecutive completed days ending today or yesterday - a streak
// isn't considered broken just because today hasn't happened yet, but two
// missed days in a row genuinely ends it.
const computeStreak = (completedDates: string[]): number => {
  if (!completedDates || completedDates.length === 0) return 0;
  const dateSet = new Set(completedDates);
  const today = new Date();
  let streak = 0;
  const cursor = new Date(today);
  const todayStr = today.toISOString().split('T')[0];
  if (!dateSet.has(todayStr)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (dateSet.has(cursor.toISOString().split('T')[0])) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

// ============ Recovery Ally (real, two-sided accountability) ============
// The ally doesn't need their own Blaze Break account - they get a real
// emailed link to an unauthenticated, token-scoped view of exactly what the
// person chose to share, and can leave a real encouragement note back. This
// is what makes "they'll get a link to accept" and "once they send a note
// it'll appear here" - both already promised in the UI - actually true.

app.post("/api/ally/invite", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
    const { allyEmail } = req.body;
    if (!allyEmail || typeof allyEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(allyEmail)) {
      return res.status(400).json({ error: "Please provide a valid email address." });
    }
    const db = getDb();
    const shareToken = crypto.randomBytes(24).toString('hex');
    const allyName = allyEmail.split('@')[0];

    await db.collection("users").doc(user.uid).collection("recovery_ally").doc("state").set({
      isInvited: true,
      allyName,
      allyEmail: allyEmail.trim().toLowerCase(),
      permissions: { viewGoals: true, viewMilestones: true, sendPings: true, viewEnergyStats: false },
      shareToken,
      invitedAt: new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const appBase = (process.env.APP_URL || "").replace(/\/$/, "");
    const link = `${appBase}/ally/${shareToken}`;
    const emailSent = await sendBrevoEmail(
      allyEmail,
      "You've been invited as a Recovery Ally",
      `Someone you know is using Blaze Break to work on burnout recovery, and asked you to be their accountability ally.\n\nYou can see what they've chosen to share and leave them an encouraging note here, no account needed:\n\n${link}\n\nThis is just for everyday accountability, not a crisis service.`
    );

    res.json({ success: true, emailSent, shareToken });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ally/revoke", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
    const db = getDb();
    await db.collection("users").doc(user.uid).collection("recovery_ally").doc("state").set({
      isInvited: false,
      allyName: '',
      allyEmail: '',
      shareToken: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Ally Nudge Schedules: recurring accountability messages sent via real
// SMS/WhatsApp to a user's chosen support contact, on a schedule the user
// sets themselves. Deliberately no AI involvement in deciding when to send -
// the user configures a time, the scheduler below just fires it. This is
// the low-stakes, human-directed alternative to a medication reminder
// feature, built for people managing recovery without much in-person
// support around them.
// ============================================================================

// Base object schema WITHOUT the cross-field refinement. Kept separate so
// the update schema below can call .partial() on it - zod v4 throws if
// .partial() is called on a schema that already carries a .refine()
// ("cannot be used on object schemas containing refinements"), which would
// crash the whole server at module load. The refinement is re-applied to
// each concrete schema instead.
// Kill switch for the entire scheduled-nudge feature - see
// nudgeSchedulerIsEnabled's own docstring in guardian-alert.ts for why
// this defaults to OFF. Read once at module load, same pattern as
// NOVA_TOOLS_ENABLED.
const NUDGE_SCHEDULER_ENABLED = nudgeSchedulerIsEnabled(process.env.NUDGE_SCHEDULER_ENABLED);

const NudgeScheduleBase = z.object({
  contactId: z.string().min(1).max(100),
  contactName: z.string().min(1).max(100),
  contactMethod: z.string().regex(/^\+[1-9]\d{6,14}$/, "Phone number must be in E.164 format, e.g. +15551234567"),
  notificationPreference: z.enum(['sms', 'whatsapp']).default('sms'),
  message: z.string().min(1).max(300),
  frequency: z.enum(['daily', 'weekly']),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in 24-hour HH:MM format"),
  timezone: z.string().min(1).max(60),
  enabled: z.boolean(),
  // This can only ever be created as true - the frontend gates this behind
  // an explicit "I've told them to expect these" confirmation. There is no
  // way to verify a phone contact's real consent server-side (they don't
  // have an account), so this is an honest human checkpoint rather than a
  // fabricated "consent verified" claim.
  contactAcknowledged: z.literal(true, { message: "Please confirm you've told this contact to expect these messages." }),
}).strict();

// A weekly schedule must name at least one day. When frequency is absent
// (as it can be in a partial update) there is nothing to check, so it passes.
const weeklyNeedsDays = (data: { frequency?: 'daily' | 'weekly'; daysOfWeek?: number[] }) =>
  data.frequency !== 'weekly' || (!!data.daysOfWeek && data.daysOfWeek.length > 0);
const weeklyNeedsDaysError = { message: "Weekly schedules need at least one day selected.", path: ['daysOfWeek'] };

const NudgeScheduleSchema = NudgeScheduleBase.refine(weeklyNeedsDays, weeklyNeedsDaysError);

app.post("/api/nudge-schedules", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    if (!NUDGE_SCHEDULER_ENABLED) {
      return res.status(403).json({ error: "Scheduled nudges aren't available yet." });
    }
    const user = requireAuth(req);
    const parsed = NudgeScheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid schedule.", details: (parsed as any).error?.errors || [] });
    }
    const db = getDb();
    const existingSnap = await db.collection("users").doc(user.uid).collection("nudge_schedules").get();
    if (existingSnap.size >= 10) {
      return res.status(400).json({ error: "You've reached the limit of 10 nudge schedules." });
    }
    const now = new Date().toISOString();
    const ref = db.collection("users").doc(user.uid).collection("nudge_schedules").doc();
    await ref.set({ ...parsed.data, createdAt: now, updatedAt: now });
    await logAutopilotAction(user.uid, "nudge_schedule_created", { contactName: parsed.data.contactName }, true);
    res.json({ success: true, id: ref.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/nudge-schedules", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
    const db = getDb();
    const snap = await db.collection("users").doc(user.uid).collection("nudge_schedules").orderBy("createdAt", "desc").get();
    res.json({ schedules: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Built from the un-refined base so .partial() is legal, then the same
// weekly-days refinement is re-applied.
const NudgeScheduleUpdateSchema = NudgeScheduleBase.partial().extend({
  contactAcknowledged: z.literal(true).optional(),
}).refine(weeklyNeedsDays, weeklyNeedsDaysError);

app.patch("/api/nudge-schedules/:id", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
    const parsed = NudgeScheduleUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid update.", details: (parsed as any).error?.errors || [] });
    }
    const db = getDb();
    const ref = db.collection("users").doc(user.uid).collection("nudge_schedules").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Schedule not found." });
    await ref.update({ ...parsed.data, updatedAt: new Date().toISOString() });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/nudge-schedules/:id", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
    const db = getDb();
    await db.collection("users").doc(user.uid).collection("nudge_schedules").doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Checks every enabled schedule and sends any that are due. Runs every 5
// minutes, so "due" means the target time falls within the last 5-minute
// window rather than an exact-second match (which would almost never hit).
// lastSentPeriod - computed in the schedule's own local date, not the
// server's UTC date, so someone in a timezone far from UTC doesn't get a
// duplicate or skipped send near midnight - is the actual guard against
// double-sends if the window is checked more than once, which matters more
// here than exact-second precision does.
async function processNudgeSchedules() {
  if (!NUDGE_SCHEDULER_ENABLED) return; // Kill switch - see NUDGE_SCHEDULER_ENABLED above.
  let db;
  try {
    db = getDb();
  } catch (e) {
    return; // Firestore not configured in this environment - nothing to do.
  }
  try {
    const snap = await db.collectionGroup("nudge_schedules").where("enabled", "==", true).get();
    const now = new Date();

    for (const doc of snap.docs) {
      const data = doc.data();
      const uid = doc.ref.parent.parent?.id;
      if (!uid || !data.timezone || !data.time || !data.contactMethod || !data.message) continue;

      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: data.timezone,
          hour: '2-digit', minute: '2-digit', hour12: false,
          weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
        });
        const parts = formatter.formatToParts(now);
        const get = (t: string) => parts.find(p => p.type === t)?.value || '';
        const currentMinutes = parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10);
        const [targetH, targetM] = String(data.time).split(':').map(Number);
        const targetMinutes = targetH * 60 + targetM;
        const diff = currentMinutes - targetMinutes;

        // Only fire within [0, 5) minutes after the target time - never early.
        if (diff < 0 || diff >= 5) continue;

        if (data.frequency === 'weekly') {
          const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
          const currentDow = weekdayMap[get('weekday')];
          if (!Array.isArray(data.daysOfWeek) || !data.daysOfWeek.includes(currentDow)) continue;
        }

        const localDateKey = `${get('year')}-${get('month')}-${get('day')}`;
        if (data.lastSentPeriod === localDateKey) continue; // Already sent for this local day.

        const result = await sendTwilioMessage(uid, data.contactMethod, data.message, data.notificationPreference === 'whatsapp', 'ally_nudge');
        await doc.ref.update({
          lastSentAt: new Date().toISOString(),
          lastSentPeriod: localDateKey,
          lastSendResult: result.success ? 'sent' : 'failed',
        });
      } catch (innerErr: any) {
        console.error(`[NudgeScheduler] Failed processing schedule ${doc.id}:`, innerErr.message);
      }
    }
  } catch (err: any) {
    console.error("[NudgeScheduler] Failed to process nudge schedules:", err.message);
  }
}

// Unlike this file's other two startup-time side effects (the pulse-check
// setInterval and the app.listen/WebSocket block below), this registration
// was unconditional - a real (if inert, thanks to NUDGE_SCHEDULER_ENABLED
// defaulting false) node-cron timer was left running on every test-file
// import that pulls in server.ts. Harmless today only because the kill
// switch stays off in test envs; guarded the same way as the other two so
// that stays true structurally, not by convention.
if (process.env.TEST_MODE !== 'true') {
  cron.schedule('*/5 * * * *', processNudgeSchedules);
}

// Public - the ally doesn't have an account. Access is entirely gated by
// possession of an unguessable 48-character token, and the response only
// ever includes what the owner explicitly toggled on.
app.get("/api/ally/view/:token", verifyAppCheck, async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || token.length < 20) {
      return res.status(404).json({ error: "This link isn't valid." });
    }
    const db = getDb();
    const stateSnap = await db.collectionGroup("recovery_ally")
      .where("shareToken", "==", token).limit(1).get();
    if (stateSnap.empty) {
      return res.status(404).json({ error: "This link isn't valid or has been revoked." });
    }
    const stateDoc = stateSnap.docs[0];
    const state = stateDoc.data();
    const ownerRef = stateDoc.ref.parent.parent;
    if (!ownerRef) {
      return res.status(404).json({ error: "This link isn't valid." });
    }
    const permissions = state.permissions || {};
    const response: any = { allyName: state.allyName || 'there' };

    if (permissions.viewGoals) {
      const goalsSnap = await ownerRef.collection("ally_shared_goals").orderBy("createdAt", "desc").limit(20).get();
      response.sharedGoals = goalsSnap.docs.map(d => {
        const data = d.data();
        const dates: string[] = data.completedDates || [];
        return {
          id: d.id,
          text: data.text,
          category: data.category,
          completedToday: dates.includes(new Date().toISOString().split('T')[0]),
          streak: computeStreak(dates),
        };
      });
    }

    if (permissions.viewMilestones) {
      const goalsSnap = await ownerRef.collection("ally_shared_goals").get();
      const longestStreak = goalsSnap.docs.reduce((max, d) => Math.max(max, computeStreak(d.data().completedDates || [])), 0);
      response.longestStreak = longestStreak;
    }

    if (permissions.viewEnergyStats) {
      const moodSnap = await ownerRef.collection("mood_pulses").orderBy("createdAt", "desc").limit(7).get();
      const intensities = moodSnap.docs.map(d => d.data().intensity).filter((n: any) => typeof n === 'number');
      response.recentAvgMood = intensities.length > 0
        ? Number((intensities.reduce((a: number, b: number) => a + b, 0) / intensities.length).toFixed(1))
        : null;
    }

    res.json(response);
  } catch (err: any) {
    res.status(500).json({ error: "Could not load this page." });
  }
});

app.post("/api/ally/view/:token/encourage", verifyAppCheck, async (req, res) => {
  try {
    const { token } = req.params;
    const { message } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0 || message.length > 300) {
      return res.status(400).json({ error: "Message must be 1-300 characters." });
    }
    if (!token || token.length < 20) {
      return res.status(404).json({ error: "This link isn't valid." });
    }
    const db = getDb();
    const stateSnap = await db.collectionGroup("recovery_ally")
      .where("shareToken", "==", token).limit(1).get();
    if (stateSnap.empty) {
      return res.status(404).json({ error: "This link isn't valid or has been revoked." });
    }
    const stateDoc = stateSnap.docs[0];
    const state = stateDoc.data();
    if (state.permissions?.sendPings === false) {
      return res.status(403).json({ error: "This person has turned off messages for now." });
    }
    const ownerRef = stateDoc.ref.parent.parent;
    if (!ownerRef) {
      return res.status(404).json({ error: "This link isn't valid." });
    }
    await ownerRef.collection("ally_encouragements").add({
      type: 'personal',
      message: message.trim(),
      createdAt: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Could not send that." });
  }
});

// ============================================================================
// User-Facing Audit Trail (genuinely persisted, not localStorage-only)
// ============================================================================
// Every handleAuditAction call across PrivacyVault and elsewhere previously
// only wrote to localStorage - meaning the entire "what happened to my
// data" trail was fabricated the moment someone switched devices, cleared
// their browser, or wanted to prove to themselves what they'd actually
// consented to. This writes it for real, server-side, so it can't be
// silently edited or lost.
const AuditLogSchema = z.object({
  action: z.string().max(200),
  target: z.string().max(200).optional(),
  status: z.enum(['authorised', 'denied', 'anonymised', 'deleted', 'verified']),
  details: z.string().max(500).optional(),
}).strict();

app.post("/api/audit-log", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const parsed = AuditLogSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid audit log entry.", details: (parsed as any).error?.errors || [] });
    }
    const user = requireAuth(req);
    const db = getDb();
    await db.collection("audit_logs").add({
      ...parsed.data,
      userId: user.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Audit] write error:", err.message);
    res.status(500).json({ error: "Could not save that audit entry." });
  }
});

app.get("/api/audit-log", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
    const db = getDb();
    const snap = await db.collection("audit_logs")
      .where("userId", "==", user.uid)
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();
    const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Anxiety Reset API endpoints
app.get("/api/anxiety-reset", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const verifiedUser = requireAuth(req);
    const uid = verifiedUser?.uid;
    const db = getDb();
    const snap = await db.collection("anxiety_reset_events").where("userId", "==", uid).get();
    const events = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ events });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const AnxietyResetEventSchema = z.object({
  userId: z.string().optional(), // Client sends this but the server always overrides it with the authenticated uid below - accepted here only so .strict() doesn't reject real requests.
  mode: z.string().max(50).optional(),
  triggerType: z.string().max(100).optional(),
  intensityBefore: z.number().min(0).max(10).optional(),
  intensityAfter: z.number().min(0).max(10).optional(),
  selectedTool: z.string().max(100).optional(),
  completed: z.boolean().optional(),
  durationSeconds: z.number().max(3600).optional(),
  userNote: z.string().max(2000).optional(),
  novaFollowUpShown: z.boolean().optional(),
  followUpActionId: z.string().max(100).optional(),
  safetyLevel: z.enum(['normal_support', 'heightened_anxiety', 'panic_level', 'possible_crisis', 'immediate_danger']).optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  createdAt: z.string().optional(), // Same as userId - client sends it, server overrides with a real serverTimestamp below.
}).strict();

app.post("/api/anxiety-reset", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const verifiedUser = requireAuth(req);
    const uid = verifiedUser?.uid;
    const parsed = AnxietyResetEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid anxiety reset event payload.", details: (parsed as any).error?.errors || [] });
    }
    const eventData = parsed.data;
    const db = getDb();
    
    const eventRef = db.collection("anxiety_reset_events").doc();
    const savedEvent = {
      ...eventData,
      id: eventRef.id,
      userId: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    
    await eventRef.set(savedEvent);
    
    // Increment recovery points as engagement rewards (BLAME engagement rewards)
    const statsRef = db.collection("users").doc(uid).collection("derived").doc("stats");
    const statsDoc = await statsRef.get();
    let currentPoints = 0;
    if (statsDoc.exists) {
      currentPoints = statsDoc.data().points || 0;
    }
    
    await statsRef.set({
      points: currentPoints + 50,
      lastEngagementDate: new Date().toISOString().split('T')[0],
      lastAnxietyReset: new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    res.json({ success: true, event: savedEvent });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Recalculation API for user recovery intelligence (Phase 3B)
app.post("/api/recovery/recalculate", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const verifiedUser = (req as any).user;
    const uid = verifiedUser?.uid;

    if (!uid) {
      return res.status(401).json({ error: "Unauthorized. Missing user ID." });
    }

    const db = getDb();
    const { checkins = [], energy_budgets = [], mood_pulses = [], body_checkins = [], wins = [], weekly_reviews = [], goals = [] } = req.body;

    const now = new Date();
    const periodEnd = now.toISOString();
    const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const calculatedAt = now.toISOString();

    const getDirection = (numList: number[]) => {
      if (numList.length < 2) return "stable";
      const half = Math.floor(numList.length / 2);
      const firstHalf = numList.slice(0, half);
      const secondHalf = numList.slice(half);
      const avg1 = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const avg2 = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      if (avg2 - avg1 > 3) return "rising";
      if (avg1 - avg2 > 3) return "falling";
      return "stable";
    };

    // 1. RECOVERY DEBT
    let debtStatus: "not_enough_data" | "early_signal" | "available" = "available";
    let debtValue: number | null = null;
    let debtDirection = "unknown";
    let debtConfidence: "low" | "medium" | "high" = "medium";
    const debtSourceCount = checkins.length + energy_budgets.length + mood_pulses.length + body_checkins.length + wins.length + weekly_reviews.length;

    if (checkins.length < 3) {
      debtStatus = "not_enough_data";
    } else {
      let stressSum = 0;
      let energySum = 0;
      checkins.forEach(c => {
        stressSum += Number(c.stressLoad) || 5;
        energySum += Number(c.energyLevel) || 5;
      });
      const avgStress = stressSum / checkins.length;
      const avgEnergy = energySum / checkins.length;

      let score = 50 + (avgStress - 5) * 8 - (avgEnergy - 5) * 8;

      const budgetCapacityValues = energy_budgets.map(b => Number(b.remainingCapacity)).filter(v => !isNaN(v));
      if (budgetCapacityValues.length > 0) {
        const avgCapacity = budgetCapacityValues.reduce((a, b) => a + b, 0) / budgetCapacityValues.length;
        score -= (avgCapacity - 50) * 0.4;
      }

      const bodySignals = body_checkins.flatMap(bc => bc.signals || []);
      if (bodySignals.length > 0) {
        const tensionSignals = bodySignals.filter(s => s !== 'calm_settled');
        const ratio = tensionSignals.length / body_checkins.length;
        score += ratio * 5;
      }

      score -= wins.length * 2;
      score -= weekly_reviews.length * 4;

      debtValue = Math.max(0, Math.min(100, Math.round(score)));
      debtConfidence = debtSourceCount >= 10 ? "high" : (debtSourceCount < 5 ? "low" : "medium");
      
      const debtValues = checkins.map((c) => {
        const stress = Number(c.stressLoad) || 5;
        const energy = Number(c.energyLevel) || 5;
        return 50 + (stress - 5) * 10 - (energy - 5) * 10;
      });
      debtDirection = getDirection(debtValues);
    }

    const debtExplanation = debtStatus === "not_enough_data"
      ? "Not enough data yet. Complete a few check-ins to begin seeing trends."
      : "Based on your self-reported pressure levels and recovery actions, your coaching trend indicator suggests a stable recovery direction. Self-reported body signals show manageable tension, supported by your reported recovery actions.";

    const debtSummary = {
      type: "recovery_debt",
      status: debtStatus,
      value: debtValue,
      direction: debtDirection,
      confidenceLevel: debtConfidence,
      sourceCount: debtSourceCount,
      periodStart,
      periodEnd,
      formulaVersion: "rd_v1_nonclinical",
      explanation: debtExplanation,
      sourcesUsed: ["checkins", "energy_budgets", "mood_pulses", "body_checkins", "wins", "weekly_reviews"],
      calculatedAt
    };

    // 2. RECOVERY VELOCITY
    let velocityStatus: "not_enough_data" | "early_signal" | "available" = "available";
    let velocityValue: number | null = null;
    let velocityDirection = "unknown";
    let velocityConfidence: "low" | "medium" | "high" = "medium";
    const velocitySourceCount = checkins.length + energy_budgets.length + mood_pulses.length + wins.length + goals.length + weekly_reviews.length;

    if (checkins.length < 5 || weekly_reviews.length === 0) {
      velocityStatus = "not_enough_data";
    } else {
      if (weekly_reviews.length < 2) {
        velocityStatus = "early_signal";
      }
      let score = 50;
      let positiveCount = 0;
      let negativeCount = 0;
      mood_pulses.forEach(m => {
        const label = String(m.moodLabel).toLowerCase();
        if (['calm', 'hopeful', 'focused'].includes(label)) positiveCount++;
        if (['frustrated', 'overwhelmed', 'pressured'].includes(label)) negativeCount++;
      });
      score += (positiveCount - negativeCount) * 5;

      const budgetCapacityValues = energy_budgets.map(b => Number(b.remainingCapacity)).filter(v => !isNaN(v));
      if (budgetCapacityValues.length > 0) {
        const avgCapacity = budgetCapacityValues.reduce((a, b) => a + b, 0) / budgetCapacityValues.length;
        score += (avgCapacity - 50) * 0.3;
      }

      score += Math.min(25, wins.length * 5);

      const completedGoals = goals.filter(g => g.status === 'completed').length;
      const activeGoals = goals.filter(g => g.status === 'active').length;
      score += completedGoals * 8 + activeGoals * 2;
      score += weekly_reviews.length * 10;

      velocityValue = Math.max(10, Math.min(100, Math.round(score)));
      velocityConfidence = velocitySourceCount >= 12 ? "high" : (velocitySourceCount < 6 ? "low" : "medium");
      
      if (velocityValue >= 70) velocityDirection = "rising";
      else if (velocityValue < 45) velocityDirection = "falling";
      else velocityDirection = "stable";
    }

    const velocityExplanation = velocityStatus === "not_enough_data"
      ? "Not enough data yet. Complete a few check-ins to begin seeing trends."
      : "Your self-reported progress trend indicates a steady recovery direction. Your active recovery actions are working, framed by your completed weekly reflections and positive boundary actions.";

    const velocitySummary = {
      type: "recovery_velocity",
      status: velocityStatus,
      value: velocityValue,
      direction: velocityDirection,
      confidenceLevel: velocityConfidence,
      sourceCount: velocitySourceCount,
      periodStart,
      periodEnd,
      formulaVersion: "rv_v1_nonclinical",
      explanation: velocityExplanation,
      sourcesUsed: ["checkins", "energy_budgets", "mood_pulses", "wins", "goals", "weekly_reviews"],
      calculatedAt
    };

    // 3. ENERGY TREND
    let energyStatus: "not_enough_data" | "early_signal" | "available" = "available";
    let energyValue: number | null = null;
    let energyDirection = "unknown";
    let energyConfidence: "low" | "medium" | "high" = "medium";
    
    const checkinEnergyValues = checkins.map(c => Number(c.energyLevel) * 10).filter(v => !isNaN(v));
    const budgetCapacityValues = energy_budgets.map(b => Number(b.remainingCapacity)).filter(v => !isNaN(v));
    const energyEntries = [...checkinEnergyValues, ...budgetCapacityValues];
    const energySourceCount = energyEntries.length;

    if (energySourceCount < 3) {
      energyStatus = "not_enough_data";
    } else {
      const avg = energyEntries.reduce((a, b) => a + b, 0) / energySourceCount;
      energyValue = Math.max(10, Math.min(100, Math.round(avg)));
      energyConfidence = energySourceCount >= 10 ? "high" : (energySourceCount < 5 ? "low" : "medium");
      energyDirection = getDirection(energyEntries);
    }

    const energyExplanation = energyStatus === "not_enough_data"
      ? "Not enough data yet. Complete a few check-ins to begin seeing trends."
      : "Your self-reported energy levels show a consistent progress trend. Active energy management practices suggest your baseline capacity remains stable.";

    const energySummary = {
      type: "energy_trend",
      status: energyStatus,
      value: energyValue,
      direction: energyDirection,
      confidenceLevel: energyConfidence,
      sourceCount: energySourceCount,
      periodStart,
      periodEnd,
      formulaVersion: "energy_v1_nonclinical",
      explanation: energyExplanation,
      sourcesUsed: ["checkins", "energy_budgets"],
      calculatedAt
    };

    // 4. MOOD TREND
    let moodStatus: "not_enough_data" | "early_signal" | "available" = "available";
    let moodValue: number | null = null;
    let moodDirection = "unknown";
    let moodConfidence: "low" | "medium" | "high" = "medium";
    const moodSourceCount = mood_pulses.length;

    if (moodSourceCount < 3) {
      moodStatus = "not_enough_data";
    } else {
      const moodPulsesScores = mood_pulses.map(m => {
        const label = String(m.moodLabel || '').toLowerCase();
        let score = 50;
        if (['calm', 'hopeful', 'focused'].includes(label)) score = 80;
        else if (['tired', 'flat'].includes(label)) score = 40;
        else if (['frustrated', 'overwhelmed', 'pressured'].includes(label)) score = 20;
        
        const intensity = Number(m.intensity) || 5;
        if (score >= 60) {
          score += (intensity - 5) * 3;
        } else {
          score -= (intensity - 5) * 3;
        }
        return Math.max(10, Math.min(100, score));
      });
      const avg = moodPulsesScores.reduce((a, b) => a + b, 0) / moodSourceCount;
      moodValue = Math.max(10, Math.min(100, Math.round(avg)));
      moodConfidence = moodSourceCount >= 8 ? "high" : (moodSourceCount < 5 ? "low" : "medium");
      moodDirection = getDirection(moodPulsesScores);
    }

    const moodExplanation = moodStatus === "not_enough_data"
      ? "Not enough data yet. Complete a few check-ins to begin seeing trends."
      : "Self-reported mood trends indicate a stable direction. Tracking suggests your responses behave as expected under current reported pressure.";

    const moodSummary = {
      type: "mood_trend",
      status: moodStatus,
      value: moodValue,
      direction: moodDirection,
      confidenceLevel: moodConfidence,
      sourceCount: moodSourceCount,
      periodStart,
      periodEnd,
      formulaVersion: "mood_v1_nonclinical",
      explanation: moodExplanation,
      sourcesUsed: ["mood_pulses"],
      calculatedAt
    };

    // firestore.rules locks derived/{summaryId} to server-only writes (same
    // as derived/stats), so this has to persist here, not on the client -
    // the client previously tried to setDoc these itself after getting them
    // back from this route, which always failed with permission-denied
    // (the rule doesn't special-case these 4 doc IDs) while still awarding
    // points and showing a success state, since that happened before the
    // failed write was reached.
    const summaries = {
      recovery_debt: debtSummary,
      recovery_velocity: velocitySummary,
      energy_trend: energySummary,
      mood_trend: moodSummary,
    };
    await Promise.all(
      Object.entries(summaries).map(([key, summary]) =>
        db.collection("users").doc(uid).collection("derived").doc(key).set(summary)
      )
    );

    res.json({ success: true, calculatedAt, summaries });

  } catch (error: any) {
    logRouteError("Calculations Error Observation", error);
    res.status(500).json({ error: "Calculations Sync Failure: A safe operational error occurred." });
  }
});

// ============ Cross-Module Activity & Recommendation Engine ============
// This is the actual backing for "Nova sees what's happening everywhere" -
// a single per-user derived/stats document that every module marks when a
// real session completes, and one endpoint that reads across that plus a
// couple of live signals to compute what's actually worth suggesting right
// now, replacing what used to be static, unchanging copy on the home
// dashboard regardless of anything the person had actually done.

const ACTIVITY_FIELD_MAP: Record<string, string> = {
  nervousSystemReset: 'lastNervousSystemReset',
  boundaryRehearsal: 'lastBoundaryRehearsal',
  checkIn: 'lastCheckIn',
  moodPulse: 'lastMoodPulse',
  energyBudgetUpdate: 'lastEnergyBudgetUpdate',
  recoveryAllyActivity: 'lastRecoveryAllyActivity',
};

// ============ Real data portability & erasure (GDPR Art. 15/17/20) ============
// Both endpoints enumerate the user's subcollections dynamically via
// listCollections() rather than against a hardcoded list. That matters:
// this app writes to 40+ distinct per-user collections across client and
// server code, and a hardcoded list would silently go stale the first
// time a new feature adds one - producing either an incomplete export
// (a portability failure the user can't detect) or data surviving a
// deletion (an erasure failure that contradicts what the UI promises).
// Dynamic enumeration means new collections are covered automatically.

app.get("/api/user/export", exportLimiter, verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
    // A daily cap here is abuse protection against scripted repeated
    // full-account pulls, not a restriction on the underlying data-access
    // right - the limit is generous enough (1/day free, 20/day Premium)
    // that no genuine one-off export request is ever affected.
    const exportQuota = await checkAndReserveCapability(user.uid, 'exports');
    if (!exportQuota.allowed) {
      return res.status(429).json({ error: "You've already exported your data today. Please try again tomorrow.", code: 'capability_limit_reached', capability: 'exports' });
    }
    const db = getDb();
    const userRef = db.collection("users").doc(user.uid);

    const rootSnap = await userRef.get();
    const collections = await userRef.listCollections();

    const data: Record<string, unknown> = {};
    await Promise.all(collections.map(async (col) => {
      const snap = await col.get();
      data[col.id] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }));

    // Top-level collections keyed by userId rather than nested under the
    // user document - listCollections() above cannot see these, so they
    // have to be fetched explicitly or they'd be silently missing from a
    // record that claims to be complete. The list is the single source of
    // truth in user-data-collections.ts, guarded by a test that fails if a
    // new such collection is added to server.ts without being classified.
    const strayCollections = collectionsForExport();
    await Promise.all(strayCollections.map(async (colName) => {
      const snap = await db.collection(colName).where("userId", "==", user.uid).get();
      data[colName] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }));

    res.json({
      exportedAt: new Date().toISOString(),
      uid: user.uid,
      email: user.email || null,
      profile: rootSnap.exists ? rootSnap.data() : null,
      collections: data,
    });
  } catch (err: any) {
    console.error("[Export] failed:", err?.message || err);
    res.status(500).json({ error: "Could not build your data export right now. Please try again." });
  }
});

app.post("/api/user/delete-account", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
    const db = getDb();
    const userRef = db.collection("users").doc(user.uid);

    // Remove this user from any organisation they belong to first, so a
    // deleted account can't linger in an org's memberUids/adminUids and
    // count toward its aggregate dashboards after the person is gone.
    try {
      const rootSnap = await userRef.get();
      const orgId = rootSnap.exists ? (rootSnap.data() as any)?.organisationId : null;
      if (orgId) {
        await db.collection("organisations").doc(orgId).update({
          memberUids: FieldValue.arrayRemove(user.uid),
          adminUids: FieldValue.arrayRemove(user.uid),
          [`memberTeams.${user.uid}`]: FieldValue.delete(),
        });
        // Clean up the granular Enterprise role record too - see
        // /api/org/leave for why this matters.
        await db.collection("organisations").doc(orgId).collection("members").doc(user.uid).delete();
        // Same reasoning for any desktop-deployment device this user
        // registered under the org (organisations/{orgId}/devices, keyed by
        // ownerUid) - otherwise a device record carrying this user's uid and
        // deviceName would silently outlive the account it belongs to,
        // exactly the class of bug the member-record cleanup above exists
        // to prevent.
        const devicesSnap = await db.collection("organisations").doc(orgId).collection("devices")
          .where("ownerUid", "==", user.uid).get();
        await Promise.all(devicesSnap.docs.map((d: any) => d.ref.delete()));
      }
    } catch (e) {
      // Non-fatal - if the org record is already gone or malformed, the
      // user's own data should still be deleted below rather than the
      // whole request failing over org bookkeeping.
    }

    // recursiveDelete removes the user document and every subcollection
    // beneath it, at any depth - the actual erasure the Privacy Vault's
    // copy promises.
    await db.recursiveDelete(userRef);

    // Top-level collections keyed by userId rather than nested under the
    // user document - recursiveDelete above cannot reach these, so they
    // have to be handled explicitly or the data survives a deletion that
    // claims to remove everything. Single source of truth in
    // user-data-collections.ts. Note this list is deliberately a subset of
    // the export list: audit_logs is exported but NOT erased, because a
    // compliance trail must outlive the account it records (see the reason
    // field there). The classification lives in one place, guarded by a
    // test, rather than as two hand-maintained arrays that can drift.
    const strayCollections = collectionsForErasure();
    for (const colName of strayCollections) {
      const snap = await db.collection(colName).where("userId", "==", user.uid).get();
      await Promise.all(snap.docs.map(d => d.ref.delete()));
    }

    // Delete the auth account itself last. If this fails, the personal
    // data is already gone, which is the part that actually matters for
    // erasure - but report it honestly rather than claiming full success.
    let authDeleted = true;
    try {
      await getAuth().deleteUser(user.uid);
    } catch (e: any) {
      authDeleted = false;
      console.error("[Delete] auth account deletion failed:", e?.message || e);
    }

    res.json({ success: true, authDeleted });
  } catch (err: any) {
    console.error("[Delete] failed:", err?.message || err);
    res.status(500).json({ error: "The deletion did not complete. Some data may have been removed already - please try again, and contact support if this keeps happening." });
  }
});

app.post("/api/user/mark-activity", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
    const { activity } = req.body;
    const fieldName = ACTIVITY_FIELD_MAP[activity];
    if (!fieldName) {
      return res.status(400).json({ error: "Unknown activity type." });
    }
    const db = getDb();
    await db.collection("users").doc(user.uid).collection("derived").doc("stats").set({
      [fieldName]: new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// "Pick up where you left off" - checked by the client BEFORE
// /api/user/recommendation, and takes priority over it whenever there's
// genuine unfinished progress on Recovery Plan or the post-check-in
// action plan - the only two features with real, resumable partial
// state today (check-in/reflect save nothing until final submit;
// weekly goals/energy budget are time-boxed and "in progress" by
// design all week, so neither maps cleanly to "abandoned" - both
// deliberately left for a future pass rather than guessed at here).
// Kept as a fully separate function from the rule-based recommendation
// engine above so it carries zero risk to those rules. Only ever
// surfaces ONE prompt (the most recently touched), matching this
// product's "one clear next step per page" principle - never a stack
// of reminders. Copy is deliberately optional-sounding, never framed
// as a broken streak or something owed.
app.get("/api/user/resume-prompt", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
    const db = getDb();

    type ResumeCandidate = { tool: string; tab: string; title: string; message: string; updatedAt: string };
    const candidates: ResumeCandidate[] = [];

    const planSnap = await db.collection("users").doc(user.uid).collection("recovery_plan_progress").doc("state").get();
    if (planSnap.exists) {
      const data = planSnap.data()!;
      const allIds: string[] = Array.isArray(data.allActionIds) ? data.allActionIds : [];
      const completedIds: string[] = Array.isArray(data.completedIds) ? data.completedIds : [];
      const remaining = allIds.filter((id) => !completedIds.includes(id)).length;
      if (allIds.length > 0 && remaining > 0 && typeof data.updatedAt === 'string') {
        candidates.push({
          tool: 'Recovery Plan',
          tab: 'plan',
          title: "Pick up where you left off",
          message: "Whenever you're ready - you left your Recovery Plan partway through. It's exactly as you left it.",
          updatedAt: data.updatedAt,
        });
      }
    }

    const diagnosisSnap = await db.collection("users").doc(user.uid).collection("diagnosis_progress").get();
    for (const doc of diagnosisSnap.docs) {
      const data = doc.data();
      const allActionIds: string[] = Array.isArray(data.allActionIds) ? data.allActionIds : [];
      const allBoundaryIds: string[] = Array.isArray(data.allBoundaryIds) ? data.allBoundaryIds : [];
      const completedActions: string[] = Array.isArray(data.completedActions) ? data.completedActions : [];
      const committedBoundaries: string[] = Array.isArray(data.committedBoundaries) ? data.committedBoundaries : [];
      const remainingActions = allActionIds.filter((id) => !completedActions.includes(id)).length;
      const remainingBoundaries = allBoundaryIds.filter((id) => !committedBoundaries.includes(id)).length;
      const totalKnown = allActionIds.length + allBoundaryIds.length;
      if (totalKnown > 0 && (remainingActions + remainingBoundaries) > 0 && typeof data.updatedAt === 'string') {
        candidates.push({
          tool: 'Your Action Plan',
          tab: 'diagnose',
          title: "Pick up where you left off",
          message: "Whenever you're ready - you left some of your recovery actions unfinished. They're exactly as you left them.",
          updatedAt: data.updatedAt,
        });
      }
    }

    if (candidates.length === 0) {
      return res.json({ hasIncomplete: false });
    }

    // Only ever surface the single most recently-touched candidate.
    candidates.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const chosen = candidates[0];
    res.json({
      hasIncomplete: true,
      tool: chosen.tool,
      tab: chosen.tab,
      title: chosen.title,
      message: chosen.message,
      points: 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Weekly Recovery Recap - a plain "here's what you actually did this
// week" read, not a recommendation. Template-based off real data the
// person already logged (check-in count, current streak, which way
// energy moved, one win) rather than an AI call - genuinely tailored to
// their week without the latency/cost/rate-limit surface a Nova call
// would add. Deliberately separate from the recommendation/resume-prompt
// routes above - this never suggests anything or competes with "today's
// focus" for the one-clear-next-step slot, it's a retrospective widget
// someone opts into from "Add widget".
app.get("/api/user/weekly-recap", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
    const db = getDb();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [checkinsSnap, winsSnap, statsSnap] = await Promise.all([
      db.collection("users").doc(user.uid).collection("checkins").where("createdAt", ">=", sevenDaysAgo).get(),
      db.collection("users").doc(user.uid).collection("wins").where("createdAt", ">=", sevenDaysAgo).orderBy("createdAt", "desc").limit(1).get(),
      db.collection("users").doc(user.uid).collection("user_stats").doc("core").get(),
    ]);

    const checkinsCount = checkinsSnap.size;
    if (checkinsCount === 0) {
      return res.json({ hasActivity: false });
    }

    const stats = statsSnap.exists ? statsSnap.data()! : {};
    const currentStreak = typeof stats.streak === "number" ? stats.streak : 0;

    // Compares the first half of this week's check-ins to the second half
    // - same technique as /api/recovery/recalculate's getDirection, just
    // over a 7-day window instead of 30, and on the raw 0-10 energyLevel
    // scale rather than the derived 0-100 score.
    const energyValues = checkinsSnap.docs
      .map((d) => d.data())
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((d) => Number(d.energyLevel))
      .filter((v) => !isNaN(v));
    let energyDirection: "rising" | "falling" | "stable" | "unknown" = "unknown";
    if (energyValues.length >= 2) {
      const half = Math.floor(energyValues.length / 2);
      const avg1 = energyValues.slice(0, half).reduce((a, b) => a + b, 0) / half;
      const avg2 = energyValues.slice(half).reduce((a, b) => a + b, 0) / (energyValues.length - half);
      if (avg2 - avg1 > 1) energyDirection = "rising";
      else if (avg1 - avg2 > 1) energyDirection = "falling";
      else energyDirection = "stable";
    }

    const highlight = winsSnap.empty ? null : (winsSnap.docs[0].data().title as string) || null;

    res.json({
      hasActivity: true,
      checkinsCount,
      currentStreak,
      energyDirection,
      highlight,
      weekStart: sevenDaysAgo,
      weekEnd: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/user/recommendation", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
    const db = getDb();

    const statsDoc = await db.collection("users").doc(user.uid).collection("derived").doc("stats").get();
    const stats = statsDoc.exists ? statsDoc.data()! : {};
    const now = Date.now();
    const hoursSince = (iso?: string) => iso ? (now - new Date(iso).getTime()) / (1000 * 60 * 60) : Infinity;

    // Real, recent high-severity signals - if something acute happened
    // recently, that outranks everything else below.
    const triggersSnap = await db.collection("users").doc(user.uid).collection("stress_triggers")
      .orderBy("createdAt", "desc").limit(3).get();
    const recentHighSeverity = triggersSnap.docs
      .map(d => d.data())
      .find(d => hoursSince(d.createdAt) < 3 && (d.severity || 0) >= 7);

    // Real current active load, not a guess.
    const commitmentsSnap = await db.collection("users").doc(user.uid).collection("energy_commitments")
      .where("status", "==", "active").get();
    const activeLoad = commitmentsSnap.docs.reduce((sum, d) => sum + (d.data().energyDrain || 0), 0);

    // Whether the user has ever actually used Energy Budget / Recovery Ally
    // before - without this, a person who has never touched either feature
    // would show as permanently "stale" (lastEnergyBudgetUpdate/
    // lastRecoveryAllyActivity undefined -> hoursSince Infinity) and get
    // nagged toward a tool they've never opened, every single time nothing
    // else matches. Gating on real prior engagement keeps the reminder
    // meaningful instead of a blind default.
    const hasEnergyBudgetHistory = !(await db.collection("users").doc(user.uid).collection("energy_budgets").limit(1).get()).empty;
    const hasAllyHistory = !(await db.collection("users").doc(user.uid).collection("ally_shared_goals").limit(1).get()).empty;

    let recommendation: { tool: string; tab: string; title: string; message: string; points: number; sourcesUsed: string[]; type: string };

    if (recentHighSeverity) {
      const snippet = String(recentHighSeverity.text || '').slice(0, 90);
      recommendation = {
        tool: 'Nervous System Reset',
        tab: 'reset',
        title: "You flagged something heavy recently",
        message: snippet
          ? `You logged "${snippet}" a little while ago as high-intensity. A short reset now could help before it compounds.`
          : "Something you logged recently was high-intensity. A short reset now could help before it compounds.",
        points: 25,
        sourcesUsed: ['stress_triggers'],
        type: 'overload_warning',
      };
    } else if (hoursSince(stats.lastCheckIn) > 20 && hoursSince(stats.lastMoodPulse) > 20) {
      recommendation = {
        tool: 'Pulse Check-In',
        tab: 'home',
        title: "Haven't heard from you today",
        message: "You haven't logged a check-in yet today. A quick pulse helps Nova actually track how you're doing, not just guess.",
        points: 15,
        sourcesUsed: ['derived_stats.lastCheckIn', 'derived_stats.lastMoodPulse'],
        type: 'recovery_reminder',
      };
    } else if (activeLoad >= 60) {
      recommendation = {
        tool: 'Energy Budget',
        tab: 'recover',
        title: "Your active load looks heavy",
        message: `You've got ${activeLoad} units of active energy commitments logged right now. Worth reviewing what can be delegated or dropped before it adds up.`,
        points: 20,
        sourcesUsed: ['energy_commitments'],
        type: 'recovery_reminder',
      };
    } else if (hoursSince(stats.lastBoundaryRehearsal) > 24 * 7 && activeLoad > 0) {
      recommendation = {
        tool: 'Boundary Rehearsal',
        tab: 'communicate',
        title: "Worth rehearsing a script",
        message: "It's been a while since you practised a boundary script. If something's been sitting on your plate, a few minutes of rehearsal makes it easier to actually say.",
        points: 20,
        sourcesUsed: ['derived_stats.lastBoundaryRehearsal', 'energy_commitments'],
        type: 'recovery_reminder',
      };
    } else if (hoursSince(stats.lastNervousSystemReset) > 48) {
      recommendation = {
        tool: 'Nervous System Reset',
        tab: 'reset',
        title: "A reset might help",
        message: "It's been a couple of days since your last nervous system reset. Even five minutes of breathing work adds up.",
        points: 15,
        sourcesUsed: ['derived_stats.lastNervousSystemReset'],
        type: 'recovery_reminder',
      };
    } else if (hasEnergyBudgetHistory && hoursSince(stats.lastEnergyBudgetUpdate) > 24 * 10) {
      recommendation = {
        tool: 'Energy Budget',
        tab: 'recover',
        title: "Your energy budget is out of date",
        message: "It's been over a week since you last logged an energy budget. A fresh one keeps Nova's read on your capacity honest instead of stale.",
        points: 15,
        sourcesUsed: ['derived_stats.lastEnergyBudgetUpdate', 'energy_budgets'],
        type: 'recovery_reminder',
      };
    } else if (hasAllyHistory && hoursSince(stats.lastRecoveryAllyActivity) > 24 * 10) {
      recommendation = {
        tool: 'Recovery Ally',
        tab: 'ally',
        title: "Your support circle hasn't heard from you",
        message: "It's been over a week since you checked in on a shared recovery goal. A quick update keeps the people supporting you actually in the loop.",
        points: 15,
        sourcesUsed: ['derived_stats.lastRecoveryAllyActivity', 'ally_shared_goals'],
        type: 'recovery_reminder',
      };
    } else {
      recommendation = {
        tool: 'Nova Coach',
        tab: 'nova',
        title: "You're on track",
        message: "Nothing urgent flagged right now based on what you've logged. If something's on your mind, Nova's a good place to think it through.",
        points: 10,
        sourcesUsed: [],
        type: 'tiny_win',
      };
    }

    // Genuinely verify this recommendation before it reaches the user - the
    // same guardrail rules previously existed as a fully-built class
    // (NovaChallengeMode.verifyRecommendation) that nothing in the app ever
    // actually called, while a "Nova Recommendation Ledger" in the Trust
    // Centre showed three hardcoded example rows (with an identical
    // timestamp across all three) as if they were real audit evidence.
    let verificationStatus: 'verified' | 'rejected' = 'verified';
    let verificationExplanation = 'Verified: Passed all guardrail checks.';
    const checkInsSnap = await db.collection("users").doc(user.uid).collection("checkins").limit(3).get();
    if (checkInsSnap.size < 3 && recommendation.message.toLowerCase().includes('pattern')) {
      verificationStatus = 'rejected';
      verificationExplanation = 'Rejected: Attempted to claim a pattern with fewer than 3 check-ins.';
    } else if (/(depression|anxiety disorder|treatment|clinical)/i.test(recommendation.message)) {
      verificationStatus = 'rejected';
      verificationExplanation = 'Rejected: Recommendation breached non-medical coaching boundary.';
    }

    const ledgerEntry = {
      type: recommendation.type,
      content: recommendation.message,
      sourcesUsed: recommendation.sourcesUsed,
      ruleVersion: '1.0',
      status: verificationStatus,
      explanation: verificationExplanation,
      timestamp: new Date().toISOString(),
    };
    db.collection("users").doc(user.uid).collection("recommendation_ledger").add(ledgerEntry).catch(() => {
      // Non-fatal - the recommendation still reaches the user even if the ledger write fails.
    });

    if (verificationStatus === 'rejected') {
      // A genuinely rejected recommendation doesn't reach the user - fall
      // back to the honest, always-safe default instead.
      return res.json({
        tab: 'nova', title: "You're on track",
        message: "Nothing urgent flagged right now based on what you've logged. If something's on your mind, Nova's a good place to think it through.",
        points: 10, tool: 'Nova Coach',
      });
    }

    res.json(recommendation);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/user/recommendation-ledger", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
    const db = getDb();
    const snap = await db.collection("users").doc(user.uid).collection("recommendation_ledger")
      .orderBy("timestamp", "desc").limit(50).get();
    const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ entries });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============ Recovery Velocity Map (real 30-day history) ============
// Replaces what was previously a fully fabricated chart - sine/cosine wave
// functions plus random noise generating 30 days of "energy output" and
// "recovery input" data, complete with invented diagnostic annotations,
// shown on the home dashboard as if it reflected the person's real trend.

app.get("/api/recovery/velocity-map", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
    const db = getDb();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [triggersSnap, budgetsSnap, sessionsSnap, winsSnap, moodSnap] = await Promise.all([
      db.collection("users").doc(user.uid).collection("stress_triggers").where("createdAt", ">=", thirtyDaysAgo).get(),
      db.collection("users").doc(user.uid).collection("energy_budgets").where("createdAt", ">=", thirtyDaysAgo).get(),
      db.collection("users").doc(user.uid).collection("focus_sessions").where("createdAt", ">=", thirtyDaysAgo).get(),
      db.collection("users").doc(user.uid).collection("wins").where("createdAt", ">=", thirtyDaysAgo).get(),
      db.collection("users").doc(user.uid).collection("mood_pulses").where("createdAt", ">=", thirtyDaysAgo).get(),
    ]);

    const dayKey = (iso: string) => new Date(iso).toISOString().split('T')[0];

    const triggersByDay: Record<string, number[]> = {};
    triggersSnap.docs.forEach(d => {
      const data = d.data();
      const key = dayKey(data.createdAt);
      (triggersByDay[key] = triggersByDay[key] || []).push(data.severity || 5);
    });

    const budgetsByDay: Record<string, number[]> = {};
    budgetsSnap.docs.forEach(d => {
      const data = d.data();
      const key = dayKey(data.createdAt);
      const pct = data.totalCapacity > 0 ? (data.allocatedCapacity / data.totalCapacity) * 100 : 0;
      (budgetsByDay[key] = budgetsByDay[key] || []).push(pct);
    });

    const recoveryEventsByDay: Record<string, number> = {};
    sessionsSnap.docs.forEach(d => {
      if (d.data().completed) {
        const key = dayKey(d.data().createdAt);
        recoveryEventsByDay[key] = (recoveryEventsByDay[key] || 0) + 1;
      }
    });
    winsSnap.docs.forEach(d => {
      const key = dayKey(d.data().createdAt);
      recoveryEventsByDay[key] = (recoveryEventsByDay[key] || 0) + 1;
    });
    moodSnap.docs.forEach(d => {
      const key = dayKey(d.data().createdAt);
      recoveryEventsByDay[key] = (recoveryEventsByDay[key] || 0) + 0.5;
    });

    const days = [];
    let anyRealData = false;
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const dayTriggers = triggersByDay[key];
      const dayBudgets = budgetsByDay[key];
      let energyOutput: number | null = null;
      if (dayBudgets && dayBudgets.length > 0) {
        energyOutput = Math.round(dayBudgets.reduce((a, b) => a + b, 0) / dayBudgets.length);
      } else if (dayTriggers && dayTriggers.length > 0) {
        const avgSeverity = dayTriggers.reduce((a, b) => a + b, 0) / dayTriggers.length;
        energyOutput = Math.min(100, Math.round(dayTriggers.length * 12 + avgSeverity * 4));
      }

      const recoveryCount = recoveryEventsByDay[key] || 0;
      const recoveryInput = recoveryCount > 0 ? Math.min(100, Math.round(recoveryCount * 25)) : null;

      if (energyOutput !== null || recoveryInput !== null) anyRealData = true;

      days.push({
        date: formattedDate,
        energyOutput,
        recoveryInput,
        hasData: energyOutput !== null || recoveryInput !== null,
      });
    }

    res.json({ days, hasAnyData: anyRealData });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============ Outcome Tracker (real, not fabricated) ============
// Previously "Section 21 / Evidence & ROI" was entirely hardcoded: 8 KPIs
// (+45% recovery improvement, 4.9/5 user rating, etc.) and 3 charts showing
// a perfectly smooth 6-week improvement curve, identical for every user,
// with the fingerprint prop received but never even read. This computes
// genuine weekly aggregates from real collections using the same
// day-bucketing approach as the velocity map above, and is honest that some
// of the original claims (a user rating system, sleep-hours tracking,
// a return-to-work confidence score) have no real data source anywhere in
// this app rather than inventing plausible-looking substitutes for them.

app.get("/api/user/outcome-tracker", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
    const db = getDb();
    const sixWeeksAgo = new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString();

    const [triggersSnap, boundarySnap, winsSnap, moodSnap, budgetsSnap, workloadDoc] = await Promise.all([
      db.collection("users").doc(user.uid).collection("stress_triggers").where("createdAt", ">=", sixWeeksAgo).get(),
      db.collection("users").doc(user.uid).collection("boundary_scripts").where("createdAt", ">=", sixWeeksAgo).get(),
      db.collection("users").doc(user.uid).collection("wins").where("createdAt", ">=", sixWeeksAgo).get(),
      db.collection("users").doc(user.uid).collection("mood_pulses").where("createdAt", ">=", sixWeeksAgo).get(),
      db.collection("users").doc(user.uid).collection("energy_budgets").where("createdAt", ">=", sixWeeksAgo).get(),
      db.collection("users").doc(user.uid).collection("workload_reality_check").doc("state").get(),
    ]);

    const weekIndex = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / (7 * 24 * 60 * 60 * 1000));

    const triggersByWeek: Record<number, number[]> = {};
    triggersSnap.docs.forEach(d => {
      const w = weekIndex(d.data().createdAt);
      if (w >= 0 && w < 6) (triggersByWeek[w] = triggersByWeek[w] || []).push(d.data().severity || 5);
    });
    const boundaryByWeek: Record<number, number> = {};
    boundarySnap.docs.forEach(d => {
      const w = weekIndex(d.data().createdAt);
      if (w >= 0 && w < 6) boundaryByWeek[w] = (boundaryByWeek[w] || 0) + 1;
    });
    const recoveryEventsByWeek: Record<number, number> = {};
    winsSnap.docs.forEach(d => {
      const w = weekIndex(d.data().createdAt);
      if (w >= 0 && w < 6) recoveryEventsByWeek[w] = (recoveryEventsByWeek[w] || 0) + 1;
    });
    moodSnap.docs.forEach(d => {
      const w = weekIndex(d.data().createdAt);
      if (w >= 0 && w < 6) recoveryEventsByWeek[w] = (recoveryEventsByWeek[w] || 0) + 0.5;
    });
    const budgetsByWeek: Record<number, number[]> = {};
    budgetsSnap.docs.forEach(d => {
      const data = d.data();
      const w = weekIndex(data.createdAt);
      const pct = data.totalCapacity > 0 ? (data.allocatedCapacity / data.totalCapacity) * 100 : 0;
      if (w >= 0 && w < 6) (budgetsByWeek[w] = budgetsByWeek[w] || []).push(pct);
    });

    const weeks = [];
    let anyRealData = false;
    for (let i = 5; i >= 0; i--) {
      const dayTriggers = triggersByWeek[i];
      const burnoutRisk = dayTriggers && dayTriggers.length > 0
        ? Math.min(100, Math.round(dayTriggers.reduce((a, b) => a + b, 0) / dayTriggers.length * 10))
        : null;

      const recoveryCount = recoveryEventsByWeek[i] || 0;
      const recoveryFromEvents = recoveryCount > 0 ? Math.min(100, Math.round(recoveryCount * 15)) : null;

      const boundaryCount = boundaryByWeek[i] || 0;
      const boundary = boundaryCount > 0 ? Math.min(100, Math.round(boundaryCount * 25)) : null;

      const dayBudgets = budgetsByWeek[i];
      const overcapacity = dayBudgets && dayBudgets.length > 0
        ? Math.round(dayBudgets.reduce((a, b) => a + b, 0) / dayBudgets.length)
        : null;

      const hasData = burnoutRisk !== null || recoveryFromEvents !== null || boundary !== null || overcapacity !== null;
      if (hasData) anyRealData = true;

      weeks.push({
        week: `W${6 - i}`,
        recovery: recoveryFromEvents,
        burnoutRisk,
        boundary,
        overcapacity,
        hasData,
      });
    }

    // KPIs: only computed where a real signal genuinely exists. Sleep
    // consistency, return-to-work confidence, and a user-helpfulness rating
    // have no real data source anywhere in this app - honestly null rather
    // than invented.
    const totalBoundaryScripts = boundarySnap.size;
    const totalWins = winsSnap.size;
    const avgTriggerSeverity = triggersSnap.size > 0
      ? triggersSnap.docs.reduce((sum, d) => sum + (d.data().severity || 5), 0) / triggersSnap.size
      : null;

    let overcapacityDaysPerWeek: number | null = null;
    if (workloadDoc.exists) {
      const tasks = workloadDoc.data()?.tasks || [];
      const activeDrain = tasks.filter((t: any) => !t.completed).reduce((sum: number, t: any) => sum + (t.energyDrain || 0), 0);
      overcapacityDaysPerWeek = activeDrain > 300 ? Math.min(7, Math.round((activeDrain - 300) / 60)) : 0;
    }

    res.json({
      weeks,
      hasAnyData: anyRealData,
      kpis: {
        boundaryScriptsLogged: totalBoundaryScripts,
        winsLogged: totalWins,
        avgTriggerSeverity: avgTriggerSeverity !== null ? Math.round(avgTriggerSeverity * 10) / 10 : null,
        overcapacityDaysPerWeek,
        sleepConsistency: null,
        returnToWorkConfidence: null,
        userRatedHelpfulness: null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============ Executive Board Report (real data, not fabricated) ============
// Previously this report - explicitly meant to be shown to an employer or
// manager - contained a hardcoded "Nova AI Analysis" quote that was never
// generated by any model, plus a static "115%" burn rate, "4 Protected"
// boundaries, "4.5 hrs" deep work, and "7 Completed" somatic resets, none
// tied to anything the person actually did. This endpoint computes every
// figure from real data and only generates AI commentary grounded in what's
// actually there.

// ============================================================================
// Resentment Tracker: real analysis (previously this was 100% hardcoded -
// the code's own comment admitted "Simulate AI analysis delay" - the same
// four-part response was shown to every user regardless of what they
// actually wrote, after a fake 2-second "thinking" animation).
// ============================================================================

const ResentmentAnalysisRequestSchema = z.object({
  log: z.string().min(1).max(3000),
}).strict();

// Matches firestore.rules' resentment_logs shape exactly (isStringWithMax
// caps of 500/500/500/300) - previously the model's raw JSON.parse output
// went straight to the client and then into a Firestore write with no
// server-side check in between, so the rule's own length/shape validation
// was the only thing standing between a malformed model response and a
// silently-rejected client write. Validating here instead gives a real
// error response if the model ever returns an unexpected shape, rather
// than a mysterious failed save on the client.
const ResentmentAnalysisResponseSchema = z.object({
  yesMeantNo: z.string().max(500).optional(),
  unclear: z.string().max(500).optional(),
  unappreciated: z.string().max(500).optional(),
  missingBoundary: z.string().max(300).optional(),
});

app.post("/api/nova/resentment-analysis", resentmentAnalysisLimiter, verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const parsed = ResentmentAnalysisRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request.", details: (parsed as any).error?.errors || [] });
    }
    const { log } = parsed.data;

    const user = requireAuth(req);
    const quota = await checkAndReserveCapability(user.uid, 'resentment_analysis');
    if (!quota.allowed) {
      return res.status(429).json({
        error: quota.plan === 'free'
          ? "You've reached today's free limit for this. It resets tomorrow, or upgrade to Blaze Break Premium for more."
          : "You've reached today's fair-use limit for this. It resets tomorrow.",
        code: 'capability_limit_reached',
        capability: 'resentment_analysis',
      });
    }

    const prompt = `You are Nova, a direct, analytical British high-performance recovery coach. The user has just written raw, unfiltered venting about something that's currently resenting them at work or in life - they were explicitly told "be unprofessional, be petty, just get it out." Read what they actually wrote and extract genuine structural patterns from it. Do not invent specifics not present in their text - if something isn't there, say so honestly rather than filling the gap with a generic-sounding but fabricated observation.

Their raw venting:
"""
${log}
"""

Respond strictly in this JSON format, no markdown, no commentary outside the JSON:
{
  "yesMeantNo": "1-2 sentences on where they likely agreed to something when they meant to decline, based specifically on what they wrote. If this pattern isn't evident in their text, say so honestly instead of guessing.",
  "unclear": "1-2 sentences on where expectations seem vaguely defined, based specifically on what they wrote.",
  "unappreciated": "1-2 sentences on where their effort seems to be going unrecognized, based specifically on what they wrote.",
  "missingBoundary": "A short, concrete boundary statement (under 20 words) they could have used, grounded in their actual situation - not a generic template."
}
${NOVA_ONE_SHOT_SAFETY_FLOOR}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from Gemini model.");
    const rawAnalysis = JSON.parse(text);
    const validated = ResentmentAnalysisResponseSchema.safeParse(rawAnalysis);
    if (!validated.success) {
      throw new Error(`Model returned an unexpected shape: ${validated.error.message}`);
    }

    res.json(validated.data);
  } catch (err: any) {
    console.error("[Nova] resentment analysis error:", err.message);
    res.status(500).json({ error: "Could not analyze that right now." });
  }
});

app.get("/api/signals/executive-report", executiveReportLimiter, verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
    const quota = await checkAndReserveCapability(user.uid, 'executive_report');
    if (!quota.allowed) {
      return res.status(429).json({
        error: quota.plan === 'free'
          ? "You've reached today's free limit for this. It resets tomorrow, or upgrade to Blaze Break Premium for more."
          : "You've reached today's fair-use limit for this. It resets tomorrow.",
        code: 'capability_limit_reached',
        capability: 'executive_report',
      });
    }
    const db = getDb();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const focusSnap = await db.collection("users").doc(user.uid).collection("focus_sessions")
      .where("createdAt", ">=", sevenDaysAgo).get();
    const completedFocus = focusSnap.docs.filter(d => d.data().completed === true);
    const deepWorkMinutes = completedFocus.reduce((sum, d) => sum + (d.data().durationMinutes || 0), 0);
    const deepWorkHours = deepWorkMinutes > 0 ? Math.round((deepWorkMinutes / 60) * 10) / 10 : 0;

    const boundarySnap = await db.collection("users").doc(user.uid).collection("boundary_scripts")
      .where("createdAt", ">=", sevenDaysAgo).get();
    const boundariesProtected = boundarySnap.size;

    // Same formula WorkloadRealityCheck already uses for fatigue probability
    // - kept consistent rather than inventing a separate "burn rate" concept.
    let burnRatePercent: number | null = null;
    const workloadSnap = await db.collection("users").doc(user.uid).collection("workload_reality_check").doc("state").get();
    if (workloadSnap.exists) {
      const tasksData = workloadSnap.data()?.tasks || [];
      const weeklyDrain = tasksData
        .filter((t: any) => !t.completed)
        .reduce((sum: number, t: any) => sum + (t.energyDrain || 0), 0);
      burnRatePercent = Math.min(Math.round((weeklyDrain / 300) * 100), 100);
    }

    let sleepDebtHours: number | null = null;
    const statsSnap = await db.collection("users").doc(user.uid).collection("user_stats").doc("core").get();
    if (statsSnap.exists) {
      const debts = statsSnap.data()?.debts || [];
      const sleepEntry = debts.find((d: any) => (d.label || '').toLowerCase().includes('sleep'));
      if (sleepEntry && typeof sleepEntry.value === 'number' && sleepEntry.value > 0) {
        sleepDebtHours = sleepEntry.value;
      }
    }

    const hasEnoughData = deepWorkHours > 0 || boundariesProtected > 0 || burnRatePercent !== null || sleepDebtHours !== null;

    let aiAnalysis: string | null = null;
    if (hasEnoughData) {
      try {
        const signals: string[] = [];
        if (deepWorkHours > 0) signals.push(`${deepWorkHours} hours of protected deep work logged this week`);
        if (boundariesProtected > 0) signals.push(`${boundariesProtected} boundary script(s) practiced this week`);
        if (burnRatePercent !== null) signals.push(`workload burn rate at ${burnRatePercent}% of weekly capacity`);
        if (sleepDebtHours !== null) signals.push(`${sleepDebtHours} hours of carried sleep debt`);

        const prompt = `You are Nova, a direct, analytical British high-performance recovery coach writing a short (2-3 sentence) executive summary for a workplace wellbeing report the person may share with their manager. Base this ONLY on these real signals - do not invent any number, event, or day not listed here: ${signals.join('; ')}. Be honest and grounded, not alarmist and not falsely reassuring. Do not mention specific days of the week since none were provided.`;

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
        });
        aiAnalysis = response.text ? response.text.trim() : null;
      } catch (e) {
        // Non-fatal - the report renders without AI commentary if this fails.
      }
    }

    res.json({
      deepWorkHours,
      boundariesProtected,
      burnRatePercent,
      sleepDebtHours,
      aiAnalysis,
      hasEnoughData,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Memory API Validation
const applyMemorySafetyFilter = (text: string) => {
  const t = text.toLowerCase();
  const dangerous = ["suicid", "kill", "harm", "depress", "anxiet", "panic", "bipolar", "broken", "always fails"];
  // Redact simple phone numbers or emails loosely
  if (/\d{4,}/.test(t) || /@/.test(t) || /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(t)) {
    return false;
  }
  for (const d of dangerous) {
    if (t.includes(d)) return false;
  }
  return true;
};

// Vite middleware for development
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, {
      // Every other file here is content-hashed by Vite (safe to cache
      // indefinitely - a changed file gets a new filename), but
      // index.html's filename never changes. Without this, a browser can
      // keep serving a stale, cached index.html referencing a previous
      // deploy's asset hashes long after those files are gone from the
      // server - the exact "Failed to load module script... MIME type of
      // text/html" blank-page failure this fixes.
      //
      // sw.js gets the same treatment for a related reason: browsers only
      // re-check a service worker script for updates periodically (and
      // otherwise reuse whatever they last fetched), so without an
      // explicit no-cache header here, a browser that cached an older
      // sw.js before a fix like this one shipped can keep running that
      // stale worker logic for a long time afterwards even though the
      // server has the fix - reintroducing the exact blank-page-on-normal-
      // refresh symptom the worker itself exists to prevent (see
      // public/sw.js's own history), just with a longer, harder-to-explain
      // delay before it self-heals.
      setHeaders: (res, filePath) => {
        if (path.basename(filePath) === 'index.html' || path.basename(filePath) === 'sw.js') {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }));
    app.get('*all', (req, res) => {
      // A request that reaches here for something under /assets/ or with
      // a file extension is a stale reference to a build artifact that no
      // longer exists - typically a browser still holding an old
      // index.html from before a redeploy. A real 404 lets the browser
      // report that cleanly; silently serving today's index.html instead
      // (200, wrong MIME type) is what produced the confusing blank page.
      if (req.path.startsWith('/assets/') || path.extname(req.path)) {
        return res.status(404).end();
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

export { app };

if (process.env.TEST_MODE !== 'true') {
  setupVite().then(() => {
    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });

    const wss = new WebSocketServer({ server, path: "/api/nova/live" });
    wss.on("connection", async (clientWs, req) => {
      // Browsers can't set custom headers on WebSocket connections, so auth
      // travels as query params instead of the Authorization/x-firebase-appcheck
      // headers used everywhere else in this file. This is the one thing that
      // was actually missing — everything else (client audio capture/encode,
      // playback, session lifecycle) was already built; it was just never
      // safe to open this socket to the world without it.
      const url = new URL(req.url || "", `http://${req.headers.host}`);
      const idToken = url.searchParams.get("token");
      const appCheckToken = url.searchParams.get("appCheckToken");

      // Same fix as the main verifyAppCheck middleware: no magic bypass
      // string here, since anyone can read it out of the shipped client
      // bundle and send it directly regardless of environment. Only
      // genuinely running outside production skips this check.
      if (process.env.NODE_ENV === "production") {
        if (!appCheckToken) {
          clientWs.send(JSON.stringify({ error: "Missing App Check token." }));
          return clientWs.close();
        }
        try {
          await getAppCheck().verifyToken(appCheckToken);
        } catch (e) {
          clientWs.send(JSON.stringify({ error: "Invalid App Check token." }));
          return clientWs.close();
        }
      }

      if (!idToken) {
        clientWs.send(JSON.stringify({ error: "Missing authentication token." }));
        return clientWs.close();
      }
      let uid: string;
      try {
        const decoded = await getAuth().verifyIdToken(idToken);
        uid = decoded.uid;
      } catch (e) {
        clientWs.send(JSON.stringify({ error: "Invalid or expired session. Please refresh and try again." }));
        return clientWs.close();
      }

      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY") {
        clientWs.send(JSON.stringify({ error: "Live voice isn't configured on this server yet." }));
        return clientWs.close();
      }

      if (!NOVA_LIVE_VOICE_ENABLED) {
        clientWs.send(JSON.stringify({ error: "Voice coaching is temporarily unavailable. Continue with Nova by text for now." }));
        return clientWs.close();
      }

      // Unlike every other await in this handler, these two weren't
      // individually try/caught - a Firestore error inside
      // getEntitlementRecord (permission error, transient network blip)
      // became an unhandled rejection inside a WS event listener: no error
      // reached the client, the socket just hung open with no feedback,
      // and in modern Node an unhandled rejection can terminate the whole
      // process, not just this one connection.
      let liveQuota: Awaited<ReturnType<typeof checkAndReserveCapability>>;
      let minutesQuota: Awaited<ReturnType<typeof checkCapabilityQuota>>;
      try {
        liveQuota = await checkAndReserveCapability(uid, 'nova_voice');
        // Separate from the daily session-COUNT check above: this is the
        // monthly cumulative-MINUTES allowance (docs/AI_COST_CONTROL.md).
        // Checked (not reserved) here - the real minutes used are only
        // known once the session actually ends, recorded via
        // recordCapabilityUsage in endSession below.
        minutesQuota = await checkCapabilityQuota(uid, 'nova_voice_minutes');
      } catch (e) {
        clientWs.send(JSON.stringify({ error: "Couldn't verify your Nova voice access right now. Please try again, or continue with Nova by text." }));
        return clientWs.close();
      }
      if (!liveQuota.allowed) {
        clientWs.send(JSON.stringify({
          error: liveQuota.plan === 'free'
            ? "You've used today's free Nova voice session. Upgrade for many more, or continue with Nova by text."
            : "You've reached today's Nova voice fair-use limit. It resets tomorrow - continue with Nova by text for now.",
        }));
        return clientWs.close();
      }
      if (!minutesQuota.allowed) {
        clientWs.send(JSON.stringify({
          error: "You've used this month's Nova voice minutes. They reset next month - continue with Nova by text for now, or upgrade for a higher monthly allowance.",
        }));
        return clientWs.close();
      }
      const novaLiveSessionStartedAt = Date.now();

      const db = getDb();

      // Same cross-feature awareness packet the text chat endpoint injects
      // (getNovaContextAndMetadata) - without this, voice-Nova was blind to
      // everything text-Nova could see: consented check-ins, energy budgets,
      // mood pulses, derived recovery trends, saved memories. Best-effort by
      // design (the function itself already degrades to "" on any failure),
      // so a Firestore hiccup here never blocks the call from starting.
      // getNovaQuestioningStyleAddendum alongside it means a chosen
      // questioning style applies to voice too, not just text - same
      // Firestore-sourced value, so it's consistent across both.
      const [contextResult, styleAddendum] = await Promise.all([
        getNovaContextAndMetadata(uid, db),
        getNovaQuestioningStyleAddendum(uid, db),
      ]);
      const liveSystemInstruction = NOVA_LIVE_VOICE_PERSONA + contextResult.systemInstructionsAddendum + styleAddendum;

      // Real per-second cost here (audio in + audio out), so a hard ceiling
      // matters even for a legitimate, authenticated user — 15 minutes
      // (NOVA_LIVE_MAX_SESSION_MS) is generous for a coaching check-in
      // without leaving a session open indefinitely if a client never
      // explicitly closes it.
      const MAX_SESSION_MS = NOVA_LIVE_MAX_SESSION_MS;
      // A live call has no discrete "turn" boundary the way a single chat
      // request does, so the per-turn memory-write cap becomes a per-session
      // one instead - generous enough for a real 15-minute conversation,
      // still a hard ceiling against a runaway loop of writes.
      const MAX_VOICE_MEMORY_WRITES = 5;
      let voiceMemoryWriteCount = 0;
      // sessionTimeout/idleTimeout are assigned exactly once each, but only
      // after endSession (which reads them via closure) is declared below;
      // TS requires const to initialize immediately, so these can't be
      // const without restructuring the timer setup.
      // eslint-disable-next-line prefer-const
      let sessionTimeout: NodeJS.Timeout;
      // Separate from the flat session ceiling above: a connection left
      // open with no audio flowing in either direction (mic muted, app
      // backgrounded, network half-dead) shouldn't run the full 15 minutes
      // billing per-second the whole time. Reset on any real activity.
      let idleTimeout: NodeJS.Timeout;
      const resetIdleTimer = () => {
        clearTimeout(idleTimeout);
        idleTimeout = setTimeout(() => endSession("This voice session ended after a period of inactivity."), NOVA_LIVE_IDLE_TIMEOUT_MS);
      };
      let liveSession: any = null;
      let sessionEnded = false;

      const endSession = (reason?: string) => {
        if (sessionEnded) return;
        sessionEnded = true;
        clearTimeout(sessionTimeout);
        clearTimeout(idleTimeout);
        // Records the REAL elapsed minutes against this account's monthly
        // Nova Live allowance, now that the actual duration is known -
        // fire-and-forget (this function is synchronous, called from
        // several timer/callback paths) but never silently dropped: an
        // async failure here would otherwise mean an account's real usage
        // just doesn't count against its monthly minutes, forever.
        recordCapabilityUsage(uid, 'nova_voice_minutes', liveQuota.plan, minutesUsedForSession(Date.now() - novaLiveSessionStartedAt))
          .catch((e) => console.error(`[Nova Live] failed to record voice minutes for uid ${uid}:`, e?.message || e));
        try {
          liveSession?.close();
        } catch (e) {
          // Best-effort - the session may already be closed.
        }
        try {
          if (reason) clientWs.send(JSON.stringify({ error: reason }));
          clientWs.close();
        } catch (e) {
          // Best-effort - the socket may already be closed.
        }
      };

      try {
        liveSession = await ai.live.connect({
          model: "gemini-3.1-flash-live-preview",
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } }, // Same voice as the existing single-shot TTS endpoint, so Nova sounds consistent everywhere.
              languageCode: "en-GB", // British accent, matching the single-shot TTS endpoint.
            },
            // Native transcription of both sides of the call, relayed to the
            // client so the voice-call UI can show a live, accessible
            // transcript (and so a deaf/hard-of-hearing user isn't locked out
            // of a voice-only feature). This is text ABOUT the audio, not a
            // second response - the spoken audio remains the real reply.
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction: liveSystemInstruction,
            // Same tool set text chat uses (search_nova_memories,
            // propose_recovery_action, remember_about_user, suggest_feature),
            // dispatched through the same executeNovaTool so voice can never
            // do anything text chat couldn't already do.
            tools: NOVA_TOOLS_ENABLED ? [{ functionDeclarations: NOVA_TOOLS }] : undefined,
          },
          callbacks: {
            onopen: () => {
              console.log(`[Nova Live] session opened for uid ${uid}`);
            },
            onmessage: (message: LiveServerMessage) => {
              if (sessionEnded) return;
              resetIdleTimer();
              try {
                if (message.serverContent?.interrupted) {
                  clientWs.send(JSON.stringify({ interrupted: true }));
                }
                // Relay transcript fragments so the client can build a live
                // caption. These arrive incrementally, so the client appends.
                const userText = message.serverContent?.inputTranscription?.text;
                if (userText) {
                  clientWs.send(JSON.stringify({ userTranscript: userText }));
                }
                const novaText = message.serverContent?.outputTranscription?.text;
                if (novaText) {
                  clientWs.send(JSON.stringify({ novaTranscript: novaText }));
                }
                if (message.data) {
                  clientWs.send(JSON.stringify({ audio: message.data }));
                }
                // Marks the end of one of Nova's spoken turns, so the client
                // can settle its "Nova is speaking" indicator honestly rather
                // than guessing from audio timing alone.
                if (message.serverContent?.turnComplete) {
                  clientWs.send(JSON.stringify({ turnComplete: true }));
                }
                // Function calls from the Live API arrive as a distinct
                // message shape (message.toolCall), not inline with
                // serverContent - handled async since dispatching a tool can
                // mean a Firestore read/write, but onmessage itself stays
                // synchronous so the audio/transcript relay above is never
                // delayed by a slow tool call.
                const functionCalls = message.toolCall?.functionCalls;
                if (functionCalls && functionCalls.length > 0) {
                  void (async () => {
                    const functionResponses = await Promise.all(functionCalls.map(async (call) => {
                      const name = call.name || "";
                      const args = (call.args || {}) as Record<string, unknown>;
                      let output: Record<string, unknown>;
                      if (name === "remember_about_user") {
                        // Checked and incremented synchronously before the
                        // await inside executeNovaTool, same race-safety
                        // reasoning as the chat loops' per-turn cap.
                        if (voiceMemoryWriteCount >= MAX_VOICE_MEMORY_WRITES) {
                          output = { saved: false, error: `Already saved ${MAX_VOICE_MEMORY_WRITES} memories this call - that's enough for one conversation.` };
                        } else {
                          voiceMemoryWriteCount++;
                          output = await executeNovaTool(name, args, uid, db);
                        }
                      } else {
                        output = await executeNovaTool(name, args, uid, db);
                      }
                      // Relay a successful feature suggestion to the client the
                      // same way the text-chat endpoint's planTrace does, so the
                      // voice call UI can render the same real, validated
                      // "go there" link - never silent navigation.
                      if (name === "suggest_feature" && output.suggested) {
                        try {
                          clientWs.send(JSON.stringify({
                            featureSuggestion: { featureId: output.featureId, label: output.label, reason: output.reason },
                          }));
                        } catch (e) {
                          // Best-effort - the call continues even if this relay fails.
                        }
                      }
                      // Same relay pattern for the Guardian Support
                      // Invitation - the card is rendered from this
                      // WebSocket message alone. Nova's spoken reply never
                      // needs to (and must not) say the guardian's name or
                      // read out message content; only this visual card,
                      // populated client-side from the user's own saved
                      // contacts, ever shows that.
                      if (name === "offer_guardian_support" && output.offered) {
                        try {
                          clientWs.send(JSON.stringify({
                            guardianSupportOffer: { reason: output.reason },
                          }));
                        } catch (e) {
                          // Best-effort - the call continues even if this relay fails.
                        }
                      }
                      return { id: call.id, name, response: output };
                    }));
                    try {
                      liveSession?.sendToolResponse({ functionResponses });
                    } catch (e: any) {
                      console.error("[Nova Live] failed to send tool response:", e?.message || e);
                    }
                  })();
                }
              } catch (e: any) {
                console.error("[Nova Live] relay-to-client error:", e?.message || e);
              }
            },
            onerror: (e: any) => {
              console.error(`[Nova Live] upstream error for uid ${uid}:`, e?.message || e);
              endSession("Voice session hit an error and had to end.");
            },
            onclose: () => {
              endSession();
            },
          },
        });
      } catch (e: any) {
        console.error("[Nova Live] failed to open upstream session:", e.message);
        clientWs.send(JSON.stringify({ error: "Could not start the live voice session. Please try again." }));
        return clientWs.close();
      }

      sessionTimeout = setTimeout(() => endSession("This voice session has reached its time limit."), MAX_SESSION_MS);
      resetIdleTimer();

      clientWs.on("message", (data) => {
        if (sessionEnded) return;
        resetIdleTimer();
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.initialPrompt) {
            // Prefill context (fingerprint, recent chat, Nova's memory) without
            // expecting an immediate reply — turnComplete:false per the SDK's
            // own guidance for priming a conversation before real input starts.
            liveSession.sendClientContent({ turns: parsed.initialPrompt, turnComplete: false });
          }
          if (parsed.audio) {
            liveSession.sendRealtimeInput({ audio: { data: parsed.audio, mimeType: "audio/pcm;rate=16000" } });
          }
        } catch (e: any) {
          console.error("[Nova Live] client message parse error:", e?.message || e);
        }
      });

      clientWs.on("close", () => endSession());
      clientWs.on("error", (e) => {
        console.error(`[Nova Live] client socket error for uid ${uid}:`, e.message);
        endSession();
      });
    });
  });
}
