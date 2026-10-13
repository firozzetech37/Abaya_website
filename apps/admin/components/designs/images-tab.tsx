'use client';

import type { AdminDesignDetail, AdminDesignImageDto } from '@abaya/contracts';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Sparkles, Star, Trash2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { AiImagesPanel } from './ai-images-panel';
import { FileDropzone } from '@/components/file-dropzone';
import { SafeImage } from '@/components/safe-image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect } from '@/components/ui/select';
import { strings } from '@/content/strings';
import { errorMessage } from '@/lib/api-client';
import { useOptionGroups } from '@/lib/queries/catalog';
import { useAttachDesignImage, useDeleteDesignImage, useUpdateDesignImages } from '@/lib/queries/designs';
import { uploadImage } from '@/lib/upload';
import { cn } from '@/lib/utils';

const t = strings.editor.images;

interface LocalImage {
  id: string;
  url: string;
  alt: string;
  isPrimary: boolean;
  /** The colour this photo shows; null = the main photoshoot (every colour). */
  colourValueId: string | null;
  /** A close-up detail shot (fabric, embroidery, hem…) for the website's craftsmanship gallery. */
  isDetail: boolean;
}

type ColourOption = { id: string; name: string };

const toLocal = (images: AdminDesignImageDto[]): LocalImage[] =>
  [...images]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((i) => ({ id: i.id, url: i.url, alt: i.alt ?? '', isPrimary: i.isPrimary, colourValueId: i.colourValueId, isDetail: i.isDetail }));

