import fs from 'fs';
let content = fs.readFileSync('src/components/RecoveryIntelligenceLayer.tsx', 'utf8');
if (!content.includes('import { ConnectedMoodPulse')) {
  content = "import { ConnectedMoodPulse, ConnectedBodyCheckIn, ConnectedWinsLog } from './ConnectedRecoveryModules.tsx';\n" + content;
  fs.writeFileSync('src/components/RecoveryIntelligenceLayer.tsx', content);
}
