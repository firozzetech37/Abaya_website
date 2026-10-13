// Metro config for the pnpm monorepo: watch the whole repo (workspace packages such as
// @abaya/contracts and pnpm's .pnpm store live outside this folder) and resolve
// modules from this app first, then the repo root.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];
// pnpm links packages through symlinks into node_modules/.pnpm.
config.resolver.unstable_enableSymlinks = true;

// Babel inserts imports that are not direct dependencies of this app (NativeWind's JSX
// runtime lives in react-native-css-interop, a dependency of nativewind). With pnpm's
// isolated node_modules they are not reachable from app/, so point Metro at them.
const resolveFrom = (pkg, fromPkg) =>
  path.dirname(
    require.resolve(`${pkg}/package.json`, {
      paths: [fromPkg ? path.dirname(require.resolve(`${fromPkg}/package.json`)) : projectRoot],
    }),
  );
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'react-native-css-interop': resolveFrom('react-native-css-interop', 'nativewind'),
};

module.exports = withNativeWind(config, { input: './global.css' });
