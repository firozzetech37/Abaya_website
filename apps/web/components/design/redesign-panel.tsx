'use client';

import { usePathname, useRouter } from '@/components/i18n/navigation';
import {type DesignDetail, type MeasurementBody, type PriceBreakdown, type QuoteBody } from '@abaya/contracts';
import { CheckCircle2, type LucideIcon, Plus, Ruler, ShoppingBag, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { MeasureField } from '@/components/account/measurement-diagram';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStrings } from '@/components/i18n/locale-provider';
import { EightPointStar, EyebrowStar, StarPattern } from '@/components/ornament/geometric';
import { errorMessage, isApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { useDebouncedValue } from '@/lib/hooks';
import {
  blankMeasurements,
  forgetDraft,
  profileToValues,
  readDraft,
  type RedesignDraft,
  sameMeasurements,
  saveDraft,
} from '@/lib/measurements';
import { useAddToCart } from '@/lib/queries/cart';
import { useQuote } from '@/lib/queries/catalog';
import { useMeasurements, useSaveMeasurement } from '@/lib/queries/me';
import { defaultSelections, estimatePrice, missingRequiredGroups, type Selections, selectedIds } from '@/lib/redesign';
import { cn, loginHref } from '@/lib/utils';
import { AiStudio } from './ai-studio';
import { useColourChoice } from './colour-choice';
import { MeasurementFields, useMeasurementForm } from './measurement-fields';
import { OptionGroup } from './option-group';
import { useMoney } from '@/lib/currency';
import { OrderingComingSoon } from '@/components/ordering/coming-soon';
import { useOrderingOpen } from '@/lib/queries/ordering';

type SizeMode = 'band' | 'profile';
type SizeChoice = { sizeBandId: string } | { measurementProfileId: string };

const noSubscription = () => () => {};

/** The panels under the order choice: soft cream cards with a gold hairline. */
const PANEL = 'rounded-2xl border border-gold-200/70 bg-gradient-to-b from-surface to-[#FFFBF3] p-5 shadow-[0_24px_48px_-40px_rgba(35,28,23,0.5)] sm:p-7';

/**
 * The core of the storefront: choose options, a size or measurements, see the price.
 * A draft saved just before a login redirect is restored once, after hydration (the server
 * never sees sessionStorage), by remounting the panel with it.
 */
type OrderMode = 'shown' | 'custom';

export function RedesignPanel({ design }: { design: DesignDetail }) {
  const draft = useSyncExternalStore(noSubscription, () => readDraft(design.id), () => null);
  return <Panel key={draft ? 'draft' : 'fresh'} design={design} draft={draft} />;
}

/**
 * Two ways to order: "Order as shown" keeps the photographed defaults and asks only for the size;
 * "Customise it" opens every option. Switching back to "as shown" restores the defaults.
 * The local calculatePrice() estimate updates instantly; the server quote (debounced 300 ms)
 * is authoritative and wins whenever it differs. No price is ever sent to the API.
 * Measurements are typed right here: on "Add to bag" they are saved to the account as a
 * profile (or the chosen saved profile is updated), then the item is added with that profile.
 */
function Panel({ design, draft }: { design: DesignDetail; draft: RedesignDraft | null }) {
  const money = useMoney();
  const { design: t, measurementForm: mf, ordering: o } = useStrings();
  // "Ordering coming soon": no size, bag or checkout until the shop opens orders.
  const orderingOpen = useOrderingOpen();
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useAuth();
  const loggedIn = status === 'authenticated';

  const [selections, setSelections] = useState<Selections>(() => draft?.selections ?? defaultSelections(design));
  const [sizeMode, setSizeMode] = useState<SizeMode>(draft?.sizeMode ?? 'band');
  const [sizeBandId, setSizeBandId] = useState<string | null>(draft?.sizeBandId ?? null);
  // undefined = nothing chosen yet (the default profile is used once loaded); null = new measurements.
  const [editingId, setEditingId] = useState<string | null | undefined>(draft ? draft.editingId : undefined);

  // "Order as shown" is offered when the photographed defaults make a complete order.
  const defaults = useMemo(() => defaultSelections(design), [design]);
  const canOrderAsShown = missingRequiredGroups(design, defaults).length === 0;
  const [mode, setMode] = useState<OrderMode>(() => draft?.mode ?? (draft || !canOrderAsShown ? 'custom' : 'shown'));
  const chooseMode = (m: OrderMode) => {
    setMode(m);
    if (m === 'shown') setSelections(defaults);
  };

  const standardBands = design.sizeBands.filter((b) => b.code !== 'CUSTOM');
  const customBand = design.sizeBands.find((b) => b.code === 'CUSTOM');

  // The gallery follows the colour picked here.
  const { setColourId } = useColourChoice();
  const chosenColourId = selections.COLOUR?.[0] ?? null;
  useEffect(() => {
    setColourId(chosenColourId);
  }, [chosenColourId, setColourId]);

  const profiles = useMeasurements();
  const saveProfile = useSaveMeasurement();
  const profileList = useMemo(() => profiles.data ?? [], [profiles.data]);
  const activeId =
    editingId === undefined ? (profileList.find((p) => p.isDefault)?.id ?? profileList[0]?.id ?? null) : editingId;
  const activeProfile = activeId ? (profileList.find((p) => p.id === activeId) ?? null) : null;

  const form = useMeasurementForm(draft?.measurements ?? blankMeasurements());
  const profileName = useWatch({ control: form.control, name: 'name' });
  const { isDirty } = form.formState;

  // Picking a saved profile fills the form with its values; "New measurements" clears it.
  const applied = useRef<string | null | undefined>(draft ? draft.editingId : undefined);
  useEffect(() => {
    if (activeId === applied.current) return;
    if (activeId && !activeProfile) return; // that profile has not loaded yet
    const first = applied.current === undefined;
    applied.current = activeId;
    if (activeProfile) form.reset(profileToValues(activeProfile));
    else if (!first) form.reset(blankMeasurements());
  }, [activeId, activeProfile, form]);

  const sizeAdjustment =
    sizeMode === 'profile'
      ? (customBand?.adjustmentInPaise ?? 0)
      : (standardBands.find((b) => b.id === sizeBandId)?.adjustmentInPaise ?? 0);

  const missing = missingRequiredGroups(design, selections);
  const local = estimatePrice(design, selections, sizeAdjustment);
  // The server can only quote a saved profile; typed measurements show the local estimate until added.
  const quoteSize: SizeChoice | null =
    sizeMode === 'band'
      ? sizeBandId
        ? { sizeBandId }
        : null
      : activeProfile
        ? { measurementProfileId: activeProfile.id }
        : null;

  const quoteBody: QuoteBody | null =
    missing.length === 0 && quoteSize
      ? { designId: design.id, selectedOptionValueIds: selectedIds(design, selections), quantity: 1, ...quoteSize }
      : null;

  // Debounce on a string key so the server is asked only after choices settle.
  const bodyKey = quoteBody ? JSON.stringify(quoteBody) : null;
  const debouncedKey = useDebouncedValue(bodyKey, 300);
  const quote = useQuote(debouncedKey ? (JSON.parse(debouncedKey) as QuoteBody) : null);
  const serverFresh = debouncedKey === bodyKey && quote.isSuccess && !quote.isFetching ? quote.data : null;

  const shown: PriceBreakdown | null = serverFresh ?? local;
  const unitPrice = shown?.unitPriceInPaise ?? design.fromPriceInPaise;
  const differs = Boolean(serverFresh && local && serverFresh.unitPriceInPaise !== local.unitPriceInPaise);

  const addToCart = useAddToCart();
  const busy = addToCart.isPending || saveProfile.isPending;

  const addItem = (size: SizeChoice) =>
    addToCart.mutate(
      { designId: design.id, selectedOptionValueIds: selectedIds(design, selections), quantity: 1, ...size },
      {
        onSuccess: () => {
          forgetDraft(design.id);
          toast.success(t.added, { action: { label: t.viewBag, onClick: () => router.push('/bag') } });
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  /** Keep everything typed so far, log in, come back to the same page. */
  const toLogin = () => {
    saveDraft(design.id, { mode, selections, sizeMode, sizeBandId, editingId: activeId, measurements: form.getValues() });
    router.push(loginHref(pathname));
  };

  const addWithMeasurements = form.handleSubmit(
    async (values: MeasurementBody) => {
      if (!loggedIn) return toLogin();
      const body: MeasurementBody = { ...values, name: values.name.trim() || 'Me', notes: values.notes?.trim() || undefined };
      let profileId = activeProfile && sameMeasurements(body, activeProfile) ? activeProfile.id : null;
      if (!profileId) {
        try {
          const saved = await saveProfile.mutateAsync({
            id: activeProfile?.id,
            body: { ...body, isDefault: activeProfile ? activeProfile.isDefault : profileList.length === 0 },
          });
          profileId = saved.id;
          setEditingId(saved.id);
        } catch (e) {
          // Cross-field rule (full length < height) comes back as 422 with details.field.
          const field = isApiError(e) ? (e.details as { field?: string } | undefined)?.field : undefined;
          if (field && field in mf.fields) form.setError(field as MeasureField, { message: errorMessage(e) }, { shouldFocus: true });
          else toast.error(errorMessage(e));
          return;
        }
      }
      addItem({ measurementProfileId: profileId });
    },
    () => toast.error(t.measurementsIncomplete),
  );

  const onAdd = () => {
    if (missing.length > 0) {
      toast.error(t.selectionIncomplete);
      return;
    }
    if (sizeMode === 'profile') {
      void addWithMeasurements();
      return;
    }
    if (!sizeBandId) {
      toast.error(t.selectSize);
      document.getElementById('size-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!loggedIn) return toLogin();
    addItem({ sizeBandId });
  };

  const measurementNote = !loggedIn
    ? t.loginToSaveMeasurements
    : activeProfile
      ? isDirty
        ? t.editingProfile(activeProfile.name)
        : t.usingProfile(activeProfile.name)
      : t.savedToAccount((profileName ?? '').trim() || 'Me');

  return (
    <div>
      {/* The two ways to order */}
      {canOrderAsShown && (
        <div role="radiogroup" aria-label={t.orderModeLabel} className="grid gap-3 sm:grid-cols-2">
          <ModeCard active={mode === 'shown'} onClick={() => chooseMode('shown')} icon={ShoppingBag} title={t.orderAsShown} body={t.orderAsShownBody} meta={money(design.fromPriceInPaise)} />
          <ModeCard active={mode === 'custom'} onClick={() => chooseMode('custom')} icon={SlidersHorizontal} title={t.customiseIt} body={t.customiseItBody} meta={t.customiseItMeta} />
        </div>
      )}

      {mode === 'custom' ? (
        <section aria-labelledby="redesign-title" className={cn(PANEL, canOrderAsShown && 'mt-4')}>
          <h2 id="redesign-title" className="flex items-center gap-2 font-display text-2xl font-semibold">
            <EyebrowStar className="size-4" />
            {t.redesignTitle}
          </h2>
          <p className="mb-5 mt-1 text-sm text-muted">{t.redesignBody}</p>
          {design.optionGroups.map((g, i) => (
            <OptionGroup
              key={g.code}
              step={i + 1}
              group={g}
              selected={selections[g.code] ?? []}
              onChange={(ids) => setSelections((s) => ({ ...s, [g.code]: ids }))}
            />
          ))}
        </section>
      ) : (
        /* As shown: what the photographed abaya comes with, nothing to pick */
        <section aria-labelledby="included-title" className={cn(PANEL, 'mt-4')}>
          <h2 id="included-title" className="flex items-center gap-2 font-display text-2xl font-semibold">
            <EyebrowStar className="size-4" />
            {t.includedTitle}
          </h2>
          <p className="mb-4 mt-1 text-sm text-muted">{t.includedBody}</p>
          <dl className="grid gap-x-6 sm:grid-cols-2">
            {design.optionGroups.map((g) => {
              const chosen = g.values.filter((v) => (selections[g.code] ?? []).includes(v.id));
              if (chosen.length === 0) return null;
              return (
                <div key={g.code} className="flex items-baseline justify-between gap-3 border-b border-dashed border-gold-200/80 py-2.5 text-sm">
                  <dt className="text-muted">{g.name}</dt>
                  <dd className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-end font-medium">
                    {chosen.map((v) => (
                      <span key={v.id} className="inline-flex items-center gap-1.5">
                        {v.colourHex && <span aria-hidden className="size-3 rounded-full border border-black/10" style={{ backgroundColor: v.colourHex }} />}
                        {v.name}
                      </span>
                    ))}
                  </dd>
                </div>
              );
            })}
          </dl>
          <button
            type="button"
            onClick={() => chooseMode('custom')}
            className="mt-4 min-h-9 text-sm font-medium text-accent-800 underline underline-offset-4 hover:text-accent-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            {t.wantChanges}
          </button>
        </section>
      )}

      <AiStudio
        design={{ id: design.id, name: design.name, slug: design.slug }}
        selectedIds={selectedIds(design, selections)}
        complete={missing.length === 0}
        colourId={chosenColourId}
        onLogin={toLogin}
        canPreview={mode === 'custom'}
      />

      {/* Sizes and measurements are only needed to order ("Ordering coming soon" hides them). */}
      {orderingOpen && (
      <section id="size-section" aria-labelledby="size-title" className={cn(PANEL, 'mt-4 scroll-mt-24')}>
        <h2 id="size-title" className="flex items-center gap-2 font-display text-2xl font-semibold">
          <EyebrowStar className="size-4" />
          {t.sizeTitle}
        </h2>
        <Tabs value={sizeMode} onValueChange={(v) => setSizeMode(v as SizeMode)} className="mt-4">
          <TabsList>
            <TabsTrigger value="band">{t.standardSize}</TabsTrigger>
            <TabsTrigger value="profile">{t.myMeasurements}</TabsTrigger>
          </TabsList>

          <TabsContent value="band">
            <div role="radiogroup" aria-label={t.standardSize} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {standardBands.map((b) => {
                const active = b.id === sizeBandId;
                const [code, ...rest] = b.label.split(' ');
                // "(bust 83–87 cm)" from the API, in the page's language.
                const range = rest.join(' ').replace(/^\(|\)$/g, '').replace(/\bbust\b/i, t.bustWord).replace(/\bcm\b/i, t.cmUnit);
                return (
                  <button
                    key={b.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSizeBandId(b.id)}
                    className={cn(
                      'flex min-h-[3.75rem] flex-col items-start justify-center rounded-xl border px-3.5 py-2 text-start transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2',
                      active
                        ? 'border-primary bg-gradient-to-br from-accent-50 to-surface shadow-[0_10px_24px_-18px_rgba(107,31,42,0.75)]'
                        : 'border-neutral-200 bg-surface hover:border-gold-300',
                    )}
                  >
                    <span className="text-sm font-semibold">{code}</span>
                    <span className="text-xs text-neutral-600">
                      {range}
                      {b.adjustmentInPaise > 0 && ` · ${t.surcharge(money(b.adjustmentInPaise))}`}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">{t.sizeHint}</p>
          </TabsContent>

          <TabsContent value="profile">
            <p className="text-sm text-neutral-600">
              {t.measurementsHint}
              {customBand && customBand.adjustmentInPaise > 0 && ` (${t.surcharge(money(customBand.adjustmentInPaise))})`}
            </p>

            {loggedIn && profileList.length > 0 && (
              <div role="radiogroup" aria-label={t.chooseProfile} className="mt-3 flex flex-wrap gap-2">
                {profileList.map((p) => (
                  <ProfileChip key={p.id} active={p.id === activeId} onClick={() => setEditingId(p.id)}>
                    <Ruler className="size-4 shrink-0 text-accent-700" aria-hidden />
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-neutral-600">{p.heightCm} {mf.unit}</span>
                  </ProfileChip>
                ))}
                <ProfileChip active={activeId === null} onClick={() => setEditingId(null)}>
                  <Plus className="size-4 shrink-0" aria-hidden />
                  <span className="font-medium">{t.newMeasurements}</span>
                </ProfileChip>
              </div>
            )}

            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                onAdd();
              }}
            >
              <MeasurementFields form={form} idPrefix="size" className="mt-4" />
            </form>

            <details className="group mt-3">
              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-accent-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
                <Ruler className="size-4" aria-hidden />
                {t.measuringTips}
              </summary>
              <p className="mt-1 text-sm leading-relaxed text-neutral-600">{mf.intro}</p>
            </details>
            <p className="mt-3 text-xs leading-relaxed text-muted">{measurementNote}</p>
          </TabsContent>
        </Tabs>
      </section>
      )}

      {/* Price + add to bag (desktop and tablet): a deep burgundy card, gold for the action */}
      <section
        aria-live="polite"
        className="relative mt-4 overflow-hidden rounded-2xl bg-[radial-gradient(120%_120%_at_100%_0%,#7C2B3A_0%,#44111B_55%,#2E0D14_100%)] p-6 text-sand-50 shadow-[0_30px_60px_-36px_rgba(46,13,20,0.9)] sm:p-7"
      >
        <StarPattern className="text-gold-200/[0.07]" size={56} />
        <EightPointStar className="pointer-events-none absolute -end-14 -top-14 size-40 text-gold-300/[0.12]" />
        <div className="relative flex items-end justify-between gap-4">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-gold-200">{t.total}</p>
            <p className="mt-1 font-display text-[2.6rem] font-semibold leading-none tabular-nums text-white">{money(unitPrice)}</p>
          </div>
          <PriceStatus confirmed={Boolean(serverFresh)} pending={Boolean(quoteBody) && !serverFresh} dark />
        </div>
        {differs && <p className="relative mt-2 text-xs text-gold-200">{t.priceChanged}</p>}
        {quote.isError && debouncedKey === bodyKey && (
          <p className="relative mt-2 text-xs text-rose-200" role="alert">
            {errorMessage(quote.error)}
          </p>
        )}
        {shown && (
          <details className="group relative mt-5 border-t border-white/15 pt-3">
            <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-gold-200 hover:text-gold-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
              {t.breakdown}
            </summary>
            <PriceLines breakdown={shown} dark />
          </details>
        )}
        {orderingOpen ? (
          <>
            <Button size="lg" variant="gold" className="relative mt-5 hidden w-full sm:flex" onClick={onAdd} loading={busy}>
              {busy ? t.adding : t.addToBag}
            </Button>
            <p className="relative mt-3 hidden text-center text-xs text-sand-200/75 sm:block">{t.totalReassurance}</p>
          </>
        ) : orderingOpen === false ? (
          <OrderingComingSoon />
        ) : null}
      </section>

      {/* Sticky mobile bar */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 pt-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.15)] backdrop-blur sm:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">{serverFresh ? t.confirmedPrice : t.estimate}</p>
            <p className="font-display text-2xl font-semibold tabular-nums">{money(unitPrice)}</p>
          </div>
          {orderingOpen ? (
            <Button size="lg" variant="gold" className="flex-1" onClick={onAdd} loading={busy}>
              {busy ? t.adding : t.addToBag}
            </Button>
          ) : (
            <span className="flex min-h-11 flex-1 items-center justify-center rounded-full border border-gold-300 bg-gold-50 px-3 text-center text-sm font-semibold text-accent-900">
              {o.comingSoon}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** One of the two ways to order, as a radio card. */
function ModeCard({ active, onClick, icon: Icon, title, body, meta }: { active: boolean; onClick: () => void; icon: LucideIcon; title: string; body: string; meta: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 rounded-2xl border p-4 text-start transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 sm:p-5',
        active
          ? 'border-primary bg-gradient-to-br from-accent-50 via-surface to-surface shadow-[0_18px_36px_-26px_rgba(107,31,42,0.8)] ring-1 ring-primary'
          : 'border-neutral-200 bg-surface hover:-translate-y-px hover:border-gold-300 hover:shadow-[0_12px_28px_-22px_rgba(35,28,23,0.6)] motion-reduce:hover:translate-y-0',
      )}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors',
          active ? 'border-gold-300 bg-gradient-to-b from-accent-600 to-accent-800 text-gold-100 shadow-sm' : 'border-gold-200 bg-gold-50 text-accent-800',
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="font-display text-lg font-semibold leading-tight">{title}</span>
          {active && <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden />}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-neutral-600">{body}</span>
        <span className="mt-1.5 block text-sm font-medium text-accent-800">{meta}</span>
      </span>
    </button>
  );
}

function ProfileChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2',
        active ? 'border-primary bg-accent-50/60 text-accent-900' : 'border-neutral-300 hover:border-neutral-500',
      )}
    >
      {children}
      {active && <CheckCircle2 className="size-4 text-primary" aria-hidden />}
    </button>
  );
}

function PriceStatus({ confirmed, pending, dark = false }: { confirmed: boolean; pending: boolean; dark?: boolean }) {
  const { design: t } = useStrings();
  if (confirmed)
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs font-medium', dark ? 'text-gold-200' : 'text-success')}>
        <CheckCircle2 className="size-4" aria-hidden />
        {t.confirmedPrice}
      </span>
    );
  return <span className={cn('text-xs', dark ? 'text-sand-200/75' : 'text-muted', pending && 'animate-pulse')}>{t.estimate}</span>;
}

export function PriceLines({ breakdown, dark = false }: { breakdown: PriceBreakdown; dark?: boolean }) {
  const money = useMoney();
  const { design: t } = useStrings();
  return (
    <dl className="mt-2 space-y-1.5 text-sm">
      {breakdown.lines.map((l, i) => (
        <div key={`${l.kind}-${l.optionValueId ?? i}`} className="flex justify-between gap-4">
          <dt className={dark ? 'text-sand-200/80' : 'text-neutral-600'}>{l.kind === 'BASE' ? t.basePrice : l.label}</dt>
          <dd className="tabular-nums">{l.kind === 'BASE' ? money(l.amountInPaise) : `+${money(l.amountInPaise)}`}</dd>
        </div>
      ))}
    </dl>
  );
}
