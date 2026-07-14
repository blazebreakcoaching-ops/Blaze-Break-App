import fs from 'fs';

let contentEB = fs.readFileSync('src/components/EnergyBudget.tsx', 'utf8');
if (!contentEB.includes('ConnectedEnergyBudget')) {
  let imp = "import { auth } from '../lib/firebase';\nimport { ConnectedEnergyBudget } from './ConnectedRecoveryModules';\n";
  contentEB = contentEB.replace("import React,", imp + "import React,");
  contentEB = contentEB.replace("export const EnergyBudgetTool = ({", "export const EnergyBudgetTool = ({\n  onAwardPoints,\n  currentStage = 'Safety',\n  debts = []\n}: any) => {\n  if (auth.currentUser) return <ConnectedEnergyBudget />;\n /*");
  contentEB = contentEB + "\n*/"; 
  // Wait, commenting out the whole function is wrong because we matched `export const EnergyBudgetTool = ({`. We shouldn't comment out, just return early.
}
