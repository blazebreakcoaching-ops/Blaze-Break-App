import { app } from "./server.ts";
import { getAuth } from 'firebase-admin/auth';
import { getAppCheck } from 'firebase-admin/app-check';
import fetch from "node-fetch";

const server = app.listen(8081, async () => {
  console.log("Test server running on port 8081");
  
  // Mint a custom token using the emulator
  const customToken = await getAuth().createCustomToken("synthetic-test-user-123");
  
  // Exchange it against the AUTH EMULATOR for an ID token
  const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const apiKey = "fake-api-key"; 
  const swapUrl = `http://${emulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`;
  
  const swapRes = await fetch(swapUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  
  const swapData = await swapRes.json();
  const validToken = (swapData as any).idToken;
  console.log("Successfully minted valid synthetic test token from emulator:", !!validToken);
  
  // Mock getAppCheck().verifyToken for tests since there's no App Check emulator
  const originalVerify = getAppCheck().verifyToken;
  getAppCheck().verifyToken = async (token) => {
    if (token === "valid_mock_app_check_token_999") {
      return { appId: "mock-app-id", token: token } as any;
    }
    throw new Error("Invalid token");
  };
  
  const originalVerifyId = getAuth().verifyIdToken;
  getAuth().verifyIdToken = async (token) => {
    if (token === validToken) {
       return { uid: 'synthetic-test-user-123', aud: 'ais-europe-west2-04e495469f024' } as any;
    }
    return originalVerifyId.call(getAuth(), token);
  };
  
  const validAppCheckToken = "valid_mock_app_check_token_999";
  console.log("Successfully mocked App Check token verification for tests.");
  
  async function testEndpoint(name, path, goodBody, badBody1, badBody2) {
    console.log(`\n--- Testing ${name} (${path}) ---`);
    
    // Auth Validation Tests
    let res = await fetch(`http://127.0.0.1:8081${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-firebase-appcheck': validAppCheckToken }, body: JSON.stringify(goodBody) });
    console.log(`- No Auth Header: ${res.status} (Expected 401)`);
    
    res = await fetch(`http://127.0.0.1:8081${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ', 'x-firebase-appcheck': validAppCheckToken }, body: JSON.stringify(goodBody) });
    console.log(`- Malformed Token: ${res.status}  (Expected 401)`);
    
    res = await fetch(`http://127.0.0.1:8081${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer some_invalid_token_123', 'x-firebase-appcheck': validAppCheckToken }, body: JSON.stringify(goodBody) });
    console.log(`- Invalid Token: ${res.status}  (Expected 401)`);

    // App Check Validation Tests
    res = await fetch(`http://127.0.0.1:8081${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` }, body: JSON.stringify(goodBody) });
    console.log(`- Valid ID Token, Missing App Check Token: ${res.status} (Expected 401)`);

    res = await fetch(`http://127.0.0.1:8081${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}`, 'x-firebase-appcheck': 'invalid_app_check_token_123' }, body: JSON.stringify(goodBody) });
    console.log(`- Valid ID Token, Invalid App Check Token: ${res.status} (Expected 401)`);

    res = await fetch(`http://127.0.0.1:8081${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-firebase-appcheck': validAppCheckToken }, body: JSON.stringify(goodBody) });
    console.log(`- Missing ID Token, Valid App Check Token: ${res.status} (Expected 401)`);

    // Schema Validation Tests (with valid token and valid app check)
    res = await fetch(`http://127.0.0.1:8081${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}`, 'x-firebase-appcheck': validAppCheckToken } }); 
    console.log(`- No Body: ${res.status} (Expected 400 or valid default depending on strictness)`);

    res = await fetch(`http://127.0.0.1:8081${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}`, 'x-firebase-appcheck': validAppCheckToken }, body: JSON.stringify(badBody1) });
    console.log(`- Unknown/forbidden fields: ${res.status} (Expected 400)`);
    
    res = await fetch(`http://127.0.0.1:8081${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}`, 'x-firebase-appcheck': validAppCheckToken }, body: JSON.stringify(badBody2) });
    console.log(`- Empty/Invalid Payload: ${res.status} (Expected 400)`);
    
    // Oversize payload test check
    const hugeString = "a".repeat(15000); 
    res = await fetch(`http://127.0.0.1:8081${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}`, 'x-firebase-appcheck': validAppCheckToken }, body: JSON.stringify({ huge: hugeString }) });
    console.log(`- Oversized Payload (>10KB): ${res.status} (Expected 413)`);

    // Valid Payload + Valid Token + Valid AppCheck
    res = await fetch(`http://127.0.0.1:8081${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}`, 'x-firebase-appcheck': validAppCheckToken }, body: JSON.stringify(goodBody) });
    console.log(`- Valid Payload + Valid Token + Valid AppCheck: ${res.status} (Expected 200 or 400 depending on strictness)`);
    const data = await res.text();
    console.log(`  Response:`, data);
  }
  
  await testEndpoint(
    'Nova Chat', 
    '/api/nova/chat', 
    { message: "test msg" }, 
    { message: "test", recoveryContext: "secret data" },
    { } // empty
  );

  await testEndpoint(
    'Nova Diagnose', 
    '/api/nova/diagnose', 
    { answers: { workload: 4 } }, 
    { answers: {}, fingerprintData: "secret" }, 
    { answers: 123 } // invalid type
  );

  await testEndpoint(
    'Nova Speech', 
    '/api/nova/speech', 
    { text: "hello" }, 
    { text: "hello", prompt: "foo" }, 
    { } 
  );

  const longStr = "A".repeat(250);
  await testEndpoint(
    'Nova Memory Suggest', 
    '/api/nova/memory/suggest', 
    { proposedText: "User prefers direct feedback.", proposedType: "coaching_preference", sourceType: "chat_interaction" }, 
    { proposedText: "User is broken", proposedType: "coaching_preference", sourceType: "chat_interaction" }, 
    { proposedText: longStr, proposedType: "coaching_preference", sourceType: "chat_interaction" } 
  );

  await testEndpoint(
    'Nova Memory Approve', 
    '/api/nova/memory/approve',
    { memoryText: "User prefers direct feedback.", memoryType: "coaching_preference", sourceType: "chat_interaction" }, 
    { memoryText: "User hates their manager John", memoryType: "coaching_preference", sourceType: "chat_interaction" }, 
    { memoryText: longStr, memoryType: "coaching_preference", sourceType: "chat_interaction" } 
  );

  // Test CORS
  console.log(`\n--- Testing CORS ---`);
  const corsRes1 = await fetch(`http://127.0.0.1:8081/api/nova/chat`, { method: 'OPTIONS', headers: { 'Origin': 'http://evil.com' } });
  console.log(`- Evil Origin: ${corsRes1.status} (Expected not to have access-control-allow-origin or generic)`);
  
  const corsRes2 = await fetch(`http://127.0.0.1:8081/api/nova/chat`, { method: 'OPTIONS', headers: { 'Origin': 'http://localhost:3000' } });
  console.log(`- Localhost Origin: ${corsRes2.status} (Expected 204 with allow origin)`);
  console.log(`  Access-Control-Allow-Origin: ${corsRes2.headers.get('Access-Control-Allow-Origin')}`);

  server.close(() => {
    console.log("\nIntegration tests completed.");
    process.exit(0);
  });
});
