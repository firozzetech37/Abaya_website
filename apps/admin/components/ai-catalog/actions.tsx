'use client';

import {
  buildEditPrompt,
  CATALOG_ASPECT_RATIOS,
  CATALOG_EDIT_TYPES,
  CATALOG_POSES,
  CATALOG_REJECT_REASONS,
  CATALOG_SCORE_KEYS,
  type CatalogAspectRatio,
  type CatalogEditType,
  type CatalogImageDto,
  type CatalogJobDto,
  type CatalogPose,
  type CatalogRejectReason,
  CATALOG_BACKGROUNDS,
  classifyEdit,
  overallScore,
  referenceEdit,
  suggestPoses,
} from '@abaya/contracts';
import { AlertTriangle } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { STYLE_LABELS, strings } from '@/content/strings';
import { errorMessage } from '@/lib/api-client';
import {
  useCreateEdit,
  useCreatePoses,
  useCreateReframe,
  useReviewImage,
} from '@/lib/queries/ai-catalog';
import { uploadImage } from '@/lib/upload';
import { cn } from '@/lib/utils';
import { MaskPainter, type MaskPainterHandle } from './mask-painter';
import {
  costLabel,
  DirectionBox,
  type Photo,
  PhotoInput,
  PromptBox,
  type Settings,
  SettingsFields,
} from './shared';

const t = strings.aiCatalog;

