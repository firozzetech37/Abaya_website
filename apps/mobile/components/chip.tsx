import { View } from 'react-native';
import { PressableScale } from './pressable-scale';
import { Text } from './text';

/** Filter / option chip: deep green when selected, with a small gold dot. */
export function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={4}
      scaleTo={0.94}
      className={`min-h-[40px] flex-row items-center gap-1.5 rounded-full border px-4 ${
        selected ? 'border-accent-800 bg-accent-800' : 'border-border bg-surface'
      }`}
    >
      {selected ? <View className="h-1.5 w-1.5 rounded-full bg-gold-300" /> : null}
      <Text className={`text-sm ${selected ? 'font-semibold text-white' : 'text-foreground'}`}>{label}</Text>
    </PressableScale>
  );
}
