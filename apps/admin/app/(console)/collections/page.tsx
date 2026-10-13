'use client';

import { type AdminCollectionDto, collectionBody } from '@abaya/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Clapperboard, Pencil, Plus, Search } from 'lucide-react';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { PageHeader } from '@/components/page-header';
import { Thumb } from '@/components/safe-image';
import { EmptyState, ErrorState, ForbiddenState, TableSkeleton } from '@/components/states';
import { DesignStatusBadge } from '@/components/status-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { strings } from '@/content/strings';
import { useCurrentUser } from '@/lib/current-user';
import { useDebounced } from '@/lib/hooks/use-debounced';
import { useCollections, useCreateCollection, useUpdateCollection } from '@/lib/queries/catalog';
import { useDesigns } from '@/lib/queries/designs';
import { errorMessage } from '@/lib/api-client';
import { uploadVideo, VIDEO_ACCEPT } from '@/lib/upload';

const c = strings.collections;
const formSchema = collectionBody.omit({ designIds: true });
type FormValues = z.input<typeof formSchema>;

function DesignPicker({ initial, onChange }: { initial: string[]; onChange: (ids: string[]) => void }) {
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(initial));
  const [search, setSearch] = React.useState('');
  const q = useDebounced(search.trim(), 300);
  const designs = useDesigns({ q: q || undefined });
  const items = designs.data?.pages.flatMap((p) => p.items) ?? [];

  function toggle(id: string, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
    onChange(Array.from(next));
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input aria-label={c.designsSearch} placeholder={c.designsSearch} className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <p className="text-xs text-muted">{c.designCount(selected.size)}</p>
      <div className="max-h-64 overflow-y-auto rounded-md border border-border">
        {designs.isPending ? (
          <TableSkeleton rows={4} cols={2} />
        ) : items.length === 0 ? (
          <p className="p-3 text-sm text-muted">{strings.designs.emptyFiltered}</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                <Checkbox id={`cd-${d.id}`} checked={selected.has(d.id)} onCheckedChange={(v) => toggle(d.id, Boolean(v))} />
                <Thumb src={d.primaryImageUrl} alt="" fallbackText={d.name} className="size-8" />
                <label htmlFor={`cd-${d.id}`} className="min-w-0 flex-1 truncate text-sm">
                  {d.name}
                </label>
                <DesignStatusBadge status={d.status} />
              </li>
            ))}
          </ul>
        )}
        {designs.hasNextPage ? (
          <div className="border-t border-border p-2 text-center">
            <Button variant="ghost" size="sm" onClick={() => void designs.fetchNextPage()} loading={designs.isFetchingNextPage}>
              {strings.common.loadMore}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CollectionDialog({ collection, open, onOpenChange }: { collection: AdminCollectionDto | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateCollection();
  const update = useUpdateCollection();
  const [designIds, setDesignIds] = React.useState<string[] | null>(null);
  // undefined = unchanged; a path = a new upload to save; null = remove the current video.
  const [videoPath, setVideoPath] = React.useState<string | null | undefined>(undefined);
  const [uploadingVideo, setUploadingVideo] = React.useState(false);
  const videoInput = React.useRef<HTMLInputElement>(null);
  const hasVideo = videoPath === undefined ? Boolean(collection?.videoUrl) : Boolean(videoPath);

  async function onVideoFile(file: File | undefined) {
    if (!file) return;
    setUploadingVideo(true);
    try {
      setVideoPath(await uploadVideo(file));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploadingVideo(false);
    }
  }

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: collection
      ? {
          name: collection.name,
          slug: collection.slug,
          description: collection.description ?? '',
          isActive: collection.isActive,
          sortOrder: collection.sortOrder,
        }
      : { name: '', slug: '', description: '', isActive: true, sortOrder: 0 },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (v) => {
    const body = { ...v, description: v.description || undefined, ...(designIds ? { designIds } : {}), ...(videoPath !== undefined ? { videoPath } : {}) };
    if (collection) {
      await update.mutateAsync({ id: collection.id, body });
      toast.success(c.saved);
    } else {
      await create.mutateAsync(collectionBody.parse(body));
      toast.success(c.created);
    }
    setDesignIds(null);
    setVideoPath(undefined);
    onOpenChange(false);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setDesignIds(null);
          setVideoPath(undefined);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent size="lg">
        <form noValidate onSubmit={(e) => void onSubmit(e).catch(() => undefined)} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{collection ? c.editTitle : c.createTitle}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={c.name} htmlFor="col-name" error={errors.name?.message}>
                <Input id="col-name" autoFocus {...form.register('name')} />
              </Field>
              <Field label={c.slug} htmlFor="col-slug" error={errors.slug?.message}>
                <Input id="col-slug" className="font-mono" {...form.register('slug')} />
              </Field>
            </div>
            <Field label={c.description} htmlFor="col-desc" optional error={errors.description?.message}>
              <Textarea id="col-desc" rows={2} {...form.register('description')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={c.sortOrder} htmlFor="col-order" error={errors.sortOrder?.message}>
                <Input id="col-order" type="number" min={0} max={1000} {...form.register('sortOrder', { valueAsNumber: true })} />
              </Field>
              <div className="flex items-end pb-2">
                <Controller
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} aria-label={c.activeLabel} />
                      {c.activeLabel}
                    </label>
                  )}
                />
              </div>
            </div>
            <div className="space-y-1.5 rounded-lg border border-border bg-neutral-50 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-neutral-800">
                <Clapperboard className="size-4 text-accent-700" aria-hidden />
                {c.video}
              </p>
              <p className="text-xs text-muted">{c.videoHint}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {hasVideo ? <Badge tone="success">{videoPath ? c.videoPending : c.videoAdded}</Badge> : null}
                <input ref={videoInput} type="file" accept={VIDEO_ACCEPT} className="sr-only" aria-label={c.videoChoose} onChange={(e) => void onVideoFile(e.target.files?.[0])} />
                <Button type="button" variant="secondary" size="sm" loading={uploadingVideo} onClick={() => videoInput.current?.click()}>
                  {uploadingVideo ? c.videoUploading : hasVideo ? c.videoReplace : c.videoChoose}
                </Button>
                {hasVideo ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setVideoPath(null)}>
                    {c.videoRemove}
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-neutral-800">{c.designs}</p>
              <p className="text-xs text-muted">{c.designsHint}</p>
              {/* Every member, published or not, so saving never drops unpublished designs. */}
              <DesignPicker key={collection?.id ?? 'new'} initial={collection?.designIds ?? []} onChange={setDesignIds} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {strings.common.cancel}
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting} disabled={uploadingVideo}>
              {collection ? strings.common.save : strings.common.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CollectionsPage() {
  const me = useCurrentUser();
  const collections = useCollections();
  const [editing, setEditing] = React.useState<AdminCollectionDto | null>(null);
  const [open, setOpen] = React.useState(false);

  if (!me.can('manageCatalog')) return <ForbiddenState />;
  const sorted = [...(collections.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        title={c.title}
        subtitle={c.subtitle}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus /> {c.new}
          </Button>
        }
      />
      <Card>
        {collections.isPending ? (
          <TableSkeleton />
        ) : collections.isError ? (
          <ErrorState error={collections.error} onRetry={() => void collections.refetch()} />
        ) : sorted.length === 0 ? (
          <EmptyState title={c.empty} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{c.colName}</TH>
                <TH className="text-right">{c.colDesigns}</TH>
                <TH className="text-right">{c.colOrder}</TH>
                <TH>{c.colStatus}</TH>
                <TH>
                  <span className="sr-only">{strings.common.edit}</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {sorted.map((col) => (
                <TR key={col.id} className="hover:bg-neutral-50">
                  <TD>
                    <p className="font-medium">{col.name}</p>
                    <p className="font-mono text-xs text-muted">{col.slug}</p>
                    {col.description ? <p className="mt-0.5 line-clamp-1 text-xs text-muted">{col.description}</p> : null}
                  </TD>
                  <TD className="text-right tabular-nums">{col.designCount}</TD>
                  <TD className="text-right tabular-nums">{col.sortOrder}</TD>
                  <TD>
                    <Badge tone={col.isActive ? 'success' : 'neutral'}>{col.isActive ? strings.common.active : strings.common.inactive}</Badge>
                  </TD>
                  <TD className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(col);
                        setOpen(true);
                      }}
                    >
                      <Pencil /> {strings.common.edit}
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <CollectionDialog collection={editing} open={open} onOpenChange={setOpen} />
    </>
  );
}
