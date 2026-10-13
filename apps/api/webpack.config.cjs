// Bundles the API into dist/main.js. Workspace packages (@abaya/*) ship as
// TypeScript source, so they are compiled into the bundle; every other
// dependency stays in node_modules (Prisma needs its engine files there).
const nodeExternals = require('webpack-node-externals');
const path = require('node:path');

/** @param {import('webpack').Configuration} options */
module.exports = (options) => ({
  ...options,
  externals: [
    nodeExternals({ allowlist: [/^@abaya\//] }),
    nodeExternals({
      modulesDir: path.resolve(__dirname, '../../node_modules'),
      allowlist: [/^@abaya\//],
    }),
  ],
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        exclude: /node_modules[\\/](?!@abaya)/,
        options: { transpileOnly: true, configFile: 'tsconfig.build.json' },
      },
    ],
  },
  resolve: { ...options.resolve, extensions: ['.ts', '.js'] },
});
