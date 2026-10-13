import type { DesignDetail, MeasurementProfileDto } from '@abaya/contracts';
import { Pressable, View } from 'react-native';
import { Text } from './text';
import { strings } from '../content/strings';
import { formatINR } from '../lib/format';
import { bandParts, type RedesignSelection, standardBands, suggestBand } from '../lib/redesign';
import { Button } from './button';

type Mode = 'BAND' | 'MEASUREMENTS';

export function SizePicker({
  design,
  size,
  mode,
  onModeChange,
  onChange,
  profiles,
  signedIn,
  onAddMeasurements,
  onSignIn,
}: {
  design: DesignDetail;
  size: RedesignSelection['size'];
  mode: Mode;
  onModeChange: (m: Mode) => void;
  onChange: (size: RedesignSelection['size']) => void;
  profiles: MeasurementProfileDto[];
  signedIn: boolean;
  onAddMeasurements: () => void;
  onSignIn: () => void;
}) {
  const bands = standardBands(design);
  const custom = design.sizeBands.find((b) => b.code === 'CUSTOM');
  const defaultProfile = profiles.find((p) => p.isDefault) ?? profiles[0];
  const suggestion = defaultProfile ? suggestBand(design, defaultProfile.bustCm) : null;

  return (
    <View className="gap-3 py-4">
      <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
        {strings.design.size}
      </Text>

      <View className="flex-row rounded-full bg-neutral-100 p-1" accessibilityRole="tablist">
        {(['BAND', 'MEASUREMENTS'] as const).map((m) => {
          const on = mode === m;
          return (
            <Pressable
              key={m}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => onModeChange(m)}
              className={`min-h-[40px] flex-1 items-center justify-center rounded-full ${on ? 'bg-surface' : ''}`}
            >
              <Text className={`text-sm ${on ? 'font-semibold text-foreground' : 'text-muted'}`}>
                {m === 'BAND' ? strings.design.standardSize : strings.design.myMeasurements}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'BAND' ? (
        <>
          <View className="flex-row flex-wrap gap-2">
            {bands.map((b) => {
              const p = bandParts(b);
              const on = size?.kind === 'BAND' && size.sizeBandId === b.id;
              return (
                <Pressable
                  key={b.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={b.label}
                  onPress={() => onChange({ kind: 'BAND', sizeBandId: b.id })}
                  className={`min-h-[56px] min-w-[72px] items-center justify-center rounded-xl border px-3 ${
                    on ? 'border-primary bg-accent-50' : 'border-border bg-surface'
                  }`}
                >
                  <Text className={`text-base ${on ? 'font-semibold text-primary' : 'text-foreground'}`}>{p.code}</Text>
                  {p.range ? <Text className="text-[11px] text-muted">{p.range}</Text> : null}
                  {b.adjustmentInPaise > 0 ? (
                    <Text className="text-[11px] text-muted">
                      {strings.design.surcharge(formatINR(b.adjustmentInPaise))}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          {suggestion && defaultProfile ? (
            <Text className="text-sm text-accent-700">
              {strings.design.suggestedSize(suggestion.code, defaultProfile.bustCm)}
            </Text>
          ) : null}
        </>
      ) : !signedIn ? (
        <View className="gap-3 rounded-xl bg-neutral-100 p-4">
          <Text className="text-sm text-neutral-700">{strings.design.signInForMeasurements}</Text>
          <Button label={strings.common.signIn} onPress={onSignIn} variant="secondary" size="md" />
        </View>
      ) : (
        <View className="gap-2">
          {custom && custom.adjustmentInPaise > 0 ? (
            <Text className="text-xs text-muted">
              {custom.label} · {strings.design.surcharge(formatINR(custom.adjustmentInPaise))}
            </Text>
          ) : null}
          {profiles.length === 0 ? <Text className="text-sm text-muted">{strings.design.noProfiles}</Text> : null}
          {profiles.map((p) => {
            const on = size?.kind === 'MEASUREMENTS' && size.measurementProfileId === p.id;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={p.name}
                onPress={() => onChange({ kind: 'MEASUREMENTS', measurementProfileId: p.id })}
                className={`min-h-[56px] justify-center rounded-xl border px-4 py-3 ${
                  on ? 'border-primary bg-accent-50' : 'border-border bg-surface'
                }`}
              >
                <Text className={`text-base ${on ? 'font-semibold text-primary' : 'text-foreground'}`}>{p.name}</Text>
                <Text className="text-xs text-muted">
                  {strings.measurements.summary(p.bustCm, p.waistCm, p.fullLengthCm)}
                </Text>
              </Pressable>
            );
          })}
          <Button label={strings.design.addMeasurements} onPress={onAddMeasurements} variant="ghost" size="md" />
        </View>
      )}
    </View>
  );
}
