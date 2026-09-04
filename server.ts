import express from "express";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import crypto from "crypto";
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
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { memoryToolIsAllowed, searchMemories, isValidRecoveryDuration, validateMemoryWrite, validateFeatureSuggestion, SUGGESTABLE_FEATURES, toolsAreEnabled, NovaMemoryDoc } from './nova-tools';
import { toClaudeTools, GeminiStyleToolDeclaration } from './nova-claude-tools';
import { computeClimateConcern, computeClimateConcernByDimension, computeMoodConcern, computeOverallConcern, computeTrend } from './org-risk-trend';

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
const PORT = 3000;

// Set up CORS
const allowedOrigins = [
  "https://ais-dev-j3n2iqpfdg7zbjgfq4ixfo-398142886217.europe-west2.run.app",
  "https://ais-pre-j3n2iqpfdg7zbjgfq4ixfo-398142886217.europe-west2.run.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:8081"
];
if (process.env.APP_CHECK_DOMAIN) {
  allowedOrigins.push(`https://${process.env.APP_CHECK_DOMAIN}`);
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
        // specifically so this could stay strict.
        scriptSrc: ["'self'"],
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
          "ws:", "wss:",                // same-origin WebSocket (Nova live voice) — scheme itself, not a host, since it's same-origin
        ],
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
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true }
});

const speechLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // stricter for speech
  message: { error: 'Too many speech requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true }
});

const smsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // SMS costs real money per message and could enable harassment if abused — stricter than any other endpoint.
  message: { error: 'Too many messaging requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true }
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

// Firebase ID Token Authentication Middleware for Nova API Layer Hardening
const authenticateFirebaseUser = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header. Bearer token required.' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    (req as any).user = decodedToken;
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
const sendBrevoEmail = async (toEmail: string, subject: string, textContent: string) => {
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
      body: JSON.stringify({
        sender: { name: "Blaze Break Support", email: "support@blazebreak.com" },
        to: [{ email: toEmail }],
        subject: subject,
        textContent: textContent
      })
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
    await sendBrevoEmail("support@blazebreak.com", subject, body);
    
    // Auto-reply to user
    await sendBrevoEmail(
      email, 
      "Blaze Break - Request Received", 
      "We have received your request. Blaze Break is in controlled early access, so our team will process this manually and be in touch soon. \n\nNote: This email is unmonitored."
    );

    res.json({ success: true });
  } catch (err: any) {
    console.error("[SUPPORT] Error processing support request:", err.message);
    res.status(500).json({ error: "Failed to process request" });
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
async function sendTwilioMessage(uid: string, to: string, message: string, useWhatsapp: boolean): Promise<{ success: boolean; sid?: string; error?: string }> {
  const client = initTwilio();
  const fromPhone = process.env.TWILIO_PHONE_NUMBER;
  if (!client || !fromPhone) {
    return { success: false, error: "Messaging is unavailable because the support messaging system is not configured." };
  }
  try {
    const m = await client.messages.create({
      body: message,
      from: useWhatsapp ? `whatsapp:${fromPhone}` : fromPhone,
      to: useWhatsapp ? `whatsapp:${to}` : to,
    });
    await logAutopilotAction(uid, "sms_send", { to, useWhatsapp }, true);
    return { success: true, sid: m.sid };
  } catch (error: any) {
    console.error("Twilio error:", error);
    await logAutopilotAction(uid, "sms_send", { error: error.message }, false);
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
    const result = await sendTwilioMessage(uid, to, message, useWhatsapp);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    res.json({ success: true, sid: result.sid });
  } catch (error: any) {
    console.error("Twilio route error:", error);
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
- AVOID: Do not make medical claims. Do not diagnose mental illnesses. Do not pretend to be therapy. If a user expresses severe distress or self-harm thoughts, prioritize safety and refer to professional help without providing coaching.

When a user shares a problem, help them identify which "leak" is open and use the BLAME method or SHIP framework to address it.
`;

// Context Consent Metadata representation
interface NovaConsentMetadata {
  contextTriggered: boolean;
  modulesUsed: string[];
  rationale: string;
}

// Build Nova Context Builder
async function getNovaContextAndMetadata(uid: string, firestoreDb: any): Promise<{ systemInstructionsAddendum: string; metadata: NovaConsentMetadata }> {
  const metadata: NovaConsentMetadata = {
    contextTriggered: false,
    modulesUsed: [],
    rationale: ""
  };

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
      const snap = await firestoreDb.collection('users').doc(uid).collection('checkins').get();
      const count = snap.size;
      const energyLevels: number[] = [];
      const stressLoads: number[] = [];
      snap.docs.forEach((doc: any) => {
        const data = doc.data();
        if (typeof data.energyLevel === 'number') energyLevels.push(data.energyLevel);
        if (typeof data.stressLoad === 'number') stressLoads.push(data.stressLoad);
      });
      infoParts.push(`Check-ins Summary:
- Number of logged check-ins: ${count}
- Self-reported Energy Levels over time: ${JSON.stringify(energyLevels)}
- Self-reported Stress Loads over time: ${JSON.stringify(stressLoads)}`);
      used.push("checkins");
    }

    // Energy Budgets: Log count and overall average capacity remaining
    if (perms.allowEnergyBudgets) {
      const snap = await firestoreDb.collection('users').doc(uid).collection('energy_budgets').get();
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
- Number of logged budgets: ${count}
- Average remaining energy capacity across budgets: ${avgRemaining !== null ? avgRemaining + "%" : "N/A"}`);
      used.push("energy_budgets");
    }

    // Mood Pulses: Compact counts of labels and intensity list
    if (perms.allowMoodPulses) {
      const snap = await firestoreDb.collection('users').doc(uid).collection('mood_pulses').get();
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
- Number of logged mood pulses: ${count}
- Self-reported Mood label occurrences: ${JSON.stringify(labelCounts)}
- Self-reported Mood Intensities over time: ${JSON.stringify(intensities)}`);
      used.push("mood_pulses");
    }

    // Body Checkins: Frequencies of somatic tension categories
    if (perms.allowBodyCheckins) {
      const snap = await firestoreDb.collection('users').doc(uid).collection('body_checkins').get();
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
- Number of logged body check-ins: ${count}
- Logged Body Tension and Symptom Category counts: ${JSON.stringify(signalCounts)}`);
      used.push("body_checkins");
    }

    // Wins: Compact counts by category
    if (perms.allowWins) {
      const snap = await firestoreDb.collection('users').doc(uid).collection('wins').get();
      const count = snap.size;
      const cateCounts: Record<string, number> = {};
      snap.docs.forEach((doc: any) => {
        const data = doc.data();
        if (data.category) {
          cateCounts[data.category] = (cateCounts[data.category] || 0) + 1;
        }
      });
      infoParts.push(`Wins Summary:
- Number of logged wins: ${count}
- Categories of wins logged: ${JSON.stringify(cateCounts)}`);
      used.push("wins");
    }

    // Weekly reviews: Review counts only
    if (perms.allowWeeklyReviews) {
      const snap = await firestoreDb.collection('users').doc(uid).collection('weekly_reviews').get();
      infoParts.push(`Weekly Reviews Summary:
- Total number of completed weekly reviews: ${snap.size}`);
      used.push("weekly_reviews");
    }

    // Boundary Scripts: Scenario types and status tracking
    if (perms.allowBoundaryScripts) {
      const snap = await firestoreDb.collection('users').doc(uid).collection('boundary_scripts').get();
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
- Total boundary scripts configured: ${count}
- Frequency of scenario types targeted: ${JSON.stringify(scenarioCounts)}
- Boundary script status counts: ${JSON.stringify(statusCounts)}`);
      used.push("boundary_scripts");
    }

    // Goals: Completed or active count tracking
    if (perms.allowGoals) {
      const snap = await firestoreDb.collection('users').doc(uid).collection('goals').get();
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
- Total goals tracking: ${count}
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

    // Memory Usage
    if (perms.allowNovaMemory && perms.allowNovaUseSavedMemories) {
      const memRef = firestoreDb.collection('users').doc(uid).collection('nova_memories');
      const memSnap = await memRef.get();
      const memories = memSnap.docs.map((d: any) => d.data());

      // Most recently updated first, capped at 5 - matches the same
      // "top 5" limit this passive injection always had, now against
      // real documents instead of ones that could never actually match
      // the old filter criteria.
      const recentMemories = memories
        .filter((mem: any) => mem && typeof mem.content === 'string')
        .sort((a: any, b: any) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
        .slice(0, 5);

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
    description: `When the conversation makes clear a specific other part of the app would genuinely help right now, suggest it - this renders as a real, tappable link the user can act on immediately, not just a name mentioned in text. Only suggest something the conversation actually calls for; do not use this reflexively or more than once in a normal exchange. The real, valid options and what each is for: plan (Recovery Plan - a personalized coaching plan for their current archetype and highest energy debt), diagnose (Diagnose - a structured burnout assessment), recover (Recover - energy budget tracking and recovery debt), fuel (Nutrition - nutrition's effect on recovery), reset (Nervous System - breathing and nervous-system regulation tools), anxiety_reset (Anxiety Reset - in-the-moment anxiety de-escalation), communicate (Communicate - scripted help for a specific hard conversation or boundary), reflect (Reflect - weekly reflection and journaling), ally (Recovery Ally - trusted contacts and support network). Never suggest anything not in this exact list - if nothing here genuinely fits, don't call this tool.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        featureId: { type: Type.STRING, description: "One of: plan, diagnose, recover, fuel, reset, anxiety_reset, communicate, reflect, ally - must match exactly." },
        reason: { type: Type.STRING, description: "A short, specific reason tied to what the user just said - under 200 characters, not generic." },
      },
      required: ["featureId", "reason"],
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

app.post("/api/nova/chat", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
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
        const contextResult = await getNovaContextAndMetadata(uid, db);
        contextAddendum = contextResult.systemInstructionsAddendum;
        contextMetadata = contextResult.metadata;
      } catch (e) {
        console.warn("Nova context build failed - continuing without it.", e);
      }
    }

    const mergedSystemPrompt = (systemInstruction || NOVA_SYSTEM_PROMPT) + contextAddendum;

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
    console.error("Gemini Chat Error"); // Redacted raw error
    res.status(500).json({ error: `Nova Chat Sync Failure: A safe operational error occurred.` });
  }
});

