import fs from 'fs';

// Just for inspection
const source = fs.readFileSync('src/components/RecoveryIntelligenceLayer.tsx', 'utf8');

console.log("Found bodySymptom:", source.includes('bodySymptoms'));
