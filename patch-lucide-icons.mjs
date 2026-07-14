import fs from 'fs';

let content = fs.readFileSync('src/components/RecoveryIntelligenceLayer.tsx', 'utf8');
content = content.replace(
  "} from 'lucide-react';",
  "HeartPulse, Star, Wind,\n} from 'lucide-react';"
);
fs.writeFileSync('src/components/RecoveryIntelligenceLayer.tsx', content);