function SortableImage({
  image,
  index,
  designName,
  readOnly,
  colours,
  onAlt,
  onColour,
  onDetail,
  onPrimary,
  onDelete,
}: {
  image: LocalImage;
  index: number;
  designName: string;
  readOnly: boolean;
  colours: ColourOption[];
  onAlt: (alt: string) => void;
  onColour: (colourValueId: string | null) => void;
  onDetail: (isDetail: boolean) => void;
  onPrimary: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id, disabled: readOnly });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'overflow-hidden rounded-lg border bg-surface shadow-sm',
        image.isPrimary ? 'border-accent-500 ring-1 ring-accent-500' : 'border-border',
        isDragging && 'z-10 opacity-80 shadow-lg',
      )}
    >
      <div className="relative aspect-[3/4] bg-neutral-100">
        <SafeImage src={image.url} alt={image.alt || `${designName} ${index + 1}`} fallbackText={designName} sizes="240px" />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2">
          {image.isPrimary ? (
            <Badge tone="accent" className="bg-accent-50/95">
              <Star className="size-3 fill-current" aria-hidden /> {t.primary}
            </Badge>
          ) : (
            <span className="rounded-full bg-white/90 px-2 py-0.5 text-xs tabular-nums text-neutral-600">{index + 1}</span>
          )}
          {!readOnly ? (
            <button
              type="button"
              className="cursor-grab rounded-md bg-white/90 p-1.5 text-neutral-600 shadow-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 active:cursor-grabbing"
              aria-label={`${t.dragHandle}: ${image.alt || index + 1}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="space-y-2 p-2">
        <Input
          aria-label={t.alt}
          placeholder={t.altPlaceholder}
          value={image.alt}
          maxLength={200}
          disabled={readOnly}
          onChange={(e) => onAlt(e.target.value)}
          className="h-8 text-xs"
        />
        <NativeSelect
          aria-label={t.colour}
          title={t.colour}
          value={image.colourValueId ?? ''}
          disabled={readOnly}
          onChange={(e) => onColour(e.target.value || null)}
          className="h-8 text-xs"
        >
          <option value="">{t.allColours}</option>
          {colours.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        <label className="flex items-center gap-2 text-xs text-neutral-700">
          <Checkbox checked={image.isDetail} disabled={readOnly} onCheckedChange={(v) => onDetail(Boolean(v))} aria-label={t.detail} />
          {t.detail}
        </label>
        {!readOnly ? (
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={onPrimary} disabled={image.isPrimary}>
              <Star /> {t.makePrimary}
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label={strings.common.delete} className="text-danger hover:bg-red-50">
              <Trash2 />
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** Local, reorderable copy of the server images. Remounted (via key) whenever the server list changes. */
function ImagesEditor({ design, readOnly }: { design: AdminDesignDetail; readOnly: boolean }) {
  const [images, setImages] = React.useState<LocalImage[]>(() => toLocal(design.images));
  const [dirty, setDirty] = React.useState(false);
  const [deleting, setDeleting] = React.useState<LocalImage | null>(null);
  const updateImages = useUpdateDesignImages(design.id);
  const remove = useDeleteDesignImage(design.id);
  const groups = useOptionGroups();
  // The design's own colours first, then the rest of the active colour catalog.
  const offered = new Set(design.options.map((o) => o.optionValueId));
  const colours: ColourOption[] = (groups.data?.find((g) => g.code === 'COLOUR')?.values ?? [])
    .filter((v) => v.isActive)
    .sort((a, b) => Number(offered.has(b.id)) - Number(offered.has(a.id)) || a.sortOrder - b.sortOrder)
    .map((v) => ({ id: v.id, name: v.name }));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function edit(next: LocalImage[]) {
    setImages(next);
    setDirty(true);
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = images.findIndex((i) => i.id === e.active.id);
    const to = images.findIndex((i) => i.id === e.over!.id);
    edit(arrayMove(images, from, to));
  }

  async function save() {
    await updateImages.mutateAsync({
      images: images.map((i) => ({ id: i.id, alt: i.alt.trim() || null, isPrimary: i.isPrimary, colourValueId: i.colourValueId, isDetail: i.isDetail })),
    });
    toast.success(strings.common.saved);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-sm text-muted">{t.hint}</p>
          <p className="text-xs text-muted">{t.colourHint}</p>
        </div>
        {!readOnly && dirty ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-700">{t.unsaved}</span>
            <Button variant="secondary" size="sm" onClick={() => { setImages(toLocal(design.images)); setDirty(false); }}>
              {strings.common.cancel}
            </Button>
            <Button size="sm" onClick={() => void save().catch(() => undefined)} loading={updateImages.isPending}>
              {t.saveOrder}
            </Button>
          </div>
        ) : null}
      </div>

      {images.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">{t.empty}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={images.map((i) => i.id)} strategy={rectSortingStrategy}>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {images.map((img, index) => (
                <SortableImage
                  key={img.id}
                  image={img}
                  index={index}
                  designName={design.name}
                  readOnly={readOnly}
                  colours={colours}
                  onAlt={(alt) => edit(images.map((i) => (i.id === img.id ? { ...i, alt } : i)))}
                  onColour={(colourValueId) => edit(images.map((i) => (i.id === img.id ? { ...i, colourValueId } : i)))}
                  onDetail={(isDetail) => edit(images.map((i) => (i.id === img.id ? { ...i, isDetail } : i)))}
                  onPrimary={() => edit(images.map((i) => ({ ...i, isPrimary: i.id === img.id })))}
                  onDelete={() => setDeleting(img)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t.deleteTitle}
        description={t.deleteBody}
        tone="danger"
        confirmLabel={strings.common.delete}
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.id);
          toast.success(strings.common.saved);
        }}
      />
    </div>
  );
}

export function ImagesTab({ design, readOnly }: { design: AdminDesignDetail; readOnly: boolean }) {
  const [uploading, setUploading] = React.useState<string[]>([]);
  const [ai, setAi] = React.useState(false);
  const attach = useAttachDesignImage(design.id);

  async function onFiles(files: File[]) {
    setUploading(files.map((f) => f.name));
    let added = 0;
    let first = design.images.length === 0;
    for (const file of files) {
      try {
        const storagePath = await uploadImage(file, 'DESIGN_IMAGE');
        await attach.mutateAsync({ storagePath, isPrimary: first });
        first = false;
        added += 1;
      } catch (e) {
        toast.error(errorMessage(e, t.uploaded(0)));
      } finally {
        setUploading((u) => u.filter((n) => n !== file.name));
      }
    }
    if (added > 0) toast.success(t.uploaded(added));
  }

  // Any server change (upload, delete, save) produces a new signature and a fresh local copy.
  const signature = design.images
    .map((i) => `${i.id}:${i.sortOrder}:${i.isPrimary ? 1 : 0}:${i.colourValueId ?? ''}:${i.isDetail ? 1 : 0}:${i.alt ?? ''}`)
    .join('|');
  return (
    <div className="space-y-4">
      {!readOnly ? (
        <div className="space-y-3">
          <FileDropzone onFiles={(f) => void onFiles(f)} busy={uploading.length > 0} />
          {!ai ? (
            <Button variant="secondary" onClick={() => setAi(true)}>
              <Sparkles /> {strings.editor.aiImages.open}
            </Button>
          ) : (
            <AiImagesPanel design={design} onClose={() => setAi(false)} />
          )}
        </div>
      ) : null}
      {uploading.length > 0 ? (
        <ul className="space-y-1 text-xs text-muted" aria-live="polite">
          {uploading.map((n) => (
            <li key={n}>
              {strings.common.uploading} {n}
            </li>
          ))}
        </ul>
      ) : null}
      <ImagesEditor key={signature} design={design} readOnly={readOnly} />
    </div>
  );
}
