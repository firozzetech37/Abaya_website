import {
  CUSTOMER_STAGE_FLOW,
  customerStage,
  PRODUCTION_STAGE_LABELS,
  type ProductionStage,
  type StageEventDto,
} from '@abaya/contracts';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Text } from './text';
import { strings } from '../content/strings';
import { formatDateTime } from '../lib/format';
import { colors, gold } from '../lib/theme';

const FLOW = CUSTOMER_STAGE_FLOW;

/** A gold ring that keeps breathing around the stage the abaya is at now. */
function Pulse() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1600 }), -1, false);
  }, [t]);
  const style = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - t.value), transform: [{ scale: 1 + t.value * 0.9 }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: gold[400] }, style]}
    />
  );
}

function latestEvent(events: StageEventDto[], stage: ProductionStage): StageEventDto | undefined {
  return [...events].reverse().find((e) => e.toStage === stage);
}

/** Vertical per-abaya production timeline with dates, notes and stage photos. */
export function StageTimeline({ stage, events }: { stage: ProductionStage; events: StageEventDto[] }) {
  const sorted = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  // Workshop-internal stages fold into the customer steps (a remake shows at the pattern step).
  const effective = customerStage(stage);
  const cancelled = stage === 'CANCELLED';
  const currentIndex = cancelled
    ? Math.max(0, ...sorted.map((e) => FLOW.indexOf(customerStage(e.fromStage ?? 'PLACED'))))
    : FLOW.indexOf(effective);
  const steps: ProductionStage[] = cancelled ? [...FLOW.slice(0, currentIndex + 1), 'CANCELLED'] : [...FLOW];

  return (
    <View accessibilityRole="list">
      {steps.map((s, i) => {
        const isCancelStep = s === 'CANCELLED';
        let state: 'done' | 'current' | 'todo';
        if (isCancelStep) state = 'current';
        else if (cancelled || i < currentIndex || (i === currentIndex && s === 'DELIVERED')) state = 'done';
        else state = i === currentIndex ? 'current' : 'todo';
        const event = latestEvent(sorted, s);
        const last = i === steps.length - 1;
        const label =
          stage === 'REMAKE' && s === 'PATTERN' ? PRODUCTION_STAGE_LABELS.REMAKE : PRODUCTION_STAGE_LABELS[s];
        const dotColor = isCancelStep ? colors.danger : state === 'todo' ? colors.neutral['300'] : state === 'current' ? gold[500] : colors.primary;
        return (
          <View
            key={s}
            className="flex-row gap-4"
            accessibilityLabel={`${label}${event ? `, ${formatDateTime(event.createdAt)}` : ''}`}
          >
            <View className="items-center">
              {state === 'current' && !isCancelStep ? (
                <View className="absolute h-[26px] w-[26px] items-center justify-center">
                  <Pulse />
                </View>
              ) : null}
              <View
                className="h-[26px] w-[26px] items-center justify-center rounded-full"
                style={{
                  backgroundColor: state === 'todo' ? colors.surface : dotColor,
                  borderWidth: 2,
                  borderColor: dotColor,
                }}
              >
                {state === 'done' ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                {isCancelStep ? <Ionicons name="close" size={14} color="#fff" /> : null}
                {state === 'current' && !isCancelStep ? <View className="h-2 w-2 rounded-full bg-white" /> : null}
              </View>
              {!last ? (
                <View
                  className="w-0.5 flex-1"
                  style={{ backgroundColor: state === 'done' ? colors.accent['600'] : colors.neutral['200'], minHeight: 28 }}
                />
              ) : null}
            </View>
            <View className={`flex-1 ${last ? '' : 'pb-5'}`}>
              <Text
                className={`${
                  state === 'todo'
                    ? 'text-base text-neutral-400'
                    : state === 'current'
                      ? 'font-display text-[24px] leading-7 text-accent-900'
                      : 'text-base font-medium text-foreground'
                }`}
              >
                {label}
              </Text>
              {event ? <Text className="text-xs text-muted">{formatDateTime(event.createdAt)}</Text> : null}
              {event?.note ? <Text className="mt-1 text-sm text-neutral-700">{event.note}</Text> : null}
              {event?.photoUrl ? (
                <Image
                  source={{ uri: event.photoUrl }}
                  style={{
                    width: 150,
                    height: 200,
                    borderTopLeftRadius: 75,
                    borderTopRightRadius: 75,
                    borderBottomLeftRadius: 14,
                    borderBottomRightRadius: 14,
                    marginTop: 10,
                    borderWidth: 1,
                    borderColor: gold[200],
                    backgroundColor: colors.neutral['100'],
                  }}
                  contentFit="cover"
                  accessibilityLabel={`${strings.orders.stagePhoto}: ${label}`}
                />
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
