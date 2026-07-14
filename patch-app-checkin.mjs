import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  /import \{ DailyCheckIn \} from "\.\/components\/DailyCheckIn\.tsx";/,
  `import { DailyCheckIn } from "./components/DailyCheckIn.tsx";\nimport { ConnectedDailyCheckIn } from "./components/ConnectedRecoveryModules.tsx";`
);

content = content.replace(
  /\{!user && showCheckIn && \([\s\S]*?<DailyCheckIn[\s\S]*?\/>\n          \)\}/,
  `{!user && showCheckIn && (
            <DailyCheckIn
              onComplete={handleCheckInComplete}
              onClose={() => setShowCheckIn(false)}
            />
          )}
          {user && showCheckIn && (
            <ConnectedDailyCheckIn
              onClose={() => setShowCheckIn(false)}
            />
          )}`
);

fs.writeFileSync('src/App.tsx', content);
