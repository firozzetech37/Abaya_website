import type { DesignCard as DesignCardDto } from '@abaya/contracts';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { strings } from '../content/strings';
import { formatINR } from '../lib/format';
import { colors, gold } from '../lib/theme';
import { DesignImage } from './design-image';
import { EightPointStar } from './ornament';
import { PressableScale } from './pressable-scale';
import { Text } from './text';

/**
 * A design as an arch (like a doorway), the same as the website's cards: gold inner outline,
 * a spring press, and a gentle rise into view (`index` staggers a grid).
 */
export function DesignCard({ design, className = '', index = 0 }: { design: DesignCardDto; className?: string; index?: number }) {
  const price = strings.shop.from(formatINR(design.fromPriceInPaise));
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 70).duration(600)} className={className}>
      <PressableScale
        accessibilityRole="link"
        accessibilityLabel={`${design.name}, ${strings.styles[design.style]}, ${price}`}
        onPress={() => router.push(`/design/${design.slug}`)}
        scaleTo={0.96}
      >
        <View
          className="overflow-hidden bg-sand-100"
          style={{
            borderTopLeftRadius: 999,
            borderTopRightRadius: 999,
            borderBottomLeftRadius: 18,
            borderBottomRightRadius: 18,
            shadowColor: gold[600],
            shadowOpacity: 0.18,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 10 },
            elevation: 3,
          }}
        >
          <DesignImage uri={design.primaryImageUrl} name={design.name} className="aspect-[3/4] w-full" />
          {/* Gold arch outline inside the frame */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 7,
              left: 7,
              right: 7,
              bottom: 7,
              borderTopLeftRadius: 999,
              borderTopRightRadius: 999,
              borderBottomLeftRadius: 13,
              borderBottomRightRadius: 13,
              borderWidth: 1,
              borderColor: 'rgba(235,213,156,0.75)',
            }}
          />
          <View className="absolute bottom-2.5 right-2.5 h-8 w-8 items-center justify-center rounded-full bg-white/90">
            <Ionicons name="arrow-forward" size={15} color={colors.accent['800']} />
          </View>
        </View>
        <View className="mt-3 gap-1 px-0.5">
          <View className="flex-row items-center gap-1.5">
            <EightPointStar size={10} />
            <Text className="text-[10px] font-medium uppercase tracking-[2px] text-accent-700">{strings.styles[design.style]}</Text>
          </View>
          <Text numberOfLines={2} className="font-display text-xl leading-6 text-foreground">
            {design.name}
          </Text>
          <Text className="text-sm text-neutral-600">{price}</Text>
        </View>
      </PressableScale>
    </Animated.View>
  );
}
