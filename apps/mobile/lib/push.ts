import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DevicePlatform, RegisterDeviceBody } from '@abaya/contracts';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { strings } from '../content/strings';
import { api } from './api-client';

/**
 * Push notifications for the customer app (order stage updates).
 *
 * Flow: after sign-in (and on every app start while signed in) we re-register the Expo
 * push token with the API if the user has already granted permission. The permission
 * prompt itself is only shown from the in-app explainer (app/notifications.tsx), after
 * the first sign-in or the first order. Denial never blocks anything.
 */

const TOKEN_KEY = 'push.token';
/** 'deferred' = the user tapped "Not now" once; we ask one more time after the first order. */
const ASK_KEY = 'push.asked';
type AskState = 'deferred' | 'done';

const CHANNEL_ID = 'default';
const APP = 'CUSTOMER' as const;

// Show a banner (and play the default sound) when a push arrives while the app is open.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

let warned = false;
function skip(reason: string): null {
  if (!warned && __DEV__) console.info(`[push] skipped: ${reason}`);
  warned = true;
  return null;
}

/** Why push cannot work in this build/device, or null when it can. */
function unsupportedReason(): string | null {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return 'unsupported platform';
  if (!Device.isDevice) return 'simulators and emulators cannot receive push';
  // Remote push was removed from Expo Go on Android in SDK 53; use the development build.
  if (Platform.OS === 'android' && isRunningInExpoGo()) return 'Expo Go on Android has no remote push';
  if (!projectId()) return 'no EAS projectId (run `npx eas-cli init`, set EAS_PROJECT_ID)';
  return null;
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

export const isPushSupported = (): boolean => unsupportedReason() === null;

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: strings.push.channelName,
    importance: Notifications.AndroidImportance.HIGH,
  });
}

/** 'granted' | 'denied' | 'undetermined'; 'denied' when push is unsupported here. */
export async function pushPermissionStatus(): Promise<Notifications.PermissionStatus> {
  if (!isPushSupported()) return Notifications.PermissionStatus.DENIED;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  } catch {
    return Notifications.PermissionStatus.DENIED;
  }
}

async function registerToken(): Promise<void> {
  const id = projectId();
  if (!id) return;
  await ensureChannel();
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  const body: RegisterDeviceBody = {
    token,
    platform: (Platform.OS === 'ios' ? 'IOS' : 'ANDROID') satisfies DevicePlatform,
    app: APP,
  };
  await api<void>('/me/devices', { method: 'POST', body });
  await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => undefined);
}

/**
 * Called after sign-in and on each app start while signed in. Registers only when the
 * permission is already granted (never prompts). Never throws.
 */
export async function syncPushRegistration(): Promise<void> {
  const reason = unsupportedReason();
  if (reason) {
    skip(reason);
    return;
  }
  try {
    if ((await pushPermissionStatus()) !== 'granted') return;
    await registerToken();
  } catch (e) {
    if (__DEV__) console.info('[push] registration failed', e);
  }
}

/** Shows the OS permission prompt (from the explainer), then registers. Returns true when granted. */
export async function requestPushPermission(): Promise<boolean> {
  const reason = unsupportedReason();
  if (reason) {
    skip(reason);
    return false;
  }
  try {
    // Android 13+ only shows the prompt once a channel exists.
    await ensureChannel();
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return false;
    await registerToken();
    return true;
  } catch (e) {
    if (__DEV__) console.info('[push] permission/registration failed', e);
    return false;
  }
}

/** Remove this install's token from the API. Call BEFORE the session is cleared. Never throws. */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await AsyncStorage.removeItem(TOKEN_KEY);
    await api<void>('/me/devices', { method: 'DELETE', query: { token } });
  } catch {
    // Sign-out must never fail because of push; the API prunes dead tokens on send.
  }
}

// ───────── When to show the explainer ─────────

async function askState(): Promise<AskState | null> {
  try {
    const v = await AsyncStorage.getItem(ASK_KEY);
    return v === 'deferred' || v === 'done' ? v : null;
  } catch {
    return null;
  }
}

export async function markExplainerShown(answer: 'accepted' | 'later'): Promise<void> {
  const current = await askState();
  // The first "Not now" leaves one more chance after the first order; after that we stop asking.
  const next: AskState = answer === 'later' && current === null ? 'deferred' : 'done';
  await AsyncStorage.setItem(ASK_KEY, next).catch(() => undefined);
}

/**
 * Whether to show the explainer now. `moment` is 'login' (first sign-in) or 'order'
 * (after an order is placed). Only when the OS has not been asked yet.
 */
export async function shouldShowExplainer(moment: 'login' | 'order'): Promise<boolean> {
  if ((await pushPermissionStatus()) !== 'undetermined') return false;
  const state = await askState();
  return moment === 'login' ? state === null : state !== 'done';
}

// ───────── Taps ─────────

/** `abaya://orders/AB-2026-000123` → `/orders/AB-2026-000123`. Unknown links → null. */
export function routeFromPushUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const match = /^abaya:\/\/\/?(orders|design)\/([^/?#]+)\/?$/.exec(url.trim());
  if (!match) return null;
  return `/${match[1]}/${match[2]}`;
}