function Shell({
  title,
  description,
  children,
  footer,
  onClose,
  size = 'md',
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  onClose: () => void;
  size?: 'md' | 'lg' | 'xl';
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size={size}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody className="space-y-4">{children}</DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {strings.common.cancel}
          </Button>
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Approve (optional scores) or reject (reasons required, optional scores and note). */
export function ReviewDialog({
  image,
  verdict,
  onClose,
}: {
  image: CatalogImageDto;
  verdict: 'APPROVED' | 'REJECTED';
  onClose: () => void;
}) {
  const review = useReviewImage();
  const [reasons, setReasons] = React.useState<CatalogRejectReason[]>(image.reasons);
  const [scores, setScores] = React.useState<Record<string, number | undefined>>(
    image.scores ?? {},
  );
  const [note, setNote] = React.useState(image.note ?? '');
  const [error, setError] = React.useState<string | null>(null);
  const overall = overallScore(scores as Record<string, number>);

  async function save() {
    if (verdict === 'REJECTED' && reasons.length === 0) {
      setError(t.reasonRequired);
      return;
    }
    const given = Object.fromEntries(
      Object.entries(scores).filter(([, v]) => typeof v === 'number'),
    );
    try {
      await review.mutateAsync({
        imageId: image.id,
        body: {
          review: verdict,
          reasons: verdict === 'REJECTED' ? reasons : [],
          scores: given,
          note: note.trim() || undefined,
        },
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Shell
      title={verdict === 'APPROVED' ? t.approveTitle : t.reviewTitle}
      description={verdict === 'APPROVED' ? t.approveBody : t.reviewBody}
      onClose={onClose}
      size="lg"
      footer={
        <Button
          variant={verdict === 'APPROVED' ? 'primary' : 'danger'}
          loading={review.isPending}
          onClick={() => void save()}
        >
          {verdict === 'APPROVED' ? t.approve : t.reject}
        </Button>
      }
    >
      {verdict === 'REJECTED' ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t.reasonRequired.replace('.', '')}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CATALOG_REJECT_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={reasons.includes(r)}
                  onCheckedChange={(v) => {
                    setError(null);
                    setReasons((cur) => (v === true ? [...cur, r] : cur.filter((x) => x !== r)));
                  }}
                />
                {t.reasons[r]}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <fieldset>
        <legend className="mb-2 flex items-center gap-2 text-sm font-medium">
          {t.scoresTitle}
          {overall !== null ? <Badge tone="accent">{`${t.overall} ${overall}`}</Badge> : null}
        </legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {CATALOG_SCORE_KEYS.map((k) => (
            <label key={k} className="flex items-center justify-between gap-2 text-sm">
              <span>{t.scores[k]}</span>
              <NativeSelect
                aria-label={t.scores[k]}
                className="w-20"
                value={scores[k] ?? ''}
                onChange={(e) =>
                  setScores((s) => ({
                    ...s,
                    [k]: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              >
                <option value="">—</option>
                {Array.from({ length: 10 }, (_, i) => 10 - i).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </NativeSelect>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={t.note} htmlFor="review-note" optional>
        <Textarea
          id="review-note"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </Shell>
  );
}

/** Poses from an approved master (FASHN edit), each keeping model, abaya and background. */
export function PosesDialog({
  job,
  image,
  onClose,
  onDone,
}: {
  job: CatalogJobDto;
  image: CatalogImageDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const poses = useCreatePoses();
  // The poses that best show this abaya's style and embroidery are ticked to start with.
  const recommended = suggestPoses({ style: job.style ?? undefined, embroidery: job.embroidery });
  const [chosen, setChosen] = React.useState<CatalogPose[]>(recommended);
  const [direction, setDirection] = React.useState('');
  const [back, setBack] = React.useState<Photo | null>(null);
  const [settings, setSettings] = React.useState<Settings>({
    resolution: '2k',
    mode: 'balanced',
    numImages: 1,
  });
  const hasBack = Boolean(back || job.inputs.backUrl);

  async function make() {
    try {
      await poses.mutateAsync({
        imageId: image.id,
        body: {
          poses: chosen,
          backPath: back?.path,
          direction: direction.trim() || undefined,
          resolution: settings.resolution,
          mode: settings.mode,
        },
      });
      toast.success(t.queued);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Shell
      title={t.posesTitle}
      description={t.posesBody}
      onClose={onClose}
      size="lg"
      footer={
        <Button
          disabled={chosen.length === 0}
          loading={poses.isPending}
          onClick={() => void make()}
        >
          {t.makePoses(costLabel('EDIT', { ...settings, numImages: 1 }, chosen.length))}
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {CATALOG_POSES.map((p) => (
          <label
            key={p}
            className="flex items-center gap-2 rounded-md border border-border p-2 text-sm has-[:checked]:border-accent-400 has-[:checked]:bg-accent-50/50"
          >
            <Checkbox
              checked={chosen.includes(p)}
              onCheckedChange={(v) =>
                setChosen((c) => (v === true ? [...c, p] : c.filter((x) => x !== p)))
              }
            />
            <span className="min-w-0">
              {t.poseLabels[p]}
              {recommended.includes(p) ? (
                <span className="block text-[11px] text-accent-700">
                  ★{' '}
                  {job.style ? t.recommended(STYLE_LABELS[job.style]) : t.recommended('this abaya')}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
      <DirectionBox id="pose-direction" value={direction} onChange={setDirection} />
      {chosen.includes('BACK') && !job.inputs.backUrl ? (
        <PhotoInput label={t.abayaBack} hint={t.abayaBackHint} value={back} onChange={setBack} />
      ) : null}
      {chosen.includes('BACK') && !hasBack ? (
        <p className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t.backMissing}
        </p>
      ) : null}
      <SettingsFields
        value={settings}
        onChange={setSettings}
        kind="EDIT"
        showCount={false}
        count={chosen.length}
      />
    </Shell>
  );
}

/** A controlled design edit: one change, detected type, editable prompt, optional painted area. */
export function EditDialog({
  job,
  image,
  onClose,
  onDone,
}: {
  job: CatalogJobDto;
  image: CatalogImageDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const edit = useCreateEdit();
  const painter = React.useRef<MaskPainterHandle>(null);
  const [instruction, setInstruction] = React.useState('');
  const [typeOverride, setTypeOverride] = React.useState<CatalogEditType | ''>('');
  const [prompt, setPrompt] = React.useState<string | null>(null);
  const [painting, setPainting] = React.useState(false);
  const [painted, setPainted] = React.useState(false);
  const [reference, setReference] = React.useState<Photo | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [settings, setSettings] = React.useState<Settings>({
    resolution: '2k',
    mode: 'balanced',
    numImages: 1,
  });
  const detected = instruction.trim().length >= 3 ? classifyEdit(instruction) : 'OTHER';
  const editType = typeOverride || detected;
  const built = instruction.trim().length >= 3 ? buildEditPrompt(editType, instruction) : '';

  async function apply() {
    if (instruction.trim().length < 3) return;
    setBusy(true);
    try {
      const file = painting && painted ? await painter.current?.toFile() : null;
      const maskPath = file ? await uploadImage(file, 'CATALOG_INPUT') : undefined;
      await edit.mutateAsync({
        imageId: image.id,
        body: {
          instruction: instruction.trim(),
          editType,
          prompt: prompt ?? undefined,
          maskPath,
          contextPath: reference?.path,
          ...settings,
        },
      });
      toast.success(t.queued);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell
      title={t.editTitle}
      description={t.editBody}
      onClose={onClose}
      size="xl"
      footer={
        <Button
          disabled={instruction.trim().length < 3}
          loading={busy}
          onClick={() => void apply()}
        >
          {t.applyEdit(costLabel('EDIT', settings))}
        </Button>
      }
    >
      <div className="grid gap-5 md:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <Field label={t.instruction} htmlFor="edit-instruction">
            <Textarea
              id="edit-instruction"
              rows={2}
              maxLength={400}
              autoFocus
              placeholder={t.instructionPlaceholder}
              value={instruction}
              onChange={(e) => {
                setInstruction(e.target.value);
                setPrompt(null);
              }}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">{t.detected}:</span>
            <NativeSelect
              aria-label={t.detected}
              className="w-48"
              value={editType}
              onChange={(e) => {
                setTypeOverride(e.target.value as CatalogEditType);
                setPrompt(null);
              }}
            >
              {CATALOG_EDIT_TYPES.map((k) => (
                <option key={k} value={k}>
                  {t.editTypes[k]}
                </option>
              ))}
            </NativeSelect>
          </div>
          {job.references.length ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t.applyReference}</p>
              <div className="flex flex-wrap gap-2">
                {job.references.map((r) => {
                  const active = reference?.path === r.path;
                  return (
                    <button
                      key={r.path}
                      type="button"
                      onClick={() => {
                        const e = referenceEdit(r);
                        setInstruction(e.instruction);
                        setTypeOverride(e.editType);
                        setReference({ path: r.path, preview: r.url });
                        setPrompt(null);
                      }}
                      className={cn(
                        'flex items-center gap-2 rounded-md border p-1.5 pr-2.5 text-left text-xs transition',
                        active
                          ? 'border-accent-500 bg-accent-50/60'
                          : 'border-border hover:bg-neutral-50',
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
                      <img src={r.url} alt="" className="size-9 rounded object-cover" />
                      <span>
                        <span className="block font-medium">{t.referenceTypes[r.type]}</span>
                        {r.note ? (
                          <span className="block max-w-40 truncate text-muted">{r.note}</span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted">{t.applyReferenceHint}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">{t.quickBackground}</span>
            <NativeSelect
              aria-label={t.quickBackground}
              className="w-60"
              value=""
              onChange={(e) => {
                const b = CATALOG_BACKGROUNDS.find((x) => x.id === e.target.value);
                if (!b) return;
                setInstruction(`Change the background to a ${b.prompt}`);
                setTypeOverride('BACKGROUND');
                setPrompt(null);
              }}
            >
              <option value="">—</option>
              {CATALOG_BACKGROUNDS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          {built ? <PromptBox built={built} override={prompt} onOverride={setPrompt} /> : null}
          <PhotoInput
            label={t.referencePhoto}
            hint={t.referenceHint}
            value={reference}
            onChange={setReference}
          />
          <SettingsFields value={settings} onChange={setSettings} kind="EDIT" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t.mask}</p>
          <p className="text-xs text-muted">{t.maskHint}</p>
          {painting ? (
            <MaskPainter ref={painter} src={image.url} onPaintedChange={setPainted} />
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
              <img src={image.url} alt="" className="w-full rounded-lg ring-1 ring-border" />
              <Button type="button" size="sm" variant="secondary" onClick={() => setPainting(true)}>
                {t.drawMask}
              </Button>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}

export function ReframeDialog({
  image,
  onClose,
  onDone,
}: {
  image: CatalogImageDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const reframe = useCreateReframe();
  const [aspect, setAspect] = React.useState<CatalogAspectRatio>('4:5');
  const [settings, setSettings] = React.useState<Settings>({
    resolution: '2k',
    mode: 'balanced',
    numImages: 1,
  });

  async function go() {
    try {
      await reframe.mutateAsync({
        imageId: image.id,
        body: { aspectRatio: aspect, resolution: settings.resolution, mode: settings.mode },
      });
      toast.success(t.queued);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Shell
      title={t.reframeTitle}
      description={t.reframeBody}
      onClose={onClose}
      footer={
        <Button loading={reframe.isPending} onClick={() => void go()}>
          {t.doReframe(costLabel('REFRAME', settings))}
        </Button>
      }
    >
      <Field label={t.aspect} htmlFor="reframe-aspect">
        <NativeSelect
          id="reframe-aspect"
          value={aspect}
          onChange={(e) => setAspect(e.target.value as CatalogAspectRatio)}
        >
          {CATALOG_ASPECT_RATIOS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <SettingsFields value={settings} onChange={setSettings} kind="REFRAME" showCount={false} />
    </Shell>
  );
}
