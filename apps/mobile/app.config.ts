import fs from 'node:fs';
import path from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * The monorepo keeps one .env at the repo root, but Expo only loads .env files from
 * this folder. Read the PUBLIC mobile values (+ EAS project id) from the root file (never secrets)
 * so they reach the app through `extra` as a fallback to EXPO_PUBLIC_* inlining.
 */
function readRootPublicEnv(): Record<string, string> {
  const file = path.resolve(__dirname, '../../.env');
  const wanted = ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY', 'EAS_PROJECT_ID'];
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || !wanted.includes(match[1]!)) continue;
    const raw = match[2]!;
    const quoted = /^(['"])(.*?)\1/.exec(raw);
    out[match[1]!] = quoted ? quoted[2]! : raw.replace(/\s+#.*$/, '').trim();
  }
  return out;
}

const rootEnv = readRootPublicEnv();

/** Brand teal from the shared design tokens (tints the Android notification icon). */
function primaryColour(): string {
  try {
    const file = path.resolve(__dirname, '../../packages/config/tailwind/tokens.json');
    const tokens = JSON.parse(fs.readFileSync(file, 'utf8')) as { colors?: { primary?: string } };
    return tokens.colors?.primary ?? '#6B1F2A';
  } catch {
    return '#6B1F2A';
  }
}
const publicEnv = (key: string): string | undefined => process.env[key] || rootEnv[key] || undefined;

/**
 * Expo app config. Bundle ids are placeholders until the store listings exist.
 * EAS_PROJECT_ID comes from `eas init` (set it in the root .env or your shell).
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Abaya',
  slug: 'abaya',
  scheme: 'abaya',
  // Android + iOS are the targets; web is for testing in a desktop browser.
  platforms: ['android', 'ios', 'web'],
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  backgroundColor: '#FAF9F7',
  ios: {
    bundleIdentifier: 'in.abaya.app',
    supportsTablet: false,
    usesAppleSignIn: true,
    infoPlist: {
      NSCameraUsageDescription:
        'Abaya uses the camera only if you choose to take measurement photos, so your abaya can be tailored to fit you.',
      NSPhotoLibraryUsageDescription:
        'Abaya uses your photos only if you choose to upload measurement photos, so your abaya can be tailored to fit you.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'in.abaya.app',
    // FCM for push: drop the Firebase file here (see README); it is picked up when present.
    ...(fs.existsSync(path.resolve(__dirname, 'google-services.json'))
      ? { googleServicesFile: './google-services.json' }
      : {}),
    // Camera / photo permissions are added in Phase 2 with the measurement-photo feature
    // (no unused permissions in the Play listing). iOS usage strings are ready above.
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-apple-authentication',
    'expo-font',
    'expo-web-browser',
    // Push: Android channel 'default' is created at runtime (lib/push.ts) with HIGH importance.
    // Add `icon: './assets/notification-icon.png'` (96x96, white on transparent) once the brand asset exists.
    ['expo-notifications', { color: primaryColour(), defaultChannel: 'default' }],
    [
      'expo-splash-screen',
      { backgroundColor: '#FAF9F7', imageWidth: 160 },
    ],
  ],
  experiments: { typedRoutes: false },
  extra: {
    apiUrl: publicEnv('EXPO_PUBLIC_API_URL'),
    clerkPublishableKey: publicEnv('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY'),
    // Set EAS_PROJECT_ID after `npx eas-cli init` (placeholder until the EAS project exists).
    eas: publicEnv('EAS_PROJECT_ID') ? { projectId: publicEnv('EAS_PROJECT_ID') } : {},
  },
});
