'use client';

import { type AdminDesignDetail, CATALOG_ASPECT_RATIOS, type CatalogAspectRatio, type CatalogJobDto, type CatalogModelProfileDto } from '@abaya/contracts';
import { Camera, Check, ChevronLeft, ChevronRight, Crop, Expand, Sparkles, Star, ThumbsDown, Wand2, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ColourPicker } from '@/components/ai-catalog/catalog-dialogs';
import { ModelGrid } from '@/components/ai-catalog/models';
import { costLabel, DirectionBox, type Settings, SettingsFields, useElapsed } from '@/components/ai-catalog/shared';
import { SafeImage } from '@/components/safe-image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { strings } from '@/content/strings';
import { errorMessage } from '@/lib/api-client';
import { useCreateDesignEdit, useCreateDesignPhotoshoot, useCreateDesignReframe, useDesignCatalogJobs, useReviewImage, useUseAsDesignPhoto } from '@/lib/queries/ai-catalog';
import { cn } from '@/lib/utils';

const t = strings.editor.aiImages;
const c = strings.aiCatalog;
type Kind = 'photoshoot' | 'edit' | 'reframe';

/**
 * "Make with AI" on a design's Images tab: the AI Catalog's photoshoot, edit and reframe, pointed
 * at this design's main photo, with the results listed right here and one click to add any of
 * them to the design's images. The same jobs, credits, limits and audit as the Studio.
 */
export function AiImagesPanel({ design, onClose }: { design: AdminDesignDetail; onClose: () => void }) {
  const hasPhoto = design.images.length > 0;
  const [kind, setKind] = React.useState<Kind>('edit');
  const [model, setModel] = React.useState<CatalogModelProfileDto | null>(null);
  const [direction, setDirection] = React.useState('');
  const [instruction, setInstruction] = React.useState('');
  const [aspect, setAspect] = React.useState<CatalogAspectRatio>('16:9');
  const [settings, setSettings] = React.useState<Settings>({ resolution: '2k', mode: 'balanced', numImages: 1 });
  const photoshoot = useCreateDesignPhotoshoot();
  const edit = useCreateDesignEdit();
  const reframe = useCreateDesignReframe();
  const jobs = useDesignCatalogJobs(design.id);
  const busy = photoshoot.isPending || edit.isPending || reframe.isPending;
  const jobKind = kind === 'photoshoot' ? 'TRYON' : kind === 'edit' ? 'EDIT' : 'REFRAME';
  const ready = hasPhoto && (kind === 'photoshoot' ? Boolean(model) : kind === 'edit' ? instruction.trim().length >= 3 : true);

  async function start() {
    try {
      if (kind === 'photoshoot' && model) {
        await photoshoot.mutateAsync({ designId: design.id, body: { modelProfileId: model.id, direction: direction.trim() || undefined, style: design.style, resolution: settings.resolution, mode: settings.mode } });
      } else if (kind === 'edit') {
        await edit.mutateAsync({ designId: design.id, body: { instruction: instruction.trim(), resolution: settings.resolution, mode: settings.mode, numImages: settings.numImages } });
        setInstruction('');
      } else {
        await reframe.mutateAsync({ designId: design.id, body: { aspectRatio: aspect, resolution: settings.resolution, mode: settings.mode } });
      }
      toast.success(c.queued);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <section aria-labelledby="ai-images-title" className="rounded-xl border border-gold-300/60 bg-gradient-to-br from-amber-50/60 via-surface to-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="ai-images-title" className="flex items-center gap-2 font-display text-xl font-semibold">
            <Sparkles className="size-4 text-amber-600" aria-hidden /> {t.title}
          </h3>
          <p className="mt-1 text-sm text-muted">{t.body}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={strings.common.close}>
          <X />
        </Button>
      </div>

      {!hasPhoto ? <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{t.needPhoto}</p> : null}

      <div role="tablist" aria-label={t.title} className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ['photoshoot', Camera],
            ['edit', Wand2],
            ['reframe', Crop],
          ] as const
        ).map(([k, Icon]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
              kind === k ? 'border-primary bg-primary text-white' : 'border-border bg-surface hover:border-neutral-400',
            )}
          >
            <Icon className="size-4" aria-hidden /> {t.kinds[k]}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          {kind === 'photoshoot' ? (
            <>
              <p className="text-sm text-neutral-700">{t.photoshootHint}</p>
              <ModelGrid selectedId={model?.id ?? null} onSelect={setModel} />
              <DirectionBox id="ai-images-direction" value={direction} onChange={setDirection} />
            </>
          ) : kind === 'edit' ? (
            <>
              <p className="text-sm text-neutral-700">{t.editHint}</p>
              <Field label={c.instruction} htmlFor="ai-images-instruction">
                <Textarea id="ai-images-instruction" rows={2} maxLength={400} placeholder={c.instructionPlaceholder} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <p className="text-sm text-neutral-700">{t.reframeHint}</p>
              <Field label={c.aspect} htmlFor="ai-images-aspect">
                <NativeSelect id="ai-images-aspect" className="w-40" value={aspect} onChange={(e) => setAspect(e.target.value as CatalogAspectRatio)}>
                  {CATALOG_ASPECT_RATIOS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </>
          )}
        </div>
        <div className="space-y-3">
          <SettingsFields value={settings} onChange={setSettings} kind={jobKind} showCount={kind === 'edit'} />
          <Button className="w-full" disabled={!ready} loading={busy} onClick={() => void start()}>
            <Sparkles /> {t.start(costLabel(jobKind, settings, kind === 'edit' ? settings.numImages : 1))}
          </Button>
        </div>
      </div>

      <h4 className="mt-6 text-sm font-medium text-neutral-800">{t.results}</h4>
      {jobs.data && jobs.data.length === 0 ? <p className="mt-2 text-sm text-muted">{t.noResults}</p> : null}
      <ul className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(jobs.data ?? []).map((job) => (
          <ResultCard key={job.id} job={job} design={design} />
        ))}
      </ul>
    </section>
  );
}

