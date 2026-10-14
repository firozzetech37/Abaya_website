'use client';

import type { FashnUsageUserDto } from '@abaya/contracts';
import { Camera, Coins, EyeOff, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { CreditsByCustomer, customerName } from '@/components/customer-previews/credits-by-customer';
import { PageHeader } from '@/components/page-header';
import { StatTile } from '@/components/stat-tile';
import { EmptyState, ErrorState, ForbiddenState, TableSkeleton } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { strings } from '@/content/strings';
import { errorMessage } from '@/lib/api-client';
import { useCurrentUser } from '@/lib/current-user';
import { formatDateTime } from '@/lib/format';
import { useCustomerPreviews, useCustomerPreviewSummary, useHideCustomerPreview } from '@/lib/queries/customer-previews';
import { cn } from '@/lib/utils';

const t = strings.customerPreviews;

/**
 * Website "Preview my design" pictures and "a model like me" try-ons: usage today, and hiding a bad
 * preview. Try-ons on a customer's own photo are never shown.
 */
export default function CustomerPreviewsPage() {
  const me = useCurrentUser();
  const summary = useCustomerPreviewSummary();
  const [customer, setCustomer] = useState<FashnUsageUserDto | null>(null);
  const list = useCustomerPreviews(customer?.userId);
  const hide = useHideCustomerPreview();
  if (!me.can('manageCatalog')) return <ForbiddenState />;
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  const s = summary.data;

  return (
    <div className="space-y-5">
      <PageHeader title={t.title} subtitle={t.subtitle} />
      {s && !s.live ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t.testMode}</p> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label={t.previewsToday} value={s?.previewsToday ?? '—'} icon={<Sparkles className="size-4" />} tone="accent" />
        <StatTile label={t.tryOnsToday} value={s?.tryOnsToday ?? '—'} icon={<Camera className="size-4" />} />
        <StatTile
          label={s ? `${t.creditsToday} (${t.ofLimit(s.dailyCreditLimit)})` : t.creditsToday}
          value={s?.creditsToday ?? '—'}
          icon={<Coins className="size-4" />}
        />
      </div>

      <CreditsByCustomer selectedUserId={customer?.userId ?? null} onSelect={setCustomer} />

      {customer ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-sm text-accent-900">
          <span className="font-medium">{t.filteredTo(customerName(customer))}</span>
          <Button variant="secondary" size="sm" onClick={() => setCustomer(null)}>
            <X className="size-3.5" aria-hidden /> {t.showEveryone}
          </Button>
        </div>
      ) : null}

      {list.isPending ? (
        <Card>
          <TableSkeleton />
        </Card>
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <Card>
          {customer ? (
            <EmptyState icon={<Sparkles className="size-5" />} title={t.emptyForCustomer} />
          ) : (
            <EmptyState icon={<Sparkles className="size-5" />} title={t.empty} body={t.emptyHint} />
          )}
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {rows.map((p) => (
            <li key={p.id} className={cn('overflow-hidden rounded-lg border border-border bg-surface shadow-sm', p.hidden && 'opacity-60')}>
              <div className="relative aspect-[4/5] bg-neutral-100">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL
                  <img src={p.imageUrl} alt={p.design.name} className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center px-2 text-center text-xs text-muted">
                    {p.purgedAt
                      ? t.purged
                      : p.status === 'FAILED'
                        ? p.checkNotes?.startsWith('Failed')
                          ? t.inaccurate
                          : t.failed
                        : t.making}
                  </span>
                )}
                {p.hidden ? (
                  <Badge className="absolute left-2 top-2 bg-white/95">
                    <EyeOff className="size-3" aria-hidden /> {t.hidden}
                  </Badge>
                ) : p.kind === 'TRYON' ? (
                  <Badge className="absolute left-2 top-2 bg-white/95">
                    <Camera className="size-3" aria-hidden /> {t.modelTryOn}
                  </Badge>
                ) : null}
              </div>
              <div className="space-y-1.5 p-2.5 text-xs">
                {p.design.slug ? (
                  <Link href={`/designs/${p.design.id}`} className="block truncate font-medium hover:text-accent-700 hover:underline">
                    {p.design.name}
                  </Link>
                ) : (
                  <span className="block truncate font-medium text-muted">{p.design.name}</span>
                )}
                <p className="line-clamp-3 text-muted" title={p.choices.join(' · ')}>
                  {p.choices.join(' · ')}
                </p>
                {p.checkNotes ? (
                  <p
                    className={cn(
                      'line-clamp-2',
                      p.checkNotes === 'Checked' ? 'text-emerald-700' : p.checkNotes.startsWith('Failed') ? 'text-danger' : 'text-amber-700',
                    )}
                    title={p.checkNotes}
                  >
                    {p.checkNotes === 'Checked' ? t.checked : p.checkNotes === 'Not checked' ? t.notChecked : p.checkNotes}
                    {p.retries > 0 ? ` · ${t.remade}` : ''}
                  </p>
                ) : null}
                <p className="text-muted">{formatDateTime(p.createdAt)}</p>
                {p.kind === 'PREVIEW' && p.status === 'DONE' && !p.purgedAt ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    loading={hide.isPending && hide.variables?.id === p.id}
                    onClick={() =>
                      hide.mutate(
                        { id: p.id, hidden: !p.hidden },
                        {
                          onSuccess: () => toast.success(p.hidden ? t.shownToast : t.hiddenToast),
                          onError: (e) => toast.error(errorMessage(e)),
                        },
                      )
                    }
                  >
                    {p.hidden ? t.unhide : t.hide}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {list.hasNextPage ? (
        <div className="text-center">
          <Button variant="secondary" size="sm" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
            {t.loadMore}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
