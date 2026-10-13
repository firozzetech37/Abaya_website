import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Pattern, Rect, Stop } from 'react-native-svg';
import { strings } from '../content/strings';
import { colors, gold } from '../lib/theme';
import { EightPointStar, StarPattern } from './ornament';
import { Text } from './text';

const EASE = Easing.bezier(0.77, 0, 0.18, 1);

/** One half of the curtain: pleated green fabric with a gold valance and half of the arched door. */
function Panel({ side, width, height }: { side: 'left' | 'right'; width: number; height: number }) {
  const id = `pleat-${side}`;
  const doorW = width * 0.62;
  const doorH = height * 0.42;
  // The door's arch is split down the middle: each panel draws its own half.
  const x0 = side === 'left' ? width - doorW / 2 : 0;
  const archTop = height * 0.36;
  const halfArch =
    side === 'left'
      ? `M${width} ${archTop} C ${x0 + doorW * 0.18} ${archTop} ${x0} ${archTop + doorW * 0.2} ${x0} ${archTop + doorW * 0.5} L ${x0} ${archTop + doorH} L ${width} ${archTop + doorH}`
      : `M0 ${archTop} C ${doorW * 0.32} ${archTop} ${doorW / 2} ${archTop + doorW * 0.2} ${doorW / 2} ${archTop + doorW * 0.5} L ${doorW / 2} ${archTop + doorH} L 0 ${archTop + doorH}`;
  return (
    <View style={{ width, height, backgroundColor: colors.accent['950'], overflow: 'hidden' }}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.accent['950']} />
            <Stop offset="0.45" stopColor={colors.accent['800']} />
            <Stop offset="0.6" stopColor={colors.accent['700']} />
            <Stop offset="1" stopColor={colors.accent['950']} />
          </SvgGradient>
          <Pattern id={id} patternUnits="userSpaceOnUse" width={30} height={height}>
            <Rect width={30} height={height} fill={`url(#${id}-g)`} />
          </Pattern>
          <SvgGradient id={`${id}-shade`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000" stopOpacity={0.45} />
            <Stop offset="0.25" stopColor="#000" stopOpacity={0} />
            <Stop offset="0.75" stopColor="#000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.4} />
          </SvgGradient>
        </Defs>
        <Rect width={width} height={height} fill={`url(#${id})`} />
        <Rect width={width} height={height} fill={`url(#${id}-shade)`} />
        {/* Arched door outline in gold */}
        <Path d={halfArch} fill="none" stroke={gold[300]} strokeOpacity={0.55} strokeWidth={1.5} />
        {/* Gold valance along the top */}
        <Rect width={width} height={10} y={0} fill={gold[600]} />
        <Rect width={width} height={2} y={12} fill={gold[400]} opacity={0.7} />
      </Svg>
    </View>
  );
}

/**
 * Opening curtain shown once when the app starts, like the website's entrance: the brand
 * and a glowing gold star sit on the closed curtain, then the two halves part from the
 * middle. Skipped (a quick fade) when the phone asks for reduced motion.
 */
export function CurtainLoader({ ready }: { ready: boolean }) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [done, setDone] = useState(false);
  const open = useSharedValue(0);
  const brand = useSharedValue(0);

  useEffect(() => {
    brand.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [brand]);

  useEffect(() => {
    if (!ready) return;
    const finish = () => setDone(true);
    if (reduced) {
      open.value = withTiming(1, { duration: 300 }, (ok) => ok && runOnJS(finish)());
      return;
    }
    brand.value = withDelay(650, withTiming(0, { duration: 450 }));
    open.value = withDelay(
      850,
      withSequence(withTiming(1, { duration: 1700, easing: EASE }, (ok) => ok && runOnJS(finish)())),
    );
  }, [ready, reduced, open, brand]);

  const half = width / 2;
  const left = useAnimatedStyle(() => ({
    transform: [{ translateX: -open.value * (half + 30) }, { scaleX: 1 - open.value * 0.15 }],
    opacity: reduced ? 1 - open.value : 1,
  }));
  const right = useAnimatedStyle(() => ({
    transform: [{ translateX: open.value * (half + 30) }, { scaleX: 1 - open.value * 0.15 }],
    opacity: reduced ? 1 - open.value : 1,
  }));
  const centre = useAnimatedStyle(() => ({
    opacity: brand.value,
    transform: [{ translateY: (1 - brand.value) * 12 }, { scale: 0.96 + brand.value * 0.04 }],
  }));
  const light = useAnimatedStyle(() => ({
    opacity: open.value < 0.5 ? open.value * 1.6 : (1 - open.value) * 1.6,
    transform: [{ scaleX: 0.3 + open.value * 3 }],
  }));

  if (done) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 100 }]} accessibilityLabel={strings.common.loading}>
      {/* Warm light through the parting */}
      <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, light]}>
        <View style={{ width: width * 0.4, height: height * 0.9, borderRadius: width, backgroundColor: 'rgba(245,234,203,0.55)' }} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, transformOrigin: 'left' }, left]}>
        <Panel side="left" width={half} height={height} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', right: 0, top: 0, transformOrigin: 'right' }, right]}>
        <Panel side="right" width={half} height={height} />
      </Animated.View>
      {/* Brand on the closed curtain */}
      <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, centre]}>
        <StarPattern color={gold[300]} opacity={0.06} tile={72} />
        <View style={{ shadowColor: gold[400], shadowOpacity: 0.7, shadowRadius: 18, shadowOffset: { width: 0, height: 0 } }}>
          <EightPointStar size={44} color={gold[300]} />
        </View>
        <Text className="mt-5 font-display text-5xl text-gold-100">{strings.appName}</Text>
        <Text className="mt-2 text-[11px] uppercase tracking-[4px] text-gold-300">{strings.home.eyebrow}</Text>
      </Animated.View>
    </View>
  );
}
