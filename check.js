const fs = require('fs');
const glob = require('glob');

const componentFiles = glob.sync('src/components/**/*.tsx');
const appFile = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /export const ([A-Za-z0-9_]+)/g;

let unused = [];

componentFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = regex.exec(content)) !== null) {
    const comp = match[1];
    let usedInApp = appFile.includes('<' + comp);
    let usedInOther = false;
    
    componentFiles.forEach(otherFile => {
      if (otherFile === file) return;
      const otherContent = fs.readFileSync(otherFile, 'utf8');
      if (otherContent.includes('<' + comp)) {
        usedInOther = true;
      }
    });

    if (!usedInApp && !usedInOther) {
      unused.push(comp);
    }
  }
});

console.log('Unused components:');
console.log(unused.join('\n'));
