'use client';

import { type CustomerPreviewDto, type MeasurementProfileDto, PREVIEW_REQUEST_MAX, type TryOnBody, type TryOnMode } from '@abaya/contracts';
import { m } from 'framer-motion';
import { Camera, Check, ImagePlus, Loader2, Ruler, ShieldCheck, Sparkles, Trash2, UserRound, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useStrings } from '@/components/i18n/locale-provider';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/misc';
import { errorMessage, serverText } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { OPEN_PICTURE_EVENT, PICTURE_PARAM, watchPicture } from '@/lib/ai-watch';
import { OPEN_TRYON_EVENT, TRYON_PARAM } from '@/lib/try-on-link';
import { usePathname, useRouter } from '@/components/i18n/navigation';
import { HEIC_ACCEPT, jpegFromHeic, looksLikeHeic } from '@/lib/heic';
import { type BackgroundChoice, BackgroundPicker } from './background-picker';
import { CameraCapture, canUseCamera } from './camera-capture';
import { TryOnChoice, type TryOnVersion } from './try-on-choice';
import { guideSeen, TryOnGuide } from './try-on-guide';
import { TRYON_ACCEPT, useAiLimits, useAiPicture, useCreatePreview, useCreateTryOn, useDeleteTryOn, useRecentAiPictures } from '@/lib/queries/try-on';
import { useMeasurements } from '@/lib/queries/me';
import { cn, loginHref } from '@/lib/utils';

/**
 * "See it before it's made": an AI preview of the design with the customer's choices, and a
 * virtual try-on on her own photo. Both are on request (each one uses AI credits), and both
 * are only pictures: the order is always made from the options she chooses.
 */
