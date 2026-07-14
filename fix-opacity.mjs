import fs from 'fs';
import path from 'path';

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;

  // We want to remove opacity when it's on text-text-muted or text-main or text-primary
  // e.g., "text-text-muted opacity-40" => "text-text-muted"
  // "opacity-60 text-text-muted" => "text-text-muted"
  
  const textClasses = ['text-text-muted', 'text-text-main', 'text-primary', 'text-[11px]', 'text-[10px]', 'text-xs', 'text-sm'];
  
  for (const t of textClasses) {
      // Find where opacity-XX and t are in the same quote string
      // This is a naive regex replacing opacity-XX when followed by or preceded by a text class
      // Let's just do a direct string replace for combination patterns
      content = content.replace(new RegExp(`opacity-[2-7]0\\s+${t.replace('[', '\\[').replace(']', '\\]')}`, 'g'), t);
      content = content.replace(new RegExp(`${t.replace('[', '\\[').replace(']', '\\]')}\\s+opacity-[2-7]0`, 'g'), t);
      
      // Also for cases separated by other classes
      // Actually it's easier to just match text-* ... opacity-* inside className="..."
  }

  // Common cases observed:
  content = content.replace(/text-text-muted opacity-[2-7]0/g, 'text-text-muted');
  content = content.replace(/opacity-[2-7]0 text-text-muted/g, 'text-text-muted');
  
  // Specific known lines:
  // src/App.tsx:1133: <p className="text-xs font-black uppercase tracking-widest text-text-muted opacity-40">
  content = content.replace(/className="text-xs font-black uppercase tracking-widest text-text-muted opacity-40"/g, 'className="text-xs font-black uppercase tracking-widest text-text-muted"');

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

// Make sure to restore the previous dumb script changes first
traverseDir('./src');
