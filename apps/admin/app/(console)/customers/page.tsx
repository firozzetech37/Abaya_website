'use client';

import { type AdminCustomerDto, CUSTOMER_AUDIENCES, type CustomerAudience } from '@abaya/contracts';
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import {
  ChevronLeft,
  ChevronRight,
  IndianRupee,
  Repeat,
  Search,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import * as React from 'react';
import { OrdersTable } from '@/components/orders/orders-table';
import { PageHeader } from '@/components/page-header';
import { StatTile } from '@/components/stat-tile';
import { EmptyState, ErrorState, ForbiddenState, TableSkeleton } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { strings } from '@/content/strings';
import { useCurrentUser } from '@/lib/current-user';
import { formatDate, formatMoney, initials } from '@/lib/format';
import { useDebounced } from '@/lib/hooks/use-debounced';
import { useUrlState } from '@/lib/hooks/use-url-state';
import { useCustomerAnalytics, useCustomersPage } from '@/lib/queries/customers';
import { cn } from '@/lib/utils';

const c = strings.customers;

/** Order numbers look like AB-2026-000123; those searches show matching orders instead of customers. */
const isOrderNumber = (q: string) => /^AB-/i.test(q);

const columns: ColumnDef<AdminCustomerDto>[] = [
  {
    id: 'customer',
    header: c.colCustomer,
    cell: ({ row }) => {
      const u = row.original;
      return (
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-50 text-xs font-semibold text-accent-800">
            {initials(u.name ?? u.email)}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={u.name ? 'font-medium text-foreground' : 'italic text-muted'}>
                {u.name ?? c.unnamed}
              </span>
              {u.isStaff && <Badge tone="accent">{c.staffBadge}</Badge>}
              {!u.isActive && <Badge tone="neutral">{c.inactiveBadge}</Badge>}
            </div>
          </div>
        </div>
      );
    },
  },
  {
    id: 'email',
    header: c.colEmail,
    cell: ({ row }) => <span className="text-sm">{row.original.email ?? '—'}</span>,
  },
  {
    id: 'phone',
    header: c.colPhone,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm tabular-nums">{row.original.phone ?? '—'}</span>
    ),
  },
  {
    id: 'orders',
    header: () => <span className="block text-right">{c.colOrders}</span>,
    cell: ({ row }) => (
      <span className="block text-right tabular-nums">{row.original.orderCount}</span>
    ),
  },
  {
    id: 'spent',
    header: () => <span className="block text-right">{c.colSpent}</span>,
    cell: ({ row }) => (
      <span className="block text-right font-medium tabular-nums">
        {formatMoney(row.original.totalSpentInPaise)}
      </span>
    ),
  },
  {
    id: 'lastOrder',
    header: c.colLastOrder,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-xs text-muted">
        {formatDate(row.original.lastOrderAt)}
      </span>
    ),
  },
  {
    id: 'joined',
    header: c.colJoined,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-xs text-muted">
        {formatDate(row.original.createdAt)}
      </span>
    ),
  },
];

/** Cursor-paginated customer table; remount (key) when the search changes to reset paging. */
function CustomersTable({
  q,
  audience,
  onOpen,
}: {
  q: string;
  audience: CustomerAudience;
  onOpen: (customer: AdminCustomerDto) => void;
}) {
  const [cursors, setCursors] = React.useState<(string | undefined)[]>([undefined]);
  const page = cursors.length;
  const query = useCustomersPage({
    q: q || undefined,
    audience,
    cursor: cursors[cursors.length - 1],
  });
  const data = React.useMemo(() => query.data?.items ?? [], [query.data]);
  // TanStack Table returns non-memoizable functions; this component does not rely on compiler memoization.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (r) => r.id,
  });

  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.isPending) return <TableSkeleton rows={8} cols={7} />;
  if (data.length === 0 && page === 1) {
    return <EmptyState title={q ? c.noMatch : c.empty} icon={<Users className="size-5" />} />;
  }

  return (
    <div>
      <Table>
        <THead>
          {table.getHeaderGroups().map((hg) => (
            <TR key={hg.id}>
              {hg.headers.map((h) => (
                <TH key={h.id}>
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </TH>
              ))}
            </TR>
          ))}
        </THead>
        <TBody className={query.isPlaceholderData ? 'opacity-60' : undefined}>
          {table.getRowModel().rows.map((row) => (
            <TR
              key={row.id}
              tabIndex={0}
              className="cursor-pointer hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none"
              onClick={() => onOpen(row.original)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpen(row.original);
                }
              }}
            >
              {row.getVisibleCells().map((cell) => (
                <TD key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TD>
              ))}
            </TR>
          ))}
        </TBody>
      </Table>
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <span className="text-xs text-muted">{c.pageOf(page)}</span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page === 1}
            onClick={() => setCursors((p) => p.slice(0, -1))}
          >
            <ChevronLeft /> {strings.common.previous}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!query.data?.nextCursor || query.isPlaceholderData}
            onClick={() => setCursors((p) => [...p, query.data?.nextCursor ?? undefined])}
          >
            {strings.common.next} <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** One customer: contact, totals and every order they placed. */
