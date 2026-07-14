import fs from 'fs';

let content = fs.readFileSync('src/components/RecoveryIntelligenceLayer.tsx', 'utf8');
content = content.replace(
  "MicOff\nHeartPulse, Star, Wind,",
  "MicOff,\nHeartPulse, Star, Wind,"
);
fs.writeFileSync('src/components/RecoveryIntelligenceLayer.tsx', content);
