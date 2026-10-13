import { View } from 'react-native';
import { Text } from './text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { strings } from '../content/strings';
import { formatINR } from '../lib/format';
import { Button } from './button';

/** Sticky bottom bar: current price (estimate until the server confirms) + main action. */
export function PriceBar({
  priceInPaise,
  confirmed,
  actionLabel,
  onAction,
  loading,
  disabled,
  hint,
  safeArea = true,
}: {
  priceInPaise: number | null;
  confirmed: boolean;
  actionLabel: string;
  onAction: () => void;
  loading?: boolean;
  disabled?: boolean;
  hint?: string | null;
  safeArea?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingBottom: (safeArea ? insets.bottom : 0) + 12,
        shadowColor: '#0B2522',
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: -6 },
        elevation: 12,
      }}
      className="rounded-t-[28px] border-t border-gold-200 bg-surface px-5 pt-4"
    >
      {hint ? <Text className="mb-2 text-xs text-danger">{hint}</Text> : null}
      <View className="flex-row items-center gap-4">
        <View className="min-w-[110px]" accessibilityLiveRegion="polite">
          <Text className="text-[10px] font-semibold uppercase tracking-[2px] text-accent-700">{confirmed ? strings.design.total : strings.design.estimate}</Text>
          <Text className="font-display text-[28px] leading-8 text-accent-900">
            {priceInPaise === null ? '—' : formatINR(priceInPaise)}
          </Text>
        </View>
        <Button label={actionLabel} onPress={onAction} loading={loading} disabled={disabled} trailingIcon="bag-add-outline" shine className="flex-1" />
      </View>
    </View>
  );
}
