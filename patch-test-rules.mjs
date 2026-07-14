import fs from 'fs';

let content = fs.readFileSync('test-rules.cjs', 'utf8');

const checksToAdd = `
  const budgetRef = userA.firestore().collection('users').doc('userA').collection('energy_budgets').doc('b1');
  const fingerprintRef = userA.firestore().collection('users').doc('userA').collection('recovery').doc('fingerprint');

  await assertSucceeds(budgetRef.set({ createdAt: '2025', updatedAt: '2025', periodType: 'day', totalCapacity: 100, allocatedCapacity: 50, remainingCapacity: 50, categories: ['work'] }));
  await assertSucceeds(budgetRef.get());
  await assertSucceeds(budgetRef.update({ updatedAt: '2026' }));
  await assertSucceeds(budgetRef.delete());

  await assertSucceeds(fingerprintRef.set({ archetype: 'High-Functioning Exhausted', identifiedAt: '2025', version: '1.0', source: 'user' }));
  await assertSucceeds(fingerprintRef.get());
  await assertSucceeds(fingerprintRef.delete());
`;

if (!content.includes('energy_budgets')) {
  // Add it before `console.log("Testing failure scenarios...");`
  const splitStr = `  console.log("Testing failure scenarios...");`;
  const parts = content.split(splitStr);
  if (parts.length === 2) {
    fs.writeFileSync('test-rules.cjs', parts[0] + checksToAdd + '\n' + splitStr + parts[1]);
  }
}

content = fs.readFileSync('test-rules.cjs', 'utf8');
const failureChecksToAdd = `
  await assertFails(budgetRef.set({ createdAt: '2025', updatedAt: '2025', periodType: 'day', totalCapacity: 101, allocatedCapacity: 50, remainingCapacity: 50, categories: ['work'] })); // over 100
  await assertFails(fingerprintRef.set({ archetype: 'Crisis Sprinter', identifiedAt: '2025', version: '1.0', source: 'user' })); // Parked archetype
`;

if (!content.includes('101')) {
  const splitStr = `  console.log("All rule tests passed successfully!");`;
  const parts = content.split(splitStr);
  if (parts.length === 2) {
    fs.writeFileSync('test-rules.cjs', parts[0] + failureChecksToAdd + '\n' + splitStr + parts[1]);
  }
}
