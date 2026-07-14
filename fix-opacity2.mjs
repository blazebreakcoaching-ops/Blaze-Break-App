import fs from 'fs';
import path from 'path';

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;

  // Global but careful replacements
  
  // 1. Text elements with opacity
  const regex = /(className="[^"]*)(text-text-[a-z]+|text-xs|text-sm|text-\[[0-9]+px\])([^"]*)opacity-[3-8]0([^"]*")/g;
  
  let p = content;
  // apply repeatedly in case of multiple text modifiers
  for(let i=0; i<3; i++) {
     p = p.replace(regex, '$1$2$3$4');
     // Some might have opacity-[3-8]0 first
     p = p.replace(/(className="[^"]*)opacity-[3-8]0([^"]*)(text-text-[a-z]+|text-xs|text-sm|text-\[[0-9]+px\])([^"]*")/g, '$1$2$3$4');
  }
  
  // also handle template literals className={cn("...", "...") }
  // we'll just replace `opacity-40` if it's next to `text-text-muted` anywhere.
  p = p.replace(/text-text-muted\s+opacity-[3-8]0/g, 'text-text-muted');
  p = p.replace(/opacity-[3-8]0\s+text-text-muted/g, 'text-text-muted');

  if (p !== original) {
    fs.writeFileSync(filePath, p, 'utf-8');
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
