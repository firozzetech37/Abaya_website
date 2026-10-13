'use client';

import {
  CATALOG_MODES,
  CATALOG_RESOLUTIONS,
  type CatalogJobKind,
  type CatalogMode,
  type CatalogResolution,
  creditCost,
} from '@abaya/contracts';
import { BookmarkPlus, ImagePlus, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { strings } from '@/content/strings';
import { errorMessage } from '@/lib/api-client';
import {
  typicalSeconds,
  useArchivePromptPreset,
  useCreatePromptPreset,
  usePromptPresets,
} from '@/lib/queries/ai-catalog';
import { uploadImage } from '@/lib/upload';
import { cn } from '@/lib/utils';

const t = strings.aiCatalog;

export interface Photo {
  /** Storage path of an uploaded photo (purpose CATALOG_INPUT). */
  path?: string;
  /** A photo cleaned with background-remove (catalog image id). */
  imageId?: string;
  preview: string;
}

/** Upload one photo (private bucket); shows a preview. */
export function PhotoInput({
  label,
  hint,
  value,
  onChange,
  extra,
}: {
  label: string;
  hint?: string;
  value: Photo | null;
  onChange: (photo: Photo | null) => void;
  extra?: React.ReactNode;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  async function take(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const path = await uploadImage(file, 'CATALOG_INPUT');
      onChange({ path, preview: URL.createObjectURL(file) });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className={cn(
            'relative flex aspect-[3/4] w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed text-muted transition-colors hover:border-accent-400 hover:bg-accent-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
            value ? 'border-transparent' : 'border-neutral-300 bg-neutral-50',
          )}
          aria-label={value ? t.replace : t.upload}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview or signed URL
            <img
              src={value.preview}
              alt={label}
              className="absolute inset-0 size-full object-cover"
            />
          ) : busy ? (
            <span className="text-xs">…</span>
          ) : (
            <ImagePlus className="size-6" aria-hidden />
          )}
        </button>
        <div className="min-w-0 space-y-2 pt-1">
          {hint ? <p className="text-xs text-muted">{hint}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={busy}
              onClick={() => ref.current?.click()}
            >
              {value ? t.replace : t.upload}
            </Button>
            {value ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
                <X className="size-4" aria-hidden /> {t.remove}
              </Button>
            ) : null}
            {extra}
          </div>
        </div>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void take(e.target.files?.[0])}
      />
    </div>
  );
}

export interface Settings {
  resolution: CatalogResolution;
  mode: CatalogMode;
  numImages: number;
}

/** Resolution, quality and count, with the credit cost and usual time. */
export function SettingsFields({
  value,
  onChange,
  kind,
  showCount = true,
  count = 1,
  faceReference = false,
  photoshoot = false,
}: {
  value: Settings;
  onChange: (s: Settings) => void;
  kind: CatalogJobKind;
  showCount?: boolean;
  /** Jobs that will be made (poses: one per pose). */
  count?: number;
  /** A real person's face photo: FASHN charges 3 more credits per image. */
  faceReference?: boolean;
  /** A master: "Images" means shots of one photoshoot (1 master + edits made from it). */
  photoshoot?: boolean;
}) {
  const cost = photoshoot ? photoshootCost(kind, value, faceReference) : creditCost({ kind, ...value, faceReference }) * count;
  return (
    <div className="space-y-3">
      <Segmented
        label={t.resolution}
        options={CATALOG_RESOLUTIONS.map((r) => ({ value: r, label: t.resolutionLabels[r] ?? r }))}
        value={value.resolution}
        onChange={(resolution) => onChange({ ...value, resolution })}
      />
      <Segmented
        label={t.mode}
        options={CATALOG_MODES.map((m) => ({ value: m, label: t.modeLabels[m] ?? m }))}
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode })}
      />
      {showCount ? (
        <div className="space-y-1">
          <Segmented
            label={photoshoot ? t.shots : t.images}
            options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))}
            value={value.numImages}
            onChange={(numImages) => onChange({ ...value, numImages })}
          />
          {photoshoot ? (
            <p className="text-xs text-muted">
              <span className="font-medium text-foreground">{t.shotNames[value.numImages]}</span> · {t.shotsHint}
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-muted">
        <span className="font-semibold text-foreground">{t.cost(cost)}</span> ·{' '}
        {t.usuallyTakes(typicalSeconds(value.resolution, value.mode))}
      </p>
    </div>
  );
}

