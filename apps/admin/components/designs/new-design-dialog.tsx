'use client';

import { ABAYA_STYLES, createDesignBody } from '@abaya/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { STYLE_LABELS, strings } from '@/content/strings';
import { useCreateDesign } from '@/lib/queries/designs';
import { parseTags } from '@/lib/tags';

/** Form shape: the contracts schema, with tags typed as comma-separated text. */
const formSchema = createDesignBody.omit({ tags: true, referenceId: true }).extend({ tagsText: z.string().max(500) });
type FormValues = z.input<typeof formSchema>;

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

export function NewDesignDialog({
  open,
  onOpenChange,
  referenceId,
  defaultName,
  title = strings.designs.createTitle,
  description = strings.designs.createDescription,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referenceId?: string;
  defaultName?: string;
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const create = useCreateDesign();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: defaultName ?? '', style: 'CLOSED', leadTimeDays: 12, tagsText: '', description: '' },
  });
  const { errors } = form.formState;

  React.useEffect(() => {
    if (open) form.reset({ name: defaultName ?? '', style: 'CLOSED', leadTimeDays: 12, tagsText: '', description: '' });
  }, [open, defaultName, form]);

  const onSubmit = form.handleSubmit(async ({ tagsText, ...values }) => {
    const body = createDesignBody.parse({ ...values, tags: parseTags(tagsText), referenceId });
    const detail = await create.mutateAsync(body);
    toast.success(strings.designs.created);
    onOpenChange(false);
    router.push(`/designs/${detail.id}`);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form noValidate onSubmit={(e) => void onSubmit(e).catch(() => undefined)} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label={strings.designs.name} htmlFor="nd-name" error={errors.name?.message}>
              <Input id="nd-name" autoFocus aria-invalid={Boolean(errors.name)} {...form.register('name')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={strings.designs.style} htmlFor="nd-style" error={errors.style?.message}>
                <NativeSelect id="nd-style" {...form.register('style')}>
                  {ABAYA_STYLES.map((s) => (
                    <option key={s} value={s}>
                      {STYLE_LABELS[s]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={strings.designs.leadTime} htmlFor="nd-lead" error={errors.leadTimeDays?.message}>
                <Input id="nd-lead" type="number" min={3} max={60} {...form.register('leadTimeDays', { valueAsNumber: true })} />
              </Field>
            </div>
            <Field label={strings.designs.slug} htmlFor="nd-slug" hint={strings.designs.slugHint} error={errors.slug?.message} optional>
              <Input id="nd-slug" className="font-mono" {...form.register('slug', { setValueAs: emptyToUndefined })} />
            </Field>
            <Field label={strings.designs.description} htmlFor="nd-desc" error={errors.description?.message} optional>
              <Textarea id="nd-desc" rows={3} {...form.register('description', { setValueAs: emptyToUndefined })} />
            </Field>
            <Field label={strings.designs.tags} htmlFor="nd-tags" hint={strings.designs.tagsHint} error={errors.tagsText?.message} optional>
              <Input id="nd-tags" {...form.register('tagsText')} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {strings.common.cancel}
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {strings.common.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
