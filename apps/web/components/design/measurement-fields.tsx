'use client';

import { type MeasurementBody, measurementBody } from '@abaya/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { type DefaultValues, useForm } from 'react-hook-form';
import { type MeasureField, MeasurementDiagram } from '@/components/account/measurement-diagram';
import { useStrings } from '@/components/i18n/locale-provider';
import { fieldAria, FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { MEASURE_FIELDS, rangeOf, toNumber } from '@/lib/measurements';
import { cn } from '@/lib/utils';

/** What the boxes hold before validation (strings the schema coerces to numbers). */
type MeasurementInput = (typeof measurementBody)['_input'];

/** One react-hook-form instance validated by the shared Zod schema (coerces the typed strings). */
export function useMeasurementForm(defaultValues: DefaultValues<MeasurementInput>) {
  return useForm<MeasurementInput, unknown, MeasurementBody>({ resolver: zodResolver(measurementBody), defaultValues });
}
export type MeasurementForm = ReturnType<typeof useMeasurementForm>;

/**
 * The customer's own measurements, compact enough for the product page: every required
 * measurement with its diagram and a one-line tip, the optional wrist, then a name for the
 * profile and notes for the tailor.
 */
export function MeasurementFields({ form, idPrefix, className }: { form: MeasurementForm; idPrefix: string; className?: string }) {
  const { common, measurementForm: t } = useStrings();
  const { errors } = form.formState;

  const fieldError = (key: MeasureField): string | undefined => {
    const err = errors[key];
    if (!err) return undefined;
    // z.coerce turns an empty box into NaN; say something human instead.
    return err.type === 'invalid_type' || /nan/i.test(err.message ?? '') ? t.enterValue(t.fields[key].label) : err.message;
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="grid gap-3 sm:grid-cols-2">
        {MEASURE_FIELDS.map(({ key, optional }) => {
          const meta = t.fields[key];
          const { min, max } = rangeOf(key);
          const id = `${idPrefix}-${key}`;
          const error = fieldError(key);
          return (
            <div
              key={key}
              className={cn(
                'flex gap-3 rounded-lg border bg-surface p-3 transition-colors',
                error ? 'border-danger/60' : 'border-border focus-within:border-accent-500',
              )}
            >
              <div className="w-10 shrink-0 rounded-md bg-sand-50 p-1">
                <MeasurementDiagram field={key} label={t.diagramLabel(meta.label)} />
              </div>
              <FormField
                id={id}
                label={optional ? `${meta.label} (${common.optional})` : meta.label}
                error={error}
                hint={meta.help}
                className="min-w-0 flex-1"
              >
                <div className="relative max-w-[10rem]">
                  <Input
                    {...fieldAria(id, error, true)}
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min={min}
                    max={max}
                    placeholder={`${min}–${max}`}
                    className="h-10 pe-11 tabular-nums"
                    {...form.register(key, { setValueAs: toNumber })}
                  />
                  <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-muted">{t.unit}</span>
                </div>
              </FormField>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 rounded-lg border border-border bg-surface p-3 sm:grid-cols-[minmax(0,11rem)_1fr]">
        <FormField id={`${idPrefix}-name`} label={t.profileName} hint={t.profileNameHint} error={errors.name?.message}>
          <Input {...fieldAria(`${idPrefix}-name`, errors.name?.message, true)} maxLength={40} className="h-10" {...form.register('name')} />
        </FormField>
        <FormField
          id={`${idPrefix}-notes`}
          label={`${t.notes} (${common.optional})`}
          hint={t.notesHint}
          error={errors.notes?.message}
        >
          <Textarea
            {...fieldAria(`${idPrefix}-notes`, errors.notes?.message, true)}
            maxLength={300}
            rows={2}
            className="min-h-[4.5rem]"
            {...form.register('notes')}
          />
        </FormField>
      </div>
    </div>
  );
}
