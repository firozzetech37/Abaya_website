import { type AddressBody, addressBody } from '@abaya/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import type { z } from 'zod';
import { strings } from '../content/strings';
import { errorMessage } from '../lib/api-client';
import { useCreateAddress } from '../lib/queries/account';
import type { AddressDto } from '@abaya/contracts';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { InlineError } from './states';
import { TextField } from './text-field';

type Input = z.input<typeof addressBody>;
type TextKey = Exclude<keyof Input, 'isDefault'>;

const FIELDS: { key: TextKey; label: string; keyboard?: 'phone-pad' | 'number-pad'; autoComplete?: 'name' | 'tel' | 'postal-code' | 'street-address'; optional?: boolean }[] = [
  { key: 'fullName', label: strings.addresses.fullName, autoComplete: 'name' },
  { key: 'phone', label: strings.addresses.phone, keyboard: 'phone-pad', autoComplete: 'tel' },
  { key: 'line1', label: strings.addresses.line1, autoComplete: 'street-address' },
  { key: 'line2', label: strings.addresses.line2, optional: true },
  { key: 'landmark', label: strings.addresses.landmark, optional: true },
  { key: 'pincode', label: strings.addresses.pincode, keyboard: 'number-pad', autoComplete: 'postal-code' },
  { key: 'city', label: strings.addresses.city },
  { key: 'state', label: strings.addresses.state },
];

/** Address form validated with the shared `addressBody` Zod schema. */
export function AddressForm({ onSaved, defaultChecked = false }: { onSaved: (a: AddressDto) => void; defaultChecked?: boolean }) {
  const create = useCreateAddress();
  const { control, handleSubmit, formState } = useForm<Input, unknown, AddressBody>({
    resolver: zodResolver(addressBody),
    defaultValues: { fullName: '', phone: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '', isDefault: defaultChecked },
  });

  const submit = handleSubmit((values) => {
    // Optional fields: send nothing rather than an empty string.
    const body: AddressBody = {
      ...values,
      line2: values.line2?.trim() || undefined,
      landmark: values.landmark?.trim() || undefined,
    };
    create.mutate(body, { onSuccess: onSaved });
  });

  return (
    <View className="gap-4">
      {FIELDS.map((f) => (
        <Controller
          key={f.key}
          control={control}
          name={f.key}
          render={({ field }) => (
            <TextField
              label={f.optional ? `${f.label} (${strings.common.optional.toLowerCase()})` : f.label}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              keyboardType={f.keyboard}
              autoComplete={f.autoComplete}
              maxLength={f.key === 'pincode' ? 6 : f.key === 'phone' ? 13 : undefined}
              error={formState.errors[f.key]?.message}
            />
          )}
        />
      ))}
      <Controller
        control={control}
        name="isDefault"
        render={({ field }) => (
          <Checkbox label={strings.addresses.makeDefault} checked={Boolean(field.value)} onChange={field.onChange} />
        )}
      />
      <InlineError message={create.isError ? errorMessage(create.error) : null} />
      <Button label={create.isPending ? strings.common.saving : strings.common.save} loading={create.isPending} onPress={() => void submit()} />
    </View>
  );
}

export function formatAddress(a: Pick<AddressDto, 'line1' | 'line2' | 'landmark' | 'city' | 'state' | 'pincode'>): string {
  return [a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean).join(', ');
}
