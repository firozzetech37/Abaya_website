import { measurementBody } from '@abaya/contracts';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, type TextInput, View } from 'react-native';
import { Text } from '../../components/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/checkbox';
import { MeasurementDiagram, type MeasurementField } from '../../components/measurement-diagram';
import { InlineError } from '../../components/states';
import { TextField } from '../../components/text-field';
import { strings } from '../../content/strings';
import { errorMessage } from '../../lib/api-client';
import { useCreateMeasurement } from '../../lib/queries/account';

/** One field per step, in the order a tailor measures. */
const FIELDS: { key: MeasurementField; min: number; max: number; optional?: boolean }[] = [
  { key: 'heightCm', min: 120, max: 210 },
  { key: 'shoulderCm', min: 28, max: 60 },
  { key: 'bustCm', min: 60, max: 170 },
  { key: 'waistCm', min: 50, max: 160 },
  { key: 'hipCm', min: 60, max: 180 },
  { key: 'sleeveLengthCm', min: 40, max: 85 },
  { key: 'fullLengthCm', min: 100, max: 175 },
  { key: 'wristCm', min: 12, max: 30, optional: true },
];
const TOTAL = FIELDS.length + 1; // + name step

type Values = Record<MeasurementField, string>;

/** Accepts "88", "88.5" or "88,5"; returns the number to validate (or the raw text if unparseable). */
const toNumber = (text: string): number | string => {
  const n = Number(text.replace(',', '.'));
  return text.trim() === '' || Number.isNaN(n) ? text : Math.round(n * 10) / 10;
};

export default function NewMeasurementScreen() {
  const insets = useSafeAreaInsets();
  const create = useCreateMeasurement();
  const inputRef = useRef<TextInput>(null);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>({
    heightCm: '',
    shoulderCm: '',
    bustCm: '',
    waistCm: '',
    hipCm: '',
    sleeveLengthCm: '',
    fullLengthCm: '',
    wristCm: '',
  });
  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const field = FIELDS[step];
  const isNameStep = step === FIELDS.length;

  const validateField = (): boolean => {
    if (!field) return true;
    const raw = values[field.key];
    if (field.optional && raw.trim() === '') return true;
    // Validate with the same Zod rule the API uses.
    const result = measurementBody.shape[field.key].safeParse(toNumber(raw));
    if (!result.success) {
      setError(result.error.issues[0]?.message ? `${strings.measurements.fields[field.key].label} ${result.error.issues[0].message}` : strings.common.genericError);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      return false;
    }
    return true;
  };

  const next = () => {
    setError(null);
    if (!validateField()) return;
    setStep((s) => Math.min(s + 1, FIELDS.length));
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const back = () => {
    setError(null);
    if (step === 0) router.back();
    else setStep((s) => s - 1);
  };

  const save = () => {
    setError(null);
    const payload = {
      name: name.trim() || strings.measurements.namePlaceholder,
      isDefault,
      ...Object.fromEntries(
        FIELDS.filter((f) => !(f.optional && values[f.key].trim() === '')).map((f) => [f.key, toNumber(values[f.key])]),
      ),
    };
    const parsed = measurementBody.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const badIndex = FIELDS.findIndex((f) => f.key === issue?.path[0]);
      if (badIndex >= 0) setStep(badIndex);
      setError(issue?.message ?? strings.common.genericError);
      return;
    }
    create.mutate(parsed.data, {
      onSuccess: () => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        router.back();
      },
    });
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      {/* Progress */}
      <View className="px-5 pt-2">
        <Text className="text-xs uppercase tracking-widest text-muted">{strings.measurements.stepOf(step + 1, TOTAL)}</Text>
        <View className="mt-2 h-1 flex-row overflow-hidden rounded-full bg-neutral-200" accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: TOTAL, now: step + 1 }}>
          <View className="bg-primary" style={{ width: `${((step + 1) / TOTAL) * 100}%` }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {field ? (
          <>
            <View className="items-center rounded-2xl bg-surface py-4">
              <MeasurementDiagram field={field.key} size={230} />
            </View>
            <Text accessibilityRole="header" className="mt-6 font-display text-3xl text-foreground">
              {strings.measurements.fields[field.key].label}
              {field.optional ? <Text className="text-base text-muted">{`  ${strings.common.optional}`}</Text> : null}
            </Text>
            <Text className="mt-2 text-base text-neutral-700">{strings.measurements.fields[field.key].help}</Text>
            <View className="mt-5">
              <TextField
                key={field.key}
                ref={inputRef}
                label={strings.measurements.fields[field.key].label}
                value={values[field.key]}
                onChangeText={(t) => setValues((v) => ({ ...v, [field.key]: t.replace(/[^0-9.,]/g, '') }))}
                keyboardType="decimal-pad"
                suffix={strings.measurements.unit}
                hint={strings.measurements.range(field.min, field.max)}
                error={error}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={next}
              />
            </View>
            {step === 0 ? <Text className="mt-4 text-sm text-muted">{strings.measurements.tip}</Text> : null}
          </>
        ) : (
          <>
            <Text accessibilityRole="header" className="font-display text-3xl text-foreground">
              {strings.measurements.nameLabel}
            </Text>
            <View className="mt-5 gap-4">
              <TextField
                ref={inputRef}
                label={strings.measurements.nameLabel}
                placeholder={strings.measurements.namePlaceholder}
                hint={strings.measurements.nameHint}
                value={name}
                onChangeText={setName}
                maxLength={40}
              />
              <Checkbox label={strings.measurements.makeDefault} checked={isDefault} onChange={setIsDefault} />
              <View className="rounded-3xl border border-border bg-surface p-4">
                {FIELDS.map((f) => (
                  <View key={f.key} className="flex-row justify-between py-1">
                    <Text className="text-sm text-neutral-700">{strings.measurements.fields[f.key].label}</Text>
                    <Text className="text-sm text-foreground">
                      {values[f.key] ? `${values[f.key]} ${strings.measurements.unit}` : '—'}
                    </Text>
                  </View>
                ))}
              </View>
              <InlineError message={error ?? (create.isError ? errorMessage(create.error) : null)} />
            </View>
          </>
        )}
      </ScrollView>

      <View style={{ paddingBottom: insets.bottom + 12 }} className="flex-row gap-3 border-t border-border bg-surface px-4 pt-3">
        <Button label={strings.common.back} variant="secondary" onPress={back} className="w-28" />
        {isNameStep ? (
          <Button label={strings.measurements.finish} onPress={save} loading={create.isPending} className="flex-1" />
        ) : (
          <Button
            label={field?.optional && !values[field.key] ? strings.measurements.skip : strings.measurements.next}
            onPress={next}
            className="flex-1"
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
