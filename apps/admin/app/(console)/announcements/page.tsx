'use client';

import { type AdminAnnouncementDto, announcementBody } from '@abaya/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Languages, Pencil, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, ForbiddenState, TableSkeleton } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { strings } from '@/content/strings';
import { errorMessage } from '@/lib/api-client';
import { useCurrentUser } from '@/lib/current-user';
import { formatDateTime } from '@/lib/format';
import { useAnnouncements, useCreateAnnouncement, useDeleteAnnouncement, useTranslate, useUpdateAnnouncement } from '@/lib/queries/announcements';

const a = strings.announcements;

/** The form keeps dates as the <input type="datetime-local"> text; the API gets ISO strings. */
const formSchema = z
  .object({
    textEn: z.string().trim().min(2).max(140),
    textAr: z.string().trim().min(2).max(140),
    linkPath: z.string().trim().max(300),
    isActive: z.boolean(),
    startsAt: z.string(),
    endsAt: z.string(),
    sortOrder: z.coerce.number().int().min(0).max(1000),
  })
  .refine((v) => !v.startsAt || !v.endsAt || new Date(v.startsAt) < new Date(v.endsAt), { message: 'The end must be after the start.', path: ['endsAt'] });
type FormValues = z.input<typeof formSchema>;

const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

function AnnouncementDialog({ item, open, onOpenChange }: { item: AdminAnnouncementDto | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateAnnouncement();
  const update = useUpdateAnnouncement();
  const translate = useTranslate();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: item
      ? { textEn: item.textEn, textAr: item.textAr, linkPath: item.linkPath ?? '', isActive: item.isActive, startsAt: toLocalInput(item.startsAt), endsAt: toLocalInput(item.endsAt), sortOrder: item.sortOrder }
      : { textEn: '', textAr: '', linkPath: '', isActive: true, startsAt: '', endsAt: '', sortOrder: 0 },
  });
  const { errors } = form.formState;
  // The Arabic is drafted from the English (when leaving the field with the Arabic still empty, or on the button) for the editor to check.
  const draftArabic = async (force: boolean) => {
    const en = form.getValues('textEn').trim();
    if (en.length < 2 || (!force && form.getValues('textAr').trim())) return;
    try {
      const { textAr } = await translate.mutateAsync(en);
      form.setValue('textAr', textAr, { shouldDirty: true, shouldValidate: true });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const onSubmit = form.handleSubmit(async (v) => {
    const body = announcementBody.parse({ ...v, linkPath: v.linkPath || null, startsAt: toIso(v.startsAt), endsAt: toIso(v.endsAt) });
    try {
      if (item) await update.mutateAsync({ id: item.id, body });
      else await create.mutateAsync(body);
      toast.success(item ? a.saved : a.created);
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{item ? a.editTitle : a.createTitle}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Field label={a.textEn} htmlFor="an-en" error={errors.textEn?.message}>
              <Input id="an-en" autoFocus maxLength={140} {...form.register('textEn', { onBlur: () => void draftArabic(false) })} />
            </Field>
            <Field label={a.textAr} htmlFor="an-ar" hint={a.textArHint} error={errors.textAr?.message}>
              <div className="flex gap-2">
                <Input id="an-ar" dir="rtl" lang="ar" maxLength={140} className="flex-1" {...form.register('textAr')} />
                <Button type="button" variant="secondary" loading={translate.isPending} onClick={() => void draftArabic(true)}>
                  <Languages /> {a.translate}
                </Button>
              </div>
            </Field>
            <Field label={a.link} htmlFor="an-link" optional hint={a.linkHint} error={errors.linkPath?.message}>
              <Input id="an-link" placeholder="/collections/occasion" {...form.register('linkPath')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={a.startsAt} htmlFor="an-start" optional error={errors.startsAt?.message}>
                <Input id="an-start" type="datetime-local" {...form.register('startsAt')} />
              </Field>
              <Field label={a.endsAt} htmlFor="an-end" optional error={errors.endsAt?.message}>
                <Input id="an-end" type="datetime-local" {...form.register('endsAt')} />
              </Field>
            </div>
            <p className="-mt-2 text-xs text-muted">{a.datesHint}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={a.sortOrder} htmlFor="an-order" error={errors.sortOrder?.message}>
                <Input id="an-order" type="number" min={0} max={1000} {...form.register('sortOrder')} />
              </Field>
              <div className="flex items-end pb-2">
                <Controller
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} aria-label={a.activeLabel} />
                      {a.activeLabel}
                    </label>
                  )}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {strings.common.cancel}
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {item ? strings.common.save : strings.common.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function statusOf(x: AdminAnnouncementDto): { label: string; tone: 'success' | 'warning' | 'neutral' } {
  if (!x.isActive) return { label: a.off, tone: 'neutral' };
  if (x.live) return { label: a.live, tone: 'success' };
  if (x.startsAt && new Date(x.startsAt) > new Date()) return { label: a.scheduled, tone: 'warning' };
  return { label: a.ended, tone: 'neutral' };
}

export default function AnnouncementsPage() {
  const me = useCurrentUser();
  const list = useAnnouncements();
  const remove = useDeleteAnnouncement();
  const [editing, setEditing] = React.useState<AdminAnnouncementDto | null>(null);
  const [open, setOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<AdminAnnouncementDto | null>(null);
  if (!me.can('manageCatalog')) return <ForbiddenState />;
  const rows = list.data ?? [];

  return (
    <>
      <PageHeader
        title={a.title}
        subtitle={a.subtitle}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus /> {a.new}
          </Button>
        }
      />
      <p className="mb-4 text-sm text-muted">{a.hint}</p>
      <Card>
        {list.isPending ? (
          <TableSkeleton />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title={a.empty} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{a.colMessage}</TH>
                <TH>{a.colWhen}</TH>
                <TH className="text-right">{a.colOrder}</TH>
                <TH>{a.colStatus}</TH>
                <TH>
                  <span className="sr-only">{strings.common.edit}</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((x) => {
                const st = statusOf(x);
                return (
                  <TR key={x.id} className="hover:bg-neutral-50">
                    <TD>
                      <p className="font-medium">{x.textEn}</p>
                      <p dir="rtl" className="text-sm text-neutral-700">
                        {x.textAr}
                      </p>
                      {x.linkPath ? <p className="mt-0.5 font-mono text-xs text-muted">{x.linkPath}</p> : null}
                    </TD>
                    <TD className="text-sm text-neutral-700">
                      {!x.startsAt && !x.endsAt ? a.always : null}
                      {x.startsAt ? <p>{a.from(formatDateTime(x.startsAt))}</p> : null}
                      {x.endsAt ? <p>{a.until(formatDateTime(x.endsAt))}</p> : null}
                    </TD>
                    <TD className="text-right tabular-nums">{x.sortOrder}</TD>
                    <TD>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </TD>
                    <TD className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(x);
                          setOpen(true);
                        }}
                      >
                        <Pencil /> {strings.common.edit}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-danger hover:bg-red-50" onClick={() => setDeleting(x)}>
                        <Trash2 /> {strings.common.delete}
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      <AnnouncementDialog item={editing} open={open} onOpenChange={setOpen} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={a.deleteTitle}
        description={a.deleteBody}
        confirmLabel={strings.common.delete}
        tone="danger"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            toast.success(a.deleted);
            setDeleting(null);
          } catch (e) {
            toast.error(errorMessage(e));
            return false;
          }
        }}
      />
    </>
  );
}
