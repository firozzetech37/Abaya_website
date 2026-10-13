import * as Notifications from 'expo-notifications';
import { router, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '../lib/auth';
import { routeFromPushUrl, shouldShowExplainer, syncPushRegistration } from '../lib/push';
import { hasCurrentConsent, useMe } from '../lib/queries/account';

/** Notification ids already routed, so a cold-start tap is not handled twice. */
const handled = new Set<string>();

function openFromResponse(response: Notifications.NotificationResponse | null) {
  if (!response) return;
  const id = response.notification.request.identifier;
  if (handled.has(id)) return;
  handled.add(id);
  const data = response.notification.request.content.data as Record<string, unknown> | null;
  const route = routeFromPushUrl(data?.url);
  if (route) router.push(route);
}

/**
 * Registers this install for push once signed in (and consented), opens the explainer
 * once after the first sign-in, and routes notification taps (warm and cold start).
 */
export function PushManager() {
  const { session } = useAuth();
  const me = useMe();
  const segments = useSegments();
  const onConsent = segments[0] === 'consent';
  const syncedFor = useRef<string | null>(null);

  const userId = session?.user.id ?? null;
  const consented = Boolean(me.data && hasCurrentConsent(me.data));

  useEffect(() => {
    if (!userId || !consented || onConsent) return;
    if (syncedFor.current === userId) return;
    syncedFor.current = userId;
    let active = true;
    void (async () => {
      await syncPushRegistration();
      if (active && (await shouldShowExplainer('login'))) router.push('/notifications');
    })();
    return () => {
      active = false;
    };
  }, [userId, consented, onConsent]);

  useEffect(() => {
    if (!userId) syncedFor.current = null;
  }, [userId]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void Notifications.getLastNotificationResponseAsync()
      .then(openFromResponse)
      .catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(openFromResponse);
    return () => sub.remove();
  }, []);

  return null;
}
