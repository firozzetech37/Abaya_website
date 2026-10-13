// babel-preset-expo is a dependency of `expo`; with pnpm's isolated node_modules it is not
// hoisted next to this app, so resolve it through expo's own folder.
const path = require('path');

const expoDir = path.dirname(require.resolve('expo/package.json'));
const presetExpo = require.resolve('babel-preset-expo', { paths: [expoDir] });

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [[presetExpo, { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
