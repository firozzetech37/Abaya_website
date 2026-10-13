'use client';

import { DESIGN_STATUSES, type DesignStatus } from '@abaya/contracts';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { BulkCatalogBar } from '@/components/designs/bulk-catalog-bar';
import { CatalogRowActions } from '@/components/designs/catalog-row-actions';
import { NewDesignDialog } from '@/components/designs/new-design-dialog';
import { ReviewQueue } from '@/components/designs/review-queue';
import { PageHeader } from '@/components/page-header';
import { Thumb } from '@/components/safe-image';
import { EmptyState, ErrorState, ForbiddenState, TableSkeleton } from '@/components/states';
import { AiMatchBadge } from '@/components/ai/ai-panel';
import { RebuildPreviewsButton } from '@/components/designs/rebuild-previews-button';
import { DesignStatusBadge } from '@/components/status-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { DESIGN_STATUS_LABELS, STYLE_LABELS, strings } from '@/content/strings';
import { useCurrentUser } from '@/lib/current-user';
import { formatMoney, formatRelative } from '@/lib/format';
import { useDebounced } from '@/lib/hooks/use-debounced';
import { useUrlState } from '@/lib/hooks/use-url-state';
import { useDesigns } from '@/lib/queries/designs';
import { cn } from '@/lib/utils';

const s = strings.designs;

function isStatus(v: string | null): v is DesignStatus {
  return (DESIGN_STATUSES as readonly string[]).includes(v ?? '');
}

function StatusTabs({ value, onChange }: { value: DesignStatus | undefined; onChange: (v: DesignStatus | undefined) => void }) {
  const tabs: (DesignStatus | undefined)[] = [undefined, ...DESIGN_STATUSES];
  return (
    <div role="tablist" aria-label={s.colStatus} className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const active = tab === value;
        return (
          <button
            key={tab ?? 'all'}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tab)}
            className={cn(
              '-mb-px h-10 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
              active ? 'border-primary text-foreground' : 'border-transparent text-muted hover:text-foreground',
            )}
          >
            {tab ? DESIGN_STATUS_LABELS[tab] : s.allStatuses}
          </button>
        );
      })}
    </div>
  );
}

