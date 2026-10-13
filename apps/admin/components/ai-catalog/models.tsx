'use client';

import {
  aiModelAttributes,
  type AiModelAttributes,
  buildModelPrompt,
  CATALOG_BACKGROUNDS,
  type CatalogBackgroundId,
  type CatalogJobDto,
  type CatalogModelProfileDto,
  DEFAULT_BACKGROUND_ID,
  SHAYLA_OPTIONS,
  varietyTraits,
} from '@abaya/contracts';
import { Check, Shuffle, Trash2, UserRound } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/states';
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
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { strings } from '@/content/strings';
import { errorMessage } from '@/lib/api-client';
import { useCurrentUser } from '@/lib/current-user';
import {
  useArchiveModel,
  useCatalogJobs,
  useCatalogModels,
  useCreateAiModel,
  useCreatePersonalModel,
} from '@/lib/queries/ai-catalog';
import { cn } from '@/lib/utils';
import { JobCard } from './job-card';
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

/** The saved models (shared by the whole team); click to choose one. */
export function ModelGrid({
  selectedId,
  onSelect,
  manage = false,
}: {
  selectedId?: string | null;
  onSelect?: (m: CatalogModelProfileDto) => void;
  manage?: boolean;
}) {
  const me = useCurrentUser();
  const models = useCatalogModels();
  const archive = useArchiveModel();
  const [removing, setRemoving] = React.useState<CatalogModelProfileDto | null>(null);

  if (models.isPending) {
    return (
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="aspect-[3/4]" />
        ))}
      </div>
    );
  }
  if (!models.data?.length)
    return (
      <EmptyState icon={<UserRound className="size-5" />} title={t.noModels} className="py-6" />
    );

  return (
    <>
      <ul
        className={cn(
          'grid gap-3',
          manage ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6' : 'grid-cols-3 sm:grid-cols-4',
        )}
      >
        {models.data.map((m) => {
          const selected = m.id === selectedId;
          return (
            <li key={m.id} className="space-y-1">
              <button
                type="button"
                onClick={() => onSelect?.(m)}
                disabled={!onSelect}
                aria-pressed={selected}
                className={cn(
                  'relative block aspect-[3/4] w-full overflow-hidden rounded-lg bg-neutral-100 ring-2 transition focus-visible:outline-none focus-visible:ring-accent-500',
                  selected ? 'ring-accent-600' : 'ring-transparent hover:ring-neutral-300',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
                <img src={m.imageUrl} alt={m.name} className="size-full object-cover" />
                {selected ? (
                  <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-accent-700 text-white">
                    <Check className="size-3.5" aria-hidden />
                  </span>
                ) : null}
                <span className="absolute inset-x-1.5 bottom-1.5 flex flex-wrap gap-1">
                  <Badge tone={m.type === 'PERSONAL' ? 'violet' : 'accent'}>
                    {m.type === 'PERSONAL' ? t.personalBadge : t.aiBadge}
                  </Badge>
                  <Badge tone={m.abayaCount === 0 ? 'success' : 'neutral'}>
                    {t.wornBy(m.abayaCount)}
                  </Badge>
                </span>
              </button>
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-sm font-medium">{m.name}</span>
                {manage && (m.createdBy.id === me.id || me.can('manageCatalog')) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRemoving(m)}
                    aria-label={`${t.archive} ${m.name}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                ) : null}
              </div>
              {manage && m.description ? (
                <p className="line-clamp-2 text-xs text-muted">{m.description}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {removing ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemoving(null)}
          title={`${t.archive} ${removing.name}?`}
          description={t.archiveConfirm}
          tone="danger"
          confirmLabel={t.archive}
          onConfirm={() => archive.mutateAsync(removing.id)}
        />
      ) : null}
    </>
  );
}

const TEXT_FIELDS: (keyof AiModelAttributes)[] = [
  'appearance',
  'skinTone',
  'makeup',
  'bodyType',
  'expression',
];

/** Face, shayla, age… with a "New face" shuffle (used by the one-step form and the model dialog). */
/** Short name of a shayla choice for summaries ("coordinated", "black, Gulf style"…). */
export const shaylaLabel = (value: string): string => {
  const i = (SHAYLA_OPTIONS as readonly string[]).indexOf(value);
  return i === 0 ? 'coordinated' : i > 0 ? (t.shaylaLabels[i] ?? value).toLowerCase() : value;
};

/** Height and body type: shown up front for a real person, so the image keeps her real proportions. */
export function BodyFields({
  attrs,
  onChange,
}: {
  attrs: AiModelAttributes;
  onChange: (patch: Partial<AiModelAttributes>) => void;
}) {
  const valid = !attrs.heightCm || (attrs.heightCm >= 130 && attrs.heightCm <= 200);
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field
        label={t.attrs.heightCm}
        htmlFor="body-height"
        hint={valid ? t.heightHint : undefined}
        error={valid ? undefined : '130–200 cm'}
      >
        <Input
          id="body-height"
          type="number"
          inputMode="numeric"
          min={130}
          max={200}
          placeholder="160"
          value={attrs.heightCm ?? ''}
          onChange={(e) =>
            onChange({ heightCm: e.target.value ? Number(e.target.value) : undefined })
          }
        />
      </Field>
      <Field label={t.attrs.bodyType} htmlFor="body-type" hint={t.bodyTypeHint}>
        <Input
          id="body-type"
          maxLength={60}
          value={attrs.bodyType}
          onChange={(e) => onChange({ bodyType: e.target.value })}
        />
      </Field>
    </div>
  );
}

export function LookFields({
  attrs,
  onChange,
  faceFromPhoto = false,
}: {
  attrs: AiModelAttributes;
  onChange: (patch: Partial<AiModelAttributes>) => void;
  /** With a real person's face photo only the shayla and styling apply. */
  faceFromPhoto?: boolean;
}) {
  return (
    <div className="space-y-3">
      {!faceFromPhoto ? (
        <>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-accent-50/60 p-2.5">
            <p className="text-xs text-accent-900">{t.newFaceHint}</p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onChange(varietyTraits(Date.now()))}
            >
              <Shuffle className="size-4" aria-hidden /> {t.newFace}
            </Button>
          </div>
          <Field label={t.attrs.features} htmlFor="attr-features">
            <Textarea
              id="attr-features"
              rows={2}
              maxLength={200}
              value={attrs.features}
              onChange={(e) => onChange({ features: e.target.value })}
            />
          </Field>
        </>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        {!faceFromPhoto ? (
          <Field label={t.attrs.age} htmlFor="attr-age">
            <Input
              id="attr-age"
              type="number"
              min={18}
              max={65}
              value={attrs.age}
              onChange={(e) => onChange({ age: Number(e.target.value) || 27 })}
            />
          </Field>
        ) : null}
        <Field label={t.attrs.hijab} htmlFor="attr-hijab">
          <NativeSelect
            id="attr-hijab"
            value={attrs.hijab}
            onChange={(e) => onChange({ hijab: e.target.value })}
          >
            {SHAYLA_OPTIONS.map((o, i) => (
              <option key={o} value={o}>
                {t.shaylaLabels[i] ?? o}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {!faceFromPhoto ? (
          <Field label={t.attrs.heightCm} htmlFor="attr-height" optional>
            <Input
              id="attr-height"
              type="number"
              min={130}
              max={200}
              placeholder="160"
              value={attrs.heightCm ?? ''}
              onChange={(e) =>
                onChange({ heightCm: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </Field>
        ) : null}
        {(faceFromPhoto ? (['skinTone'] as const) : TEXT_FIELDS).map((k) => (
          <Field key={k} label={t.attrs[k as keyof typeof t.attrs]} htmlFor={`attr-${k}`}>
            <Input
              id={`attr-${k}`}
              value={String(attrs[k])}
              maxLength={80}
              onChange={(e) => onChange({ [k]: e.target.value })}
            />
          </Field>
        ))}
        <Field label={t.attrs.extra} htmlFor="attr-extra" className="col-span-2" optional>
          <Input
            id="attr-extra"
            value={attrs.extra}
            maxLength={200}
            onChange={(e) => onChange({ extra: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

/** A fresh face within the house look (Middle Eastern, warm olive skin, shayla). */
export const freshAttributes = (): AiModelAttributes => ({
  ...aiModelAttributes.parse({}),
  ...varietyTraits(Date.now()),
});

/** model-create: describe the model, see the prompt, make 1–4 options, save the best one. */
export function AiModelDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateAiModel();
  const jobs = useCatalogJobs();
  const [attrs, setAttrs] = React.useState<AiModelAttributes>(freshAttributes);
  const [background, setBackground] = React.useState<CatalogBackgroundId>(DEFAULT_BACKGROUND_ID);
  const [direction, setDirection] = React.useState('');
  const [prompt, setPrompt] = React.useState<string | null>(null);
  const [settings, setSettings] = React.useState<Settings>({
    resolution: '2k',
    mode: 'balanced',
    numImages: 2,
  });
  const [jobId, setJobId] = React.useState<string | null>(null);
  const built = buildModelPrompt(attrs, background, direction);
  const job: CatalogJobDto | undefined = jobs.data?.find((j) => j.id === jobId);
  const set = (patch: Partial<AiModelAttributes>) => {
    setAttrs((a) => ({ ...a, ...patch }));
    setPrompt(null);
  };

  async function go() {
    try {
      const j = await create.mutateAsync({
        attributes: attrs,
        backgroundId: background,
        direction: direction.trim() || undefined,
        prompt: prompt ?? undefined,
        ...settings,
      });
      setJobId(j.id);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{t.aiModelTitle}</DialogTitle>
          <DialogDescription>{t.aiModelBody}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3">
              <LookFields attrs={attrs} onChange={set} />
              <BackgroundPicker
                value={background}
                onChange={(b) => (setBackground(b), setPrompt(null))}
              />
            </div>
            <div className="space-y-4">
              <DirectionBox
                id="model-direction"
                value={direction}
                onChange={(v) => (setDirection(v), setPrompt(null))}
              />
              <PromptBox built={built} override={prompt} onOverride={setPrompt} />
              <SettingsFields value={settings} onChange={setSettings} kind="MODEL_CREATE" />
            </div>
          </div>
          {job ? <JobCard job={job} /> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {strings.common.close}
          </Button>
          <Button loading={create.isPending} onClick={() => void go()}>
            {t.createModel(costLabel('MODEL_CREATE', settings))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BackgroundPicker({
  value,
  onChange,
}: {
  value: CatalogBackgroundId;
  onChange: (b: CatalogBackgroundId) => void;
}) {
  const groups = [
    {
      label: t.arabianBackgrounds,
      items: CATALOG_BACKGROUNDS.filter((b) => b.group === 'arabian'),
    },
    { label: t.studioBackgrounds, items: CATALOG_BACKGROUNDS.filter((b) => b.group === 'studio') },
  ];
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t.background}</legend>
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
            {g.label}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {g.items.map((b) => (
              <button
                key={b.id}
                type="button"
                aria-pressed={b.id === value}
                onClick={() => onChange(b.id)}
                className={cn(
                  'flex items-center gap-2 rounded-md border p-2 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                  b.id === value
                    ? 'border-accent-500 bg-accent-50/60'
                    : 'border-border hover:bg-neutral-50',
                )}
              >
                <span
                  className="size-6 shrink-0 rounded ring-1 ring-black/10"
                  style={{ background: b.swatch }}
                  aria-hidden
                />
                {b.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}

/** A real person's full-body photo, saved only with their consent. */
export function PersonalModelDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved?: (m: CatalogModelProfileDto) => void;
}) {
  const create = useCreatePersonalModel();
  const [photo, setPhoto] = React.useState<Photo | null>(null);
  const [name, setName] = React.useState('');
  const [consent, setConsent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    if (!photo?.path || name.trim().length < 2) return;
    if (!consent) {
      setError(t.consentRequired);
      return;
    }
    try {
      const m = await create.mutateAsync({
        name: name.trim(),
        imagePath: photo.path,
        consent: true,
      });
      onSaved?.(m);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.personalTitle}</DialogTitle>
          <DialogDescription>{t.personalBody}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <PhotoInput label={t.personalTitle} value={photo} onChange={setPhoto} />
          <Field label={t.name} htmlFor="personal-name">
            <Input
              id="personal-name"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={consent}
              onCheckedChange={(v) => {
                setConsent(v === true);
                setError(null);
              }}
            />
            {t.consent}
          </label>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {strings.common.cancel}
          </Button>
          <Button
            disabled={!photo?.path || name.trim().length < 2}
            loading={create.isPending}
            onClick={() => void save()}
          >
            {t.addModel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
