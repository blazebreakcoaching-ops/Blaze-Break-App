const fs = require('fs');
const files = [
  'src/components/ConnectedRecoveryModules.tsx',
  'src/components/RecoveryVaultTest.tsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/import \{ auth \} from '\.\.\/lib\/firebase';/g, "import { auth, db } from '../lib/firebase';");
  content = content.replace(/const db = getFirestore\(\);/g, '');
  
  fs.writeFileSync(file, content);
  console.log(`Updated ${file}`);
});