function CustomerDialog({
  customer,
  onClose,
}: {
  customer: AdminCustomerDto | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={customer !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="xl">
        {customer && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-50 text-sm font-semibold text-accent-800">
                  {initials(customer.name ?? customer.email)}
                </span>
                <div className="min-w-0">
                  <DialogTitle className="flex items-center gap-2">
                    {c.detailTitle(customer.name ?? c.unnamed)}
                    {customer.isStaff && <Badge tone="accent">{c.staffBadge}</Badge>}
                  </DialogTitle>
                  <DialogDescription>
                    {[customer.email, customer.phone].filter(Boolean).join(' · ') || c.hidden}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <DialogBody>
              <dl className="grid grid-cols-3 gap-3">
                {[
                  { label: c.statOrders, value: String(customer.orderCount) },
                  { label: c.statSpent, value: formatMoney(customer.totalSpentInPaise) },
                  { label: c.statJoined, value: formatDate(customer.createdAt) },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-md border border-border bg-neutral-50 px-3 py-2"
                  >
                    <dt className="text-xs text-muted">{s.label}</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">{s.value}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <h3 className="mb-2 text-sm font-semibold">{c.detailOrders}</h3>
                {customer.orderCount === 0 ? (
                  <EmptyState title={c.detailNoOrders} />
                ) : (
                  <Card>
                    <OrdersTable key={customer.id} params={{ customerId: customer.id }} />
                  </Card>
                )}
              </div>
            </DialogBody>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Totals for the chosen audience, and the five biggest spenders. */
function Analysis({
  audience,
  onOpen,
}: {
  audience: CustomerAudience;
  onOpen: (id: string) => void;
}) {
  const analytics = useCustomerAnalytics(audience);
  if (analytics.isError)
    return <ErrorState error={analytics.error} onRetry={() => void analytics.refetch()} />;
  const a = analytics.data;
  const v = (value: React.ReactNode) => (a ? value : <Skeleton className="h-9 w-16" />);
  return (
    <div
      className={cn(
        'mb-5 grid gap-4 xl:grid-cols-[1fr_340px]',
        analytics.isPlaceholderData && 'opacity-60',
      )}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile
          label={c.kpi.accounts}
          value={v(a?.accounts)}
          icon={<Users className="size-4" />}
          tone="accent"
        />
        <StatTile
          label={c.kpi.newThisMonth}
          value={v(a?.newThisMonth)}
          icon={<UserPlus className="size-4" />}
        />
        <StatTile
          label={c.kpi.buyers}
          value={v(a?.buyers)}
          icon={<ShoppingBag className="size-4" />}
          hint={a ? c.conversion(pct(a.buyers, a.accounts)) : undefined}
        />
        <StatTile
          label={c.kpi.repeat}
          value={v(a?.repeatBuyers)}
          icon={<Repeat className="size-4" />}
          hint={a ? c.repeatRate(pct(a.repeatBuyers, a.buyers)) : undefined}
        />
        <StatTile
          label={c.kpi.revenue}
          value={v(a ? formatMoney(a.revenueInPaise) : null)}
          icon={<IndianRupee className="size-4" />}
          tone="accent"
          hint={a ? c.paidOrders(a.paidOrders) : undefined}
        />
        <StatTile
          label={c.kpi.aov}
          value={v(a ? formatMoney(a.averageOrderValueInPaise) : null)}
          icon={<TrendingUp className="size-4" />}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-accent-700" aria-hidden /> {c.topTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!a ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : a.topCustomers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">{c.topEmpty}</p>
          ) : (
            <ol className="space-y-1">
              {a.topCustomers.map((t, i) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(t.id)}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                  >
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                        i === 0 ? 'bg-amber-100 text-amber-800' : 'bg-accent-50 text-accent-800',
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {t.name ?? t.email ?? c.unnamed}
                      </span>
                      <span className="block text-xs text-muted">{c.topOrders(t.orderCount)}</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatMoney(t.totalSpentInPaise)}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CustomersView() {
  const me = useCurrentUser();
  const { params, set } = useUrlState();
  const [search, setSearch] = React.useState(params.get('q') ?? '');
  const [selected, setSelected] = React.useState<AdminCustomerDto | null>(null);
  const q = useDebounced(search.trim(), 400);
  const audienceParam = params.get('audience');
  const audience: CustomerAudience = (CUSTOMER_AUDIENCES as readonly string[]).includes(
    audienceParam ?? '',
  )
    ? (audienceParam as CustomerAudience)
    : 'customers';
  // A top customer opens the same detail dialog (looked up from the current list when shown).
  const [pendingOpen, setPendingOpen] = React.useState<string | null>(null);

  React.useEffect(() => {
    if ((params.get('q') ?? '') !== q) set({ q });
  }, [q, params, set]);

  if (!me.can('viewCustomers')) return <ForbiddenState />;

  return (
    <>
      <PageHeader title={c.title} subtitle={c.subtitle} />

      {/* Who is shown: customers (default), staff, or everyone */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label={c.title}
          className="inline-flex rounded-full border border-border bg-surface p-1"
        >
          {CUSTOMER_AUDIENCES.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={audience === key}
              onClick={() => set({ audience: key === 'customers' ? null : key })}
              className={cn(
                'h-8 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                audience === key
                  ? 'bg-accent-700 text-white shadow-sm'
                  : 'text-neutral-700 hover:bg-neutral-100',
              )}
            >
              {c.audiences[key]}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">{c.audienceHint[audience]}</span>
      </div>

      <Analysis
        audience={audience}
        onOpen={(id) => {
          setSearch('');
          setPendingOpen(id);
        }}
      />

      <div className="relative mb-4 w-full max-w-md">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          data-page-search
          type="search"
          aria-label={c.searchPlaceholder}
          placeholder={c.searchPlaceholder}
          className="h-11 pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {isOrderNumber(q) ? (
        <>
          <p className="mb-2 text-xs text-muted">{c.orderSearchNote}</p>
          <Card>
            <OrdersTable key={q} params={{ q }} />
          </Card>
        </>
      ) : (
        <Card>
          <CustomersTable key={`${audience}|${q}`} q={q} audience={audience} onOpen={setSelected} />
        </Card>
      )}
      {pendingOpen ? (
        <OpenById
          id={pendingOpen}
          audience={audience}
          onFound={(cust) => {
            setSelected(cust);
            setPendingOpen(null);
          }}
        />
      ) : null}
      <CustomerDialog customer={selected} onClose={() => setSelected(null)} />
    </>
  );
}

/** Finds a top customer's full row (by id) in the first pages of the list, then opens it. */
function OpenById({
  id,
  audience,
  onFound,
}: {
  id: string;
  audience: CustomerAudience;
  onFound: (c: AdminCustomerDto) => void;
}) {
  const list = useCustomersPage({ audience, limit: 100 });
  const found = list.data?.items.find((u) => u.id === id);
  React.useEffect(() => {
    if (found) onFound(found);
  }, [found, onFound]);
  return null;
}

export default function CustomersPage() {
  return (
    <React.Suspense fallback={<TableSkeleton />}>
      <CustomersView />
    </React.Suspense>
  );
}
