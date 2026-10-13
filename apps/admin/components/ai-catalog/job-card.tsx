'use client';

import {
  BACK_CONSTRUCTION_UNVERIFIED,
  type CatalogImageDto,
  type CatalogJobDto,
} from '@abaya/contracts';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Crop,
  Expand,
  ImagePlus,
  Loader2,
  PersonStanding,
  RotateCcw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  UserRoundCheck,
  Wand2,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { strings } from '@/content/strings';
import { errorMessage } from '@/lib/api-client';
import { formatRelative } from '@/lib/format';
import {
  typicalSeconds,
  useMakeFinal,
  useRetryImage,
  useSaveModel,
} from '@/lib/queries/ai-catalog';
import { cn } from '@/lib/utils';
import { EditDialog, PosesDialog, ReframeDialog, ReviewDialog } from './actions';
import { AddToCatalogDialog } from './catalog-dialogs';
import { useElapsed } from './shared';

const t = strings.aiCatalog;

type Action = 'approve' | 'reject' | 'poses' | 'edit' | 'reframe' | 'use' | 'zoom';

/** One FASHN generation: progress while it runs, then its images with every action. */
export function JobCard({
  job,
  compact = false,
  onCleanedPhoto,
}: {
  job: CatalogJobDto;
  compact?: boolean;
  /** A background-removed abaya photo can be used for the next master. */
  onCleanedPhoto?: (image: CatalogImageDto) => void;
}) {
  const running = job.status === 'QUEUED' || job.status === 'RUNNING';
  const elapsed = useElapsed(job.createdAt, running);
  const [showPrompt, setShowPrompt] = React.useState(false);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-neutral-50/70 px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-semibold">{t.views[job.view] ?? job.view}</span>
          {job.editType ? <Badge tone="violet">{t.editTypes[job.editType]}</Badge> : null}
          <Badge tone={job.resolution === '4k' ? 'accent' : 'neutral'}>
            {job.resolution.toUpperCase()} · {t.modeLabels[job.mode]}
          </Badge>
          {job.retryOfImageId ? <Badge tone="warning">{t.retryBadge}</Badge> : null}
          {job.afterJobId ? <Badge tone="info">{t.chainedStep}</Badge> : null}
          {job.sketch && job.view === 'MASTER' ? <Badge tone="info">{t.sketchBadge}</Badge> : null}
          {job.provider === 'test' ? <Badge tone="warning">{t.testMode}</Badge> : null}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>{t.cost(job.credits)}</span>
          <span>{formatRelative(job.createdAt)}</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-foreground"
            onClick={() => setShowPrompt((s) => !s)}
          >
            {t.showPrompt}{' '}
            <ChevronDown
              className={cn('size-3.5 transition-transform', showPrompt && 'rotate-180')}
              aria-hidden
            />
          </button>
        </div>
      </div>

      {showPrompt ? (
        <div className="space-y-1 border-b border-border bg-neutral-50 px-4 py-3 text-xs text-neutral-700">
          {job.instruction ? (
            <p>
              <span className="font-medium">{t.instruction}:</span> {job.instruction}
            </p>
          ) : null}
          <p className="leading-relaxed">{job.prompt}</p>
          <p className="font-mono text-[11px] text-muted">
            {t.endpoint}: {job.endpoint} · {t.seed}: {job.seed} · {job.numImages}×
          </p>
        </div>
      ) : null}

      {job.view === 'MASTER' && job.references.length ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <span className="text-xs font-medium text-muted">{t.referencesTitle}</span>
          {job.references.map((r) => (
            <span
              key={r.path}
              className="flex items-center gap-1.5 rounded-md bg-neutral-50 p-1 pr-2 text-xs ring-1 ring-border"
              title={r.note ?? undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
              <img src={r.url} alt="" className="size-6 rounded object-cover" />
              {t.referenceTypes[r.type]}
            </span>
          ))}
        </div>
      ) : null}

      <div className="p-4">
        {running ? (
          <div className={cn('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4')}>
            {Array.from({ length: job.numImages }, (_, i) => (
              <div
                key={i}
                className="relative aspect-[4/5] overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-border"
              >
                <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-neutral-100 to-neutral-200" />
                {i === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center text-xs text-muted">
                    <Loader2 className="size-5 animate-spin text-accent-700" aria-hidden />
                    <span className="font-medium text-foreground">{job.stage}</span>
                    <span>
                      {elapsed} s · {t.usuallyTakes(typicalSeconds(job.resolution, job.mode))}
                    </span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : job.status === 'FAILED' ? (
          <p
            className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-900"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {job.error ?? t.failed}
          </p>
        ) : (
          <div className={cn('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4')}>
            {job.images.map((image, i) => (
              <ImageTile
                key={image.id}
                job={job}
                image={image}
                index={i}
                onCleanedPhoto={onCleanedPhoto}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function ImageTile({
  job,
  image,
  index,
  onCleanedPhoto,
}: {
  job: CatalogJobDto;
  image: CatalogImageDto;
  index: number;
  onCleanedPhoto?: (image: CatalogImageDto) => void;
}) {
  const [action, setAction] = React.useState<Action | null>(null);
  const retry = useRetryImage();
  const final = useMakeFinal();
  const save = useSaveModel();
  const approved = image.review === 'APPROVED';
  const rejected = image.review === 'REJECTED';
  const isFinal = job.resolution === '4k' && job.mode === 'quality';
  const isModel = job.view === 'MODEL';
  const isCleanup = job.view === 'CLEANUP';
  const unverified = image.flags.includes(BACK_CONSTRUCTION_UNVERIFIED);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast.success(done);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <figure className="space-y-2">
      <button
        type="button"
        onClick={() => setAction('zoom')}
        className={cn(
          'group relative block aspect-[4/5] w-full overflow-hidden rounded-xl bg-neutral-100 ring-2 transition focus-visible:outline-none focus-visible:ring-accent-500',
          approved ? 'ring-emerald-500' : rejected ? 'ring-red-400' : 'ring-transparent',
        )}
        aria-label={`${t.zoom} ${index + 1}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL */}
        <img src={image.url} alt="" className="size-full object-cover" />
        <span className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 opacity-0 shadow-sm transition group-hover:opacity-100">
          <Expand className="size-3.5" aria-hidden />
        </span>
        <span className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {approved ? <Badge tone="success">{t.approved}</Badge> : null}
          {image.designId ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">
              <Check className="size-3" aria-hidden /> {t.inCatalog}
            </span>
          ) : null}
          {rejected ? <Badge tone="danger">{t.rejected}</Badge> : null}
          {image.scores?.overall ? (
            <Badge tone="dark">{`${t.overall} ${image.scores.overall}`}</Badge>
          ) : null}
          {unverified ? (
            <Badge tone="warning" title={t.unverifiedBackHint}>
              {t.unverifiedBack}
            </Badge>
          ) : null}
        </span>
      </button>

      <figcaption className="flex flex-wrap gap-1.5">
        {isModel ? (
          <Button
            size="sm"
            loading={save.isPending}
            onClick={() =>
              void save.mutateAsync({ imageId: image.id }).then(
                (p) => toast.success(t.savedModel(p.name)),
                (e: unknown) => toast.error(errorMessage(e)),
              )
            }
          >
            <UserRoundCheck className="size-4" aria-hidden /> {t.saveAsModel}
          </Button>
        ) : isCleanup ? (
          <Button size="sm" onClick={() => onCleanedPhoto?.(image)}>
            <Check className="size-4" aria-hidden /> {t.useCleaned}
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant={approved ? 'primary' : 'secondary'}
              onClick={() => setAction('approve')}
              aria-label={t.approve}
            >
              <ThumbsUp className="size-4" aria-hidden />
            </Button>
            <Button
              size="sm"
              variant={rejected ? 'danger' : 'secondary'}
              onClick={() => setAction('reject')}
              aria-label={t.reject}
            >
              <ThumbsDown className="size-4" aria-hidden />
            </Button>
            {rejected && image.retriesLeft > 0 ? (
              <Button
                size="sm"
                variant="secondary"
                loading={retry.isPending}
                onClick={() => void run(() => retry.mutateAsync(image.id), t.queued)}
              >
                <RotateCcw className="size-4" aria-hidden /> {t.retry(image.retriesLeft)}
              </Button>
            ) : null}
            {approved && (job.view === 'MASTER' || job.view === 'EDIT') ? (
              <Button size="sm" onClick={() => setAction('poses')}>
                <PersonStanding className="size-4" aria-hidden /> {t.poses}
              </Button>
            ) : null}
            {approved && !isFinal ? (
              <Button
                size="sm"
                variant="secondary"
                loading={final.isPending}
                onClick={() => void run(() => final.mutateAsync(image.id), t.queued)}
              >
                <Sparkles className="size-4" aria-hidden /> {t.make4k}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setAction('edit')}>
              <Wand2 className="size-4" aria-hidden /> {t.edit}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAction('reframe')}>
              <Crop className="size-4" aria-hidden /> {t.reframe}
            </Button>
            {approved ? (
              <Button
                size="sm"
                variant={image.designId ? 'ghost' : 'secondary'}
                onClick={() => setAction('use')}
              >
                <ImagePlus className="size-4" aria-hidden /> {t.addToCatalog}
              </Button>
            ) : null}
          </>
        )}
      </figcaption>

      {action === 'approve' || action === 'reject' ? (
        <ReviewDialog
          image={image}
          verdict={action === 'approve' ? 'APPROVED' : 'REJECTED'}
          onClose={() => setAction(null)}
        />
      ) : null}
      {action === 'poses' ? (
        <PosesDialog
          job={job}
          image={image}
          onClose={() => setAction(null)}
          onDone={() => setAction(null)}
        />
      ) : null}
      {action === 'edit' ? (
        <EditDialog
          job={job}
          image={image}
          onClose={() => setAction(null)}
          onDone={() => setAction(null)}
        />
      ) : null}
      {action === 'reframe' ? (
        <ReframeDialog
          image={image}
          onClose={() => setAction(null)}
          onDone={() => setAction(null)}
        />
      ) : null}
      {action === 'use' ? (
        <AddToCatalogDialog job={job} image={image} onClose={() => setAction(null)} />
      ) : null}
      {action === 'zoom' ? (
        <CompareDialog job={job} image={image} onClose={() => setAction(null)} />
      ) : null}
    </figure>
  );
}

/** Full-size result next to the abaya photo (or the source image), to check every detail. */
function CompareDialog({
  job,
  image,
  onClose,
}: {
  job: CatalogJobDto;
  image: CatalogImageDto;
  onClose: () => void;
}) {
  const reference = job.inputs.abayaUrl ?? job.inputs.sourceUrl;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl" className="max-w-[min(96vw,1400px)]">
        <DialogHeader>
          <DialogTitle>{t.zoom}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className={cn('grid gap-4', reference && 'md:grid-cols-2')}>
            {reference ? (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                  {t.original}
                </p>
                <div className="max-h-[75vh] overflow-auto rounded-lg ring-1 ring-border">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
                  <img src={reference} alt={t.original} className="w-full" />
                </div>
              </div>
            ) : null}
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                {t.result}
              </p>
              <div className="max-h-[75vh] overflow-auto rounded-lg ring-1 ring-border">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, shown at full size to zoom */}
                <img
                  src={image.url}
                  alt={t.result}
                  className="w-full cursor-zoom-in"
                  onClick={(e) => e.currentTarget.classList.toggle('w-full')}
                />
              </div>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