function DesignsView() {
  const me = useCurrentUser();
  const router = useRouter();
  const { params, set } = useUrlState();
  const rawStatus = params.get('status');
  const status = isStatus(rawStatus) ? rawStatus : undefined;
  const mine = params.get('mine') === 'true';
  const view = params.get('view');
  const [search, setSearch] = React.useState(params.get('q') ?? '');
  const q = useDebounced(search.trim(), 300);
  const [creating, setCreating] = React.useState(false);
  // Ticked rows (published or archived designs only), for the bulk catalog actions.
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());

  React.useEffect(() => {
    if ((params.get('q') ?? '') !== q) set({ q });
  }, [q, params, set]);

  const showReview = status === 'IN_REVIEW' && me.can('manageCatalog') && view !== 'list' && !q && !mine;
  const query = useDesigns({ status, q: q || undefined, mine }, !showReview);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const isDesignerOnly = !me.can('manageCatalog');
  const canManage = me.can('manageCatalog');
  const selectable = items.filter((d) => d.status === 'PUBLISHED' || d.status === 'ARCHIVED');
  const selected = selectable.filter((d) => selectedIds.has(d.id));
  const allSelected = selectable.length > 0 && selected.length === selectable.length;
  const toggleOne = (id: string, on: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleAll = (on: boolean) => setSelectedIds(on ? new Set(selectable.map((d) => d.id)) : new Set());

  if (!me.can('viewDesigns')) return <ForbiddenState />;

  return (
    <>
      <PageHeader
        title={status === 'IN_REVIEW' && me.can('manageCatalog') ? strings.review.title : s.title}
        subtitle={status === 'IN_REVIEW' && me.can('manageCatalog') ? strings.review.hint : s.subtitle}
        actions={
          <>
            {me.hasRole('SUPER_ADMIN') ? <RebuildPreviewsButton /> : null}
            {me.can('editDesigns') ? (
              <Button onClick={() => setCreating(true)}>
                <Plus /> {s.newDesign}
              </Button>
            ) : null}
          </>
        }
      />

      <StatusTabs value={status} onChange={(v) => set({ status: v ?? null, view: null })} />

      <div className="my-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            data-page-search
            type="search"
            aria-label={strings.common.search}
            placeholder={`${s.searchPlaceholder}  ( / )`}
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {!isDesignerOnly ? (
          <label className="flex items-center gap-2 text-sm text-neutral-700" title={s.mineHint}>
            <Switch checked={mine} onCheckedChange={(v) => set({ mine: v ? 'true' : null })} aria-label={s.mineHint} />
            {s.mine}
          </label>
        ) : null}
        {status === 'IN_REVIEW' && me.can('manageCatalog') ? (
          <div className="ml-auto flex rounded-md border border-border bg-surface p-0.5" role="group">
            {(['review', 'list'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={(v === 'list') === (view === 'list')}
                onClick={() => set({ view: v === 'list' ? 'list' : null })}
                className={cn(
                  'h-8 rounded px-3 text-xs font-medium',
                  (v === 'list') === (view === 'list') ? 'bg-neutral-100 text-foreground' : 'text-muted hover:text-foreground',
                )}
              >
                {v === 'list' ? strings.review.listView : strings.review.reviewView}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {showReview ? (
        <ReviewQueue />
      ) : (
        <Card>
          {query.isError ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : query.isPending ? (
            <TableSkeleton rows={8} cols={5} />
          ) : items.length === 0 ? (
            <EmptyState
              title={q || status || mine ? s.emptyFiltered : s.empty}
              action={
                me.can('editDesigns') && !q ? (
                  <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
                    <Plus /> {s.newDesign}
                  </Button>
                ) : null
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  {canManage ? (
                    <TH className="w-10">
                      <Checkbox
                        checked={allSelected ? true : selected.length > 0 ? 'indeterminate' : false}
                        onCheckedChange={(v) => toggleAll(v === true)}
                        disabled={selectable.length === 0}
                        aria-label={strings.editor.selectAll}
                      />
                    </TH>
                  ) : null}
                  <TH>{s.colName}</TH>
                  <TH>{s.colStatus}</TH>
                  <TH className="hidden md:table-cell">{s.colDesigner}</TH>
                  <TH className="text-right">{s.colPrice}</TH>
                  <TH className="hidden sm:table-cell text-right">{s.colUpdated}</TH>
                  {me.can('manageCatalog') ? (
                    <TH>
                      <span className="sr-only">{strings.editor.unpublish}</span>
                    </TH>
                  ) : null}
                </TR>
              </THead>
              <TBody>
                {items.map((d) => (
                  <TR
                    key={d.id}
                    className="cursor-pointer hover:bg-neutral-50"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('a, button, [role="dialog"], [role="checkbox"]')) return;
                      router.push(`/designs/${d.id}`);
                    }}
                  >
                    {canManage ? (
                      <TD className="w-10">
                        {d.status === 'PUBLISHED' || d.status === 'ARCHIVED' ? (
                          <Checkbox checked={selectedIds.has(d.id)} onCheckedChange={(v) => toggleOne(d.id, v === true)} aria-label={strings.editor.selectOne(d.name)} />
                        ) : null}
                      </TD>
                    ) : null}
                    <TD>
                      <div className="flex items-center gap-3">
                        <Thumb src={d.primaryImageUrl} alt="" fallbackText={d.name} className="h-12 w-9" />
                        <div className="min-w-0">
                          <Link
                            href={`/designs/${d.id}`}
                            className="block truncate font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                          >
                            {d.name}
                          </Link>
                          <p className="truncate text-xs text-muted">
                            {STYLE_LABELS[d.style]} · <span className="font-mono">{d.slug}</span>
                          </p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-1">
                        <DesignStatusBadge status={d.status} />
                        <AiMatchBadge level={d.aiMatch} />
                        {d.source === 'AI_GENERATED' ? <Badge tone="accent">{strings.editor.sourceAi}</Badge> : null}
                      </div>
                    </TD>
                    <TD className="hidden text-neutral-700 md:table-cell">{d.designer?.name ?? d.designer?.email ?? '—'}</TD>
                    <TD className="text-right tabular-nums">{formatMoney(d.basePriceInPaise)}</TD>
                    <TD className="hidden text-right text-xs text-muted sm:table-cell">{formatRelative(d.updatedAt)}</TD>
                    {me.can('manageCatalog') ? (
                      <TD className="text-right">
                        <CatalogRowActions design={d} />
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          {query.hasNextPage ? (
            <div className="border-t border-border p-3 text-center">
              <Button variant="secondary" size="sm" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>
                {strings.common.loadMore}
              </Button>
            </div>
          ) : null}
        </Card>
      )}

      {canManage ? <BulkCatalogBar selected={selected} onClear={() => setSelectedIds(new Set())} /> : null}
      <NewDesignDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

export default function DesignsPage() {
  return (
    <React.Suspense fallback={<TableSkeleton />}>
      <DesignsView />
    </React.Suspense>
  );
}
