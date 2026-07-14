import fs from 'fs';
let txt = fs.readFileSync('src/App.tsx', 'utf8');

// Increase main layout padding
txt = txt.replace(
  '"p-6 md:p-8 max-w-7xl mx-auto",',
  '"p-8 md:p-12 lg:p-16 max-w-7xl mx-auto",'
);

fs.writeFileSync('src/App.tsx', txt);
