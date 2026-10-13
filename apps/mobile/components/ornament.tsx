import { useEffect, useId } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Path, Pattern, Rect } from 'react-native-svg';
import { gold } from '../lib/theme';

/**
 * Arabic-inspired ornaments, the same as the website (apps/web/components/ornament):
 * the eight-pointed star (khatam) and a girih lattice built from it. Decorative only.
 */

/** Two squares, one turned 45°: the eight-pointed star in a 64 × 64 box. */
const STAR_PATH = 'M32 8 56 32 32 56 8 32Z M15 15H49V49H15Z';

export function EightPointStar({
  size = 14,
  color = gold[500],
  filled = true,
  style,
}: {
  size?: number;
  color?: string;
  filled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View style={style} accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Path
          d={STAR_PATH}
          fill={filled ? color : 'none'}
          fillOpacity={filled ? 0.2 : undefined}
          stroke={color}
          strokeWidth={3.5}
          strokeLinejoin="round"
        />
        <Circle cx="32" cy="32" r="5.5" fill={color} />
      </Svg>
    </View>
  );
}

/** A faint repeating girih lattice; place it absolutely behind content. */
export function StarPattern({
  color = gold[300],
  opacity = 0.12,
  tile = 64,
  style,
}: {
  color?: string;
  opacity?: number;
  tile?: number;
  style?: ViewStyle;
}) {
  const id = `girih${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }, style]} importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={id} patternUnits="userSpaceOnUse" width={tile} height={tile} viewBox="0 0 64 64">
            <G fill="none" stroke={color} strokeWidth={1.2} strokeLinejoin="round">
              <Path d={STAR_PATH} />
              <Path d="M32 0V8 M32 56V64 M0 32H8 M56 32H64 M0 0 15 15 M64 0 49 15 M0 64 15 49 M64 64 49 49" />
              <Circle cx="32" cy="32" r="6" />
            </G>
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Gold hairline — star — hairline. The lines draw out from the star when it mounts. */
export function StarDivider({ delay = 150, style }: { delay?: number; style?: ViewStyle }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }));
  }, [delay, progress]);
  const line = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));
  const star = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ rotate: `${(1 - progress.value) * -90}deg` }, { scale: 0.5 + progress.value * 0.5 }],
  }));
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, style]} importantForAccessibility="no-hide-descendants">
      <Animated.View style={[{ height: 1, width: 72, backgroundColor: gold[400], transformOrigin: 'right' }, line]} />
      <Animated.View style={star}>
        <EightPointStar size={16} />
      </Animated.View>
      <Animated.View style={[{ height: 1, width: 72, backgroundColor: gold[400], transformOrigin: 'left' }, line]} />
    </View>
  );
}

/** A slowly glowing gold star (closing banners, empty states). */
export function GlowingStar({ size = 30 }: { size?: number }) {
  const glow = useSharedValue(0.7);
  useEffect(() => {
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 2400 }), withTiming(0.7, { duration: 2400 })), -1);
  }, [glow]);
  const style = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: 0.94 + glow.value * 0.08 }] }));
  return (
    <Animated.View style={[{ shadowColor: gold[400], shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } }, style]}>
      <EightPointStar size={size} />
    </Animated.View>
  );
}
