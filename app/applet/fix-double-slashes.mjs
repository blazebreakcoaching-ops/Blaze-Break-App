import fs from 'fs';

const fileFixes = {
  'src/components/AssuranceCentre.tsx': [
    ['text-warning/30/80', 'text-warning']
  ],
  'src/components/DataZoneVisualizer.tsx': [
    ['bg-success/10/40', 'bg-success/10']
  ],
  'src/components/RuminationFurnace.tsx': [
    ['text-warning/20/50', 'text-warning']
  ],
  'src/components/BoundaryRehearsal.tsx': [
    ['text-success/30/80', 'text-success']
  ],
  'src/components/DiagnoseSection.tsx': [
    ['bg-destructive/10/30', 'bg-destructive/10']
  ]
};

Object.entries(fileFixes).forEach(([filePath, repairs]) => {
  let content = fs.readFileSync(filePath, 'utf8');
  repairs.forEach(([wrong, right]) => {
    content = content.replace(wrong, right);
  });
  fs.writeFileSync(filePath, content);
  console.log(`Repaired double slashes in: ${filePath}`);
});
