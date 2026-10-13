'use client';

import {
  ABAYA_STYLES,
  type AbayaStyle,
  type AiModelAttributes,
  buildMasterPrompt,
  buildOneStepPrompt,
  type CatalogBackgroundId,
  creditCost,
  catalogStyling,
  type CatalogStyling,
  DEFAULT_BACKGROUND_ID,
  varietyTraits,
  type CatalogImageDto,
  type CatalogJobDto,
  type CatalogModelProfileDto,
  CATALOG_VIEWS,
  EMBROIDERY_PLACEMENTS,
  type EmbroideryPlacement,
} from '@abaya/contracts';
import {
  AlertTriangle,
  BookImage,
  Camera,
  FlaskConical,
  Layers,
  Plus,
  Shuffle,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { AddSetDialog } from '@/components/ai-catalog/catalog-dialogs';
import { JobCard } from '@/components/ai-catalog/job-card';
import {
  AiModelDialog,
  BackgroundPicker,
  BodyFields,
  freshAttributes,
  shaylaLabel,
  LookFields,
  ModelGrid,
  PersonalModelDialog,
} from '@/components/ai-catalog/models';
import { DesignReferences, type DesignReferenceInput } from '@/components/ai-catalog/references';
import { StylingFields, stylingComplete } from '@/components/ai-catalog/styling';
import {
  DirectionBox,
  type Photo,
  PhotoInput,
  PromptBox,
  type Settings,
  SettingsFields,
} from '@/components/ai-catalog/shared';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, ForbiddenState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { STYLE_LABELS, strings } from '@/content/strings';
import { errorMessage } from '@/lib/api-client';
import { useCurrentUser } from '@/lib/current-user';
import { formatRelative } from '@/lib/format';
import {
  useCatalogJobs,
  useCatalogLimits,
  useCreateCleanup,
  useCreateMaster,
  useCreateOneStep,
} from '@/lib/queries/ai-catalog';
import { cn } from '@/lib/utils';

const t = strings.aiCatalog;

/** AI Catalog (FASHN): abaya + model → master → poses, edits and the 4K final. */
export default function AiCatalogPage() {
  const me = useCurrentUser();
  if (!me.can('useStudio')) return <ForbiddenState />;
  return (
    <div className="space-y-5">
      <PageHeader title={t.title} subtitle={t.subtitle} actions={<LimitsBar />} />
      <Tabs defaultValue="create">
        <TabsList>
          <TabsTrigger value="create">{t.tabs.create}</TabsTrigger>
          <TabsTrigger value="models">{t.tabs.models}</TabsTrigger>
          <TabsTrigger value="history">{t.tabs.history}</TabsTrigger>
        </TabsList>
        <TabsContent value="create">
          <Create />
        </TabsContent>
        <TabsContent value="models">
          <Models />
        </TabsContent>
        <TabsContent value="history">
          <History />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LimitsBar() {
  const limits = useCatalogLimits();
  if (!limits.data) return null;
  const { mode, balance, usedToday, dailyLimit } = limits.data;
  const pct = Math.min(100, Math.round((usedToday / dailyLimit) * 100));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {mode === 'test' ? (
        <Badge tone="warning" title={t.testModeHint}>
          <FlaskConical className="mr-1 size-3" aria-hidden /> {t.testMode}
        </Badge>
      ) : (
        <Badge tone="accent">
          <Camera className="mr-1 size-3" aria-hidden /> {t.live}
        </Badge>
      )}
      {balance !== null ? <span className="text-xs text-muted">{t.balance(balance)}</span> : null}
      <span className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-muted shadow-sm">
        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-neutral-200">
          <span
            className={cn('block h-full rounded-full', pct >= 90 ? 'bg-red-500' : 'bg-accent-600')}
            style={{ width: `${pct}%` }}
          />
        </span>
        {t.usage(usedToday, dailyLimit)}
      </span>
    </div>
  );
}

// ───────────── Create ─────────────

type ModelMode = 'new' | 'face' | 'saved';

function Create() {
  const limits = useCatalogLimits();
  const jobs = useCatalogJobs();
  const createMaster = useCreateMaster();
  const createOneStep = useCreateOneStep();
  const cleanup = useCreateCleanup();
  const [abaya, setAbaya] = React.useState<Photo | null>(null);
  const [sketch, setSketch] = React.useState(false);
  const [references, setReferences] = React.useState<DesignReferenceInput[]>([]);
  const [applyReferences, setApplyReferences] = React.useState(true);
  const [styling, setStyling] = React.useState<CatalogStyling>(() => catalogStyling.parse({}));
  const [back, setBack] = React.useState<Photo | null>(null);
  const [garment, setGarment] = React.useState('');
  const [style, setStyle] = React.useState<AbayaStyle>('CLOSED');
  const [embroidery, setEmbroidery] = React.useState<EmbroideryPlacement[]>([]);
  const [direction, setDirection] = React.useState('');
  const [mode, setMode] = React.useState<ModelMode>('new');
  const [attrs, setAttrs] = React.useState<AiModelAttributes>(freshAttributes);
  const [showLook, setShowLook] = React.useState(false);
  const [face, setFace] = React.useState<Photo | null>(null);
  const [consent, setConsent] = React.useState(false);
  const [background, setBackground] = React.useState<CatalogBackgroundId>(DEFAULT_BACKGROUND_ID);
  const [ownBackground, setOwnBackground] = React.useState<Photo | null>(null);
  const [model, setModel] = React.useState<CatalogModelProfileDto | null>(null);
  const [prompt, setPrompt] = React.useState<string | null>(null);
  const [settings, setSettings] = React.useState<Settings>({
    resolution: '2k',
    mode: 'balanced',
    numImages: 1,
  });
  const [dialog, setDialog] = React.useState<'ai' | 'personal' | null>(null);
  const [masterId, setMasterId] = React.useState<string | null>(null);
  const [cleanupId, setCleanupId] = React.useState<string | null>(null);

  const all = jobs.data ?? [];
  const masters = all.filter((j) => j.view === 'MASTER' && !j.parentImageId && !j.retryOfImageId);
  const master = all.find((j) => j.id === masterId) ?? masters[0] ?? null;
  const cleanupJob = all.find((j) => j.id === cleanupId) ?? null;
  const oneStep = mode !== 'saved';
  const withFace = mode === 'face' && Boolean(face?.path);
  // Only references with a photo are sent (the server builds the same prompt).
  const usedReferences = references.filter((r) => r.path);
  const built = oneStep
    ? buildOneStepPrompt({
        attributes: attrs,
        backgroundId: background,
        hasBackgroundPhoto: Boolean(ownBackground),
        hasFacePhoto: mode === 'face',
        garmentDescription: garment,
        style,
        embroidery,
        direction,
        sketch,
        references: usedReferences,
        styling,
      })
    : buildMasterPrompt(garment, direction, { sketch, references: usedReferences, styling });
  const kind = oneStep ? 'PRODUCT_TO_MODEL' : 'TRYON';
  // Reference edits run after the master when "Apply automatically" is on.
  const chainSteps = applyReferences ? usedReferences.length : 0;
  const chainCost =
    creditCost({
      kind: 'EDIT',
      resolution: settings.resolution,
      mode: settings.mode,
      numImages: 1,
    }) * chainSteps;
  const totalCost =
    creditCost({
      kind,
      resolution: settings.resolution,
      mode: settings.mode,
      numImages: settings.numImages,
      faceReference: withFace,
    }) + chainCost;
  const unseenReferences = !applyReferences && usedReferences.some((r) => !r.note.trim());
  const heightOk = !attrs.heightCm || (attrs.heightCm >= 130 && attrs.heightCm <= 200);
  const ready =
    heightOk &&
    stylingComplete(styling) &&
    Boolean(abaya) &&
    (mode === 'new' ||
      (mode === 'face' && Boolean(face?.path) && consent) ||
      (mode === 'saved' && Boolean(model)));
  const changed =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setPrompt(null);
    };

  async function generate() {
    if (!abaya) return toast.error(t.needAbaya);
    const photo = abaya.imageId ? { abayaImageId: abaya.imageId } : { abayaPath: abaya.path };
    const common = {
      ...photo,
      backPath: back?.path,
      garmentDescription: garment.trim() || undefined,
      style,
      embroidery,
      direction: direction.trim() || undefined,
      sketch,
      styling,
      applyReferences: applyReferences && usedReferences.length > 0,
      references: references
        .filter((r) => r.path)
        .map((r) => ({ type: r.type, path: r.path!, note: r.note.trim() || undefined })),
      prompt: prompt ?? undefined,
      ...settings,
    };
    try {
      let job: CatalogJobDto;
      if (mode === 'saved') {
        if (!model) return toast.error(t.needModel);
        job = await createMaster.mutateAsync({ ...common, modelProfileId: model.id });
      } else {
        if (mode === 'face' && (!face?.path || !consent)) return toast.error(t.consentRequired);
        job = await createOneStep.mutateAsync({
          ...common,
          attributes: attrs,
          backgroundId: background,
          backgroundPath: ownBackground?.path,
          facePath: mode === 'face' ? face?.path : undefined,
          faceConsent: mode === 'face' ? consent : undefined,
        });
        // The next abaya gets a new face.
        if (mode === 'new') setAttrs((a) => ({ ...a, ...varietyTraits(Date.now()) }));
      }
      setMasterId(job.id);
      toast.success(t.queued);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function clean() {
    if (!abaya?.path) return;
    try {
      const job = await cleanup.mutateAsync(abaya.path);
      setCleanupId(job.id);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const pickCleaned = (image: CatalogImageDto) => {
    setAbaya({ imageId: image.id, preview: image.url });
    setCleanupId(null);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[460px_1fr]">
      <div className="space-y-4">
        {limits.data?.mode === 'test' ? (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t.testModeHint}
          </p>
        ) : null}

        <Card className="space-y-4 p-4">
          <h2 className="font-display text-lg font-semibold">{t.stepAbaya}</h2>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">{t.startFrom}</span>
            <div
              role="radiogroup"
              aria-label={t.startFrom}
              className="flex gap-1 rounded-lg bg-neutral-100 p-1"
            >
              {([false, true] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  role="radio"
                  aria-checked={sketch === v}
                  onClick={() => {
                    changed(setSketch)(v);
                    setAbaya(null);
                    setCleanupId(null);
                  }}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                    sketch === v
                      ? 'bg-surface text-foreground shadow-sm'
                      : 'text-muted hover:text-foreground',
                  )}
                >
                  {v ? t.fromSketch : t.fromPhoto}
                </button>
              ))}
            </div>
          </div>
          <PhotoInput
            label={sketch ? t.sketchLabel : t.abayaFront}
            hint={sketch ? t.sketchHint : t.abayaFrontHint}
            value={abaya}
            onChange={(p) => {
              setAbaya(p);
              setCleanupId(null);
            }}
            extra={
              abaya?.path && !sketch ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  loading={cleanup.isPending}
                  onClick={() => void clean()}
                >
                  {t.cleanBackground}
                </Button>
              ) : null
            }
          />
          {sketch ? <p className="text-xs text-amber-800">{t.sketchTip}</p> : null}
          {cleanupJob ? <JobCard job={cleanupJob} compact onCleanedPhoto={pickCleaned} /> : null}
          <PhotoInput label={t.abayaBack} hint={t.abayaBackHint} value={back} onChange={setBack} />
          <Field label={t.styleLabel} htmlFor="abaya-style" hint={t.styleHint}>
            <NativeSelect
              id="abaya-style"
              value={style}
              onChange={(e) => changed(setStyle)(e.target.value as AbayaStyle)}
            >
              {ABAYA_STYLES.map((s) => (
                <option key={s} value={s}>
                  {STYLE_LABELS[s]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">{t.embroideryLabel}</legend>
            <div className="flex flex-wrap gap-3">
              {EMBROIDERY_PLACEMENTS.map((p) => (
                <label key={p} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={embroidery.includes(p)}
                    onCheckedChange={(v) =>
                      changed(setEmbroidery)(
                        v === true ? [...embroidery, p] : embroidery.filter((x) => x !== p),
                      )
                    }
                  />
                  {t.embroideryPlaces[p]}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label={t.garmentLabel} htmlFor="garment" hint={t.garmentHint} optional>
            <Textarea
              id="garment"
              rows={2}
              maxLength={600}
              value={garment}
              onChange={(e) => changed(setGarment)(e.target.value)}
            />
          </Field>
          <DesignReferences value={references} onChange={changed(setReferences)} />
          {usedReferences.length ? (
            <label className="flex items-start gap-2 rounded-lg bg-accent-50/60 p-2.5 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={applyReferences}
                onCheckedChange={(v) => setApplyReferences(v === true)}
              />
              <span>
                <span className="block font-medium">{t.applyAutomatically}</span>
                <span className="block text-xs text-muted">
                  {t.applyAutomaticallyHint(
                    usedReferences.length,
                    t.cost(
                      creditCost({
                        kind: 'EDIT',
                        resolution: settings.resolution,
                        mode: settings.mode,
                        numImages: 1,
                      }) * usedReferences.length,
                    ),
                  )}
                </span>
              </span>
            </label>
          ) : null}
        </Card>

        <Card className="space-y-4 p-4">
          <h2 className="font-display text-lg font-semibold">{t.stepLook}</h2>
          <div role="radiogroup" aria-label={t.stepLook} className="grid gap-2">
            {(['new', 'face', 'saved'] as const).map((m) => (
              <label
                key={m}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-sm transition',
                  mode === m
                    ? 'border-accent-500 bg-accent-50/60'
                    : 'border-border hover:bg-neutral-50',
                )}
              >
                <input
                  type="radio"
                  name="model-mode"
                  className="mt-1 accent-accent-700"
                  checked={mode === m}
                  onChange={() => changed(setMode)(m)}
                />
                <span>
                  <span className="block font-medium">{t.modes[m]}</span>
                  <span className="block text-xs text-muted">{t.modes[`${m}Hint` as const]}</span>
                </span>
              </label>
            ))}
          </div>

          {mode === 'saved' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => setDialog('ai')}>
                  <Sparkles className="size-4" aria-hidden /> {t.newAiModel}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDialog('personal')}>
                  <UserPlus className="size-4" aria-hidden /> {t.newPersonal}
                </Button>
              </div>
              <ModelGrid selectedId={model?.id ?? null} onSelect={changed(setModel)} />
              {model && model.abayaCount > 0 ? (
                <p className="flex items-start gap-2 rounded-md bg-amber-50 p-2.5 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />{' '}
                  {t.reuseWarning}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              {mode === 'face' ? (
                <div className="space-y-2">
                  <PhotoInput
                    label={t.facePhoto}
                    hint={t.faceHint}
                    value={face}
                    onChange={setFace}
                  />
                  <p className="text-xs text-muted">{t.faceTip}</p>
                  <BodyFields
                    attrs={attrs}
                    onChange={(patch) => changed(setAttrs)({ ...attrs, ...patch })}
                  />
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox
                      className="mt-0.5"
                      checked={consent}
                      onCheckedChange={(v) => setConsent(v === true)}
                    />
                    {t.consent}
                  </label>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-neutral-50 p-2.5 text-xs ring-1 ring-border">
                  <span className="min-w-0 text-neutral-700">
                    {t.lookSummary(attrs.age, attrs.skinTone, shaylaLabel(attrs.hijab))}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => changed(setAttrs)({ ...attrs, ...varietyTraits(Date.now()) })}
                  >
                    <Shuffle className="size-4" aria-hidden /> {t.newFace}
                  </Button>
                </div>
              )}
              <button
                type="button"
                className="text-xs font-medium text-accent-700 hover:underline"
                onClick={() => setShowLook((v) => !v)}
              >
                {showLook ? t.hideLook : t.customiseLook}
              </button>
              {showLook ? (
                <LookFields
                  attrs={attrs}
                  onChange={(patch) => changed(setAttrs)({ ...attrs, ...patch })}
                  faceFromPhoto={mode === 'face'}
                />
              ) : null}
              {ownBackground ? null : (
                <BackgroundPicker value={background} onChange={changed(setBackground)} />
              )}
              <PhotoInput
                label={t.ownBackground}
                hint={t.ownBackgroundHint}
                value={ownBackground}
                onChange={changed(setOwnBackground)}
              />
            </div>
          )}
          <StylingFields
            value={styling}
            onChange={changed(setStyling)}
            framing={mode !== 'saved'}
          />
        </Card>

        <Card className="space-y-4 p-4">
          <h2 className="font-display text-lg font-semibold">{t.stepSettings}</h2>
          <DirectionBox value={direction} onChange={changed(setDirection)} />
          <PromptBox built={built} override={prompt} onOverride={setPrompt} />
          <SettingsFields
            value={settings}
            onChange={setSettings}
            kind={kind}
            faceReference={withFace}
          />
          {unseenReferences ? (
            <p className="flex items-start gap-2 rounded-md bg-amber-50 p-2.5 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />{' '}
              {t.referencesWarning}
            </p>
          ) : null}
          <Button
            className="w-full"
            disabled={!ready}
            loading={createMaster.isPending || createOneStep.isPending}
            onClick={() => void generate()}
          >
            <Camera className="size-4" aria-hidden /> {t.generate(t.cost(totalCost))}
          </Button>
        </Card>
      </div>

      <Workspace
        master={master}
        masters={masters}
        jobs={all}
        loading={jobs.isPending}
        error={jobs.error}
        onPick={setMasterId}
      />

      {dialog === 'ai' ? <AiModelDialog onClose={() => setDialog(null)} /> : null}
      {dialog === 'personal' ? (
        <PersonalModelDialog onClose={() => setDialog(null)} onSaved={setModel} />
      ) : null}
    </div>
  );
}

/** The selected master and everything made from it (poses, edits, finals, retries). */
function Workspace({
  master,
  masters,
  jobs,
  loading,
  error,
  onPick,
}: {
  master: CatalogJobDto | null;
  masters: CatalogJobDto[];
  jobs: CatalogJobDto[];
  loading: boolean;
  error: unknown;
  onPick: (id: string) => void;
}) {
  const [addingSet, setAddingSet] = React.useState(false);
  if (loading) return <Skeleton className="h-[520px]" />;
  if (error) return <ErrorState error={error} />;
  if (!master) {
    return (
      <Card>
        <EmptyState
          icon={<Layers className="size-5" />}
          title={t.workspace}
          body={t.workspaceEmpty}
        />
      </Card>
    );
  }

  // Everything descending from the master's images (and retries of them), newest first.
  const family: CatalogJobDto[] = [];
  const imageIds = new Set(master.images.map((i) => i.id));
  const jobIds = new Set([master.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const j of jobs) {
      if (j.id === master.id || family.includes(j)) continue;
      if (
        (j.parentImageId && imageIds.has(j.parentImageId)) ||
        (j.retryOfImageId && imageIds.has(j.retryOfImageId)) ||
        (j.afterJobId && jobIds.has(j.afterJobId))
      ) {
        family.push(j);
        jobIds.add(j.id);
        j.images.forEach((i) => imageIds.add(i.id));
        grew = true;
      }
    }
  }
  family.sort(
    (a, b) =>
      CATALOG_VIEWS.indexOf(a.view) - CATALOG_VIEWS.indexOf(b.view) ||
      b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">{t.workspace}</h2>
        <Button size="sm" variant="secondary" onClick={() => setAddingSet(true)}>
          <BookImage className="size-4" aria-hidden /> {t.addSet}
        </Button>
        {masters.length > 1 ? (
          <NativeSelect
            aria-label={t.master}
            className="w-64"
            value={master.id}
            onChange={(e) => onPick(e.target.value)}
          >
            {masters.map((m) => (
              <option key={m.id} value={m.id}>
                {`${t.master} · ${formatRelative(m.createdAt)} · ${m.resolution.toUpperCase()}`}
              </option>
            ))}
          </NativeSelect>
        ) : null}
      </div>
      <JobCard job={master} />
      {family.map((j) => (
        <JobCard key={j.id} job={j} />
      ))}
      {addingSet ? (
        <AddSetDialog jobs={[master, ...family]} onClose={() => setAddingSet(false)} />
      ) : null}
    </div>
  );
}

// ───────────── Models and history ─────────────

function Models() {
  const [dialog, setDialog] = React.useState<'ai' | 'personal' | null>(null);
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" onClick={() => setDialog('ai')}>
          <Plus className="size-4" aria-hidden /> {t.newAiModel}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setDialog('personal')}>
          <UserPlus className="size-4" aria-hidden /> {t.newPersonal}
        </Button>
      </div>
      <ModelGrid manage />
      {dialog === 'ai' ? <AiModelDialog onClose={() => setDialog(null)} /> : null}
      {dialog === 'personal' ? <PersonalModelDialog onClose={() => setDialog(null)} /> : null}
    </Card>
  );
}

function History() {
  const jobs = useCatalogJobs();
  const [view, setView] = React.useState<string>('');
  if (jobs.isPending) return <Skeleton className="h-96" />;
  if (jobs.isError) return <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />;
  const list = (jobs.data ?? []).filter((j) => !view || j.view === view);
  return (
    <div className="space-y-4">
      <NativeSelect
        aria-label={t.tabs.history}
        className="w-56"
        value={view}
        onChange={(e) => setView(e.target.value)}
      >
        <option value="">{t.all}</option>
        {CATALOG_VIEWS.map((v) => (
          <option key={v} value={v}>
            {t.views[v]}
          </option>
        ))}
      </NativeSelect>
      {list.length === 0 ? (
        <Card>
          <EmptyState icon={<Layers className="size-5" />} title={t.historyEmpty} />
        </Card>
      ) : (
        list.map((j) => <JobCard key={j.id} job={j} />)
      )}
      {jobs.hasNextPage ? (
        <div className="text-center">
          <Button variant="secondary" loading={jobs.isFetchingNextPage} onClick={() => void jobs.fetchNextPage()}>
            {t.loadMore}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
