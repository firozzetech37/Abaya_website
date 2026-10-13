'use client';

import { type AdminOptionGroupDto, type AdminOptionValueDto, paise, upsertOptionValueBody, isSwatchGroup } from '@abaya/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, MoneyInput } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { strings } from '@/content/strings';
import { rupeesInputToPaise } from '@/lib/format';
import { useCreateOptionValue } from '@/lib/queries/catalog';

const o = strings.options;
const HEX = /^#[0-9A-Fa-f]{6}$/;

const validMoney = (t: string) => {
  const p = rupeesInputToPaise(t);
  return p !== null && paise.safeParse(p).success;
};

/** "Mauve Satin" → "mauve-satin" (the code customers never see; it cannot change later). */
const codeFrom = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const addValueForm = upsertOptionValueBody
  .omit({ surchargeInPaise: true, groupCode: true, colourHex: true })
  .extend({ surcharge: z.string().refine(validMoney, strings.common.moneyInvalid), colourHex: z.string() });
type AddValues = z.input<typeof addValueForm>;

/**
 * Add a value to an option group (a fabric, a colour, a sleeve style…). Shared by Options & sizes
 * and a design's Options & price tab, where the new value is ticked for that design straight away.
 */
export function AddValueDialog({
  group,
  open,
  onOpenChange,
  onCreated,
}: {
  group: AdminOptionGroupDto;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated?: (value: AdminOptionValueDto) => void;
}) {
  const create = useCreateOptionValue();
  const isColour = isSwatchGroup(group.code);
  const [codeEdited, setCodeEdited] = React.useState(false);
  const form = useForm<AddValues>({
    resolver: zodResolver(addValueForm),
    defaultValues: { code: '', name: '', description: '', surcharge: '0', colourHex: '', isActive: true },
  });
  const { errors } = form.formState;
  const hex = useWatch({ control: form.control, name: 'colourHex' }) ?? '';

  const onSubmit = form.handleSubmit(async (v) => {
    if (v.colourHex && !HEX.test(v.colourHex)) {
      form.setError('colourHex', { message: o.colourHint });
      return;
    }
    const body = upsertOptionValueBody.parse({
      groupCode: group.code,
      code: v.code,
      name: v.name,
      description: v.description || undefined,
      surchargeInPaise: rupeesInputToPaise(v.surcharge),
      colourHex: isColour && v.colourHex ? v.colourHex.toUpperCase() : undefined,
      isActive: v.isActive,
    });
    const created = await create.mutateAsync(body);
    toast.success(o.valueCreated);
    form.reset();
    setCodeEdited(false);
    onCreated?.(created);
    onOpenChange(false);
  });

  const name = form.register('name');
  const code = form.register('code');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form noValidate onSubmit={(e) => void onSubmit(e).catch(() => undefined)} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{o.addValueTitle(group.name)}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Field label={o.name} htmlFor="ov-name" error={errors.name?.message}>
              <Input
                id="ov-name"
                autoFocus
                {...name}
                onChange={(e) => {
                  void name.onChange(e);
                  // The code follows the name until it is edited by hand.
                  if (!codeEdited) form.setValue('code', codeFrom(e.target.value), { shouldValidate: form.formState.isSubmitted });
                }}
              />
            </Field>
            <Field label={o.code} htmlFor="ov-code" hint={o.codeHint} error={errors.code?.message}>
              <Input
                id="ov-code"
                className="font-mono"
                {...code}
                onChange={(e) => {
                  setCodeEdited(true);
                  void code.onChange(e);
                }}
              />
            </Field>
            <Field label={o.surcharge} htmlFor="ov-surcharge" error={errors.surcharge?.message}>
              <MoneyInput id="ov-surcharge" {...form.register('surcharge')} />
            </Field>
            {isColour ? (
              <Field label={o.colour} htmlFor="ov-hex" hint={o.colourHint} error={errors.colourHex?.message}>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={o.colour}
                    className="h-9 w-12 shrink-0 cursor-pointer rounded border border-border bg-surface p-0.5"
                    value={HEX.test(hex) ? hex : '#1C1A18'}
                    onChange={(e) => form.setValue('colourHex', e.target.value.toUpperCase(), { shouldValidate: true })}
                  />
                  <Input id="ov-hex" className="font-mono" placeholder="#1C1A18" {...form.register('colourHex')} />
                </div>
              </Field>
            ) : null}
            <Field label={o.description} htmlFor="ov-desc" optional error={errors.description?.message}>
              <Textarea id="ov-desc" rows={2} {...form.register('description')} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {strings.common.cancel}
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {strings.common.add}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
