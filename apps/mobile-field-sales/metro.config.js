// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// In this pnpm monorepo Metro watches the whole workspace. Exclude the web
// dashboard's transient .next build output so Metro's file watcher does not
// crash with ENOENT when those dirs are created/removed mid-build.
// (No Watchman on Windows, so the fallback watcher is brittle to dir churn.)
// NOTE: keep this pattern tight — a broad /dist/ or /.expo/ block would hide
// real package entry points (e.g. memoize-one ships from dist/).
const blocked = [/[\\/]\.next[\\/]/];

config.resolver.blockList = Array.isArray(config.resolver.blockList)
  ? [...config.resolver.blockList, ...blocked]
  : [config.resolver.blockList, ...blocked].filter(Boolean);

// pnpm monorepo: ensure the mobile app's own node_modules is resolvable.
config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths ?? []),
  __dirname + "/node_modules",
];

module.exports = config;
