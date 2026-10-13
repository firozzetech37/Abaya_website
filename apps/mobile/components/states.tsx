import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated as RNAnimated, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { GlowingStar } from './ornament';
import { Text } from './text';
import { strings } from '../content/strings';
import { colors } from '../lib/theme';
import { Button } from './button';

type IconName = keyof typeof Ionicons.glyphMap;

export function EmptyState({
  icon = 'sparkles-outline',
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(500)} className="items-center justify-center px-8 py-16">
      {/* An arch with the icon, crowned by a glowing gold star */}
      <View className="mb-1 items-center">
        <GlowingStar size={18} />
      </View>
      <View
        className="mb-5 h-[76px] w-16 items-center justify-center border border-gold-200 bg-accent-50"
        style={{ borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }}
      >
        <Ionicons name={icon} size={26} color={colors.primary} />
      </View>
      <Text className="text-center font-display text-[28px] leading-8 text-foreground">{title}</Text>
      {body ? <Text className="mt-2 text-center text-sm leading-5 text-muted">{body}</Text> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} className="mt-6" size="md" trailingIcon="arrow-forward" />
      ) : null}
    </Animated.View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title={strings.common.genericError.split('.')[0] ?? ''}
      body={message}
      actionLabel={onRetry ? strings.common.retry : undefined}
      onAction={onRetry}
    />
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  const opacity = useRef(new RNAnimated.Value(0.5)).current;
  useEffect(() => {
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        RNAnimated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <RNAnimated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ opacity }}
      className={`rounded-lg bg-sand-200 ${className}`}
    />
  );
}

export function DesignGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View className="flex-row flex-wrap justify-between px-4" accessibilityLabel={strings.common.loading}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} className="mb-6 w-[48%]">
          <Skeleton className="aspect-[3/4] w-full rounded-t-full rounded-b-xl" />
          <Skeleton className="mt-3 h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </View>
      ))}
    </View>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View className="gap-3 p-4" accessibilityLabel={strings.common.loading}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </View>
  );
}

export function InlineError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" className="flex-row items-start gap-2 rounded-lg bg-danger/10 p-3">
      <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
      <Text className="flex-1 text-sm text-danger">{message}</Text>
    </View>
  );
}
