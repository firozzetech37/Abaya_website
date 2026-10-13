'use client';

import {
  createReferenceBody,
  REFERENCE_STATUSES,
  REFERENCE_TRANSITIONS,
  type ReferenceDto,
  type ReferenceStatus,
} from '@abaya/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { ExternalLink, PenTool, Sparkles, Upload, X } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AiMatchBadge, AiPanel } from '@/components/ai/ai-panel';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { NewDesignDialog } from '@/components/designs/new-design-dialog';
import { FileDropzone } from '@/components/file-dropzone';
import { PageHeader } from '@/components/page-header';
import { SafeImage } from '@/components/safe-image';
import { EmptyState, ErrorState, ForbiddenState } from '@/components/states';
import { ReferenceStatusBadge } from '@/components/status-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { REFERENCE_STATUS_LABELS, strings } from '@/content/strings';
import { errorMessage } from '@/lib/api-client';
import { useCurrentUser } from '@/lib/current-user';
import { formatDate } from '@/lib/format';
import { useUrlState } from '@/lib/hooks/use-url-state';
import { useApplyReferenceAi, useDismissReferenceAi, useReferenceAi } from '@/lib/queries/ai';
import { useCreateReference, useReference, useReferences, useStaffDirectory, useUpdateReference } from '@/lib/queries/references';
import { parseTags } from '@/lib/tags';
import { uploadImage } from '@/lib/upload';
import { cn } from '@/lib/utils';

const r = strings.references;