// Real, deterministic recommendation - which tool actually matters most
// right now, computed from the person's own real activity across the app.
// This is a rule-based computation over their own data for their own
// screen, not data sent to an AI model, so it's a different privacy
// boundary than the consent-gated AI context above and doesn't require the
// same opt-in.
app.get("/api/nova/recommendation", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
    const db = getDb();
    const uid = user.uid;

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const todayStr = new Date().toISOString().split('T')[0];

    const [moodSnap, bodySnap, commitSnap, boundarySnap, winsSnap, reviewSnap] = await Promise.all([
      db.collection('users').doc(uid).collection('mood_pulses').where('createdAt', '>=', threeDaysAgo).get(),
      db.collection('users').doc(uid).collection('body_checkins').where('createdAt', '>=', threeDaysAgo).get(),
      db.collection('users').doc(uid).collection('energy_commitments').where('status', '==', 'active').get(),
      db.collection('users').doc(uid).collection('boundary_scripts').orderBy('createdAt', 'desc').limit(1).get(),
      db.collection('users').doc(uid).collection('wins').orderBy('createdAt', 'desc').limit(1).get(),
      db.collection('users').doc(uid).collection('weekly_reviews').orderBy('createdAt', 'desc').limit(1).get(),
    ]);

    // Priority-ordered real signals - the first genuinely true condition
    // wins, most urgent first.
    const negativeMoods = moodSnap.docs.filter(d => ['overwhelmed', 'frustrated', 'pressured', 'tired'].includes(d.data().moodLabel));
    if (negativeMoods.length >= 2) {
      return res.json({
        tab: 'reset',
        title: 'A few tough check-ins recently',
        message: `You've logged ${negativeMoods.length} stressed or tired mood pulses in the last 3 days. A grounding session might genuinely help right now.`,
      });
    }

    const totalActiveDrain = commitSnap.docs.reduce((sum, d) => sum + (d.data().energyDrain || 0), 0);
    if (totalActiveDrain >= 200) {
      return res.json({
        tab: 'recover',
        title: 'Your energy budget is stretched',
        message: `You currently have ${commitSnap.size} active commitments totalling ${totalActiveDrain} energy units. Worth reviewing what can be dropped or delegated.`,
      });
    }

    const boundaryDoc = boundarySnap.docs[0];
    const daysSinceBoundary = boundaryDoc ? (Date.now() - new Date(boundaryDoc.data().createdAt).getTime()) / (1000 * 60 * 60 * 24) : Infinity;
    if (bodySnap.size > 0 && daysSinceBoundary >= 7) {
      return res.json({
        tab: 'communicate',
        title: 'Physical tension, no recent boundary practice',
        message: "You've logged body tension recently, and it's been over a week since you rehearsed a boundary script. Often the two are connected.",
      });
    }

    const hasCheckedInToday = moodSnap.docs.some(d => typeof d.data().createdAt === 'string' && d.data().createdAt.startsWith(todayStr))
      || bodySnap.docs.some(d => typeof d.data().createdAt === 'string' && d.data().createdAt.startsWith(todayStr));
    if (!hasCheckedInToday) {
      return res.json({
        tab: 'home',
        title: "You haven't checked in today",
        message: "A quick mood or body pulse takes seconds, and it's what makes every other recommendation here actually accurate.",
      });
    }

    const reviewDoc = reviewSnap.docs[0];
    const daysSinceReview = reviewDoc ? (Date.now() - new Date(reviewDoc.data().createdAt).getTime()) / (1000 * 60 * 60 * 24) : Infinity;
    if (daysSinceReview >= 7) {
      return res.json({
        tab: 'reflect',
        title: 'Weekly review is overdue',
        message: reviewDoc ? "It's been over a week since your last weekly review — worth a few minutes to see what's actually changed." : "You haven't done a weekly review yet — it's a genuinely useful way to see your own patterns.",
      });
    }

    const winDoc = winsSnap.docs[0];
    const daysSinceWin = winDoc ? (Date.now() - new Date(winDoc.data().createdAt).getTime()) / (1000 * 60 * 60 * 24) : Infinity;
    if (daysSinceWin >= 3) {
      return res.json({
        tab: 'communicate',
        title: 'No wins logged in a few days',
        message: "It's been a few days since you logged a recovery win. Doesn't have to be big — noticing it is most of the value.",
      });
    }

    // Nothing urgent - genuinely say so, rather than inventing a fake concern.
    res.json({
      tab: null,
      title: "You're on a steady rhythm",
      message: "Recent check-ins, energy load, and boundary practice all look reasonably balanced. Nothing urgent to flag right now.",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const DiagnoseRequestSchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.number()])).optional().default({}),
  letNovaLearn: z.boolean().optional().default(true),
}).strict();