export function AiStudio({
  design,
  selectedIds,
  complete,
  colourId,
  onLogin,
  canPreview = true,
  tryOnChoice,
}: {
  design: { id: string; name: string; slug: string };
  selectedIds: string[];
  /** Every required option group has a choice. */
  complete: boolean;
  colourId: string | null;
  onLogin: () => void;
  /** False in "Order as shown": the photos already show it, so only the try-on is offered. */
  canPreview?: boolean;
  /** Has she changed the abaya (then "Try it on" asks: original or customised), her changes, and the original photo. */
  tryOnChoice?: { customised: boolean; changes: string[]; originalImageUrl: string | null; colourPhotoOnly?: boolean };
}) {
  const { tryOn: t, design: d } = useStrings();
  const authStatus = useAuth().status;
  const loggedIn = authStatus === 'authenticated';
  const limits = useAiLimits();
  const create = useCreatePreview();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewOf, setPreviewOf] = useState<string>('');
  const [tryOnOpen, setTryOnOpen] = useState(false);
  // Which abaya the try-on puts on her, and the popup that asks when she has customised it.
  const [tryOnVersion, setTryOnVersion] = useState<TryOnVersion>('ORIGINAL');
  const [chooserOpen, setChooserOpen] = useState(false);
  const [request, setRequest] = useState('');
  const words = request.trim().replace(/\s+/g, ' ');
  const picture = useAiPicture(previewId);
  // With words the picture is made from the words alone, so option changes do not make it stale.
  const key = words ? `words:${words.toLowerCase()}` : [...selectedIds].sort().join(',');
  // A picture opened from "Your recent pictures" is shown as it was, never as out of date.
  const stale = Boolean(previewId) && previewOf !== key && previewOf !== FROM_RECENT;
  const busy = create.isPending || picture.data?.status === 'QUEUED' || picture.data?.status === 'RUNNING';
  const off = limits.data ? !limits.data.available : false;

  const makePreview = () => {
    if (!loggedIn) return onLogin();
    if (!complete) {
      toast.error(d.selectionIncomplete);
      return;
    }
    create.mutate(
      { designId: design.id, selectedOptionValueIds: selectedIds, request: words || undefined },
      {
        onSuccess: (dto) => {
          setPreviewId(dto.id);
          setPreviewOf(key);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  const done = picture.data?.status === 'DONE' && picture.data.imageUrl ? picture.data : null;
  // Her preview of exactly the options chosen now (not one from "recent pictures"): the customised abaya to try on.
  const readyPreview = done && done.kind === 'PREVIEW' && previewOf === key ? done : null;
  const customised = canPreview && Boolean(tryOnChoice?.customised);
  /** Open the try-on: when she has customised the abaya, first ask which one. */
  const openVersioned = () => {
    if (customised) setChooserOpen(true);
    else {
      setTryOnVersion('ORIGINAL');
      setTryOnOpen(true);
    }
  };
  const openVersionedRef = useRef(openVersioned);
  useEffect(() => {
    openVersionedRef.current = openVersioned;
  });

  const section = useRef<HTMLElement>(null);
  // The first-time guide, shown before her first try-on (then what she asked for continues).
  const [guideOpen, setGuideOpen] = useState(false);
  const afterGuide = useRef<(() => void) | null>(null);
  const showGuideThen = (next: (() => void) | null) => {
    afterGuide.current = next;
    setGuideOpen(true);
  };
  // "Try it on" from elsewhere (home page, cards, the announcement: ?tryon=1) or from the button
  // under the price: open the try-on window here. Signed out: log in first, then come back to it.
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (authStatus === 'loading') return;
    const reallyOpen = () => {
      if (authStatus !== 'authenticated') {
        router.push(loginHref(`${pathname}?${TRYON_PARAM}=1`));
        return;
      }
      openVersionedRef.current();
      requestAnimationFrame(() => section.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };
    // First time on this device: the guide first, then the try-on (or log in, then the try-on).
    const openTryOn = () => (guideSeen() ? reallyOpen() : showGuideThen(reallyOpen));
    const url = new URL(window.location.href);
    if (url.searchParams.get(TRYON_PARAM)) {
      url.searchParams.delete(TRYON_PARAM);
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      openTryOn();
    }
    window.addEventListener(OPEN_TRYON_EVENT, openTryOn);
    return () => window.removeEventListener(OPEN_TRYON_EVENT, openTryOn);
  }, [authStatus, pathname, router]);

  // "View" on the ready notice: open that picture here (from the address, or at once when she is already on this page).
  useEffect(() => {
    if (!loggedIn) return;
    const open = (id: string) => {
      setPreviewId(id);
      setPreviewOf(FROM_RECENT);
      requestAnimationFrame(() => section.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get(PICTURE_PARAM);
    if (fromUrl) {
      open(fromUrl);
      url.searchParams.delete(PICTURE_PARAM);
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
    const onOpen = (e: Event) => open((e as CustomEvent<string>).detail);
    window.addEventListener(OPEN_PICTURE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PICTURE_EVENT, onOpen);
  }, [loggedIn]);

  return (
    <section
      ref={section}
      aria-labelledby="ai-studio-title"
      className="relative mt-4 scroll-mt-28 overflow-hidden rounded-xl border border-gold-200/70 bg-gradient-to-br from-sand-50 via-surface to-accent-50/40 p-5 sm:p-6"
    >
      <span aria-hidden className="pointer-events-none absolute -end-16 -top-16 size-48 rounded-full bg-gold-200/30 blur-3xl" />
      <p className="relative flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-accent-700">
        <Sparkles className="size-3.5 text-gold-500" aria-hidden />
        {t.eyebrow}
      </p>
      <h2 id="ai-studio-title" className="relative mt-2 font-display text-2xl font-semibold">
        {t.title}
      </h2>
      <p className="relative mt-1 text-sm text-neutral-600">{t.body}</p>

      {canPreview && limits.data?.wording && (
        <div className="relative mt-4">
          <label htmlFor="ai-request" className="text-sm font-medium text-neutral-800">
            {t.requestLabel}
          </label>
          <textarea
            id="ai-request"
            rows={2}
            maxLength={PREVIEW_REQUEST_MAX}
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder={t.requestPlaceholder}
            className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-surface px-3 py-2 text-sm leading-relaxed placeholder:text-muted focus-visible:border-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/30"
          />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {t.requestExamples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setRequest(ex)}
                className="rounded-full border border-gold-300/70 bg-surface px-2.5 py-1 text-xs text-accent-900 transition-colors hover:bg-gold-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              >
                {ex}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">{t.requestHint}</p>
        </div>
      )}

      <div className="relative mt-4 flex flex-wrap gap-2">
        {canPreview && (
          <Button onClick={makePreview} loading={create.isPending} disabled={busy || off}>
            <Wand2 aria-hidden />
            {previewId && stale ? t.previewAgain : t.preview}
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            const go = () => (loggedIn ? openVersioned() : onLogin());
            if (guideSeen()) go();
            else showGuideThen(go);
          }}
          disabled={off}
        >
          <Camera aria-hidden />
          {t.tryOn}
        </Button>
      </div>
      <p className="relative mt-2 text-xs text-muted">
        {!canPreview
          ? t.asShownNote
          : !loggedIn
          ? t.loginHint
          : off
            ? t.unavailable
            : limits.data
              ? t.left(limits.data.previewsLeft, limits.data.tryOnsLeft)
              : ' '}
      </p>
      {limits.data && !limits.data.live && <p className="relative mt-1 text-xs text-warning">{t.testMode}</p>}
      {loggedIn && limits.data && <p className="relative mt-1 text-xs text-muted">{t.keepNote(limits.data.keepMinutes)}</p>}

      {loggedIn && (
        <RecentStrip
          designId={design.id}
          activeId={previewId}
          onPick={(id) => {
            setPreviewId(id);
            setPreviewOf(FROM_RECENT);
          }}
        />
      )}

      {previewId && (
        <div className="relative mt-4" aria-live="polite">
          {picture.data?.status === 'FAILED' ? (
            <Alert
              tone="danger"
              action={
                <Button size="sm" variant="secondary" onClick={makePreview}>
                  {t.retry}
                </Button>
              }
            >
              {picture.data.error ? serverText(picture.data.error) : null}
            </Alert>
          ) : done ? (
            <figure className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="relative">
                <DevelopingImage
                  key={done.id}
                  src={done.imageUrl!}
                  alt={done.kind === 'TRYON' ? t.resultAlt(design.name) : t.previewAlt(design.name)}
                  className="aspect-[4/5]"
                />
                <span className="absolute start-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-neutral-950/70 px-3 py-1 text-[11px] font-medium text-white backdrop-blur">
                  {done.kind === 'TRYON' ? <Camera className="size-3" aria-hidden /> : <Sparkles className="size-3" aria-hidden />}
                  {done.kind === 'TRYON' ? `${t.tryOnBadge} · ${done.customised ? t.versionCustom : t.versionOriginal}` : t.badge}
                </span>
              </div>
              <figcaption className="space-y-1 p-3 text-xs leading-relaxed text-neutral-600">
                {previewOf === FROM_RECENT && <span className="block font-medium text-accent-900">{t.fromRecent}</span>}
                {stale && <span className="block font-medium text-warning">{t.stale}</span>}
                {done.fromWords && <span className="block font-medium text-accent-900">{t.fromWordsNote}</span>}
                {done.leftOut.length > 0 && <span className="block text-warning">{t.leftOut(done.leftOut)}</span>}
                {t.disclaimer}
                <span className="flex items-center gap-1.5 pt-1 text-[11px] text-muted">
                  <ShieldCheck className="size-3.5 shrink-0 text-accent-700" aria-hidden />
                  {t.imageRights}
                </span>
              </figcaption>
            </figure>
          ) : (
            <Making label={t.making} />
          )}
        </div>
      )}

      {tryOnOpen && (
        <TryOnDialog
          design={design}
          version={tryOnVersion}
          readyPreviewId={readyPreview?.id ?? null}
          colourPhotoId={tryOnChoice?.colourPhotoOnly ? colourId : null}
          selectedIds={selectedIds}
          onClose={() => setTryOnOpen(false)}
          onHowItWorks={() => showGuideThen(null)}
        />
      )}
      <TryOnChoice
        open={chooserOpen}
        originalImageUrl={tryOnChoice?.originalImageUrl ?? null}
        customImageUrl={readyPreview?.imageUrl ?? null}
        changes={tryOnChoice?.changes ?? []}
        complete={complete}
        onClose={() => setChooserOpen(false)}
        onPick={(v) => {
          setChooserOpen(false);
          setTryOnVersion(v);
          setTryOnOpen(true);
        }}
      />
      <TryOnGuide
        open={guideOpen}
        onDone={() => {
          setGuideOpen(false);
          const next = afterGuide.current;
          afterGuide.current = null;
          next?.();
        }}
      />
    </section>
  );
}

/** Her saved measurements as a figure for the try-on (only values the AI accepts). */
function figureFrom(p: MeasurementProfileDto): TryOnBody | null {
  const within = (v: number, min: number, max: number) => (v >= min && v <= max ? Math.round(v) : undefined);
  const heightCm = within(p.heightCm, 120, 210);
  if (!heightCm) return null;
  return { heightCm, bustCm: within(p.bustCm, 60, 170), waistCm: within(p.waistCm, 50, 160), hipCm: within(p.hipCm, 60, 180) };
}

/** Marks a picture opened from "Your recent pictures" (shown as it was made). */
const FROM_RECENT = '#recent';

const clock = () => Date.now();

/** The time now, refreshed every `everyMs` (for the countdowns). */
function useNow(everyMs: number): number {
  const [now, setNow] = useState(clock);
  useEffect(() => {
    const timer = setInterval(() => setNow(clock()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

const minutesUntil = (iso: string | null, now: number) => (iso ? Math.max(0, Math.ceil((Date.parse(iso) - now) / 60_000)) : 0);

/**
 * Her recent previews and try-ons of this design, newest first, each for an hour after she got
 * it (with the minutes left). Tap one to see it large; the pictures cannot be saved from here.
 */
function RecentStrip({ designId, activeId, onPick }: { designId: string; activeId: string | null; onPick: (id: string) => void }) {
  const { tryOn: t } = useStrings();
  const recent = useRecentAiPictures(designId);
  const now = useNow(20_000);
  const items = (recent.data?.items ?? []).filter((i) => minutesUntil(i.expiresAt, now) > 0);
  if (items.length === 0) return null;
  return (
    <div className="relative mt-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-800">{t.recentTitle}</p>
      <ul className="mt-2 flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
        {items.map((item) => (
          <li key={item.id} className="shrink-0">
            <RecentThumb item={item} minutes={minutesUntil(item.expiresAt, now)} active={item.id === activeId} onPick={onPick} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecentThumb({
  item,
  minutes,
  active,
  onPick,
}: {
  item: CustomerPreviewDto;
  minutes: number;
  active: boolean;
  onPick: (id: string) => void;
}) {
  const { tryOn: t } = useStrings();
  const kind = item.kind === 'TRYON' ? t.recentTryOn : t.recentPreview;
  const making = item.status === 'QUEUED' || item.status === 'RUNNING';
  const ready = item.status === 'DONE' && item.imageUrl;
  return (
    <button
      type="button"
      onClick={() => onPick(item.id)}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={t.showRecent(kind, minutes)}
      aria-pressed={active}
      className={cn(
        'group block w-[5.5rem] text-start focus-visible:outline-none',
        '[-webkit-touch-callout:none] select-none',
      )}
    >
      <span
        className={cn(
          'relative block aspect-[4/5] overflow-hidden rounded-lg bg-sand-100 transition-all duration-200 group-focus-visible:ring-2 group-focus-visible:ring-accent-500',
          active ? 'ring-2 ring-gold-400 ring-offset-2 ring-offset-surface' : 'ring-1 ring-gold-200/70 group-hover:ring-gold-300',
        )}
      >
        {ready ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link to a watermarked picture
          <img src={item.imageUrl!} alt="" draggable={false} className="pointer-events-none size-full select-none object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center px-1 text-center text-[10px] leading-tight text-muted">
            {making ? <Loader2 className="size-4 animate-spin text-accent-700" aria-hidden /> : t.recentFailed}
          </span>
        )}
        <span className="absolute start-1 top-1 inline-flex items-center gap-1 rounded-full bg-neutral-950/65 px-1.5 py-0.5 text-[9px] font-medium text-white">
          {item.kind === 'TRYON' ? <Camera className="size-2.5" aria-hidden /> : <Sparkles className="size-2.5" aria-hidden />}
          {kind}
        </span>
      </span>
      <span className={cn('mt-1 block text-[10px] tabular-nums', minutes <= 5 ? 'font-medium text-warning' : 'text-muted')}>
        {making ? t.recentMaking : t.minutesLeft(minutes)}
      </span>
    </button>
  );
}

/** What she types (as text, so a field can be empty). */
type BodyDraft = Record<'heightCm' | 'weightKg' | 'bustCm' | 'waistCm' | 'hipCm' | 'sleeveLengthCm' | 'fullLengthCm', string>;
const EMPTY_BODY: BodyDraft = { heightCm: '', weightKg: '', bustCm: '', waistCm: '', hipCm: '', sleeveLengthCm: '', fullLengthCm: '' };

/** Allowed values (the same as a saved measurement profile; the API checks them again). */
const BODY_RANGES: Record<keyof BodyDraft, [number, number]> = {
  heightCm: [120, 210],
  weightKg: [30, 200],
  bustCm: [60, 170],
  waistCm: [50, 160],
  hipCm: [60, 180],
  sleeveLengthCm: [40, 85],
  fullLengthCm: [100, 175],
};

/** Fields with a problem: height missing, or any typed value outside its range. */
function bodyProblems(d: BodyDraft): Set<keyof BodyDraft> {
  const bad = new Set<keyof BodyDraft>();
  for (const k of Object.keys(BODY_RANGES) as (keyof BodyDraft)[]) {
    const raw = d[k].trim();
    if (!raw) {
      if (k === 'heightCm') bad.add(k);
      continue;
    }
    const v = Number.parseInt(raw, 10);
    const [min, max] = BODY_RANGES[k];
    if (!Number.isFinite(v) || v < min || v > max) bad.add(k);
  }
  return bad;
}

/** Her measurements as the API takes them; null when her height is missing or out of range (the API checks the rest). */
function toBody(d: BodyDraft): TryOnBody | null {
  const n = (v: string) => {
    const x = Number.parseInt(v, 10);
    return Number.isFinite(x) ? x : undefined;
  };
  const heightCm = n(d.heightCm);
  if (!heightCm || heightCm < 120 || heightCm > 210) return null;
  const out: TryOnBody = { heightCm };
  for (const k of ['weightKg', 'bustCm', 'waistCm', 'hipCm', 'sleeveLengthCm', 'fullLengthCm'] as const) {
    const v = n(d[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * Her measurements for a try-on: height (needed), weight and bust/waist/hips for "a model like
 * me", sleeve and full length for the made-to-measure fit. A saved profile fills them in one tap.
 */
function BodyFields({
  mode,
  value,
  onChange,
  problems,
}: {
  mode: TryOnMode;
  value: BodyDraft;
  onChange: (v: BodyDraft) => void;
  /** Fields to mark in red (after she pressed "Try it on"). */
  problems: Set<keyof BodyDraft> | null;
}) {
  const { tryOn: t } = useStrings();
  const profiles = useMeasurements();
  const [more, setMore] = useState(false);
  const set = (k: keyof BodyDraft) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value.replace(/[^0-9]/g, '').slice(0, 3) });
  const field = (k: keyof BodyDraft, label: string, unit: string, optional: boolean) => {
    const [min, max] = BODY_RANGES[k];
    const bad = problems?.has(k) ?? false;
    const hintId = `try-on-${k}-hint`;
    return (
      <label key={k} className="block">
        <span className="text-xs font-medium text-neutral-700">
          {label}
          {optional && <span className="ms-1 font-normal text-muted">({t.optional})</span>}
        </span>
        <span
          className={cn(
            'mt-1 flex items-center rounded-lg border bg-surface focus-within:ring-2',
            bad ? 'border-danger focus-within:ring-danger/30' : 'border-neutral-300 focus-within:border-accent-500 focus-within:ring-accent-500/30',
          )}
        >
          <input
            inputMode="numeric"
            value={value[k]}
            onChange={set(k)}
            aria-invalid={bad || undefined}
            aria-describedby={hintId}
            className="w-full min-w-0 rounded-lg bg-transparent px-3 py-2 text-sm tabular-nums focus-visible:outline-none"
            aria-label={`${label} (${unit})`}
          />
          <span className="pe-3 text-xs text-muted">{unit}</span>
        </span>
        <span id={hintId} className={cn('mt-1 block text-[11px] leading-snug', bad ? 'text-danger' : 'text-muted')}>
          {bad
            ? k === 'heightCm' && !value.heightCm.trim()
              ? t.heightRequired
              : t.outOfRange(label, min, max, unit)
            : `${t.rangeHint(min, max, unit)}${k === 'sleeveLengthCm' ? ` · ${t.sleeveHint}` : ''}`}
        </span>
      </label>
    );
  };
  return (
    <fieldset className="space-y-3 rounded-xl border border-gold-200/80 bg-sand-50/60 p-3.5">
      <legend className="px-1 text-sm font-semibold">{t.measurementsTitle}</legend>
      {profiles.data && profiles.data.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {profiles.data.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  heightCm: String(p.heightCm),
                  bustCm: String(p.bustCm),
                  waistCm: String(p.waistCm),
                  hipCm: String(p.hipCm),
                  sleeveLengthCm: String(p.sleeveLengthCm),
                  fullLengthCm: String(p.fullLengthCm),
                })
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-gold-300/80 bg-surface px-3 py-1.5 text-xs font-medium text-accent-900 hover:bg-gold-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            >
              <Ruler className="size-3.5" aria-hidden />
              {t.useSaved(p.name)}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        {field('heightCm', t.heightLabel, t.cm, false)}
        {mode === 'MODEL' ? field('weightKg', t.weightLabel, t.kg, true) : field('sleeveLengthCm', t.sleeveLabel, t.cm, true)}
        {mode === 'PHOTO' && field('fullLengthCm', t.fullLengthLabel, t.cm, true)}
      </div>
      {mode === 'MODEL' &&
        (more || value.bustCm || value.waistCm || value.hipCm ? (
          <div className="grid grid-cols-3 gap-2.5">
            {field('bustCm', t.bustLabel, t.cm, true)}
            {field('waistCm', t.waistLabel, t.cm, true)}
            {field('hipCm', t.hipLabel, t.cm, true)}
          </div>
        ) : (
          <button type="button" onClick={() => setMore(true)} className="text-xs font-medium text-accent-800 underline underline-offset-4">
            {t.moreMeasurements}
          </button>
        ))}
      <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted">
        <ShieldCheck className="mt-px size-3.5 shrink-0 text-accent-700" aria-hidden />
        {t.bodyPrivacy}
      </p>
    </fieldset>
  );
}

/** Shimmering fabric while the picture is made. */
/** How long a try-on usually takes at FASHN: one step, or two (a model first, or the fit). */
const EXPECTED_MS = { short: 60_000, long: 100_000 };

const clockText = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * The try-on waiting screen: her own photo softly "developing" behind a shimmer, what is
 * happening now, "Usually ready in 30–60 seconds", a progress bar that follows the usual time
 * (it slows near the end and never claims to be done before it is), the time so far, and "Keep
 * browsing": she may close it and look around; a notice tells her when the picture is ready.
 */
function TryOnWaiting({
  startedAt,
  phase,
  mode,
  fit,
  photoUrl,
  onKeepBrowsing,
  customFirst = false,
  newBackground = false,
}: {
  startedAt: number;
  phase: 'customising' | 'upload' | 'queued' | 'running';
  /** Her customised abaya is made first: a longer wait, with its own first stage. */
  customFirst?: boolean;
  /** A new background is put in at the end: a longer wait, with its own last stage. */
  newBackground?: boolean;
  mode: TryOnMode;
  fit: boolean;
  photoUrl: string | null;
  onKeepBrowsing: (() => void) | null;
}) {
  const { tryOn: t } = useStrings();
  const now = useNow(500);
  const elapsed = Math.max(0, now - startedAt);
  const long = mode === 'MODEL' || fit || customFirst || newBackground;
  const expected = long ? EXPECTED_MS.long : EXPECTED_MS.short;
  const pct =
    phase === 'customising'
      ? Math.min(45, 2 + 43 * (1 - Math.exp(-elapsed / 40_000)))
      : phase === 'upload'
      ? Math.min(8, (elapsed / 1000) * 2)
      : Math.min(95, 8 + 87 * (1 - Math.exp(-elapsed / (expected * 0.55))));
  const half = elapsed < expected / 2;
  const stage =
    phase === 'customising'
      ? t.waitStageCustomise
      : phase === 'upload'
      ? t.waitStageUpload
      : phase === 'queued'
        ? t.waitStageQueue
        : elapsed > expected * 2
          ? t.waitStageSlow
          : elapsed > expected
            ? t.waitStageAlmost
            : newBackground && elapsed > expected * 0.6
              ? t.waitStageBackground
            : mode === 'MODEL'
              ? half
                ? t.waitStageModel
                : t.waitStageDressModel
              : fit && !half
                ? t.waitStageFit
                : t.waitStageDress;

  return (
    <div className="space-y-4">
      <div className="relative flex aspect-[4/5] w-full items-end overflow-hidden rounded-xl border border-border bg-sand-100">
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- her own photo, from memory only
          <img src={photoUrl} alt="" aria-hidden className="absolute inset-0 size-full scale-105 object-cover opacity-60 blur-md saturate-50" />
        )}
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-accent-950/80 via-accent-950/20 to-transparent" />
        <span aria-hidden className="absolute -inset-x-1/2 inset-y-0 bg-gradient-to-r from-transparent via-white/40 to-transparent motion-safe:animate-shimmer" />
        <div className="relative w-full p-5 text-white">
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-gold-200">
            <Sparkles className="size-3.5 motion-safe:animate-pulse" aria-hidden />
            {t.waitUsually(long)}
          </p>
          <p className="mt-2 min-h-[3rem] font-display text-xl leading-snug" aria-live="polite">
            {stage}
          </p>
        </div>
      </div>

      <div>
        <div
          role="progressbar"
          aria-label={t.waitProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          className="h-1.5 overflow-hidden rounded-full bg-sand-200"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent-800 to-gold-400 transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 flex justify-between text-xs tabular-nums text-muted">
          <span>{t.waitElapsed(clockText(elapsed))}</span>
          <span>{Math.round(pct)}%</span>
        </p>
      </div>

      {onKeepBrowsing && (
        <div className="rounded-lg border border-gold-200 bg-gold-50/60 p-3">
          <p className="text-xs leading-relaxed text-neutral-700">{t.keepBrowsingHint}</p>
          <Button variant="secondary" size="sm" className="mt-2.5" onClick={onKeepBrowsing}>
            {t.keepBrowsing}
          </Button>
        </div>
      )}
    </div>
  );
}

function Making({ label }: { label: string }) {
  return (
    <div className="relative flex aspect-[4/5] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-border bg-sand-100/70">
      <span aria-hidden className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.4)_0_2px,transparent_2px_14px)] opacity-70" />
      <span aria-hidden className="absolute -inset-x-1/2 inset-y-0 bg-gradient-to-r from-transparent via-white/70 to-transparent motion-safe:animate-shimmer" />
      <Loader2 className="relative size-6 animate-spin text-accent-700" aria-hidden />
      <p className="relative px-6 text-center text-sm text-neutral-700">{label}</p>
    </div>
  );
}

/** A finished AI picture develops from a pale, soft print into the full photo, with a small sparkle burst. */
function DevelopingImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const stars = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);
  return (
    <>
      {/* Not saveable: no right-click "Save image", no dragging out, no long-press on phones
          (the picture also carries a visible and an invisible watermark). */}
      <m.img
        src={src}
        alt={alt}
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        className={cn('pointer-events-none w-full select-none object-cover [-webkit-touch-callout:none]', className)}
        initial={{ opacity: 0, filter: 'sepia(0.45) brightness(1.7) contrast(0.6) blur(6px)' }}
        animate={{ opacity: 1, filter: 'sepia(0) brightness(1) contrast(1) blur(0px)' }}
        transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
      />
      {/* A clear layer over the picture takes the clicks and long-presses instead of the image. */}
      <span aria-hidden className="absolute inset-0 select-none [-webkit-touch-callout:none]" onContextMenu={(e) => e.preventDefault()} />
      <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {stars.map((a, i) => (
          <m.span
            key={i}
            className="absolute size-2 rounded-full bg-gold-200 shadow-[0_0_12px_rgba(221,187,107,0.9)]"
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
            animate={{ x: Math.cos(a) * 110, y: Math.sin(a) * 110, opacity: [0, 1, 0], scale: [0.4, 1.2, 0.2] }}
            transition={{ duration: 1.1, delay: 0.5 + i * 0.03, ease: 'easeOut' }}
          />
        ))}
      </span>
    </>
  );
}

function TryOnDialog({
  design,
  version,
  readyPreviewId,
  colourPhotoId,
  selectedIds,
  onClose,
  onHowItWorks,
}: {
  design: { id: string; name: string; slug: string };
  /** Which abaya she chose to try on. */
  version: TryOnVersion;
  /** Her finished preview of the options chosen now (the customised abaya), if she made one. */
  readyPreviewId: string | null;
  /** Only the colour changed and it was photographed: try on that photo (no preview needed). */
  colourPhotoId: string | null;
  /** Her chosen options, to make the customised abaya first when there is no preview yet. */
  selectedIds: string[];
  onClose: () => void;
  /** Shows the first-time guide again. */
  onHowItWorks: () => void;
}) {
  const { tryOn: t } = useStrings();
  const input = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<TryOnMode>('PHOTO');
  const [fit, setFit] = useState(false);
  const [body, setBody] = useState<BodyDraft>(EMPTY_BODY);
  const [file, setFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  /** A picked or captured photo: HEIC is turned into a JPEG first. */
  const takePicked = (chosen: File) => {
    if (!looksLikeHeic(chosen)) return setFile(chosen);
    setPreparing(true);
    jpegFromHeic(chosen)
      .then(setFile)
      .catch(() => {
        setFile(null);
        setMessage(t.photoConvertFailed);
      })
      .finally(() => setPreparing(false));
  };
  const [startedAt, setStartedAt] = useState(0);
  // Her saved measurements (if any) tell the AI her figure, so the abaya is fitted to her (no extra step).
  const savedProfiles = useMeasurements();
  // The background behind her: her own (null), a ready-made scene, or her own words.
  const [background, setBackground] = useState<BackgroundChoice>(null);
  const canDescribeBackground = Boolean(useAiLimits().data?.wording);
  // "My customised version" without a preview: the preview is made first (this id), then the try-on.
  const makePreview = useCreatePreview();
  const [chainId, setChainId] = useState<string | null>(null);
  const chain = useAiPicture(chainId);
  const pending = useRef<Parameters<typeof create.mutate>[0] | null>(null);
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const create = useCreateTryOn();
  const remove = useDeleteTryOn();
  const result = useAiPicture(resultId);

  // The chosen photo is shown from memory only; it leaves the browser when she presses "Try it on".
  const photoUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  // Her measurements are sent for "a model like me", and for a photo try-on only when she asks for the fit.
  const needsBody = mode === 'MODEL' || fit;
  const [showProblems, setShowProblems] = useState(false);
  const problems = needsBody ? bodyProblems(body) : new Set<keyof BodyDraft>();
  const tryOn = (body: Parameters<typeof create.mutate>[0]) =>
    create.mutate(body, { onSuccess: (dto) => setResultId(dto.id), onError: (e) => setMessage(errorMessage(e)) });
  const start = () => {
    if (mode === 'PHOTO' && preparing) return setMessage(t.preparingPhoto);
    if (mode === 'PHOTO' && !file) return setMessage(t.photoRequired);
    // Checked here first: a wrong value never reaches the AI (and costs no credit).
    if (problems.size > 0) {
      setShowProblems(true);
      return setMessage(problems.has('heightCm') && problems.size === 1 ? t.heightRequired : t.checkFields);
    }
    const measured = needsBody ? toBody(body) : null;
    if (needsBody && !measured) return setMessage(t.heightRequired);
    if (background && 'text' in background && background.text.trim().length < 3) return setMessage(t.background.customLabel);
    if (!consent) return setMessage(t.consentRequired);
    setMessage(null);
    setStartedAt(Date.now());
    const backgroundField = !background
      ? {}
      : 'preset' in background
        ? { backgroundPreset: background.preset }
        : { backgroundText: background.text.trim() };
    const saved = savedProfiles.data?.find((p) => p.isDefault) ?? savedProfiles.data?.[0];
    const figure = mode === 'PHOTO' && !measured && saved ? figureFrom(saved) : null;
    const request = {
      ...backgroundField,
      ...(figure ? { figure } : {}),
      file: mode === 'PHOTO' ? file : null,
      designId: design.id,
      mode,
      ...(measured ? { body: measured } : {}),
      consent: true as const,
    };
    // The original: the abaya as photographed. Her version: on her preview (made first if needed).
    if (version === 'ORIGINAL') return tryOn(request);
    if (readyPreviewId) return tryOn({ ...request, previewId: readyPreviewId });
    if (colourPhotoId) return tryOn({ ...request, colourValueId: colourPhotoId });
    pending.current = request;
    makePreview.mutate(
      { designId: design.id, selectedOptionValueIds: selectedIds },
      { onSuccess: (dto) => setChainId(dto.id), onError: (e) => setMessage(errorMessage(e)) },
    );
  };

  // The customised abaya is ready: put it on her. It failed: say so (nothing else is spent).
  const chainStatus = chain.data?.status;
  useEffect(() => {
    if (!chainId || !pending.current) return;
    if (chainStatus === 'DONE') {
      const body = { ...pending.current, previewId: chainId };
      pending.current = null;
      create.mutate(body, { onSuccess: (dto) => setResultId(dto.id), onError: (e) => setMessage(errorMessage(e)) });
    } else if (chainStatus === 'FAILED') {
      pending.current = null;
    }
  }, [chainId, chainStatus, create]);
  // Her customised abaya could not be made: shown with the form, so she can try again.
  const chainError = chainStatus === 'FAILED' ? (chain.data?.error ? serverText(chain.data.error) : t.retry) : null;

  const reset = () => {
    setResultId(null);
    setFile(null);
  };

  const status = result.data?.status;
  // Making her customised abaya first (before the try-on starts).
  const customising = !resultId && (makePreview.isPending || (Boolean(chainId) && chainStatus !== 'FAILED'));
  const working = customising || create.isPending || status === 'QUEUED' || status === 'RUNNING';

  // Closing while it is being made keeps watching it: a notice says when it is ready, on any page.
  const leave = () => {
    if (resultId && working) watchPicture({ id: resultId, designSlug: design.slug, designName: design.name, startedAt: startedAt || Date.now() });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !create.isPending && leave()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogTitle className="font-display text-2xl font-semibold">{t.dialogTitle}</DialogTitle>
        <button
          type="button"
          onClick={onHowItWorks}
          className="-mt-1 inline-flex w-fit items-center gap-1.5 text-xs font-medium text-accent-800 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        >
          <Sparkles className="size-3.5 text-gold-500" aria-hidden />
          {t.guide.howItWorks}
        </button>
        <DialogDescription className="text-sm text-neutral-700">{t.dialogBody}</DialogDescription>

        {resultId && status === 'DONE' && result.data?.imageUrl ? (
          <div className="mt-4 space-y-3 motion-safe:animate-fade-in">
            <figure className="overflow-hidden rounded-xl border border-border">
              <div className="relative">
                <DevelopingImage key={result.data.id} src={result.data.imageUrl} alt={t.resultAlt(design.name)} className="aspect-[3/4]" />
                <span className="absolute start-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-neutral-950/70 px-3 py-1 text-[11px] font-medium text-white backdrop-blur">
                  {result.data.customised ? <Sparkles className="size-3 text-gold-200" aria-hidden /> : <Camera className="size-3" aria-hidden />}
                  {result.data.customised ? t.versionCustom : t.versionOriginal}
                </span>
              </div>
              <figcaption className="space-y-1.5 p-3 text-xs text-neutral-600">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="size-4 shrink-0 text-accent-700" aria-hidden />
                  {mode === 'MODEL' ? t.privacyModel : t.privacy}
                </span>
                <span className="block ps-6 text-[11px] text-muted">{t.imageRights}</span>
              </figcaption>
            </figure>
            <div className="flex flex-wrap justify-between gap-2">
              <Button
                variant="dangerOutline"
                size="sm"
                loading={remove.isPending}
                onClick={() =>
                  remove.mutate(resultId, {
                    onSuccess: () => {
                      toast.success(t.deleted);
                      onClose();
                    },
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                }
              >
                <Trash2 aria-hidden />
                {t.deleteNow}
              </Button>
              <Button variant="secondary" size="sm" onClick={reset}>
                {t.another}
              </Button>
            </div>
          </div>
        ) : working ? (
          <div className="mt-4">
            <TryOnWaiting
              startedAt={startedAt}
              phase={customising ? 'customising' : create.isPending ? 'upload' : status === 'QUEUED' ? 'queued' : 'running'}
              customFirst={version === 'CUSTOM' && !readyPreviewId && !colourPhotoId}
              newBackground={background !== null}
              mode={mode}
              fit={mode === 'PHOTO' && fit}
              photoUrl={mode === 'PHOTO' ? photoUrl : null}
              onKeepBrowsing={resultId ? leave : null}
            />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {status === 'FAILED' && result.data?.error ? <Alert tone="danger">{serverText(result.data.error)}</Alert> : null}

            {/* Two ways to try it on */}
            <div role="radiogroup" aria-label={t.modeLabel} className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: 'PHOTO', icon: Camera, title: t.modePhoto, hint: t.modePhotoHint },
                  { value: 'MODEL', icon: UserRound, title: t.modeModel, hint: t.modeModelHint },
                ] as const
              ).map((m2) => (
                <button
                  key={m2.value}
                  type="button"
                  role="radio"
                  aria-checked={mode === m2.value}
                  onClick={() => {
                    setMode(m2.value);
                    setMessage(null);
                  }}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-xl border p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                    mode === m2.value ? 'border-primary bg-gradient-to-br from-accent-50 to-surface ring-1 ring-primary' : 'border-neutral-200 hover:border-gold-300',
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <m2.icon className={cn('size-4', mode === m2.value ? 'text-primary' : 'text-accent-700')} aria-hidden />
                    {m2.title}
                  </span>
                  <span className="text-xs leading-snug text-muted">{m2.hint}</span>
                </button>
              ))}
            </div>

            {mode === 'PHOTO' && (
            <ul className="space-y-1.5 text-sm text-neutral-700">
              {t.tips.map((tip) => (
                <li key={tip} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-accent-700" aria-hidden />
                  {tip}
                </li>
              ))}
            </ul>
            )}

            {mode === 'PHOTO' && (<>
            <input
              ref={input}
              type="file"
              accept={`${TRYON_ACCEPT},${HEIC_ACCEPT}`}
              className="sr-only"
              aria-label={t.choosePhoto}
              onChange={(e) => {
                const chosen = e.target.files?.[0] ?? null;
                e.target.value = '';
                setMessage(null);
                if (!chosen || !looksLikeHeic(chosen)) return setFile(chosen);
                takePicked(chosen);
              }}
            />
            {/* No camera in the page (e.g. not HTTPS): the phone's own camera app */}
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const chosen = e.target.files?.[0] ?? null;
                e.target.value = '';
                setMessage(null);
                if (chosen) takePicked(chosen);
              }}
            />
            <button
              type="button"
              disabled={preparing}
              aria-busy={preparing}
              onClick={() => input.current?.click()}
              className={cn(
                'flex w-full items-center gap-4 rounded-xl border-2 border-dashed p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                photoUrl ? 'border-accent-500/50 bg-accent-50/40' : 'border-neutral-300 hover:border-accent-500/60',
              )}
            >
              {preparing ? (
                <span className="flex h-24 w-[4.5rem] items-center justify-center rounded-md bg-sand-100 text-accent-700">
                  <Loader2 className="size-6 animate-spin" aria-hidden />
                </span>
              ) : photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file
                <img src={photoUrl} alt={t.yourPhoto} className="h-24 w-[4.5rem] rounded-md object-cover" />
              ) : (
                <span className="flex h-24 w-[4.5rem] items-center justify-center rounded-md bg-sand-100 text-accent-700">
                  <ImagePlus className="size-6" aria-hidden />
                </span>
              )}
              <span>
                <span className="block text-sm font-medium">{preparing ? t.preparingPhoto : photoUrl ? t.changePhoto : t.choosePhoto}</span>
                <span className="mt-0.5 block text-xs text-muted">{t.photoFormats}</span>
              </span>
            </button>
            {/* Or take one now, with the camera */}
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={preparing}
              onClick={() => (canUseCamera() ? setCameraOpen(true) : cameraInput.current?.click())}
            >
              <Camera aria-hidden />
              {t.takePhoto}
            </Button>
            <CameraCapture
              open={cameraOpen}
              onClose={() => setCameraOpen(false)}
              onPhoto={(photo) => {
                setFile(photo);
                setMessage(null);
              }}
              onChooseInstead={() => {
                setCameraOpen(false);
                input.current?.click();
              }}
            />
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <Checkbox
                checked={fit}
                onCheckedChange={(v) => {
                  setFit(v === true);
                  setMessage(null);
                }}
              />
              <span>
                <span className="block font-medium">{t.fitToggle}</span>
                <span className="block text-xs text-muted">{t.fitToggleHint}</span>
              </span>
            </label>
            </>)}

            {needsBody && <BodyFields mode={mode} value={body} onChange={setBody} problems={showProblems ? problems : null} />}

            <BackgroundPicker
              value={background}
              onChange={(v) => {
                setBackground(v);
                setMessage(null);
              }}
              modelMode={mode === 'MODEL'}
              canDescribe={canDescribeBackground}
            />


            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-sand-200 bg-sand-50 p-3 text-sm">
              <Checkbox
                checked={consent}
                onCheckedChange={(v) => {
                  setConsent(v === true);
                  setMessage(null);
                }}
              />
              <span className="leading-relaxed text-neutral-700">{mode === 'MODEL' ? t.consentModel : t.consent}</span>
            </label>

            {message || chainError ? <Alert tone="danger">{message ?? chainError}</Alert> : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={onClose}>
                {t.close}
              </Button>
              <Button onClick={start} loading={create.isPending}>
                <Camera aria-hidden />
                {t.start}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
