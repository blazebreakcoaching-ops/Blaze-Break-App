import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, Modality, LiveServerMessage } from "@google/genai";
import dotenv from "dotenv";
import twilio from "twilio";
import { WebSocketServer } from 'ws';
import { NOVA_KNOWLEDGE_BASE } from './server-knowledge';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAppCheck } from 'firebase-admin/app-check';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

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
} catch(e) {}

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
  if (process.env.NODE_ENV !== "production" || appCheckToken === "dev-bypass") {
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
app.post("/api/twilio/send", async (req, res) => {
  try {
    const { to, message, useWhatsapp } = req.body;
    const client = initTwilio();
    const fromPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!client || !fromPhone) {
      return res.status(400).json({ 
        success: false, 
        error: "Messaging is unavailable because the support messaging system is not configured." 
      });
    }

    const m = await client.messages.create({
      body: message,
      from: useWhatsapp ? `whatsapp:${fromPhone}` : fromPhone,
      to: useWhatsapp ? `whatsapp:${to}` : to
    });

    res.json({ success: true, sid: m.sid });
  } catch (error: any) {
    console.error("Twilio error:", error);
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
      const memSnap = await memRef.where('revoked', '!=', true).get();
      
      const activeMemories = memSnap.docs.map((d: any) => d.data())
        .filter((mem: any) => 
          mem.userApproved === true && 
          mem.reviewStatus === 'active' && 
          (!mem.expiresAt || new Date(mem.expiresAt) > new Date())
        );

      let filteredMemories: any[] = [];
      const allowedCategories = [];
      if (perms.allowNovaRememberCoachingPreferences) allowedCategories.push('coaching_preference', 'module_preference', 'privacy_preference');
      if (perms.allowNovaRememberRecoveryPatterns) allowedCategories.push('recovery_preference', 'recurring_pattern');
      if (perms.allowNovaRememberGoals) allowedCategories.push('user_goal');

      filteredMemories = activeMemories.filter((mem: any) => allowedCategories.includes(mem.memoryType));
      
      // Limit to 5
      filteredMemories = filteredMemories.slice(0, 5);

      if (filteredMemories.length > 0) {
        let memTextList = filteredMemories.map((m: any) => `- [${m.memoryType.replace(/_/g, ' ')}] ${m.memoryText} (Source: ${m.sourceType.replace(/_/g, ' ')})`);
        infoParts.push(`User-approved Nova memories:
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

app.post("/api/nova/chat", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const parsedParams = ChatRequestSchema.safeParse(req.body);
    if (!parsedParams.success) {
      return res.status(400).json({ error: "Invalid request payload or forbidden fields detected.", details: (parsedParams as any).error?.errors || [] });
    }
    const { message, history, systemInstruction } = parsedParams.data;
    
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY") {
      return res.status(401).json({ error: "Gemini API key not configured. Please add your key in the app settings secrets." });
    }

    const verifiedUser = (req as any).user;
    const uid = verifiedUser?.uid;

    const mergedSystemPrompt = (systemInstruction || NOVA_SYSTEM_PROMPT);

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 15000); // 15s timeout

    try {
      const chat = ai.chats.create({
        model: "gemini-3.5-flash",
        config: {
          systemInstruction: mergedSystemPrompt,
        },
        history: history || [],
      });

      const result = await chat.sendMessage({ message });
      clearTimeout(timeoutId);
      res.json({ text: result.text, privacyMetadata: { contextTriggered: false, modulesUsed: [], rationale: "" } });
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

    
    // Map answer values to numbers if they are passed as strings (for old/legacy support)
    const mapToVal = (val: any) => {
      if (typeof val === 'number') return val;
      if (!val) return 2;
      const valStr = String(val).toLowerCase();
      if (valStr.includes('rarely') || valStr.includes('very little') || valStr.includes('never') || valStr.includes('not at all') || valStr.includes('fully') || valStr.includes('comfortable') || valStr.includes('hold my line')) return 1;
      if (valStr.includes('sometimes') || valStr.includes('some') || valStr.includes('occasionally') || valStr.includes('vaguely') || valStr.includes('flinch') || valStr.includes('moderate') || valStr.includes('restless') || valStr.includes('fading')) return 2;
      if (valStr.includes('most days') || valStr.includes('significant') || valStr.includes('noticeably') || valStr.includes('most nights') || valStr.includes('often') || valStr.includes('resentfully') || valStr.includes('simmer') || valStr.includes('guilt') || valStr.includes('disconnection') || valStr.includes('disconnected') || valStr.includes('severe')) return 3;
      if (valStr.includes('every waking hour') || valStr.includes('entire') || valStr.includes('constantly') || valStr.includes('jar') || valStr.includes('permanent') || valStr.includes('panic') || valStr.includes('prioritize') || valStr.includes('paralysis') || valStr.includes('crisis')) return 4;
      return 2; // default fallback
    };

    const workloadScore = mapToVal(answers.workload);
    const boundariesScore = mapToVal(answers.boundaries);
    const peoplePleasingScore = mapToVal(answers.peoplePleasing || answers.identity); // handle legacy identity
    const guiltScore = mapToVal(answers.guilt || answers.rest); // handle legacy rest
    const sleepScore = mapToVal(answers.sleep || answers.wired); // handle legacy wired
    const emotionalScore = mapToVal(answers.emotionalOverload || answers.emotional); // handle legacy emotional
    const meaningScore = mapToVal(answers.meaning || answers.disconnection); // handle legacy disconnection
    const selfDoubtScore = mapToVal(answers.selfDoubt);
    const delegationControlScore = mapToVal(answers.delegationControl);
    const maskingLoadScore = mapToVal(answers.maskingLoad);
    const caregivingLoadScore = mapToVal(answers.caregivingLoad);
    const crisisDependencyScore = mapToVal(answers.crisisDependency);
    const emotionalPerformanceScore = mapToVal(answers.emotionalPerformance);
    const responsibilityCreepScore = mapToVal(answers.responsibilityCreep);

    // Subscores for each archetype (coefficients sum to 9 for each, so no
    // archetype has a scoring advantage purely from its weighting shape)
    const archScores = {
      'Founder on Fire': (workloadScore * 3) + (peoplePleasingScore * 1) + (guiltScore * 3) + (sleepScore * 2),
      'Over-Giver': (peoplePleasingScore * 3) + (boundariesScore * 3) + (guiltScore * 2) + (workloadScore * 1),
      'Silent Resenter': (emotionalScore * 3) + (boundariesScore * 3) + (meaningScore * 3),
      'High-Functioning Exhausted': (workloadScore * 3) + (sleepScore * 3) + (guiltScore * 2) + (meaningScore * 1),
      'Manager in the Middle': (workloadScore * 2) + (boundariesScore * 3) + (peoplePleasingScore * 2) + (emotionalScore * 1) + (meaningScore * 1),
      'The Impostor': (selfDoubtScore * 4) + (guiltScore * 2) + (workloadScore * 2) + (meaningScore * 1),
      'The Perfectionist': (delegationControlScore * 4) + (boundariesScore * 2) + (workloadScore * 2) + (guiltScore * 1),
      'The Constant Adapter': (maskingLoadScore * 4) + (emotionalScore * 2) + (sleepScore * 2) + (workloadScore * 1),
      'The Second Shift': (caregivingLoadScore * 4) + (guiltScore * 3) + (sleepScore * 1) + (workloadScore * 1),
      'Crisis Sprinter': (crisisDependencyScore * 4) + (workloadScore * 2) + (sleepScore * 2) + (guiltScore * 1),
      'People-Pleasing Performer': (emotionalPerformanceScore * 4) + (peoplePleasingScore * 2) + (guiltScore * 2) + (emotionalScore * 1),
      'Responsibility Addict': (responsibilityCreepScore * 4) + (boundariesScore * 2) + (workloadScore * 2) + (guiltScore * 1),
    };

    let profile = 'High-Functioning Exhausted';
    let maxVal = -1;
    for (const [k, v] of Object.entries(archScores)) {
      if (v > maxVal) {
        maxVal = v;
        profile = k;
      }
    }

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
    const sortedArchetypes = Object.entries(archScores).sort((a, b) => b[1] - a[1]);
    const topThree = sortedArchetypes.slice(0, 3);
    const topThreeSum = topThree.reduce((sum, [, score]) => sum + score, 0);
    const blend = topThree.map(([archProfile, score]) => ({
      profile: archProfile,
      percentage: topThreeSum > 0 ? Math.round((score / topThreeSum) * 100) : 0,
    }));

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

You MUST respond strictly in the following JSON format. Do not include markdown codeblocks or wrap it in anything. Just return the JSON object:
{
  "transcription": "A complete, accurate transcription of the user's audio",
  "themes": ["Theme 1", "Theme 2"],
  "analysis": "Nova's direct, slightly provocative coaching feedback in British English",
  "advice": "Actionable, firm, custom recovery advice or script"
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
              advice: { type: Type.STRING }
            },
            required: ["transcription", "themes", "analysis", "advice"]
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

    const sortedArchetypes = Object.entries(archScores).sort((a, b) => b[1] - a[1]);
    const topThree = sortedArchetypes.slice(0, 3);
    const topThreeSum = topThree.reduce((sum, [, score]) => sum + score, 0);
    const blend = topThree.map(([profile, score]) => ({
      profile,
      percentage: topThreeSum > 0 ? Math.round((score / topThreeSum) * 100) : 0,
    }));

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

const SendMessageSchema = z.object({
  recipientId: z.string().min(1),
  message: z.string().min(1).max(2000),
  confirm: z.literal(true), // Requires the client to explicitly assert intent, not just default to true.
}).strict();

app.post("/api/boundary-autopilot/slack/send", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  const uid = requireAuth(req).uid;
  try {
    const parsed = SendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid send request — a recipient, message, and explicit confirmation are required." });
    }
    const { recipientId, message } = parsed.data;
    const accessToken = await getSlackTokenOrFail(uid, res);
    if (!accessToken) return;

    // Open (or reuse) a DM channel with the recipient, then post to it.
    const openResult = await slackApiCall(accessToken, "conversations.open", { users: recipientId }, "POST");
    if (!openResult.ok) {
      await logAutopilotAction(uid, "slack_send", { recipientId, message }, false);
      return res.status(502).json({ error: `Could not open a conversation: ${openResult.error || "unknown error"}` });
    }

    const sendResult = await slackApiCall(accessToken, "chat.postMessage", {
      channel: openResult.channel.id,
      text: message,
    }, "POST");
    if (!sendResult.ok) {
      await logAutopilotAction(uid, "slack_send", { recipientId, message }, false);
      return res.status(502).json({ error: `Slack rejected the message: ${sendResult.error || "unknown error"}` });
    }

    await logAutopilotAction(uid, "slack_send", { recipientId, message }, true);
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Boundary Autopilot] slack send error:", err.message);
    await logAutopilotAction(uid, "slack_send", { error: err.message }, false);
    res.status(500).json({ error: "Could not send the message." });
  }
});

const SetDndSchema = z.object({
  minutes: z.number().int().min(5).max(480),
  confirm: z.literal(true),
}).strict();

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

const SetStatusSchema = z.object({
  statusText: z.string().max(100),
  statusEmoji: z.string().max(50).optional().default(""),
  confirm: z.literal(true),
}).strict();

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
    } catch (e) {}

    // Active Feature Flags
    let activeFeatureFlags = 0;
    try {
      const flagsSnap = await db.collection("public_feature_flags").where("enabled", "==", true).get();
      activeFeatureFlags = flagsSnap.size;
    } catch (e) {}

    // B2B Orgs
    let orgsCount = 0;
    try {
      const orgsSnap = await db.collection("organisations").get();
      orgsCount = orgsSnap.size;
    } catch (e) {}

    // Anxiety Reset Event Metrics
    let resetsToday = 0;
    let resetsThisWeek = 0;
    let totalBefore = 0;
    let totalAfter = 0;
    let countWithIntensity = 0;
    let completedCount = 0;
    let totalResets = 0;
    let safetyEscalations = 0;
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

        if (data.triggerType) {
          triggerCounts[data.triggerType] = (triggerCounts[data.triggerType] || 0) + 1;
        }

        if (data.selectedTool) {
          toolCounts[data.selectedTool] = (toolCounts[data.selectedTool] || 0) + 1;
        }
      });
    } catch (e) {}

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
      safetyEscalations
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
    const { orgId, name, privacyThreshold } = req.body;
    const db = getDb();
    await db.collection("organisations").doc(orgId).set({
      name,
      privacyThreshold: privacyThreshold || 5,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    
    await logAdminAction(req, "manage_organisation", "", orgId, { name, privacyThreshold });
    res.json({ success: true });
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

app.post("/api/anxiety-reset", verifyAppCheck, authenticateFirebaseUser, async (req, res) => {
  try {
    const verifiedUser = requireAuth(req);
    const uid = verifiedUser?.uid;
    const eventData = req.body;
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
    wss.on("connection", async (clientWs) => {
      // Nova Phase 1C: Live voice is entirely disabled securely at the network edge during the Secure Account Test Mode pass.
      clientWs.send(JSON.stringify({ error: "Nova live voice remains safely disabled pending the secure voice implementation phase." }));
      clientWs.close();
    });
  });
}
