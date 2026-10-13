'use client';

import {
  ABAYA_STYLES,
  type AbayaStyle,
  GENERATION_CHOICES,
  type GenerationBody,
  type GenerationChoiceKey,
  type GenerationDto,
  isPinterestUrl,
  type PinPreviewDto,
  promptProblems,
} from '@abaya/contracts';
import { AlertTriangle, ExternalLink, FlaskConical, Heart, ImagePlus, Loader2, Pin, Sparkles, Wand2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { SafeImage } from '@/components/safe-image';
import { EmptyState, ErrorState, ForbiddenState } from '@/components/states';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { STYLE_LABELS, strings } from '@/content/strings';
import { errorMessage } from '@/lib/api-client';
import { useCurrentUser } from '@/lib/current-user';
import { formatRelative } from '@/lib/format';
import { useCreateGeneration, useDesignFromImage, useFavourite, useGenerations, usePinPreview, useStudioLimits } from '@/lib/queries/studio';
import { uploadImage } from '@/lib/upload';
import { cn } from '@/lib/utils';

const s = strings.studio;
const CHOICE_KEYS = Object.keys(GENERATION_CHOICES) as GenerationChoiceKey[];

export default function AiDesignPage() {
  const me = useCurrentUser();
  if (!me.can('useStudio')) return <ForbiddenState />;
  return (
    <React.Suspense fallback={<Skeleton className="h-[600px]" />}>
      <AiDesign />
    </React.Suspense>
  );
}

function AiDesign() {
  const limits = useStudioLimits();
  const generations = useGenerations();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const list = generations.data ?? [];
  const selected = list.find((g) => g.id === selectedId) ?? list[0] ?? null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={s.aiTitle}
        subtitle={s.aiSubtitle}
        actions={
          limits.data ? (
            <div className="flex flex-wrap items-center gap-2">
              {limits.data.mode === 'test' ? (
                <Badge tone="warning" title={s.testModeHint}>
                  <FlaskConical className="mr-1 size-3" aria-hidden />
                  {s.testMode}
                </Badge>
              ) : (
                <Badge tone="accent">
                  <Sparkles className="mr-1 size-3" aria-hidden />
                  {s.liveMode(limits.data.model)}
                </Badge>
              )}
              <UsageMeter used={limits.data.usedToday} limit={limits.data.dailyLimit} />
            </div>
          ) : null
        }
      />

      {limits.data?.mode === 'test' ? (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
          {s.testModeHint}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <GenerationForm
          disabled={Boolean(limits.data && limits.data.usedToday >= limits.data.dailyLimit)}
          imagesPerGeneration={limits.data?.imagesPerGeneration ?? 4}
          onCreated={(g) => setSelectedId(g.id)}
        />
        <div className="min-w-0 space-y-6">
          {generations.isPending ? (
            <Skeleton className="h-[480px]" />
          ) : generations.isError ? (
            <Card>
              <ErrorState error={generations.error} onRetry={() => void generations.refetch()} />
            </Card>
          ) : selected ? (
            <Results g={selected} />
          ) : (
            <Card>
              <EmptyState icon={<Sparkles className="size-5" />} title={s.historyEmpty} body={s.recentAiEmpty} />
            </Card>
          )}
          {list.length > 1 ? <History list={list} selectedId={selected?.id ?? null} onSelect={setSelectedId} /> : null}
        </div>
      </div>
    </div>
  );
}

function UsageMeter({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-muted shadow-sm">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-neutral-200">
        <span className={cn('block h-full rounded-full', pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-accent-600')} style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular-nums">{s.usage(used, limit)}</span>
    </div>
  );
}

// ───────────── Form ─────────────

function GenerationForm({
  disabled,
  imagesPerGeneration,
  onCreated,
}: {
  disabled: boolean;
  imagesPerGeneration: number;
  onCreated: (g: GenerationDto) => void;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const create = useCreateGeneration();
  const [style, setStyle] = React.useState<AbayaStyle>('OPEN_FRONT');
  const [choices, setChoices] = React.useState<Partial<Record<GenerationChoiceKey, string>>>({});
  const [prompt, setPrompt] = React.useState('');
  const [sketch, setSketch] = React.useState<{ path: string; preview: string } | null>(null);
  const [sketchUploading, setSketchUploading] = React.useState(false);
  const [pinUrl, setPinUrl] = React.useState(params.get('pin') ?? '');
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const problems = promptProblems(prompt);
  const pinInvalid = pinUrl.trim() !== '' && !isPinterestUrl(pinUrl.trim());
  const tooShort = prompt.trim().length < 10;

  async function onSketch(file: File | undefined) {
    if (!file) return;
    setSketchUploading(true);
    try {
      const path = await uploadImage(file, 'DESIGN_SKETCH');
      setSketch({ path, preview: URL.createObjectURL(file) });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSketchUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (tooShort || problems.length > 0 || pinInvalid) return;
    setError(null);
    const body: GenerationBody = {
      style,
      ...Object.fromEntries(Object.entries(choices).filter(([, v]) => v)),
      prompt: prompt.trim(),
      ...(sketch ? { sketchPath: sketch.path } : {}),
      ...(pinUrl.trim() ? { inspirationUrl: pinUrl.trim() } : {}),
    };
    try {
      const g = await create.mutateAsync(body);
      onCreated(g);
      toast.success(s.queued);
      if (params.get('pin')) router.replace('/studio/ai');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card className="h-fit p-5 xl:sticky xl:top-6">
      <form onSubmit={submit} className="space-y-4">
        <Field label={s.styleLabel} htmlFor="ai-style">
          <NativeSelect id="ai-style" value={style} onChange={(e) => setStyle(e.target.value as AbayaStyle)}>
            {ABAYA_STYLES.map((st) => (
              <option key={st} value={st}>
                {STYLE_LABELS[st]}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          {CHOICE_KEYS.map((key) => (
            <Field key={key} label={s.choiceLabels[key]} htmlFor={`ai-${key}`}>
              <NativeSelect
                id={`ai-${key}`}
                value={choices[key] ?? ''}
                onChange={(e) => setChoices((c) => ({ ...c, [key]: e.target.value || undefined }))}
              >
                <option value="">{s.anyChoice}</option>
                {GENERATION_CHOICES[key].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ))}
        </div>

        <Field
          label={s.promptLabel}
          htmlFor="ai-prompt"
          hint={problems.length === 0 ? `${s.promptHint} (${prompt.trim().length}/600)` : undefined}
        >
          <Textarea
            id="ai-prompt"
            rows={4}
            maxLength={600}
            value={prompt}
            placeholder={s.promptPlaceholder}
            aria-invalid={problems.length > 0}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </Field>
        {problems.length > 0 ? (
          <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert">
            {problems.map((p) => (
              <li key={p} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden /> {s.problems[p]}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="space-y-1.5">
          <p className="text-sm font-medium">
            {s.sketchLabel} <span className="font-normal text-muted">(optional)</span>
          </p>
          {sketch ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
              <img src={sketch.preview} alt={s.yourSketch} className="h-20 w-16 rounded-md object-cover ring-1 ring-border" />
              <Button type="button" size="sm" variant="ghost" onClick={() => setSketch(null)}>
                <X className="size-4" aria-hidden /> {s.sketchRemove}
              </Button>
            </div>
          ) : (
            <Button type="button" variant="secondary" size="sm" loading={sketchUploading} onClick={() => fileRef.current?.click()}>
              <ImagePlus className="size-4" aria-hidden /> {s.sketchAdd}
            </Button>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void onSketch(e.target.files?.[0])} />
          <p className="text-xs text-muted">{s.sketchHint}</p>
        </div>

        <Field label={s.inspirationField} htmlFor="ai-pin" optional hint={pinInvalid ? undefined : s.inspirationHint} error={pinInvalid ? s.pinInvalid : undefined}>
          <Input id="ai-pin" type="url" value={pinUrl} placeholder={s.inspirationPlaceholder} onChange={(e) => setPinUrl(e.target.value)} />
        </Field>

        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {disabled ? <p className="text-sm text-danger">{s.limitReached}</p> : null}

        <Button type="submit" className="w-full" loading={create.isPending} disabled={disabled || tooShort || problems.length > 0 || pinInvalid}>
          <Wand2 className="size-4" aria-hidden /> {s.generate(imagesPerGeneration)}
        </Button>
      </form>
    </Card>
  );
}

// ───────────── Results ─────────────

function Results({ g }: { g: GenerationDto }) {
  const favourite = useFavourite();
  const [creatingFrom, setCreatingFrom] = React.useState<string | null>(null);
  const working = g.status === 'QUEUED' || g.status === 'RUNNING';
  const choices = Object.entries(g.options).filter(([k]) => k !== 'style');

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{STYLE_LABELS[g.options.style]}</Badge>
            {choices.map(([k, v]) => (
              <Badge key={k} tone="neutral">
                {v}
              </Badge>
            ))}
            {g.mode === 'test' ? <Badge tone="warning">{s.testMode}</Badge> : null}
          </div>
          <p className="mt-2 text-sm text-neutral-800">{g.prompt}</p>
          <p className="mt-0.5 text-xs text-muted">
            {formatRelative(g.createdAt)} · <span className="font-mono">{g.model}</span>
          </p>
        </div>
      </div>

      {g.status === 'FAILED' ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">{s.failed}</p>
            {g.error ? <p className="mt-0.5">{g.error}</p> : null}
          </div>
        </div>
      ) : null}

      <div className={cn('mt-5 grid gap-5', (g.inspirationUrl || g.sketchUrl) && 'lg:grid-cols-[1fr_200px]')}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-2 2xl:grid-cols-4">
          {working
            ? Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="relative aspect-[3/4] overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-border">
                  <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-neutral-100 to-neutral-200" />
                  {i === 0 ? (
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-muted">
                      <Loader2 className="size-5 animate-spin text-accent-700" aria-hidden />
                      {s.working}
                    </span>
                  ) : null}
                </div>
              ))
            : g.images.map((img, i) => (
                <figure key={img.id} className="group relative aspect-[3/4] overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-border">
                  <SafeImage src={img.url} alt={`${g.prompt} (${i + 1})`} sizes="(min-width: 1536px) 20vw, 45vw" />
                  <button
                    type="button"
                    onClick={() => favourite.mutate({ imageId: img.id, favourite: !img.favourite })}
                    aria-label={img.favourite ? s.unfavourite : s.favourite}
                    aria-pressed={img.favourite}
                    className={cn(
                      'absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-white/90 shadow-sm transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                      img.favourite ? 'text-rose-600' : 'text-neutral-500',
                    )}
                  >
                    <Heart className={cn('size-4', img.favourite && 'fill-current')} aria-hidden />
                  </button>
                  <figcaption className="absolute inset-x-2 bottom-2">
                    {img.designId ? (
                      <Button asChild size="sm" variant="secondary" className="w-full">
                        <Link href={`/designs/${img.designId}`}>{s.openDesign}</Link>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full opacity-100 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
                        onClick={() => setCreatingFrom(img.id)}
                      >
                        {s.createDesign}
                      </Button>
                    )}
                  </figcaption>
                </figure>
              ))}
        </div>

        {g.inspirationUrl || g.sketchUrl ? (
          <aside className="space-y-4">
            {g.sketchUrl ? (
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">{s.yourSketch}</p>
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-border">
                  <SafeImage src={g.sketchUrl} alt={s.yourSketch} fit="contain" />
                </div>
              </div>
            ) : null}
            {g.inspirationUrl ? <InspirationSide url={g.inspirationUrl} /> : null}
          </aside>
        ) : null}
      </div>

      {creatingFrom ? (
        <CreateDesignDialog imageId={creatingFrom} style={g.options.style} onClose={() => setCreatingFrom(null)} />
      ) : null}
    </Card>
  );
}

/** The pin shown straight from Pinterest (not stored by us), for comparing by eye. */
function InspirationSide({ url }: { url: string }) {
  const preview = usePinPreview();
  const [pin, setPin] = React.useState<PinPreviewDto | null>(null);
  const { mutate } = preview;
  React.useEffect(() => {
    mutate(url, { onSuccess: setPin });
  }, [url, mutate]);
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted">
        <Pin className="size-3" aria-hidden /> {s.sideBySide}
      </p>
      <a href={url} target="_blank" rel="noreferrer noopener" className="block overflow-hidden rounded-xl ring-1 ring-border hover:ring-accent-400">
        {pin?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- shown from Pinterest, never proxied or stored
          <img src={pin.imageUrl} alt={pin.title ?? s.sideBySide} referrerPolicy="no-referrer" className="aspect-[3/4] w-full object-cover" />
        ) : (
          <div className="flex aspect-[3/4] items-center justify-center bg-neutral-100 text-xs text-muted">
            {preview.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : s.openOnPinterest}
          </div>
        )}
      </a>
      <a href={url} target="_blank" rel="noreferrer noopener" className="mt-1.5 inline-flex items-center gap-1 text-xs text-accent-700 hover:underline">
        {s.openOnPinterest} <ExternalLink className="size-3" aria-hidden />
      </a>
    </div>
  );
}

function CreateDesignDialog({ imageId, style, onClose }: { imageId: string; style: AbayaStyle; onClose: () => void }) {
  const router = useRouter();
  const create = useDesignFromImage();
  const [name, setName] = React.useState('');
  const [chosenStyle, setChosenStyle] = React.useState<AbayaStyle>(style);
  const [description, setDescription] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 3) {
      setError(s.nameRequired);
      return;
    }
    try {
      const design = await create.mutateAsync({
        imageId,
        body: { name: name.trim(), style: chosenStyle, description: description.trim() || undefined },
      });
      toast.success(s.created);
      router.push(`/designs/${design.id}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{s.createTitle}</DialogTitle>
            <DialogDescription>{s.createBody}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field label={s.nameLabel} htmlFor="new-name" error={error ?? undefined}>
              <Input id="new-name" autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={s.styleLabel} htmlFor="new-style">
              <NativeSelect id="new-style" value={chosenStyle} onChange={(e) => setChosenStyle(e.target.value as AbayaStyle)}>
                {ABAYA_STYLES.map((st) => (
                  <option key={st} value={st}>
                    {STYLE_LABELS[st]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={s.descriptionLabel} htmlFor="new-description" optional>
              <Textarea id="new-description" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {strings.common.cancel}
            </Button>
            <Button type="submit" loading={create.isPending}>
              {s.createDesign}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────── History ─────────────

function History({ list, selectedId, onSelect }: { list: GenerationDto[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <Card className="p-5">
      <h2 className="font-display text-xl font-semibold">{s.history}</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {list.map((g) => {
          const cover = g.images.find((i) => i.favourite) ?? g.images[0];
          return (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => onSelect(g.id)}
                aria-current={g.id === selectedId}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border p-2 text-left transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                  g.id === selectedId ? 'border-accent-400 bg-accent-50/50' : 'border-border',
                )}
              >
                <span className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md bg-neutral-100">
                  {cover ? <SafeImage src={cover.url} alt="" sizes="48px" /> : null}
                  {g.status === 'QUEUED' || g.status === 'RUNNING' ? (
                    <Loader2 className="absolute inset-0 m-auto size-4 animate-spin text-accent-700" aria-hidden />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm">{g.prompt}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                    {formatRelative(g.createdAt)}
                    {g.status === 'FAILED' ? <Badge tone="danger">{s.failed}</Badge> : null}
                    {g.images.some((i) => i.designId) ? <Badge tone="accent">{s.openDesign}</Badge> : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
