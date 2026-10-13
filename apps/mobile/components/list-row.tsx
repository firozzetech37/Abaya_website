import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { colors, gold } from '../lib/theme';
import { PressableScale } from './pressable-scale';
import { Text } from './text';

/** A settings-style row: icon in a small arch, label, optional detail, chevron. */
export function ListRow({
  icon,
  label,
  detail,
  onPress,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      scaleTo={0.985}
      className="min-h-[60px] flex-row items-center gap-4 px-4"
    >
      <View
        className={`h-10 w-9 items-center justify-center ${destructive ? 'bg-danger/10' : 'bg-accent-50'}`}
        style={{ borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }}
      >
        <Ionicons name={icon} size={18} color={destructive ? colors.danger : colors.accent['700']} />
      </View>
      <Text className={`flex-1 text-base font-medium ${destructive ? 'text-danger' : 'text-foreground'}`}>{label}</Text>
      {detail ? <Text className="text-sm text-muted">{detail}</Text> : null}
      {!destructive ? <Ionicons name="chevron-forward" size={18} color={gold[500]} /> : null}
    </PressableScale>
  );
}
