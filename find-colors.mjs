import fs from 'fs';
import path from 'path';

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        if (!file.endsWith('.tsx') && !file.endsWith('.ts')) return;
        const filePath = path.join(dir, file);
        results.push(filePath);
    });
    return results;
}

const files = walk('./src/components');
files.push('./src/App.tsx');
let colors = {};
const regex = /(?:text|bg|border)-(?:zinc|gray|slate|purple|indigo|blue|sky|emerald|amber|orange|red|yellow|green|neutral|stone)-[0-9]{2,3}/g;

files.forEach(f => {
    const txt = fs.readFileSync(f, 'utf8');
    let match;
    while ((match = regex.exec(txt)) !== null) {
        colors[match[0]] = (colors[match[0]] || 0) + 1;
    }
});
const sorted = Object.entries(colors).sort((a, b) => b[1] - a[1]);
console.log(sorted.map(x => x[0] + ': ' + x[1]).join('\n'));