app.post("/api/nova/diagnose", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  // Nova personal recovery context remains disabled until secure private-data storage and consent-controlled processing are approved.
  try {
    const parsedParams = DiagnoseRequestSchema.safeParse(req.body);
    if (!parsedParams.success) {
        return res.status(400).json({ error: "Invalid request payload or forbidden fields detected.", details: (parsedParams as any).error?.errors || [] });
    }
    const { answers, letNovaLearn } = parsedParams.data;

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
    if (geminiKey && geminiKey !== "MY_GEMINI_API_KEY") {
      try {
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
        `;

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
          console.warn("Diagnose model timeout/error observation"); // Redacted
        }
      } catch (gem_err) {
        console.error("Gemini diagnose error observation"); // Redacted
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
    if (letNovaLearn) {
      try {
        const uid = requireAuth(req).uid;
        await getDb().collection("users").doc(uid).collection("diagnostics").doc("latest").set({
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
    // Redact real error message
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
    console.warn("TTS Error Observation"); // Redacted
    res.status(500).json({ error: "TTS Sync Failure: A safe operational error occurred." });
  }
});

const VoiceJournalRequestSchema = z.object({
  audioData: z.string().min(1),
  mimeType: z.string().min(1)
}).strict();

app.post("/api/nova/voice-journal", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
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
}`
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

// Reusable Helper Guards and Roles
const requireAuth = (req: any) => {
  if (!req.user) {
    throw new Error("Unauthorized. Missing user authentication.");
  }
  return req.user;
};

const requireAdmin = (req: any) => {
  const user = requireAuth(req);
  const isSuperAdmin = user.platform_admin === true || user.admin === true || user.role === 'platform_owner' || user.email === 'teampublication@gmail.com' || user.email === 'teampublication@googlemail.com';
  if (!isSuperAdmin) {
    throw new Error("Forbidden: Admin privileges required.");
  }
  return user;
};

const requireRole = (req: any, allowedRoles: string[]) => {
  const user = requireAuth(req);
  const role = user.role || (user.email === 'teampublication@gmail.com' || user.email === 'teampublication@googlemail.com' ? 'platform_owner' : 'user');
  if (!allowedRoles.includes(role) && !allowedRoles.includes(user.role)) {
    throw new Error(`Forbidden: Role in ${allowedRoles.join(', ')} required.`);
  }
  return user;
};

const requirePlatformOwner = (req: any) => {
  const user = requireAuth(req);
  const isOwner = user.platformOwner === true || user.email === 'teampublication@gmail.com' || user.email === 'teampublication@googlemail.com' || user.role === 'platform_owner';
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
  try {
    const actor = req.user;
    const db = getDb();
    await db.collection("admin_audit_logs").add({
      actorUid: actor?.uid || "system",
      actorEmail: actor?.email || "system",
      actorRole: actor?.role || (actor?.email === "teampublication@gmail.com" ? "platform_owner" : "platform_admin"),
      action,
      targetUid,
      targetEmail,
      createdAt: FieldValue.serverTimestamp(),
      metadata,
      ipAddress: req.ip || "",
      userAgent: req.headers["user-agent"] || ""
    });
  } catch (err: any) {
    console.error("Failed to write admin audit log:", err.message);
  }
};

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
        note: "Complete the burnout diagnostic first — the blend evolves from that baseline.",
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
      factors.push({ label: "Practiced a boundary rehearsal", delta: 5, source: "self-report" });
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
app.get("/api/admin/users", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requireAdmin(req);
    let users = [];
    const db = getDb();
    try {
      const usersSnap = await db.collection("users").limit(100).get();
      if (usersSnap.empty) {
        users = [
          {
            uid: (req as any).user.uid,
            email: (req as any).user.email || "current-user@example.com",
            createdAt: new Date().toISOString(),
            lastSignIn: new Date().toISOString(),
            accessStatus: "active"
          }
        ];
      } else {
        users = usersSnap.docs.map(doc => {
          const data = doc.data();
          return {
            uid: doc.id,
            email: data.email || "unknown@example.com",
            createdAt: data.createdAt || new Date().toISOString(),
            lastSignIn: data.lastActivity || new Date().toISOString(),
            accessStatus: "active"
          };
        });
      }
    } catch (adminErr: any) {
      users = [
        {
          uid: (req as any).user.uid,
          email: (req as any).user.email || "current-user@example.com",
          createdAt: new Date().toISOString(),
          lastSignIn: new Date().toISOString(),
          accessStatus: "active"
        }
      ];
    }
    res.json({ users, total: users.length });
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

app.post("/api/admin/users/:uid/role", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requirePlatformOwner(req);
    const targetUid = req.params.uid;
    const { role } = req.body;
    
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

app.post("/api/admin/users/:uid/suspend", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requireAdmin(req);
    const targetUid = req.params.uid;
    const { suspend } = req.body;
    
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

app.post("/api/admin/admin-users", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requirePlatformOwner(req);
    const { email, role, displayName } = req.body;
    
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
    const targetUid = req.params.uid;
    const { role } = req.body;
    
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

app.post("/api/admin/orgs", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    requireAdmin(req);
    const { orgId, name, privacyThreshold, initialAdminEmail } = req.body;
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

const requireOrgAdmin = async (req: any, orgId: string) => {
  const user = requireAuth(req);
  const db = getDb();
  const orgDoc = await db.collection("organisations").doc(orgId).get();
  if (!orgDoc.exists) {
    throw new Error("Organisation not found.");
  }
  const org = orgDoc.data()!;
  const adminUids: string[] = org.adminUids || [];
  if (!adminUids.includes(user.uid)) {
    throw new Error("Forbidden: Organisation admin privileges required for this organisation.");
  }
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
    await requireOrgAdmin(req, orgId);
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

interface ConcernSnapshot {
  cohortSize: number;
  moodConcern: number | null;
  climateConcern: number | null;
  climateConcernByDimension: Record<string, number> | null;
  overallConcern: number | null;
}

// Computes the full concern snapshot for one set of member uids - called
// once for the whole org and once per team below, so a team's number is
// calculated exactly the same way the org-wide one is, not a different
// or lighter-weight version.
const computeConcernSnapshotForCohort = async (db: any, uids: string[]): Promise<ConcernSnapshot> => {
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
  const moodConcern = computeMoodConcern(moodPositive, moodNegative, moodNeutral);

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
  const climateConcern = computeClimateConcern(climateAverages);
  const climateConcernByDimension = computeClimateConcernByDimension(climateAverages);

  return {
    cohortSize: uids.length,
    moodConcern,
    climateConcern,
    climateConcernByDimension,
    overallConcern: computeOverallConcern(climateConcern, moodConcern),
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

    const orgSnapshot = await computeConcernSnapshotForCohort(db, consentingUids);

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
    const qualifyingTeams = Object.entries(teamGroups).filter(([, uids]) => uids.length >= threshold);
    const teamSnapshots: Record<string, ConcernSnapshot> = {};
    await Promise.all(qualifyingTeams.map(async ([team, uids]) => {
      teamSnapshots[team] = await computeConcernSnapshotForCohort(db, uids);
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

    const teamBreakdown: Record<string, ConcernSnapshot & { trend: ReturnType<typeof computeTrend> }> = {};
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
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
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
    const trimmed = typeof team === 'string' ? team.trim() : null;
    const db = getDb();
    const fieldPath = `memberTeams.${memberUid}`;
    await db.collection("organisations").doc(orgId).update({
      [fieldPath]: trimmed && trimmed.length > 0 ? trimmed : FieldValue.delete(),
    });
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
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });
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
    await requireOrgAdmin(req, orgId);
    const { name, privacyThreshold } = req.body;
    const update: any = { updatedAt: FieldValue.serverTimestamp() };
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
        return res.status(400).json({ error: "Name must be 1-100 characters." });
      }
      update.name = name.trim();
    }
    if (privacyThreshold !== undefined) {
      if (typeof privacyThreshold !== 'number' || privacyThreshold < 3 || privacyThreshold > 100) {
        return res.status(400).json({ error: "Minimum cohort size must be between 3 and 100." });
      }
      update.privacyThreshold = privacyThreshold;
    }
    const db = getDb();
    await db.collection("organisations").doc(orgId).update(update);
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

const NudgeScheduleSchema = z.object({
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
}).strict().refine(
  (data) => data.frequency !== 'weekly' || (data.daysOfWeek && data.daysOfWeek.length > 0),
  { message: "Weekly schedules need at least one day selected.", path: ['daysOfWeek'] }
);

app.post("/api/nudge-schedules", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
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

const NudgeScheduleUpdateSchema = NudgeScheduleSchema.partial().extend({
  contactAcknowledged: z.literal(true).optional(),
});

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

        const result = await sendTwilioMessage(uid, data.contactMethod, data.message, data.notificationPreference === 'whatsapp');
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

cron.schedule('*/5 * * * *', processNudgeSchedules);

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

    // The client will save these summaries to Firestore since server lacks credentials
    res.json({
      success: true,
      calculatedAt,
      summaries: {
        recovery_debt: debtSummary,
        recovery_velocity: velocitySummary,
        energy_trend: energySummary,
        mood_trend: moodSummary
      }
    });

  } catch (error: any) {
    console.warn("Calculations Error Observation"); // Redacted raw details
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
        message: "It's been a while since you practiced a boundary script. If something's been sitting on your plate, a few minutes of rehearsal makes it easier to actually say.",
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

app.post("/api/nova/resentment-analysis", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const parsed = ResentmentAnalysisRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request.", details: (parsed as any).error?.errors || [] });
    }
    const { log } = parsed.data;

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
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from Gemini model.");
    const analysis = JSON.parse(text);

    res.json(analysis);
  } catch (err: any) {
    console.error("[Nova] resentment analysis error:", err.message);
    res.status(500).json({ error: "Could not analyze that right now." });
  }
});

app.get("/api/signals/executive-report", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const user = requireAuth(req);
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
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
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

      // Real per-second cost here (audio in + audio out), so a hard ceiling
      // matters even for a legitimate, authenticated user — 15 minutes is
      // generous for a coaching check-in without leaving a session open
      // indefinitely if a client never explicitly closes it.
      const MAX_SESSION_MS = 15 * 60 * 1000;
      // sessionTimeout is assigned exactly once, but only after endSession
      // (which reads it via closure) is declared below; TS requires const
      // to initialize immediately, so this can't be a const without
      // restructuring the timer setup.
      // eslint-disable-next-line prefer-const
      let sessionTimeout: NodeJS.Timeout;
      let liveSession: any = null;
      let sessionEnded = false;

      const endSession = (reason?: string) => {
        if (sessionEnded) return;
        sessionEnded = true;
        clearTimeout(sessionTimeout);
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
            },
            systemInstruction: "You are Nova, a calm, warm burnout-recovery coach at Blaze Break. Speak conversationally and concisely — this is a live voice conversation, not a written message, so keep responses short and natural to say aloud.",
          },
          callbacks: {
            onopen: () => {
              console.log(`[Nova Live] session opened for uid ${uid}`);
            },
            onmessage: (message: LiveServerMessage) => {
              if (sessionEnded) return;
              try {
                if (message.serverContent?.interrupted) {
                  clientWs.send(JSON.stringify({ interrupted: true }));
                }
                if (message.data) {
                  clientWs.send(JSON.stringify({ audio: message.data }));
                }
              } catch (e) {
                console.error("[Nova Live] relay-to-client error:", e);
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

      sessionTimeout = setTimeout(() => endSession("This voice session has reached its 15-minute limit."), MAX_SESSION_MS);

      clientWs.on("message", (data) => {
        if (sessionEnded) return;
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
        } catch (e) {
          console.error("[Nova Live] client message parse error:", e);
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
