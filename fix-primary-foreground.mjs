import fs from 'fs';
import path from 'path';

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    if (fs.statSync(dirPath).isDirectory()) walk(dirPath, callback);
    else callback(dirPath);
  });
}

function processFile(filePath) {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // We are going to find any className string that contains `bg-primary` and `text-white`, and replace `text-white` with `text-primary-foreground`.
  // Using a regex to find className="..."
  content = content.replace(/className=(["'])(.*?)\1/g, (match, quote, classNames) => {
    if (classNames.includes('bg-primary') && classNames.includes('text-white')) {
      return match.replace(/\btext-white\b/g, 'text-primary-foreground');
    }
    return match;
  });

  // What about template literals? clsx or cn?
  // e.g. cn("...", isActive ? "bg-primary text-white" : "...")
  content = content.replace(/["'](.*?)["']/g, (match, classNames) => {
    if (classNames.includes('bg-primary') && classNames.includes('text-white')) {
      return match.replace(/\btext-white\b/g, 'text-primary-foreground');
    }
    return match;
  });

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed bg-primary text-white in ${filePath}`);
  }
}

walk('src/components', processFile);
walk('src/lib', processFile);
processFile('src/App.tsx');
