import fs from 'fs';

let content = fs.readFileSync('src/components/ConnectedRecoveryModules.tsx', 'utf8');

content = content.replace(
  /Trash2, Edit2, AlertCircle \} from 'lucide-react';/,
  `Trash2, Edit2, AlertCircle, CheckCircle } from 'lucide-react';`
);

fs.writeFileSync('src/components/ConnectedRecoveryModules.tsx', content);
