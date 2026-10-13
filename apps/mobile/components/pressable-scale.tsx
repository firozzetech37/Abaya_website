import * as Haptics from 'expo-haptics';
import { forwardRef } from 'react';
import { Pressable, type PressableProps, type View } from 'react-native';
import { cssInterop } from 'nativewind';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
// Animated components are not styled by NativeWind on their own: map className → style.
cssInterop(AnimatedPressable, { className: 'style' });

/**
 * A Pressable that springs down a little while pressed (cards, chips, tiles) and gives a
 * light haptic tick. `scaleTo` sets how far it sinks.
 */
export const PressableScale = forwardRef<View, PressableProps & { className?: string; scaleTo?: number; haptic?: boolean }>(
  function PressableScale({ scaleTo = 0.97, haptic = true, onPressIn, onPressOut, onPress, style, ...props }, ref) {
    const scale = useSharedValue(1);
    const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
    return (
      <AnimatedPressable
        ref={ref}
        {...props}
        style={[animated, style as object]}
        onPressIn={(e) => {
          scale.value = withSpring(scaleTo, { damping: 18, stiffness: 320 });
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.value = withSpring(1, { damping: 14, stiffness: 260 });
          onPressOut?.(e);
        }}
        onPress={(e) => {
          if (haptic) void Haptics.selectionAsync().catch(() => undefined);
          onPress?.(e);
        }}
      />
    );
  },
);
