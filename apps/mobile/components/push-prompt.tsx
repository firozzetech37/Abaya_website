import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from './text';
import { strings } from '../content/strings';
import { markExplainerShown, requestPushPermission, shouldShowExplainer } from '../lib/push';
import { colors } from '../lib/theme';
import { Button } from './button';

/**
 * Short explanation shown BEFORE the OS permission prompt. "Not now" is always
 * available and nothing in the app depends on the answer.
 */
export function PushPrompt({ onDone }: { onDone: (granted: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  const enable = async () => {
    setBusy(true);
    const granted = await requestPushPermission();
    await markExplainerShown('accepted');
    setBusy(false);
    if (granted) onDone(true);
    else setDenied(true);
  };

  const later = async () => {
    await markExplainerShown('later');
    onDone(false);
  };

  return (
    <View className="rounded-3xl border border-border bg-surface p-5">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-accent-50">
        <Ionicons name="notifications-outline" size={24} color={colors.primary} />
      </View>
      <Text accessibilityRole="header" className="mt-4 font-display text-2xl text-foreground">
        {strings.push.title}
      </Text>
      <Text className="mt-2 text-base text-neutral-700">{strings.push.body}</Text>
      <View className="mt-4 gap-2">
        {strings.push.points.map((p) => (
          <View key={p} className="flex-row items-start gap-2">
            <Ionicons name="checkmark-circle-outline" size={18} color={colors.primary} style={{ marginTop: 2 }} />
            <Text className="flex-1 text-sm text-foreground">{p}</Text>
          </View>
        ))}
      </View>
      {denied ? (
        <>
          <Text accessibilityRole="alert" className="mt-4 text-sm text-muted">
            {strings.push.denied}
          </Text>
          <Button label={strings.common.done} variant="secondary" onPress={() => onDone(false)} className="mt-4" />
        </>
      ) : (
        <View className="mt-5 gap-2">
          <Button
            label={busy ? strings.push.enabling : strings.push.enable}
            loading={busy}
            onPress={() => void enable()}
          />
          <Button label={strings.push.later} variant="ghost" disabled={busy} onPress={() => void later()} />
        </View>
      )}
    </View>
  );
}

/** Inline prompt for the order-success screen; renders nothing unless we should still ask. */
export function PushPromptAfterOrder() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let active = true;
    void shouldShowExplainer('order').then((yes) => {
      if (active) setShow(yes);
    });
    return () => {
      active = false;
    };
  }, []);
  if (!show) return null;
  return (
    <View className="mt-8 w-full">
      <PushPrompt onDone={() => setShow(false)} />
    </View>
  );
}
