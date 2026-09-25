// Lets Metro resolve shared, framework-agnostic TypeScript modules that
// live at the repo root (entitlements.ts, notification-router.ts, etc.)
// instead of duplicating them inside /mobile. See plan:
// /root/.claude/plans/modular-knitting-sutherland.md ("Shared code strategy").
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [repoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(repoRoot, 'node_modules'),
];

module.exports = config;
