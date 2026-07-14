import express from "express";
import admin from 'firebase-admin';
import fetch from "node-fetch";

// Initialize the Admin SDK pointing to local emulators
admin.initializeApp({ projectId: "demo-no-project" });

const app = express();
app.use(express.json());

const authenticateFirebaseUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed header' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

app.post("/api/nova/chat", authenticateFirebaseUser, (req, res) => { res.json({ safe: "Nova personal recovery context disabled" }); });
app.post("/api/nova/diagnose", authenticateFirebaseUser, (req, res) => { res.json({ safe: "Nova personal recovery context disabled" }); });
app.post("/api/nova/speech", authenticateFirebaseUser, (req, res) => { res.json({ safe: "Nova personal recovery context disabled" }); });

const server = app.listen(8081, async () => {
  console.log("Test server running on port 8081");
  
  // Mint a custom token using the emulator
  const customToken = await admin.auth().createCustomToken("synthetic-test-user-123");
  
  // Exchange it against the AUTH EMULATOR for an ID token
  const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const apiKey = "fake-api-key"; // API key does not matter for emulator
  const swapUrl = `http://${emulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`;
  
  const swapRes = await fetch(swapUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  
  const swapData = await swapRes.json();
  const validToken = (swapData as any).idToken;
  console.log("Successfully minted valid synthetic test token from emulator:", !!validToken);
  
  async function testEndpoint(name, path, method = 'POST', body = {}) {
    console.log(`\nTesting ${name} (${path})...`);
    
    // 1. No Header
    let res = await fetch(`http://127.0.0.1:8081${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    console.log(`- No Auth Header: ${res.status}`);
    
    // 2. Malformed
    res = await fetch(`http://127.0.0.1:8081${path}`, { method, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' }, body: JSON.stringify(body) });
    console.log(`- Malformed Token: ${res.status}`);
    
    // 3. Invalid Token
    res = await fetch(`http://127.0.0.1:8081${path}`, { method, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer some_invalid_token_123' }, body: JSON.stringify(body) });
    console.log(`- Invalid Token: ${res.status}`);
    
    // 4. Valid Token
    res = await fetch(`http://127.0.0.1:8081${path}`, { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` }, body: JSON.stringify(body) });
    console.log(`- Valid Token: ${res.status}`);
    const text = await res.text();
    console.log(`  Response: ${text.substring(0, 100)}`);
  }
  
  await testEndpoint('Nova Chat', '/api/nova/chat');
  await testEndpoint('Nova Diagnose', '/api/nova/diagnose');
  await testEndpoint('Nova Speech', '/api/nova/speech');

  server.close(() => {
    console.log("Test server closed.");
    process.exit(0);
  });
});
