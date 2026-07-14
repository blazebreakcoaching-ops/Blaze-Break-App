import fs from 'fs';
import path from 'path';

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;

  // Upgrade tiny illegible text sizes to something readable.
  content = content.replace(/text-\[8px\]/g, 'text-[10px]');
  content = content.replace(/text-\[9px\]/g, 'text-[11px]');
  
  // Remove dangerous opacity modifiers on text-muted or text-main so it doesn't wash out
  // Match things like text-text-muted/40, text-text-muted/50, placeholder:text-text-muted/30
  content = content.replace(/text-text-muted\/[1-6]0/g, 'text-text-muted');
  content = content.replace(/text-text-main\/[1-6]0/g, 'text-text-main');
  content = content.replace(/text-primary\/[1-6]0/g, 'text-primary');
  
  // also handle the specific one: hover:bg-white/[0.02] is okay for background, but watch out for text-white/50
  content = content.replace(/text-white\/[1-6]0/g, 'text-text-muted');

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
