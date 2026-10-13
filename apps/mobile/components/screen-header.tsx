import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { gold } from '../lib/theme';
import { EightPointStar, StarPattern } from './ornament';
import { Text } from './text';

/**
 * Header for tab screens (they have no native header): an eyebrow with a gold star, a large
 * serif title over a faint girih lattice, and an optional action on the right.
 */
export function ScreenHeader({ title, eyebrow, right }: { title: string; eyebrow?: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 14 }} className="overflow-hidden border-b border-border/60 bg-sand-50 px-5 pb-4">
      <StarPattern color={gold[500]} opacity={0.07} tile={58} />
      <Animated.View entering={FadeInDown.duration(500)} className="flex-row items-end justify-between">
        <View className="flex-1">
          {eyebrow ? (
            <View className="mb-1.5 flex-row items-center gap-2">
              <View className="h-px w-6 bg-gold-400" />
              <EightPointStar size={11} />
              <Text className="text-[10px] font-medium uppercase tracking-[3px] text-accent-700">{eyebrow}</Text>
            </View>
          ) : null}
          <Text accessibilityRole="header" className="font-display text-[40px] leading-[44px] text-foreground">
            {title}
          </Text>
        </View>
        {right}
      </Animated.View>
    </View>
  );
}

/** Section title inside a screen: gold-star eyebrow, serif title, optional "See all". */
export function SectionHeading({ eyebrow, title, right, light = false }: { eyebrow?: string; title: string; right?: ReactNode; light?: boolean }) {
  return (
    <View className="mb-4 flex-row items-end justify-between px-5">
      <View className="flex-1">
        {eyebrow ? (
          <View className="mb-1.5 flex-row items-center gap-2">
            <View className="h-px w-6 bg-gold-400" />
            <EightPointStar size={11} color={light ? gold[300] : gold[500]} />
            <Text className={`text-[10px] font-medium uppercase tracking-[3px] ${light ? 'text-gold-200' : 'text-accent-700'}`}>{eyebrow}</Text>
          </View>
        ) : null}
        <Text accessibilityRole="header" className={`font-display text-[32px] leading-9 ${light ? 'text-white' : 'text-foreground'}`}>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}
