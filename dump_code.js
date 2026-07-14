const fs = require('fs');
const path = require('path');

const excludeDirs = ['node_modules', 'dist', '.git'];
const includeExts = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html', '.md'];

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        if (excludeDirs.includes(file)) return;
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(filePath));
        } else {
            if (includeExts.includes(path.extname(file)) || file === '.env.example') {
                results.push(filePath);
            }
        }
    });
    return results;
}

const files = walk('.');
let output = '# Blaze Break Codebase Dump\n\n';

files.forEach(file => {
    output += `\n\n## File: ${file}\n\`\`\`${path.extname(file).substring(1)}\n`;
    try {
        output += fs.readFileSync(file, 'utf8');
    } catch (e) {
        output += `Error reading file: ${e.message}`;
    }
    output += `\n\`\`\`\n`;
});

fs.writeFileSync('codebase_dump.md', output);
console.log('Created codebase_dump.md with all source code.');
