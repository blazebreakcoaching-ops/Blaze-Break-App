import fs from 'fs';

let content = fs.readFileSync('src/components/DailyGoal.tsx', 'utf8');

// We just prepend the import and modify the export const DailyGoal = ...
// to render ConnectedGoals if auth.currentUser is present

content = content.replace(
  /export const DailyGoal = \(\{ shipStage \}: \{ shipStage: SHIPStage \}\) => \{/,
  `import { auth } from '../lib/firebase';
import { ConnectedGoals } from './ConnectedRecoveryModules.tsx';

export const DailyGoal = ({ shipStage }: { shipStage: SHIPStage }) => {
  if (auth.currentUser) return <ConnectedGoals />;` // Return the connected one if logged in
);

fs.writeFileSync('src/components/DailyGoal.tsx', content);
