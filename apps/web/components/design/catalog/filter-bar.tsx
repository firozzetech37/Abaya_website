'use client';

import type { CollectionDto, DesignFacets } from '@abaya/contracts';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useStrings } from '@/components/i18n/locale-provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { PriceRange } from '@/content/strings';
import { useMoney } from '@/lib/currency';
import { cn } from '@/lib/utils';
import type { CatalogParams } from './use-catalog-params';

/** Price ranges in the visitor's display currency ("Under AED 133"), not the stored rupee labels. */
export function usePriceLabel() {
  const money = useMoney();
  const { catalog } = useStrings();
  return (p: PriceRange) =>
    p.min === undefined
      ? catalog.priceUnder(money(p.max ?? 0))
      : p.max === undefined
        ? catalog.priceAbove(money(p.min))
        : catalog.priceBetween(money(p.min), money(p.max));
}

const pill =
  'inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500';

function Swatch({ hex, className }: { hex: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-4 shrink-0 rounded-full border border-black/15 shadow-[inset_0_0_0_1.5px_#FFFCF6]', className)}
      style={{ backgroundColor: hex }}
    />
  );
}

type MenuOption = { value: string | undefined; label: string; hint?: string; swatch?: string };

/** A pill that opens a small list: one choice per click (the list closes on choosing). */
function PillMenu({ label, value, options, onChange, icon }: { label: string; value: string | undefined; options: MenuOption[]; onChange: (v: string | undefined) => void; icon?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  const chosen = value !== undefined && current?.value !== undefined;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={cn(pill, chosen ? 'border-accent-800 bg-accent-50 text-accent-900' : 'border-neutral-300 bg-surface hover:border-neutral-500')}
        aria-label={`${label}: ${current?.label ?? ''}`}
      >
        {current?.swatch ? <Swatch hex={current.swatch} /> : icon}
        <span className="max-w-[10rem] truncate">{chosen ? current?.label : label}</span>
        <ChevronDown className={cn('size-3.5 text-neutral-500 transition-transform', open && 'rotate-180')} aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          className="z-50 max-h-[min(24rem,var(--radix-popover-content-available-height))] min-w-[14rem] overflow-y-auto rounded-2xl border border-border bg-surface p-1.5 shadow-[0_24px_60px_-24px_rgba(68,17,27,0.45)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <ul role="listbox" aria-label={label}>
            {options.map((o) => {
              const on = o.value === value;
              return (
                <li key={o.value ?? 'any'} role="option" aria-selected={on}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-sm transition-colors hover:bg-sand-100 focus-visible:bg-sand-100 focus-visible:outline-none',
                      on && 'font-medium text-accent-900',
                    )}
                  >
                    {o.swatch && <Swatch hex={o.swatch} className="size-5" />}
                    <span className="flex-1">{o.label}</span>
                    {o.hint && <span className="text-xs text-muted">{o.hint}</span>}
                    <Check className={cn('size-4 text-accent-800', !on && 'invisible')} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Search that updates the page a moment after typing stops (and at once on Enter). */
function SearchBox({ value, onSearch, className }: { value: string | undefined; onSearch: (q: string | undefined) => void; className?: string }) {
  const { catalog } = useStrings();
  const [text, setText] = useState(value ?? '');
  const last = useRef(value ?? '');
  useEffect(() => {
    // Back/forward or "Clear all" changed the URL: show it.
    if ((value ?? '') !== last.current) {
      last.current = value ?? '';
      setText(value ?? '');
    }
  }, [value]);
  useEffect(() => {
    const q = text.trim();
    if (q === last.current) return;
    const t = setTimeout(() => {
      last.current = q;
      onSearch(q || undefined);
    }, 400);
    return () => clearTimeout(t);
  }, [text, onSearch]);

  return (
    <form
      role="search"
      className={cn('relative', className)}
      onSubmit={(e) => {
        e.preventDefault();
        last.current = text.trim();
        onSearch(text.trim() || undefined);
      }}
    >
      <label htmlFor="catalog-search" className="sr-only">
        {catalog.search}
      </label>
      <Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-neutral-500" aria-hidden />
      <input
        id="catalog-search"
        type="search"
        value={text}
        maxLength={80}
        onChange={(e) => setText(e.target.value)}
        placeholder={catalog.searchPlaceholder}
        className="h-11 w-full rounded-full border border-neutral-300 bg-surface pe-10 ps-10 text-sm placeholder:text-neutral-500 focus-visible:border-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/30 [&::-webkit-search-cancel-button]:hidden"
      />
      {text && (
        <button
          type="button"
          onClick={() => setText('')}
          aria-label={catalog.clearSearch}
          className="absolute end-1.5 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-500 hover:bg-sand-100"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </form>
  );
}

/**
 * The filter bar: stays under the header while scrolling. Wide screens show every filter as a
 * pill; phones show the search and one "Filters" button that opens a sheet.
 */
export function FilterBar({
  params,
  facets,
  collections,
  fixedCollection,
  total,
}: {
  params: CatalogParams;
  facets: DesignFacets | undefined;
  collections: CollectionDto[];
  fixedCollection?: string;
  total: number | undefined;
}) {
  const { catalog } = useStrings();
  const priceLabel = usePriceLabel();
  const [sheet, setSheet] = useState(false);
  const [stuck, setStuck] = useState(false);
  const probe = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = probe.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e!.isIntersecting), { rootMargin: '-90px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const colours = facets?.colours ?? [];
  const collectionOptions: MenuOption[] = [
    { value: undefined, label: catalog.anyCollection },
    ...collections.filter((c) => c.designCount > 0).map((c) => ({ value: c.slug, label: c.name, hint: String(c.designCount) })),
  ];
  const colourOptions: MenuOption[] = [
    { value: undefined, label: catalog.anyColour },
    ...colours.map((c) => ({ value: c.code, label: c.name, hint: String(c.count), swatch: c.hex })),
  ];
  const priceOptions: MenuOption[] = [{ value: undefined, label: catalog.anyPrice }, ...catalog.priceRanges.map((p) => ({ value: p.id, label: priceLabel(p) }))];
  const sortOptions: MenuOption[] = catalog.sortOptions.map((o) => ({ value: o.id === 'newest' ? undefined : o.id, label: o.label }));
  const sortValue = params.sort === 'newest' ? undefined : params.sort;
  // The search box keeps one callback; it always calls the latest `set` (which changes with the URL).
  const setLatest = useRef(params.set);
  useEffect(() => {
    setLatest.current = params.set;
  });
  const stableSearch = useCallback((q: string | undefined) => setLatest.current({ q }), []);

  return (
    <>
      <div ref={probe} aria-hidden className="h-px" />
      <div
        className={cn(
          'sticky top-[5.5rem] z-30 -mx-4 px-4 py-3 transition-[background-color,box-shadow,border-color] duration-300 sm:mx-0 sm:rounded-full sm:border sm:px-3',
          stuck
            ? 'border-border/70 bg-background/85 shadow-[0_18px_40px_-26px_rgba(68,17,27,0.5)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/70'
            : 'border-transparent bg-transparent',
        )}
      >
        <div className="flex items-center gap-2">
          <SearchBox value={params.q} onSearch={stableSearch} className="min-w-0 flex-1 lg:max-w-xs" />
          <div className="hidden items-center gap-2 lg:flex">
            {!fixedCollection && collectionOptions.length > 1 && (
              <PillMenu label={catalog.collection} value={params.collection} options={collectionOptions} onChange={(v) => params.set({ collection: v })} />
            )}
            {colours.length > 0 && (
              <PillMenu label={catalog.colour} value={params.colour} options={colourOptions} onChange={(v) => params.set({ colour: v })} />
            )}
            <PillMenu label={catalog.price} value={params.price?.id} options={priceOptions} onChange={(v) => params.set({ price: v })} />
          </div>
          <div className="ms-auto hidden items-center gap-3 lg:flex">
            {total !== undefined && <span className="whitespace-nowrap text-sm text-muted" aria-live="polite">{catalog.designsCount(total)}</span>}
            <PillMenu label={catalog.sort} value={sortValue} options={sortOptions} onChange={(v) => params.set({ sort: v })} />
          </div>
          <button
            type="button"
            onClick={() => setSheet(true)}
            className={cn(pill, 'relative border-neutral-300 bg-surface lg:hidden')}
            aria-label={catalog.filters}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            <span className="hidden sm:inline">{catalog.filters}</span>
            {params.activeCount > 0 && (
              <span className="absolute -end-1 -top-1 inline-flex size-5 items-center justify-center rounded-full bg-accent-900 text-[10px] font-medium text-white">
                {params.activeCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <ActiveChips params={params} facets={facets} collections={collections} fixedCollection={fixedCollection} />

      {/* Phones: every filter in a bottom sheet */}
      <Dialog open={sheet} onOpenChange={setSheet}>
        <DialogContent className="pb-0">
          <DialogTitle>{catalog.filters}</DialogTitle>
          <div className="mt-5 space-y-6 pb-6">
            {!fixedCollection && collectionOptions.length > 1 && (
              <SheetGroup title={catalog.collection} options={collectionOptions} value={params.collection} onChange={(v) => params.set({ collection: v })} />
            )}
            {colours.length > 0 && <SheetGroup title={catalog.colour} options={colourOptions} value={params.colour} onChange={(v) => params.set({ colour: v })} />}
            <SheetGroup title={catalog.price} options={priceOptions} value={params.price?.id} onChange={(v) => params.set({ price: v })} />
            <SheetGroup title={catalog.sort} options={sortOptions} value={sortValue} onChange={(v) => params.set({ sort: v })} />
          </div>
          <div className="sticky bottom-0 -mx-6 flex gap-3 border-t border-border bg-surface px-6 py-4">
            {params.activeCount > 0 && (
              <Button variant="secondary" onClick={params.clear}>
                {catalog.clearAll}
              </Button>
            )}
            <Button className="flex-1" onClick={() => setSheet(false)}>
              {total !== undefined ? catalog.showResults(total) : catalog.done}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SheetGroup({ title, options, value, onChange }: { title: string; options: MenuOption[]; value: string | undefined; onChange: (v: string | undefined) => void }) {
  return (
    <fieldset>
      <legend className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-neutral-600">{title}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value ?? 'any'}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={cn(pill, 'h-10', on ? 'border-accent-900 bg-accent-900 text-white' : 'border-neutral-300 bg-surface')}
            >
              {o.swatch && <Swatch hex={o.swatch} />}
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The filters in use as small removable chips, with "Clear all". */
function ActiveChips({ params, facets, collections, fixedCollection }: { params: CatalogParams; facets: DesignFacets | undefined; collections: CollectionDto[]; fixedCollection?: string }) {
  const { catalog, styles } = useStrings();
  const priceLabel = usePriceLabel();
  const colour = facets?.colours.find((c) => c.code === params.colour);
  const chips: { key: string; label: string; swatch?: string; remove: () => void }[] = [];
  if (params.q) chips.push({ key: 'q', label: catalog.searchChip(params.q), remove: () => params.set({ q: undefined }) });
  if (params.style) chips.push({ key: 'style', label: styles[params.style], remove: () => params.set({ style: undefined }) });
  if (params.collection && !fixedCollection) {
    const c = collections.find((x) => x.slug === params.collection);
    chips.push({ key: 'collection', label: c?.name ?? params.collection, remove: () => params.set({ collection: undefined }) });
  }
  if (params.colour) chips.push({ key: 'colour', label: colour?.name ?? params.colour, swatch: colour?.hex, remove: () => params.set({ colour: undefined }) });
  if (params.price) chips.push({ key: 'price', label: priceLabel(params.price), remove: () => params.set({ price: undefined }) });
  if (chips.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.remove}
          aria-label={catalog.removeFilter(c.label)}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-gold-300 bg-gold-50 pe-2.5 ps-3.5 text-sm text-accent-950 transition-colors hover:border-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        >
          {c.swatch && <Swatch hex={c.swatch} className="size-3.5" />}
          {c.label}
          <X className="size-3.5 text-neutral-600" aria-hidden />
        </button>
      ))}
      {chips.length > 1 && (
        <button type="button" onClick={params.clear} className="ms-1 text-sm font-medium text-accent-800 underline-offset-4 hover:underline">
          {catalog.clearAll}
        </button>
      )}
    </div>
  );
}
