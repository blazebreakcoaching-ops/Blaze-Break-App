import fs from 'fs';

function addConnectedMulti(filePath, componentName, connectedComponent) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(connectedComponent)) {
    console.log("Already has", connectedComponent, "in", filePath);
    return;
  }
  
  content = `import { auth } from '../lib/firebase';\nimport { ${connectedComponent} } from './ConnectedRecoveryModules.tsx';\n` + content;
  
  const searchStr = `export const ${componentName} =`;
  const idx = content.indexOf(searchStr);
  if (idx === -1) {
    console.log("Could not find", searchStr, "in", filePath);
    return;
  }
  
  // Find the first `{` after the `=>`
  let arrowIdx = content.indexOf('=>', idx);
  if (arrowIdx === -1) arrowIdx = idx; // Fallback
  const braceIdx = content.indexOf('{', arrowIdx);
  if (braceIdx !== -1) {
    let before = content.substring(0, braceIdx + 1);
    let after = content.substring(braceIdx + 1);
    content = before + `\n  if (auth.currentUser) return <${connectedComponent} />;\n` + after;
    fs.writeFileSync(filePath, content);
    console.log("Patched", filePath);
  } else {
    console.log("Failed to find brace for", filePath);
  }
}

addConnectedMulti('src/components/EnergyBudgetMatrix.tsx', 'EnergyBudgetMatrix', 'ConnectedEnergyBudget');
addConnectedMulti('src/components/EnergyBudget.tsx', 'EnergyBudgetTool', 'ConnectedEnergyBudget');
addConnectedMulti('src/components/BoundaryRehearsal.tsx', 'BoundaryRehearsal', 'ConnectedBoundaryScripts');
addConnectedMulti('src/components/ReflectSection.tsx', 'ReflectSection', 'ConnectedWeeklyReviews');
addConnectedMulti('src/components/DiagnoseSection.tsx', 'DiagnoseView', 'ConnectedBurnoutFingerprint');