/** A photoshoot: the master (with its face reference, if any) plus one edit per extra shot. */
export function photoshootCost(kind: CatalogJobKind, s: Settings, faceReference = false): number {
  return (
    creditCost({ kind, resolution: s.resolution, mode: s.mode, numImages: 1, faceReference }) +
    creditCost({ kind: 'EDIT', resolution: s.resolution, mode: s.mode, numImages: 1 }) * (s.numImages - 1)
  );
}

export function costLabel(
  kind: CatalogJobKind,
  s: Settings,
  count = 1,
  faceReference = false,
): string {
  return t.cost(creditCost({ kind, ...s, faceReference }) * count);
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex flex-wrap gap-1 rounded-lg bg-neutral-100 p-1"
      >
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
              o.value === value
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The prompt that will be sent: built from the house style and inputs, editable by the
 * designer (so their own prompts can be tested). `override` null = use the built one.
 */
export function PromptBox({
  built,
  override,
  onOverride,
}: {
  built: string;
  override: string | null;
  onOverride: (p: string | null) => void;
}) {
  const editing = override !== null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="catalog-prompt">{t.prompt}</Label>
        {editing ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => onOverride(null)}>
            <RotateCcw className="size-3.5" aria-hidden /> {t.resetPrompt}
          </Button>
        ) : (
          <Button type="button" size="sm" variant="ghost" onClick={() => onOverride(built)}>
            <Pencil className="size-3.5" aria-hidden /> {t.editPrompt}
          </Button>
        )}
      </div>
      {editing ? (
        <Textarea
          id="catalog-prompt"
          rows={6}
          maxLength={1500}
          value={override}
          onChange={(e) => onOverride(e.target.value)}
        />
      ) : (
        <p
          id="catalog-prompt"
          className="rounded-md bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-700 ring-1 ring-border"
        >
          {built}
        </p>
      )}
    </div>
  );
}

/** Seconds since `since`, ticking while `active`. */
export function useElapsed(since: string, active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return Math.max(0, Math.round((now - new Date(since).getTime()) / 1000));
}

/**
 * The designer's own direction, added on top of the house rules. Saved directions (team
 * presets) can be picked, and the current text saved as a new preset.
 */
export function DirectionBox({
  value,
  onChange,
  id = 'direction',
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
}) {
  const presets = usePromptPresets();
  const create = useCreatePromptPreset();
  const archive = useArchivePromptPreset();
  const [naming, setNaming] = React.useState(false);
  const [name, setName] = React.useState('');
  const chosen = presets.data?.find((p) => p.text === value.trim());

  async function save() {
    if (name.trim().length < 2 || value.trim().length < 3) return;
    try {
      await create.mutateAsync({ name: name.trim(), text: value.trim() });
      toast.success(t.presetSaved);
      setNaming(false);
      setName('');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>{t.directionLabel}</Label>
        {presets.data?.length ? (
          <div className="flex items-center gap-1">
            <NativeSelect
              aria-label={t.usePreset}
              className="h-8 w-44 text-xs"
              value={chosen?.id ?? ''}
              onChange={(e) =>
                onChange(presets.data?.find((p) => p.id === e.target.value)?.text ?? '')
              }
            >
              <option value="">{t.usePreset}</option>
              {presets.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
            {chosen ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={t.deletePreset}
                onClick={() => archive.mutate(chosen.id)}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <Textarea
        id={id}
        rows={2}
        maxLength={400}
        placeholder={t.directionPlaceholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="text-xs text-muted">{t.directionHint}</p>
      {value.trim().length >= 3 && !chosen ? (
        naming ? (
          <div className="flex items-center gap-2">
            <Input
              aria-label={t.presetName}
              placeholder={t.presetName}
              className="h-8"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="button" size="sm" loading={create.isPending} onClick={() => void save()}>
              {strings.common.save}
            </Button>
          </div>
        ) : (
          <Button type="button" size="sm" variant="ghost" onClick={() => setNaming(true)}>
            <BookmarkPlus className="size-3.5" aria-hidden /> {t.savePreset}
          </Button>
        )
      ) : null}
    </div>
  );
}
