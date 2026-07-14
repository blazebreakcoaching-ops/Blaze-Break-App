import fs from 'fs';

let content = fs.readFileSync('src/components/ConnectedRecoveryModules.tsx', 'utf8');

// For CheckIn
content = content.replace(
  "note: note || undefined",
  "note: note || ''"
); // Or better just conditionally add it.

content = content.replace(
  "gratitude: gratitude || undefined",
  "gratitude: gratitude || ''"
); 

fs.writeFileSync('src/components/ConnectedRecoveryModules.tsx', content);
