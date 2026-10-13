'use client';

import { ABAYA_STYLES, type AdminDesignDetail, paise, updateDesignBody } from '@abaya/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input, MoneyInput } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { STYLE_LABELS, strings } from '@/content/strings';
import { useCurrentUser } from '@/lib/current-user';
import { paiseToRupeesInput, rupeesInputToPaise } from '@/lib/format';
import { useCollections } from '@/lib/queries/catalog';
import { useUpdateDesign } from '@/lib/queries/designs';
import { parseTags, tagsToText } from '@/lib/tags';

const s = strings.designs;

const moneyText = z
  .string()
  .refine((v) => v.trim() === '' || (rupeesInputToPaise(v) !== null && paise.safeParse(rupeesInputToPaise(v)).success), {
    message: strings.common.moneyInvalid,
  });

/** Contracts' updateDesignBody fields, with tags as text and money as ₹ text. */
const detailsSchema = updateDesignBody
  .pick({ name: true, slug: true, description: true, style: true, leadTimeDays: true })
  .required({ name: true, style: true, leadTimeDays: true })
  .extend({ tagsText: z.string().max(500), makingCost: moneyText, collectionIds: z.array(z.string()) });
type DetailsValues = z.input<typeof detailsSchema>;

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

export function DetailsTab({ design, readOnly }: { design: AdminDesignDetail; readOnly: boolean }) {
  const me = useCurrentUser();
  const isCatalogManager = me.can('manageCatalog');
  const collections = useCollections();
  const update = useUpdateDesign(design.id);

  const form = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      name: design.name,
      slug: design.slug,
      description: design.description ?? '',
      style: design.style,
      leadTimeDays: design.leadTimeDays,
      tagsText: tagsToText(design.tags),
      makingCost: paiseToRupeesInput(design.makingCostInPaise),
      collectionIds: design.collectionIds,
    },
  });
  const { errors, isDirty, isSubmitting } = form.formState;
  const selectedCollections = useWatch({ control: form.control, name: 'collectionIds' });

  const onSubmit = form.handleSubmit(async (v) => {
    const making = rupeesInputToPaise(v.makingCost);
    const body = updateDesignBody.parse({
      name: v.name,
      slug: v.slug,
      description: v.description,
      style: v.style,
      leadTimeDays: v.leadTimeDays,
      tags: parseTags(v.tagsText),
      ...(making !== null ? { makingCostInPaise: making } : {}),
      ...(isCatalogManager ? { collectionIds: v.collectionIds } : {}),
    });
    const saved = await update.mutateAsync(body);
    form.reset({
      name: saved.name,
      slug: saved.slug,
      description: saved.description ?? '',
      style: saved.style,
      leadTimeDays: saved.leadTimeDays,
      tagsText: tagsToText(saved.tags),
      makingCost: paiseToRupeesInput(saved.makingCostInPaise),
      collectionIds: saved.collectionIds,
    });
    toast.success(strings.editor.detailsSaved);
  });

  return (
    <form noValidate onSubmit={(e) => void onSubmit(e).catch(() => undefined)}>
      <fieldset disabled={readOnly} className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={s.name} htmlFor="d-name" error={errors.name?.message}>
                <Input id="d-name" aria-invalid={Boolean(errors.name)} {...form.register('name')} />
              </Field>
              <Field label={s.slug} htmlFor="d-slug" error={errors.slug?.message}>
                <Input id="d-slug" className="font-mono" {...form.register('slug', { setValueAs: emptyToUndefined })} />
              </Field>
              <Field label={s.style} htmlFor="d-style" error={errors.style?.message}>
                <NativeSelect id="d-style" {...form.register('style')}>
                  {ABAYA_STYLES.map((st) => (
                    <option key={st} value={st}>
                      {STYLE_LABELS[st]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={s.leadTime} htmlFor="d-lead" error={errors.leadTimeDays?.message}>
                <Input id="d-lead" type="number" min={3} max={60} {...form.register('leadTimeDays', { valueAsNumber: true })} />
              </Field>
            </div>
            <Field label={s.description} htmlFor="d-desc" error={errors.description?.message} optional>
              <Textarea id="d-desc" rows={6} maxLength={2000} {...form.register('description')} />
            </Field>
            <Field label={s.tags} htmlFor="d-tags" hint={s.tagsHint} error={errors.tagsText?.message} optional>
              <Input id="d-tags" {...form.register('tagsText')} />
            </Field>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4">
              <Field label={s.makingCost} htmlFor="d-making" hint={s.makingCostHint} error={errors.makingCost?.message} optional>
                <MoneyInput id="d-making" aria-invalid={Boolean(errors.makingCost)} {...form.register('makingCost')} />
              </Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{s.collections}</CardTitle>
            </CardHeader>
            <CardContent>
              {!isCatalogManager ? <p className="mb-2 text-xs text-muted">{s.collectionsHint}</p> : null}
              {collections.isPending ? (
                <Skeleton className="h-16" />
              ) : collections.isError ? (
                <p className="text-xs text-muted">{strings.common.errorTitle}</p>
              ) : collections.data.length === 0 ? (
                <p className="text-xs text-muted">{strings.collections.empty}</p>
              ) : (
                <ul className="space-y-2">
                  {collections.data.map((c) => {
                    const checked = selectedCollections.includes(c.id);
                    return (
                      <li key={c.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`col-${c.id}`}
                          checked={checked}
                          disabled={!isCatalogManager || readOnly}
                          onCheckedChange={(v) =>
                            form.setValue(
                              'collectionIds',
                              v ? [...selectedCollections, c.id] : selectedCollections.filter((x) => x !== c.id),
                              { shouldDirty: true },
                            )
                          }
                        />
                        <label htmlFor={`col-${c.id}`} className="text-sm">
                          {c.name}
                          {!c.isActive ? <span className="ml-1 text-xs text-muted">({strings.common.inactive})</span> : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </fieldset>
      {!readOnly ? (
        <div className="sticky bottom-0 mt-4 flex items-center justify-end gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
          {isDirty ? <span className="text-xs text-amber-700">{strings.editor.images.unsaved}</span> : null}
          <Button variant="secondary" disabled={!isDirty || isSubmitting} onClick={() => form.reset()}>
            {strings.common.cancel}
          </Button>
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
            {strings.common.save}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
