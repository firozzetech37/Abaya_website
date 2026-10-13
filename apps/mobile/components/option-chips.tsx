import type { DesignDetail } from '@abaya/contracts';
import { isSwatchGroup } from '@abaya/contracts';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';
import { Text } from './text';
import { strings } from '../content/strings';
import { formatINR } from '../lib/format';
import { colors } from '../lib/theme';

type Group = DesignDetail['optionGroups'][number];
type Value = Group['values'][number];

const surchargeLabel = (v: Value) =>
  v.surchargeInPaise > 0 ? strings.design.surcharge(formatINR(v.surchargeInPaise)) : strings.design.included;

const tap = () => void Haptics.selectionAsync().catch(() => undefined);

/** One option group of the Redesign sheet: colour swatches, cards, or a multi-select list. */
export function OptionGroupSection({
  group,
  selected,
  onToggle,
  missing,
}: {
  group: Group;
  selected: string[];
  onToggle: (valueId: string) => void;
  missing?: boolean;
}) {
  const chosen = group.values.filter((v) => selected.includes(v.id));
  const summary =
    group.selectionType === 'MULTI'
      ? strings.design.multiHint
      : (chosen[0]?.name ?? (group.isRequired ? strings.design.requiredHint : strings.common.optional));

  return (
    <View className="gap-3 py-4" accessibilityRole="radiogroup" accessibilityLabel={group.name}>
      <View className="flex-row items-baseline justify-between">
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
          {group.name}
        </Text>
        <Text className={`text-sm ${missing ? 'text-danger' : 'text-muted'}`}>
          {missing ? strings.design.required : summary}
        </Text>
      </View>

      {isSwatchGroup(group.code) ? (
        <View className="flex-row flex-wrap gap-3">
          {group.values.map((v) => {
            const on = selected.includes(v.id);
            return (
              <Pressable
                key={v.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${v.name}, ${surchargeLabel(v)}`}
                onPress={() => {
                  tap();
                  onToggle(v.id);
                }}
                className="items-center"
              >
                <View
                  className={`h-12 w-12 items-center justify-center rounded-full border-2 ${
                    on ? 'border-primary' : 'border-transparent'
                  }`}
                >
                  <View
                    className="h-10 w-10 rounded-full border border-border"
                    style={{ backgroundColor: v.colourHex ?? colors.neutral['300'] }}
                  />
                </View>
                {v.surchargeInPaise > 0 ? (
                  <Text className="mt-1 text-[10px] text-muted">{surchargeLabel(v)}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : group.selectionType === 'MULTI' ? (
        <View className="overflow-hidden rounded-3xl border border-border bg-surface">
          {group.values.map((v, i) => {
            const on = selected.includes(v.id);
            return (
              <Pressable
                key={v.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${v.name}, ${surchargeLabel(v)}`}
                onPress={() => {
                  tap();
                  onToggle(v.id);
                }}
                className={`min-h-[52px] flex-row items-center gap-3 px-4 active:bg-neutral-50 ${
                  i > 0 ? 'border-t border-border' : ''
                }`}
              >
                <View
                  className={`h-6 w-6 items-center justify-center rounded-md border ${
                    on ? 'border-primary bg-primary' : 'border-neutral-400'
                  }`}
                >
                  {on ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                </View>
                <Text className="flex-1 text-base text-foreground">{v.name}</Text>
                <Text className="text-sm text-muted">{surchargeLabel(v)}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View className="flex-row flex-wrap justify-between gap-y-3">
          {group.values.map((v) => {
            const on = selected.includes(v.id);
            return (
              <Pressable
                key={v.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${v.name}, ${surchargeLabel(v)}`}
                onPress={() => {
                  tap();
                  onToggle(v.id);
                }}
                className={`min-h-[64px] w-[48.5%] justify-center rounded-xl border px-3 py-3 ${
                  on ? 'border-primary bg-accent-50' : 'border-border bg-surface active:bg-neutral-50'
                }`}
              >
                <Text className={`text-sm ${on ? 'font-semibold text-primary' : 'text-foreground'}`}>{v.name}</Text>
                <Text className="mt-0.5 text-xs text-muted">{surchargeLabel(v)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
