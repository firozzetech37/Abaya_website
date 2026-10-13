'use client';

import type { AdminOrderListItem } from '@abaya/contracts';
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states';
import { OrderStatusBadge, StageBadge } from '@/components/status-badges';
import { Button } from '@/components/ui/button';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { strings } from '@/content/strings';
import { formatDateTime, formatMoney } from '@/lib/format';
import { type OrderListParams, useOrdersPage } from '@/lib/queries/orders';

const o = strings.orders;

const columns: ColumnDef<AdminOrderListItem>[] = [
  {
    id: 'order',
    header: o.colOrder,
    cell: ({ row }) => (
      <Link
        href={`/orders/${row.original.id}`}
        className="font-mono text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        {row.original.orderNumber}
      </Link>
    ),
  },
  { id: 'customer', header: o.colCustomer, cell: ({ row }) => row.original.customerName ?? '—' },
  {
    id: 'status',
    header: o.colStatus,
    cell: ({ row }) => <OrderStatusBadge status={row.original.status} placedAt={row.original.placedAt} />,
  },
  {
    id: 'items',
    header: o.colItems,
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.items.map((i) => (
          <span
            key={i.id}
            title={`${i.designName}${i.withName ? ` · ${strings.production.team.withNow(i.withName)}` : i.makerName ? ` · ${i.makerName}` : ''}`}
          >
            <StageBadge
              stage={
                row.original.status === 'CANCELLED' || row.original.status === 'REFUNDED'
                  ? 'CANCELLED'
                  : i.stage
              }
            />
          </span>
        ))}
      </div>
    ),
  },
  {
    id: 'total',
    header: () => <span className="block text-right">{o.colTotal}</span>,
    cell: ({ row }) => (
      <span className="block text-right tabular-nums">
        {formatMoney(row.original.totalInPaise)}
      </span>
    ),
  },
  {
    id: 'placed',
    header: o.colPlaced,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-xs text-muted">
        {/* A checkout that was never paid was never placed: show when it was created. */}
        {row.original.placedAt ? formatDateTime(row.original.placedAt) : o.createdOn(formatDateTime(row.original.createdAt))}
      </span>
    ),
  },
];

/** Server-filtered, cursor-paginated order table. Remount (key) when filters change to reset paging. */
export function OrdersTable({
  params,
  enabled = true,
}: {
  params: OrderListParams;
  enabled?: boolean;
}) {
  const router = useRouter();
  const [cursors, setCursors] = React.useState<(string | undefined)[]>([undefined]);
  const page = cursors.length;
  const query = useOrdersPage({ ...params, cursor: cursors[cursors.length - 1] }, enabled);
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
  if (query.isPending) return <TableSkeleton rows={8} cols={6} />;
  if (data.length === 0 && page === 1) return <EmptyState title={o.empty} />;

  return (
    <div>
      <Table>
        <THead>
          {table.getHeaderGroups().map((hg) => (
            <TR key={hg.id}>
              {hg.headers.map((h) => (
                <TH key={h.id} className={h.id === 'items' ? 'min-w-[160px]' : undefined}>
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
              className="cursor-pointer hover:bg-neutral-50"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('a,button')) return;
                router.push(`/orders/${row.original.id}`);
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
        <span className="text-xs text-muted">{o.pageOf(page)}</span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page === 1}
            onClick={() => setCursors((c) => c.slice(0, -1))}
          >
            <ChevronLeft /> {strings.common.previous}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!query.data?.nextCursor || query.isPlaceholderData}
            onClick={() => setCursors((c) => [...c, query.data?.nextCursor ?? undefined])}
          >
            {strings.common.next} <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
