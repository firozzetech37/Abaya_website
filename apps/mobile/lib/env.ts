import Constants from 'expo-constants';
import { Platform } from 'react-native';

interface Extra {
  apiUrl?: string;
  clerkPublishableKey?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/**
 * In a desktop browser during development the API runs on the same computer as the
 * page, so a local/LAN API address (which may be stale — IPs change) is replaced by
 * the page's own host. Phones keep EXPO_PUBLIC_API_URL (they need the Mac's LAN IP).
 */
function resolveApiUrl(configured: string): string {
  if (Platform.OS !== 'web' || !__DEV__ || typeof window === 'undefined') return configured;
  try {
    const url = new URL(configured);
    if (!PRIVATE_HOST.test(url.hostname)) return configured;
    url.hostname = window.location.hostname;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return configured;
  }
}

/** Public config only. EXPO_PUBLIC_* is inlined at bundle time; `extra` reads the root .env. */
export const env = {
  apiUrl: resolveApiUrl((process.env.EXPO_PUBLIC_API_URL || extra.apiUrl || 'http://localhost:4000').replace(/\/+$/, '')),
  clerkPublishableKey: (process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || extra.clerkPublishableKey || '').trim(),
};

/** A real Clerk key looks like pk_test_… / pk_live_… (the .env.example placeholder "pk_test_..." does not count). */
export const isClerkConfigured = /^pk_(test|live)_[A-Za-z0-9+/=_-]{20,}$/.test(env.clerkPublishableKey);
