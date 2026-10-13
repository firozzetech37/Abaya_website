import { createRequire } from 'node:module';
import path from 'node:path';
import type { NextConfig } from 'next';

// Load the monorepo ROOT .env (NEXT_PUBLIC_* values). `@next/env` ships with Next;
// resolve it through Next's own location because pnpm does not hoist it here.
// forceReload: Next has already loaded (and cached) env files from apps/admin by the
// time this runs, so without it the root .env would be silently ignored.
const requireFromNext = createRequire(require.resolve('next/package.json'));
const { loadEnvConfig } = requireFromNext('@next/env') as {
  loadEnvConfig: (dir: string, dev?: boolean, log?: unknown, forceReload?: boolean) => unknown;
};
loadEnvConfig(path.resolve(__dirname, '../..'), process.env.NODE_ENV !== 'production', undefined, true);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
  transpilePackages: ['@abaya/contracts', '@abaya/ui'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co' }],
  },
  eslint: { ignoreDuringBuilds: true }, // lint runs separately via `pnpm lint`
};

export default nextConfig;
