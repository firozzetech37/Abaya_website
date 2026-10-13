import { Ionicons } from '@expo/vector-icons';
import type { Tabs } from 'expo-router/js-tabs';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { type ComponentProps, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, gold } from '../lib/theme';
import { StarPattern } from './ornament';
import { Text } from './text';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];
type IconName = keyof typeof Ionicons.glyphMap;

const ICONS: Record<string, [IconName, IconName]> = {
  index: ['home', 'home-outline'],
  shop: ['grid', 'grid-outline'],
  bag: ['bag-handle', 'bag-handle-outline'],
  account: ['person', 'person-outline'],
};

/**
 * Floating tab bar: a deep-green pill with a faint gold lattice; the active tab sits in a
 * gold-rimmed glow that springs into place, with a gold dot under its label.
 */
export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 10) }} className="px-4">
      <View
        className="overflow-hidden rounded-full"
        style={{ shadowColor: colors.accent['950'], shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 12 }}
      >
        <LinearGradient colors={[colors.accent['800'], colors.accent['950']]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <StarPattern color={gold[300]} opacity={0.08} tile={40} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 999, borderWidth: 1, borderColor: 'rgba(221,187,107,0.35)' }]} />
        <View className="h-[66px] flex-row items-center px-2">
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key]!;
            const focused = state.index === index;
            const label = typeof options.title === 'string' ? options.title : route.name;
            const badge = options.tabBarBadge;
            const [active, inactive] = ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
            return (
              <TabButton
                key={route.key}
                label={label}
                focused={focused}
                icon={focused ? active : inactive}
                badge={badge}
                onPress={() => {
                  const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) {
                    void Haptics.selectionAsync().catch(() => undefined);
                    navigation.navigate(route.name, route.params);
                  }
                }}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

function TabButton({
  label,
  focused,
  icon,
  badge,
  onPress,
}: {
  label: string;
  focused: boolean;
  icon: IconName;
  badge: string | number | undefined;
  onPress: () => void;
}) {
  const on = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    on.value = withSpring(focused ? 1 : 0, { damping: 16, stiffness: 220 });
  }, [focused, on]);
  const glow = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ scale: 0.7 + on.value * 0.3 }] }));
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: -on.value * 2 }, { scale: 1 + on.value * 0.06 }] }));
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={badge ? `${label}, ${badge}` : label}
      onPress={onPress}
      className="flex-1 items-center justify-center"
      style={{ height: 58 }}
    >
      <Animated.View
        style={[
          { position: 'absolute', width: 64, height: 50, borderRadius: 999, backgroundColor: 'rgba(221,187,107,0.16)', borderWidth: 1, borderColor: 'rgba(221,187,107,0.45)' },
          glow,
        ]}
      />
      <Animated.View style={[{ alignItems: 'center' }, lift]}>
        <View>
          <Ionicons name={icon} size={21} color={focused ? gold[200] : 'rgba(213,236,231,0.75)'} />
          {badge ? (
            <Animated.View
              key={String(badge)}
              entering={ZoomIn.springify()}
              className="absolute -right-2.5 -top-1.5 min-w-[18px] items-center justify-center rounded-full border border-accent-900 bg-gold-400 px-1"
              style={{ height: 18 }}
            >
              <Text className="text-[10px] font-bold text-accent-950">{badge}</Text>
            </Animated.View>
          ) : null}
        </View>
        <Text className={`mt-0.5 text-[10px] ${focused ? 'font-semibold text-gold-100' : 'text-accent-100/70'}`}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}
