import fs from 'fs';
import path from 'path';

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;

  // Replace hover:text-white and text-white when they cause issues on non-dark backgrounds.
  content = content.replace(/hover:text-white/g, 'hover:text-text-main');
  
  // Replace direct uses of text-white not handled earlier, if they form invisible patterns (like text-white on light).
  // FutureSelfSimulator 310
  content = content.replace(/isActive \? "text-white" : "text-text-main"/g, 'isActive ? "text-primary-foreground" : "text-text-main"');

  // ReflectSection 285 tracking-tight mb-5", isCommitted ? "text-text-muted" : "text-white"
  content = content.replace(/isCommitted \? "text-text-muted" : "text-white"/g, 'isCommitted ? "text-text-muted" : "text-text-main"');
  
  // PrivacyPolicyAccordion 95
  content = content.replace(/isActive \? "text-primary" : "text-white"/g, 'isActive ? "text-primary" : "text-text-main"');

  // Omnibrain map
  content = content.replace(/border-white\/10 text-text-main/g, 'border-border text-text-main');
  
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Updated ${filePath}`);
  }
}

function traverseDir(dir) {
  const elements = fs.readdirSync(dir);
  for (const el of elements) {
    const fullPath = path.join(dir, el);
    if (fs.statSync(fullPath).isDirectory()) {
      traverseDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      processFile(fullPath);
    }
  }
}

traverseDir('./src');
