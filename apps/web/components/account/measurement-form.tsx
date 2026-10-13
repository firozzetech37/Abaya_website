'use client';

import { Link, useRouter, useSearchParams } from '@/components/i18n/navigation';
import { type MeasurementBody, measurementBody, type MeasurementProfileDto } from '@abaya/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { fieldAria, FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert, Skeleton } from '@/components/ui/misc';
import { useStrings } from '@/components/i18n/locale-provider';
import { errorMessage, isApiError } from '@/lib/api-client';
import { MEASURE_FIELDS as FIELDS, rangeOf, toNumber } from '@/lib/measurements';
import { useMeasurement, useSaveMeasurement } from '@/lib/queries/me';
import { safeNext } from '@/lib/utils';
import { type MeasureField, MeasurementDiagram } from './measurement-diagram';

export function MeasurementFormPage({ id }: { id?: string }) {
  const { measurementForm: t } = useStrings();
  const existing = useMeasurement(id ?? '');
  if (id && existing.isPending) {
    return (
      <div className="container max-w-3xl space-y-4 py-12">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (id && existing.isError) {
    return (
      <div className="container max-w-3xl py-12">
        <Alert tone="danger" title={t.loadError}>
          {errorMessage(existing.error)}
        </Alert>
      </div>
    );
  }
  return <MeasurementForm profile={id ? existing.data : undefined} />;
}

function MeasurementForm({ profile }: { profile?: MeasurementProfileDto }) {
  const { common, measurementForm: t } = useStrings();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'), '/account#measurements');
  const save = useSaveMeasurement();

  const form = useForm({
    resolver: zodResolver(measurementBody),
    defaultValues: profile
      ? {
          name: profile.name,
          heightCm: profile.heightCm,
          bustCm: profile.bustCm,
          waistCm: profile.waistCm,
          hipCm: profile.hipCm,
          shoulderCm: profile.shoulderCm,
          sleeveLengthCm: profile.sleeveLengthCm,
          fullLengthCm: profile.fullLengthCm,
          wristCm: profile.wristCm ?? undefined,
          notes: profile.notes ?? '',
          isDefault: profile.isDefault,
        }
      : { name: 'Me', notes: '', isDefault: false },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values: MeasurementBody) => {
    const body: MeasurementBody = { ...values, notes: values.notes?.trim() || undefined };
    save.mutate(
      { id: profile?.id, body },
      {
        onSuccess: () => {
          toast.success(t.saved);
          router.push(next);
        },
        onError: (e) => {
          // Cross-field rule (full length < height) comes back as 422 with details.field.
          const field = isApiError(e) ? (e.details as { field?: string } | undefined)?.field : undefined;
          if (field && field in t.fields) form.setError(field as MeasureField, { message: e.message });
        },
      },
    );
  });

  const fieldError = (key: MeasureField): string | undefined => {
    const err = errors[key];
    if (!err) return undefined;
    // z.coerce turns an empty box into NaN; say something human instead.
    return err.type === 'invalid_type' || /nan/i.test(err.message ?? '') ? t.enterValue(t.fields[key].label) : err.message;
  };

  return (
    <div className="container max-w-3xl py-10 sm:py-14">
      <Link href="/account#measurements" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm text-neutral-600 hover:text-foreground">
        <ArrowLeft className="rtl:-scale-x-100 size-4" aria-hidden />
        {t.backToAccount}
      </Link>
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">{profile ? t.titleEdit : t.titleNew}</h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-neutral-600">{t.intro}</p>

      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-4">
        <div className="rounded-xl border border-border bg-surface p-5">
          <FormField id="m-name" label={t.profileName} hint={t.profileNameHint} error={errors.name?.message}>
            <Input {...fieldAria('m-name', errors.name?.message, true)} {...form.register('name')} maxLength={40} className="max-w-xs" />
          </FormField>
        </div>

        <ol className="space-y-4">
          {FIELDS.map(({ key, optional }, i) => {
            const meta = t.fields[key];
            const { min, max } = rangeOf(key);
            const id = `m-${key}`;
            const error = fieldError(key);
            return (
              <li key={key} className="flex gap-4 rounded-xl border border-border bg-surface p-4 sm:gap-6 sm:p-5">
                <div className="w-20 shrink-0 rounded-lg bg-sand-50 p-2 sm:w-28">
                  <MeasurementDiagram field={key} label={t.diagramLabel(meta.label)} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">{t.stepOf(i + 1, FIELDS.length)}</p>
                  <FormField
                    id={id}
                    label={optional ? `${meta.label} (${common.optional})` : meta.label}
                    error={error}
                    hint={t.range(min, max)}
                    className="mt-1"
                  >
                    <p className="text-sm leading-relaxed text-neutral-600">{meta.help}</p>
                    <div className="relative max-w-[12rem]">
                      <Input
                        {...fieldAria(id, error, true)}
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min={min}
                        max={max}
                        className="pe-12 tabular-nums"
                        {...form.register(key, { setValueAs: toNumber })}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">{t.unit}</span>
                    </div>
                  </FormField>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
          <FormField id="m-notes" label={`${t.notes} (${common.optional})`} hint={t.notesHint} error={errors.notes?.message}>
            <Textarea {...fieldAria('m-notes', errors.notes?.message, true)} maxLength={300} {...form.register('notes')} />
          </FormField>
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="isDefault"
              render={({ field }) => (
                <Checkbox id="m-default" checked={field.value ?? false} onCheckedChange={(v) => field.onChange(v === true)} />
              )}
            />
            <label htmlFor="m-default" className="text-sm">
              {t.isDefault}
            </label>
          </div>
        </div>

        {save.isError && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
        <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <Button type="submit" size="lg" className="w-full sm:w-auto" loading={save.isPending}>
            {save.isPending ? common.saving : t.save}
          </Button>
        </div>
      </form>
    </div>
  );
}