function ResultCard({ job, design }: { job: CatalogJobDto; design: AdminDesignDetail }) {
  const running = job.status === 'QUEUED' || job.status === 'RUNNING';
  const elapsed = useElapsed(job.createdAt, running);
  const use = useUseAsDesignPhoto();
  const review = useReviewImage();
  const [colour, setColour] = React.useState('');
  const [adding, setAdding] = React.useState<string | null>(null);
  /** The result open full size (index into job.images), or null. */
  const [viewing, setViewing] = React.useState<number | null>(null);

  // Adding approves first when the image is still pending: one click, no trip to the Studio.
  async function reject(img: CatalogJobDto['images'][number]) {
    try {
      await review.mutateAsync({ imageId: img.id, body: { review: 'REJECTED', reasons: ['OTHER'] } });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function add(img: CatalogJobDto['images'][number], primary: boolean) {
    setAdding(img.id);
    try {
      if (img.review !== 'APPROVED') await review.mutateAsync({ imageId: img.id, body: { review: 'APPROVED' } });
      await use.mutateAsync({ imageId: img.id, designId: design.id, primary, colourValueId: colour || undefined });
      toast.success(t.added);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setAdding(null);
    }
  }

  return (
    <li className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs">
        <span className="font-medium">{c.views[job.view] ?? job.view}</span>
        {running ? (
          <span className="text-muted">
            {job.stage} · {elapsed}s
          </span>
        ) : job.status === 'FAILED' ? (
          <Badge tone="danger">{t.failed}</Badge>
        ) : (
          <Badge tone="success">{c.cost(job.credits)}</Badge>
        )}
      </div>
      {running ? (
        <div className="aspect-[4/5] animate-pulse bg-neutral-100" aria-busy="true" />
      ) : job.status === 'FAILED' ? (
        <p className="p-3 text-xs text-danger">{job.error}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-1 p-1">
          {job.images.map((img) => {
            const inDesign = img.designId === design.id;
            return (
              <li key={img.id} className="space-y-1">
                <div className="group relative aspect-[4/5] overflow-hidden rounded-md bg-neutral-100">
                  <SafeImage src={img.url} alt="" fallbackText={design.name} sizes="240px" />
                  <button
                    type="button"
                    onClick={() => setViewing(job.images.indexOf(img))}
                    aria-label={t.enlarge(job.images.indexOf(img) + 1)}
                    title={t.enlarge(job.images.indexOf(img) + 1)}
                    className="absolute inset-0 cursor-zoom-in rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500"
                  >
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1.5 text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <Expand className="size-3.5" aria-hidden />
                    </span>
                  </button>
                  {inDesign ? (
                    <Badge tone="success" className="absolute left-1.5 top-1.5">{t.alreadyAdded}</Badge>
                  ) : img.review === 'APPROVED' ? (
                    <Badge tone="success" className="absolute left-1.5 top-1.5">
                      <Check className="size-3" aria-hidden /> {c.approved}
                    </Badge>
                  ) : img.review === 'REJECTED' ? (
                    <Badge tone="neutral" className="absolute left-1.5 top-1.5">{c.rejected}</Badge>
                  ) : null}
                </div>
                {!inDesign && img.review !== 'REJECTED' ? (
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" className="flex-1" loading={adding === img.id} onClick={() => void add(img, false)} title={t.addHint}>
                      {t.addToImages}
                    </Button>
                    <Button size="icon-sm" variant="ghost" title={t.addAsPrimary} aria-label={t.addAsPrimary} disabled={adding === img.id} onClick={() => void add(img, true)}>
                      <Star />
                    </Button>
                    <Button size="icon-sm" variant="ghost" title={c.reject} aria-label={c.reject} disabled={adding === img.id || review.isPending} onClick={() => void reject(img)}>
                      <ThumbsDown />
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {!running && job.status === 'DONE' && job.images.some((i) => i.designId !== design.id) ? (
        <div className="border-t border-border px-3 py-2">
          <ColourPicker id={`ai-colour-${job.id}`} value={colour} onChange={setColour} />
        </div>
      ) : null}
      {viewing !== null && job.images[viewing] ? (
        <ResultViewer
          job={job}
          index={viewing}
          designName={design.name}
          designId={design.id}
          adding={adding}
          rejecting={review.isPending}
          onIndex={setViewing}
          onAdd={(img, primary) => void add(img, primary)}
          onReject={(img) => void reject(img)}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </li>
  );
}

/**
 * One result full size beside the photo it was made from, to check every detail. Arrow keys and
 * the side buttons move between this job's results; click the result to see it at its real size.
 */
function ResultViewer({
  job,
  index,
  designName,
  designId,
  adding,
  rejecting,
  onIndex,
  onAdd,
  onReject,
  onClose,
}: {
  job: CatalogJobDto;
  index: number;
  designName: string;
  designId: string;
  adding: string | null;
  rejecting: boolean;
  onIndex: (i: number) => void;
  onAdd: (img: CatalogJobDto['images'][number], primary: boolean) => void;
  onReject: (img: CatalogJobDto['images'][number]) => void;
  onClose: () => void;
}) {
  const [actualSize, setActualSize] = React.useState(false);
  const img = job.images[index]!;
  const count = job.images.length;
  const original = job.inputs.sourceUrl ?? job.inputs.abayaUrl;
  const go = (by: number) => {
    setActualSize(false);
    onIndex((index + by + count) % count);
  };
  const inDesign = img.designId === designId;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="xl"
        className="max-w-[min(96vw,1400px)]"
        onKeyDown={(e) => {
          if (count < 2) return;
          if (e.key === 'ArrowRight') go(1);
          if (e.key === 'ArrowLeft') go(-1);
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {c.views[job.view] ?? job.view} · {t.resultOf(index + 1, count)}
          </DialogTitle>
          <DialogDescription>{t.viewerHint}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className={cn('grid gap-4', original && 'md:grid-cols-2')}>
            {original ? (
              <figure>
                <figcaption className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{t.original}</figcaption>
                <div className="flex max-h-[72vh] justify-center overflow-auto rounded-lg bg-neutral-50 ring-1 ring-border">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
                  <img src={original} alt={t.original} className="max-h-[72vh] w-auto object-contain" />
                </div>
              </figure>
            ) : null}
            <figure>
              <figcaption className="mb-1 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted">
                <span>{t.result}</span>
                {inDesign ? <Badge tone="success">{t.alreadyAdded}</Badge> : null}
              </figcaption>
              <div className="relative flex max-h-[72vh] justify-center overflow-auto rounded-lg bg-neutral-50 ring-1 ring-border">
                <button
                  type="button"
                  onClick={() => setActualSize((v) => !v)}
                  aria-label={actualSize ? t.fitToScreen : t.actualSize}
                  title={actualSize ? t.fitToScreen : t.actualSize}
                  className={cn('block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500', actualSize ? 'cursor-zoom-out' : 'cursor-zoom-in')}
                >
                  {img.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed URL, shown at full size to check details
                    <img
                      src={img.url}
                      alt={`${designName} · ${t.result}`}
                      className={actualSize ? 'max-w-none' : 'max-h-[72vh] w-auto object-contain'}
                    />
                  ) : null}
                </button>
                {count > 1 ? (
                  <>
                    <Button
                      size="icon-sm"
                      variant="secondary"
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full"
                      aria-label={t.previous}
                      onClick={() => go(-1)}
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="secondary"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full"
                      aria-label={t.next}
                      onClick={() => go(1)}
                    >
                      <ChevronRight />
                    </Button>
                  </>
                ) : null}
              </div>
            </figure>
          </div>
        </DialogBody>
        {!inDesign && img.review !== 'REJECTED' ? (
          <DialogFooter>
            <Button variant="ghost" disabled={adding === img.id || rejecting} onClick={() => onReject(img)}>
              <ThumbsDown /> {c.reject}
            </Button>
            <Button variant="secondary" disabled={adding === img.id} onClick={() => onAdd(img, true)}>
              <Star /> {t.addAsPrimary}
            </Button>
            <Button loading={adding === img.id} onClick={() => onAdd(img, false)}>
              {t.addToImages}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
