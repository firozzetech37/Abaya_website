import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { cssInterop } from 'nativewind';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors, gold } from '../lib/theme';
import { Text } from './text';

type Variant = 'primary' | 'gold' | 'secondary' | 'ghost' | 'danger' | 'light';

/** Gradients for the filled variants: deep green, and antique gold. */
const GRADIENTS: Partial<Record<Variant, [string, string, string]>> = {
  primary: [colors.accent['600'], colors.accent['800'], colors.accent['900']],
  gold: [gold[300], gold[400], gold[600]],
  danger: ['#d9534f', '#c0392b', '#a93226'],
};

const LABEL: Record<Variant, string> = {
  primary: 'text-white',
  gold: 'text-accent-950',
  secondary: 'text-foreground',
  ghost: 'text-primary',
  danger: 'text-white',
  light: 'text-accent-900',
};

const SPINNER: Record<Variant, string> = {
  primary: '#fff',
  gold: colors.accent['950'],
  secondary: colors.primary,
  ghost: colors.primary,
  danger: '#fff',
  light: colors.accent['900'],
};

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  /** Leading icon (any node), e.g. a brand logo. */
  icon?: ReactNode;
  /** Trailing Ionicons glyph, e.g. "arrow-forward". */
  trailingIcon?: keyof typeof Ionicons.glyphMap;
  className?: string;
  size?: 'md' | 'lg';
  /** A soft light sweeps across the button now and then (main calls to action). */
  shine?: boolean;
  accessibilityHint?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
// Animated components are not styled by NativeWind on their own: map className → style.
cssInterop(AnimatedPressable, { className: 'style' });

/**
 * The app's buttons: a pill with a deep-green (or gold) gradient, a thin gold rim, a spring
 * press and a haptic tick — the same feel as the website's buttons.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  trailingIcon,
  className = '',
  size = 'lg',
  shine = false,
  accessibilityHint,
}: ButtonProps) {
  const inactive = Boolean(disabled || loading);
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const gradient = GRADIENTS[variant];
  const height = size === 'lg' ? 54 : 44;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: Boolean(loading) }}
      disabled={inactive}
      onPressIn={() => {
        scale.value = withSpring(0.96, { damping: 18, stiffness: 340 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 12, stiffness: 240 });
      }}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        onPress?.();
      }}
      style={[pressStyle, { minHeight: height, opacity: inactive ? 0.55 : 1 }]}
      className={`overflow-hidden rounded-full ${
        variant === 'secondary'
          ? 'border border-border bg-surface'
          : variant === 'light'
            ? 'bg-white'
            : variant === 'ghost'
              ? 'bg-transparent'
              : ''
      } ${gradient ? 'shadow-md' : ''} ${className}`}
    >
      {gradient ? (
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      ) : null}
      {/* Thin gold rim on the filled buttons, like the website's gold hairlines */}
      {variant === 'primary' ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 999, borderWidth: 1, borderColor: 'rgba(221,187,107,0.45)' }]} />
      ) : null}
      {shine && gradient && !inactive ? <Shine /> : null}
      <View
        style={{ minHeight: height }}
        className={`flex-row items-center justify-center gap-2 ${size === 'lg' ? 'px-7' : 'px-5'}`}
      >
        {loading ? (
          <ActivityIndicator color={SPINNER[variant]} />
        ) : (
          <>
            {icon}
            <Text className={`${size === 'lg' ? 'text-base' : 'text-sm'} font-semibold ${LABEL[variant]}`}>{label}</Text>
            {trailingIcon ? (
              <Ionicons name={trailingIcon} size={size === 'lg' ? 18 : 16} color={SPINNER[variant]} />
            ) : null}
          </>
        )}
      </View>
    </AnimatedPressable>
  );
}

/** A diagonal band of light that sweeps across every few seconds. */
function Shine() {
  const x = useSharedValue(-1);
  useEffect(() => {
    x.value = withDelay(
      900,
      withRepeat(withSequence(withTiming(1.4, { duration: 1300, easing: Easing.inOut(Easing.cubic) }), withDelay(3200, withTiming(-1, { duration: 0 }))), -1),
    );
  }, [x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * 220 }, { skewX: '-20deg' }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, width: 60 }, style]}>
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}
