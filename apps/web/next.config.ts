import { createRequire } from 'node:module';
import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * Env vars live in the monorepo root .env (NEXT_PUBLIC_API_URL, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY).
 * `@next/env` ships with Next but is not a direct dependency of this package, so resolve it
 * through Next's own location. Everything still builds when the root .env is missing.
 */
type LoadEnvConfig = (dir: string, dev?: boolean, log?: unknown, forceReload?: boolean) => unknown;
try {
  const nextRequire = createRequire(require.resolve('next/package.json'));
  const { loadEnvConfig } = nextRequire('@next/env') as { loadEnvConfig: LoadEnvConfig };
  // forceReload: Next already loaded (and cached) env files from apps/web by now;
  // without it the root .env would be silently ignored.
  loadEnvConfig(path.resolve(__dirname, '../..'), process.env.NODE_ENV !== 'production', undefined, true);
} catch {
  // No root env loader available: fall back to defaults (API on http://localhost:4000).
}

/**
 * This build's version: the git commit Vercel deploys (a time stamp elsewhere). Open pages compare
 * it with /api/version and reload when a newer commit is live (components/pwa/pwa.tsx).
 */
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || process.env.RENDER_GIT_COMMIT || `build-${Date.now()}`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  // Monorepo root, so file tracing and the workspace root are detected correctly.
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
  transpilePackages: ['@abaya/contracts', '@abaya/ui'],
  images: {
    // Published design images are served from the API's file storage (public `designs` bucket).
    remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co' }],
  },
  // Lint runs as its own step (`pnpm --filter @abaya/web lint`).
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
