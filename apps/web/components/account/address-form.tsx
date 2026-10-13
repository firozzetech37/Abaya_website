'use client';

import { type AddressBody, addressBody, type AddressDto } from '@abaya/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { fieldAria, FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { useStrings } from '@/components/i18n/locale-provider';
import { errorMessage } from '@/lib/api-client';
import { useSaveAddress } from '@/lib/queries/me';

export function AddressForm({
  address,
  onSaved,
  onCancel,
  defaultName,
  defaultPhone,
}: {
  address?: AddressDto;
  onSaved: (a: AddressDto) => void;
  onCancel?: () => void;
  defaultName?: string | null;
  defaultPhone?: string | null;
}) {
  const { common, account } = useStrings();
  const t = account.addresses;
  const save = useSaveAddress();
  const form = useForm({
    resolver: zodResolver(addressBody),
    defaultValues: {
      fullName: address?.fullName ?? defaultName ?? '',
      phone: address?.phone ?? defaultPhone ?? '',
      line1: address?.line1 ?? '',
      line2: address?.line2 ?? '',
      landmark: address?.landmark ?? '',
      city: address?.city ?? '',
      state: address?.state ?? '',
      pincode: address?.pincode ?? '',
      isDefault: address?.isDefault ?? false,
    },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values: AddressBody) => {
    // Optional fields: send undefined rather than empty strings.
    const body: AddressBody = {
      ...values,
      line2: values.line2 || undefined,
      landmark: values.landmark || undefined,
    };
    save.mutate({ id: address?.id, body }, { onSuccess: onSaved });
  });

  const field = (name: keyof Omit<AddressBody, 'isDefault'>, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, optional = false) => {
    const id = `addr-${address?.id ?? 'new'}-${name}`;
    const error = errors[name]?.message;
    return (
      <FormField id={id} label={optional ? `${label} (${common.optional})` : label} error={error}>
        <Input {...fieldAria(id, error)} {...props} {...form.register(name)} />
      </FormField>
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {field('fullName', t.fullName, { autoComplete: 'name' })}
        {field('phone', t.phone, { type: 'tel', inputMode: 'tel', autoComplete: 'tel-national' })}
      </div>
      {field('line1', t.line1, { autoComplete: 'address-line1' })}
      {field('line2', t.line2, { autoComplete: 'address-line2' }, true)}
      {field('landmark', t.landmark, {}, true)}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {field('city', t.city, { autoComplete: 'address-level2' })}
        {field('state', t.state, { autoComplete: 'address-level1' })}
        <div className="col-span-2 sm:col-span-1">{field('pincode', t.pincode, { inputMode: 'numeric', autoComplete: 'postal-code', maxLength: 6 })}</div>
      </div>
      <div className="flex items-center gap-3">
        <Controller
          control={form.control}
          name="isDefault"
          render={({ field }) => (
            <Checkbox
              id={`addr-${address?.id ?? 'new'}-default`}
              checked={field.value ?? false}
              onCheckedChange={(v) => field.onChange(v === true)}
            />
          )}
        />
        <label htmlFor={`addr-${address?.id ?? 'new'}-default`} className="text-sm">
          {t.isDefault}
        </label>
      </div>
      {save.isError && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {common.cancel}
          </Button>
        )}
        <Button type="submit" loading={save.isPending}>
          {save.isPending ? common.saving : common.save}
        </Button>
      </div>
    </form>
  );
}

export function AddressLines({ a }: { a: Pick<AddressDto, 'fullName' | 'phone' | 'line1' | 'line2' | 'landmark' | 'city' | 'state' | 'pincode'> }) {
  return (
    <address className="text-sm not-italic leading-relaxed text-neutral-700">
      <span className="font-medium text-foreground">{a.fullName}</span>
      <br />
      {a.line1}
      {a.line2 && `, ${a.line2}`}
      {a.landmark && (
        <>
          <br />
          {a.landmark}
        </>
      )}
      <br />
      {a.city}, {a.state} {a.pincode}
      <br />
      {a.phone}
    </address>
  );
}
