'use client';

import {
  FABRIC_WIDTHS_CM,
  finishedCm,
  missingForCutting,
  type PatternBody,
  type PatternStationDto,
  suggestFabricLengthCm,
  type WorkshopItemDetail,
} from '@abaya/contracts';
import {
  Camera,
  CheckCircle2,
  CircleAlert,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Save,
  Scissors,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { strings } from '@/content/strings';
import { errorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { useAdvanceJob, usePattern, useSavePattern } from '@/lib/queries/workshop';
import { PATTERN_FILE_ACCEPT, uploadPatternFile } from '@/lib/upload';
import { cn } from '@/lib/utils';
import { metres, PatternFileLink, PatternView } from './pattern-view';

const pt = strings.workshop.pattern;

type Draft = PatternBody & { files: (PatternBody['files'][number] & { url?: string })[] };

/** Starting form: the latest draft, else the latest version (a new version after a QC send-back), else the prefill. */
function initialDraft(data: PatternStationDto): Draft {
  const c = data.current;
  if (c) {
    return {
      measurements: c.measurements.map(({ key, bodyCm, easeCm }) => ({ key, bodyCm, easeCm })),
      pieces: c.pieces,
      fabricWidthCm: c.fabricWidthCm,
      fabricLengthCm: c.fabricLengthCm,
      liningLengthCm: c.liningLengthCm,
      seamAllowanceMm: c.seamAllowanceMm,
      notes: c.notes,
      files: c.files.map(({ path, name, contentType, url }) => ({ path, name, contentType, url })),
    };
  }
  return {
    measurements: data.suggestion.measurements.map(({ key, bodyCm, easeCm }) => ({
      key,
      bodyCm,
      easeCm,
    })),
    pieces: data.suggestion.pieces,
    fabricWidthCm: 150,
    fabricLengthCm: null,
    liningLengthCm: null,
    seamAllowanceMm: 10,
    notes: '',
    files: [],
  };
}

const toBody = (d: Draft): PatternBody => ({
  ...d,
  files: d.files.map(({ path, name, contentType }) => ({ path, name, contentType })),
});

function Stepper({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="size-9"
        onClick={() => onChange(Math.max(1, value - 1))}
        aria-label="−"
      >
        <Minus />
      </Button>
      <span className="w-8 text-center text-sm font-semibold tabular-nums">{value}</span>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="size-9"
        onClick={() => onChange(Math.min(20, value + 1))}
        aria-label="+"
      >
        <Plus />
      </Button>
    </div>
  );
}

/**
 * The pattern technician's form on the job card: measurements + ease → finished sizes,
 * pieces, fabric, files and notes. Saves drafts; "Confirm & send to cutting" saves, then
 * moves the job on (the API refuses an incomplete pattern).
 */
export function PatternEditor({ item }: { item: WorkshopItemDetail }) {
  const query = usePattern(item.id);
  if (query.isPending) return <Skeleton className="h-96 rounded-xl" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data;
  if (!data.editable) {
    return (
      <div className="space-y-3">
        <p className="rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
          {item.stage === 'SPEC_APPROVED' ? pt.startHint : pt.readOnlyHint}
        </p>
        {data.current ? <PatternView pattern={data.current} /> : null}
      </div>
    );
  }
  // A new version (first save, or after a QC send-back) starts a fresh form.
  return <PatternForm key={data.current?.id ?? 'new'} item={item} data={data} />;
}

function PatternForm({ item, data }: { item: WorkshopItemDetail; data: PatternStationDto }) {
  const router = useRouter();
  const save = useSavePattern(item.id);
  const advance = useAdvanceJob(item.id);
  const [draft, setDraft] = React.useState<Draft>(() => initialDraft(data));
  const [dirty, setDirty] = React.useState(false);
  const [uploading, setUploading] = React.useState(0);
  const [confirming, setConfirming] = React.useState(false);
  const [otherWidth, setOtherWidth] = React.useState(
    () =>
      draft.fabricWidthCm !== null &&
      !(FABRIC_WIDTHS_CM as readonly number[]).includes(draft.fabricWidthCm),
  );
  const fileInput = React.useRef<HTMLInputElement>(null);
  const cameraInput = React.useRef<HTMLInputElement>(null);

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const missing = missingForCutting(toBody(draft));
  const body = (key: string) => draft.measurements.find((m) => m.key === key);
  const suggestedLength = (() => {
    const len = body('fullLengthCm');
    const sleeve = body('sleeveLengthCm');
    if (!len?.bodyCm || !draft.fabricWidthCm) return null;
    return suggestFabricLengthCm({
      style: data.suggestion.style,
      fullLengthCm: finishedCm(len.bodyCm, len.easeCm),
      sleeveLengthCm: sleeve?.bodyCm ? finishedCm(sleeve.bodyCm, sleeve.easeCm) : 0,
      fabricWidthCm: draft.fabricWidthCm,
    });
  })();

  async function addFiles(list: FileList | null) {
    if (!list) return;
    for (const file of Array.from(list)) {
      setUploading((n) => n + 1);
      try {
        const uploaded = await uploadPatternFile(file);
        setDraft((d) => ({
          ...d,
          files: [...d.files, { ...uploaded, url: URL.createObjectURL(file) }],
        }));
        setDirty(true);
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function saveDraft() {
    await save.mutateAsync(toBody(draft));
    setDirty(false);
    toast.success(pt.saved);
  }

  async function sendToCutting() {
    await save.mutateAsync(toBody(draft));
    setDirty(false);
    await advance.mutateAsync({ to: 'CUTTING' });
    toast.success(pt.sent);
    router.push('/workshop/pattern');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-2xl font-semibold">{pt.title}</h2>
        <Badge tone="warning">
          {pt.version(
            data.current?.status === 'DRAFT'
              ? data.current.version
              : (data.current?.version ?? 0) + 1,
          )}
        </Badge>
        {dirty ? <Badge>{pt.unsaved}</Badge> : null}
      </div>

      {/* Measurements */}
      <Card>
        <CardHeader>
          <CardTitle>{pt.measurements}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted">{pt.measurementsHint}</p>
          <div className="grid grid-cols-[1fr_4.5rem_5.5rem_4.5rem] items-center gap-x-2 gap-y-1.5 text-sm sm:grid-cols-[1fr_6rem_7rem_6rem]">
            <span className="text-xs font-medium text-muted">{pt.point}</span>
            <span className="text-right text-xs font-medium text-muted">{pt.body}</span>
            <span className="text-right text-xs font-medium text-muted">{pt.ease}</span>
            <span className="text-right text-xs font-medium text-muted">{pt.finished}</span>
            {draft.measurements.map((m, i) => {
              const given =
                data.suggestion.measurements.find((s) => s.key === m.key)?.bodyCm ?? null;
              const setRow = (patch: Partial<typeof m>) =>
                update({
                  measurements: draft.measurements.map((x, j) =>
                    j === i ? { ...x, ...patch } : x,
                  ),
                });
              return (
                <React.Fragment key={m.key}>
                  <label htmlFor={`ease-${m.key}`} className="truncate">
                    {pt.points[m.key] ?? m.key}
                  </label>
                  {given !== null ? (
                    <span className="text-right tabular-nums text-muted">{m.bodyCm}</span>
                  ) : (
                    <Input
                      aria-label={`${pt.body} ${pt.points[m.key]}`}
                      inputMode="decimal"
                      className="h-9 text-right tabular-nums"
                      value={m.bodyCm ?? ''}
                      onChange={(e) =>
                        setRow({
                          bodyCm: e.target.value === '' ? null : Number(e.target.value) || 0,
                        })
                      }
                    />
                  )}
                  <Input
                    id={`ease-${m.key}`}
                    inputMode="decimal"
                    type="number"
                    step={0.5}
                    className="h-9 text-right tabular-nums"
                    value={m.easeCm}
                    onChange={(e) => setRow({ easeCm: Number(e.target.value) || 0 })}
                  />
                  <span className="text-right font-semibold tabular-nums">
                    {m.bodyCm === null ? '—' : finishedCm(m.bodyCm, m.easeCm)}
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Pieces */}
      <Card>
        <CardHeader className="flex-wrap">
          <CardTitle>{pt.pieces}</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => update({ pieces: data.suggestion.pieces })}
          >
            <RotateCcw /> {pt.resetPieces}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {draft.pieces.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                aria-label={pt.pieceName}
                className="h-10 min-w-0 flex-1"
                value={p.name}
                maxLength={60}
                onChange={(e) =>
                  update({
                    pieces: draft.pieces.map((x, j) =>
                      j === i ? { ...x, name: e.target.value } : x,
                    ),
                  })
                }
              />
              <Stepper
                label={pt.pieceCount}
                value={p.count}
                onChange={(count) =>
                  update({ pieces: draft.pieces.map((x, j) => (j === i ? { ...x, count } : x)) })
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={pt.removePiece(p.name)}
                onClick={() => update({ pieces: draft.pieces.filter((_, j) => j !== i) })}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => update({ pieces: [...draft.pieces, { name: '', count: 1 }] })}
          >
            <Plus /> {pt.addPiece}
          </Button>
        </CardContent>
      </Card>

      {/* Fabric */}
      <Card>
        <CardHeader>
          <CardTitle>{pt.fabric}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-medium">{pt.fabricWidth}</p>
            <div className="flex flex-wrap gap-2">
              {FABRIC_WIDTHS_CM.map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={!otherWidth && draft.fabricWidthCm === w}
                  onClick={() => {
                    setOtherWidth(false);
                    update({ fabricWidthCm: w });
                  }}
                  className={cn(
                    'h-10 rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                    !otherWidth && draft.fabricWidthCm === w
                      ? 'border-accent-700 bg-accent-700 text-white'
                      : 'border-border bg-surface hover:bg-neutral-50',
                  )}
                >
                  {pt.widthCm(w)}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={otherWidth}
                onClick={() => setOtherWidth(true)}
                className={cn(
                  'h-10 rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                  otherWidth
                    ? 'border-accent-700 bg-accent-700 text-white'
                    : 'border-border bg-surface hover:bg-neutral-50',
                )}
              >
                {pt.otherWidth}
              </button>
              {otherWidth ? (
                <Input
                  aria-label={pt.fabricWidth}
                  inputMode="numeric"
                  className="h-10 w-24 tabular-nums"
                  value={draft.fabricWidthCm ?? ''}
                  onChange={(e) =>
                    update({
                      fabricWidthCm: e.target.value
                        ? Math.round(Number(e.target.value)) || null
                        : null,
                    })
                  }
                />
              ) : null}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={pt.fabricLength} htmlFor="fabric-length">
              <div className="flex gap-2">
                <Input
                  id="fabric-length"
                  type="number"
                  step={0.1}
                  inputMode="decimal"
                  className="tabular-nums"
                  value={draft.fabricLengthCm === null ? '' : draft.fabricLengthCm / 100}
                  onChange={(e) =>
                    update({
                      fabricLengthCm: e.target.value
                        ? Math.round(Number(e.target.value) * 100)
                        : null,
                    })
                  }
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={suggestedLength === null}
                  onClick={() => suggestedLength && update({ fabricLengthCm: suggestedLength })}
                  title={suggestedLength ? pt.suggested(metres(suggestedLength)) : undefined}
                >
                  {pt.suggest}
                </Button>
              </div>
            </Field>
            <Field label={pt.liningLength} htmlFor="lining-length" optional>
              <div className="flex items-center gap-2">
                <Checkbox
                  aria-label={pt.lining}
                  checked={draft.liningLengthCm !== null}
                  onCheckedChange={(v) =>
                    update({ liningLengthCm: v ? (draft.fabricLengthCm ?? 200) : null })
                  }
                />
                <Input
                  id="lining-length"
                  type="number"
                  step={0.1}
                  inputMode="decimal"
                  disabled={draft.liningLengthCm === null}
                  className="tabular-nums"
                  value={draft.liningLengthCm === null ? '' : draft.liningLengthCm / 100}
                  onChange={(e) =>
                    update({
                      liningLengthCm: e.target.value ? Math.round(Number(e.target.value) * 100) : 0,
                    })
                  }
                />
              </div>
            </Field>
            <Field label={pt.seamAllowance} htmlFor="seam">
              <Input
                id="seam"
                type="number"
                inputMode="numeric"
                min={0}
                max={50}
                className="tabular-nums"
                value={draft.seamAllowanceMm}
                onChange={(e) =>
                  update({
                    seamAllowanceMm: Math.min(
                      50,
                      Math.max(0, Math.round(Number(e.target.value) || 0)),
                    ),
                  })
                }
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* Files */}
      <Card>
        <CardHeader className="flex-wrap">
          <CardTitle>{pt.files}</CardTitle>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => cameraInput.current?.click()}
            >
              <Camera /> {pt.takePhoto}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInput.current?.click()}
            >
              <Upload /> {pt.addFiles}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted">{pt.filesHint}</p>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={PATTERN_FILE_ACCEPT}
            className="sr-only"
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {draft.files.map((f, i) => (
              <div key={f.path} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <PatternFileLink file={f} />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={pt.removeFile(f.name)}
                  onClick={() => update({ files: draft.files.filter((_, j) => j !== i) })}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            {uploading > 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="size-4 animate-spin" aria-hidden /> {pt.uploading}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardContent className="pt-4">
          <Field label={pt.notes} htmlFor="pattern-notes" optional>
            <Textarea
              id="pattern-notes"
              rows={3}
              maxLength={2000}
              placeholder={pt.notesPlaceholder}
              value={draft.notes}
              onChange={(e) => update({ notes: e.target.value })}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Ready check + actions */}
      <div className="sticky bottom-20 z-20 space-y-3 rounded-xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur md:bottom-4">
        {missing.length > 0 ? (
          <div className="flex gap-2 text-sm text-amber-900">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              <span className="font-medium">{pt.missingTitle}</span>{' '}
              {missing.map((m) => pt.missing[m]).join(' · ')}
            </p>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="size-4" aria-hidden /> {pt.ready}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="h-12"
            loading={save.isPending && !confirming}
            disabled={uploading > 0}
            onClick={() => void saveDraft().catch(() => undefined)}
          >
            <Save /> {pt.save}
          </Button>
          <Button
            type="button"
            size="lg"
            className="h-12 flex-1"
            disabled={missing.length > 0 || uploading > 0}
            onClick={() => setConfirming(true)}
          >
            <Scissors /> {pt.sendToCutting}
          </Button>
        </div>
      </div>

      {data.previous.length > 0 ? (
        <details className="rounded-xl border border-border bg-surface p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {pt.history} ({data.previous.length})
          </summary>
          <div className="mt-3 space-y-3">
            {data.previous.map((p) => (
              <div key={p.id}>
                <p className="mb-1 text-xs text-muted">
                  {pt.version(p.version)} ·{' '}
                  {p.confirmedAt
                    ? pt.by(p.confirmedBy?.name ?? null, formatDateTime(p.confirmedAt))
                    : pt.draft}
                </p>
                <PatternView pattern={p} compact />
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={pt.confirmTitle}
        description={pt.confirmBody}
        confirmLabel={pt.sendToCutting}
        onConfirm={() => sendToCutting()}
      />
    </div>
  );
}
