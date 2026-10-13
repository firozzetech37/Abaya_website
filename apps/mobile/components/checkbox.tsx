import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';
import { Text } from './text';

export function Checkbox({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  description?: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      className="min-h-[44px] flex-row items-start gap-3 py-2"
    >
      <View
        className={`mt-0.5 h-6 w-6 items-center justify-center rounded-md border ${
          checked ? 'border-primary bg-primary' : 'border-neutral-400 bg-surface'
        }`}
      >
        {checked ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
      </View>
      <View className="flex-1">
        <Text className="text-base text-foreground">{label}</Text>
        {description ? <Text className="mt-0.5 text-sm text-muted">{description}</Text> : null}
      </View>
    </Pressable>
  );
}