const uploadForm = createReferenceBody.omit({ imagePath: true, tags: true, sourceUrl: true }).extend({
  sourceUrl: z.union([z.literal(''), z.string().url()]),
  tagsText: z.string().max(500),
});
type UploadValues = z.input<typeof uploadForm>;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function UploadReferenceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateReference();
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const form = useForm<UploadValues>({
    resolver: zodResolver(uploadForm),
    defaultValues: { title: '', sourceUrl: '', licenseNote: '', tagsText: '' },
  });
  const { errors } = form.formState;

  function choose(f: File | undefined) {
    if (preview) URL.revokeObjectURL(preview);
    setFile(f ?? null);
    setPreview(f ? URL.createObjectURL(f) : null);
    setFileError(null);
  }

  function close() {
    choose(undefined);
    form.reset();
    onOpenChange(false);
  }

  const onSubmit = form.handleSubmit(async (v) => {
    if (!file) {
      setFileError(r.image);
      return;
    }
    try {
      const imagePath = await uploadImage(file, 'REFERENCE_IMAGE');
      const body = createReferenceBody.parse({
        imagePath,
        title: v.title || undefined,
        sourceUrl: v.sourceUrl || undefined,
        licenseNote: v.licenseNote || undefined,
        tags: parseTags(v.tagsText),
      });
      await create.mutateAsync(body);
      toast.success(r.created);
      close();
    } catch (e) {
      setFileError(errorMessage(e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent size="md">
        <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{r.uploadTitle}</DialogTitle>
            <DialogDescription>{r.uploadDescription}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {preview ? (
              <div className="relative mx-auto aspect-[3/4] w-40 overflow-hidden rounded-md border border-border bg-neutral-100">
                {/* Local blob preview of the chosen file. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt={file?.name ?? ''} className="size-full object-cover" />
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded-full bg-white/90 p-1 shadow"
                  aria-label={strings.common.remove}
                  onClick={() => choose(undefined)}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <FileDropzone multiple={false} onFiles={(f) => choose(f[0])} />
            )}
            {fileError ? (
              <p role="alert" className="text-xs text-danger">
                {fileError}
              </p>
            ) : null}
            <Field label={r.titleLabel} htmlFor="ref-title" optional error={errors.title?.message}>
              <Input id="ref-title" {...form.register('title')} />
            </Field>
            <Field label={r.sourceUrl} htmlFor="ref-src" optional error={errors.sourceUrl?.message}>
              <Input id="ref-src" type="url" placeholder="https://" {...form.register('sourceUrl')} />
            </Field>
            <Field label={r.licenseNote} htmlFor="ref-lic" optional error={errors.licenseNote?.message}>
              <Textarea id="ref-lic" rows={2} {...form.register('licenseNote')} />
            </Field>
            <Field label={r.tags} htmlFor="ref-tags" hint={strings.designs.tagsHint} optional>
              <Input id="ref-tags" {...form.register('tagsText')} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={close}>
              {strings.common.cancel}
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              <Upload /> {r.upload}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Suggested tags and look-alikes for one reference (tags only: style and alt text are for designs). */
function ReferenceAiDialog({ reference, onClose }: { reference: ReferenceDto; onClose: () => void }) {
  const me = useCurrentUser();
  const query = useReferenceAi(reference.id);
  const apply = useApplyReferenceAi(reference.id);
  const dismiss = useDismissReferenceAi(reference.id);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{strings.ai.insights}</DialogTitle>
          <DialogDescription>{reference.title ?? strings.ai.untitledReference}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <AiPanel
            query={query}
            canEdit={me.can('manageCatalog')}
            withStyleAndAlt={false}
            applying={apply.isPending}
            dismissing={dismiss.isPending}
            onApply={(choice) => apply.mutateAsync({ tags: choice.tags })}
            onDismiss={() => dismiss.mutateAsync()}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function ReferenceCard({ reference, highlighted }: { reference: ReferenceDto; highlighted?: boolean }) {
  const me = useCurrentUser();
  const isManager = me.can('manageCatalog');
  const update = useUpdateReference();
  const designers = useStaffDirectory('DESIGNER', isManager);
  const [rejecting, setRejecting] = React.useState(false);
  const [notes, setNotes] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [showAi, setShowAi] = React.useState(false);

  const moves = REFERENCE_TRANSITIONS[reference.status].filter((s) => s !== 'DESIGNED' && s !== 'REJECTED');
  const canReject = REFERENCE_TRANSITIONS[reference.status].includes('REJECTED');

  async function move(status: ReferenceStatus, reviewNotes?: string) {
    await update.mutateAsync({ id: reference.id, body: { status, ...(reviewNotes ? { reviewNotes } : {}) } });
    toast.success(r.statusChanged);
  }

  return (
    <Card className={cn('flex flex-col overflow-hidden', highlighted && 'ring-2 ring-accent-500')}>
      <div className="relative aspect-[3/4] bg-neutral-100">
        <SafeImage src={reference.imageUrl} alt={reference.title ?? r.titleLabel} sizes="320px" />
        <div className="absolute left-2 top-2">
          <ReferenceStatusBadge status={reference.status} />
        </div>
        <AiMatchBadge level={reference.aiMatch} className="absolute right-2 top-2" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <p className="line-clamp-1 text-sm font-medium">{reference.title ?? '—'}</p>
          <p className="text-xs text-muted">
            {reference.source.replace('_', ' ').toLowerCase()} · {formatDate(reference.importedAt)}
          </p>
        </div>
        {reference.sourceUrl ? (
          <a
            href={reference.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-accent-700 hover:underline"
          >
            {hostOf(reference.sourceUrl)} <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : null}
        {reference.licenseNote ? <p className="line-clamp-2 text-xs text-muted">{reference.licenseNote}</p> : null}
        {reference.tags.length ? (
          <div className="flex flex-wrap gap-1">
            {reference.tags.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        ) : null}
        {reference.reviewNotes ? <p className="rounded bg-neutral-50 px-2 py-1 text-xs text-neutral-700">{reference.reviewNotes}</p> : null}
        {reference.designIds.length ? (
          <p className="text-xs">
            {reference.designIds.map((id, i) => (
              <Link key={id} href={`/designs/${id}`} className="mr-2 text-accent-700 hover:underline">
                {i === 0 ? r.linkedDesigns(reference.designIds.length) : `#${i + 1}`}
              </Link>
            ))}
          </p>
        ) : null}

        <div className="mt-auto space-y-2 pt-2">
          {isManager ? (
            <NativeSelect
              aria-label={r.assignDesigner}
              value={reference.assignedDesigner?.id ?? ''}
              disabled={update.isPending || designers.isPending}
              onChange={(e) =>
                void update
                  .mutateAsync({ id: reference.id, body: { assignedDesignerId: e.target.value || null } })
                  .then(() => toast.success(r.assigned))
                  .catch(() => undefined)
              }
              className="h-8 text-xs"
            >
              <option value="">{r.unassigned}</option>
              {reference.assignedDesigner && !designers.data?.some((d) => d.id === reference.assignedDesigner!.id) ? (
                <option value={reference.assignedDesigner.id}>{reference.assignedDesigner.name ?? reference.assignedDesigner.email}</option>
              ) : null}
              {designers.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name ?? d.email}
                </option>
              ))}
            </NativeSelect>
          ) : reference.assignedDesigner ? (
            <p className="text-xs text-muted">{reference.assignedDesigner.name ?? reference.assignedDesigner.email}</p>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            {isManager
              ? moves.map((s) => (
                  <Button key={s} size="sm" variant="secondary" disabled={update.isPending} onClick={() => void move(s).catch(() => undefined)}>
                    {r.statusActions[s]}
                  </Button>
                ))
              : null}
            {isManager && canReject ? (
              <Button size="sm" variant="danger-outline" onClick={() => setRejecting(true)}>
                {r.reject}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setShowAi(true)}>
              <Sparkles /> {strings.ai.insights}
            </Button>
            {reference.status === 'NEEDS_DESIGN' && me.can('editDesigns') ? (
              <Button size="sm" onClick={() => setCreating(true)}>
                <PenTool /> {r.createDesign}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title={r.rejectTitle}
        description={r.rejectBody}
        tone="danger"
        confirmLabel={r.reject}
        onConfirm={() => move('REJECTED', notes.trim() || undefined)}
      >
        <Field label={r.rejectNotes} htmlFor={`rej-${reference.id}`} optional>
          <Textarea id={`rej-${reference.id}`} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </Field>
      </ConfirmDialog>
      {showAi ? <ReferenceAiDialog reference={reference} onClose={() => setShowAi(false)} /> : null}
      <NewDesignDialog
        open={creating}
        onOpenChange={setCreating}
        referenceId={reference.id}
        defaultName={reference.title ?? ''}
        title={r.createDesignTitle}
        description={r.createDesignBody}
      />
    </Card>
  );
}

function FocusedReference({ id, onClose }: { id: string; onClose: () => void }) {
  const ref = useReference(id);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{r.title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {ref.isPending ? <Skeleton className="aspect-[3/4]" /> : ref.isError ? <ErrorState error={ref.error} /> : <ReferenceCard reference={ref.data} />}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function ReferencesView() {
  const me = useCurrentUser();
  const { params, set } = useUrlState();
  const raw = params.get('status');
  const status = (REFERENCE_STATUSES as readonly string[]).includes(raw ?? '') ? (raw as ReferenceStatus) : undefined;
  const focus = params.get('focus');
  const query = useReferences(status, me.can('viewReferences'));
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const [uploading, setUploading] = React.useState(false);

  if (!me.can('viewReferences')) return <ForbiddenState />;
  const isManager = me.can('manageCatalog');

  return (
    <>
      <PageHeader
        title={r.title}
        subtitle={r.subtitle}
        actions={
          isManager ? (
            <Button onClick={() => setUploading(true)}>
              <Upload /> {r.upload}
            </Button>
          ) : null
        }
      />
      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {[undefined, ...REFERENCE_STATUSES].map((s) => (
          <button
            key={s ?? 'all'}
            role="tab"
            type="button"
            aria-selected={s === status}
            onClick={() => set({ status: s ?? null })}
            className={cn(
              '-mb-px h-10 whitespace-nowrap border-b-2 px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
              s === status ? 'border-primary text-foreground' : 'border-transparent text-muted hover:text-foreground',
            )}
          >
            {s ? REFERENCE_STATUS_LABELS[s] : strings.common.all}
          </button>
        ))}
      </div>

      {query.isError ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      ) : query.isPending ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/5]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState title={isManager ? r.empty : r.emptyDesigner} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {items.map((ref) => (
            <ReferenceCard key={ref.id} reference={ref} highlighted={ref.id === focus} />
          ))}
        </div>
      )}
      {query.hasNextPage ? (
        <div className="mt-4 text-center">
          <Button variant="secondary" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>
            {strings.common.loadMore}
          </Button>
        </div>
      ) : null}

      {isManager ? <UploadReferenceDialog open={uploading} onOpenChange={setUploading} /> : null}
      {focus && !items.some((i) => i.id === focus) && !query.isPending ? (
        <FocusedReference id={focus} onClose={() => set({ focus: null })} />
      ) : null}
    </>
  );
}

export default function ReferencesPage() {
  return (
    <React.Suspense fallback={<Skeleton className="h-96" />}>
      <ReferencesView />
    </React.Suspense>
  );
}
