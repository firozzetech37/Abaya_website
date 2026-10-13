'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { AiMatchBadge } from '@/components/ai/ai-panel';
import { DesignAiCard } from '@/components/ai/design-ai-card';
import { SafeImage, Thumb } from '@/components/safe-image';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states';
import { DesignStatusBadge } from '@/components/status-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { STYLE_LABELS, strings } from '@/content/strings';
import { formatRelative } from '@/lib/format';
import { useDesign, useDesigns } from '@/lib/queries/designs';
import { useReference } from '@/lib/queries/references';
import { cn } from '@/lib/utils';
import { TransitionActions } from './transition-actions';

const r = strings.review;

function ReviewPanel({ designId }: { designId: string }) {
  const design = useDesign(designId);
  const reference = useReference(design.data?.referenceId);

  if (design.isPending) return <Skeleton className="h-[480px]" />;
  if (design.isError) return <ErrorState error={design.error} onRetry={() => void design.refetch()} />;
  const d = design.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-display text-2xl font-semibold">{d.name}</h2>
              <DesignStatusBadge status={d.status} />
            </div>
            <p className="text-xs text-muted">
              {STYLE_LABELS[d.style]} · {d.designer?.name ?? d.designer?.email ?? strings.common.unknown} · {formatRelative(d.updatedAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href={`/designs/${d.id}`}>{r.openEditor}</Link>
            </Button>
            <TransitionActions design={d} size="sm" />
          </div>
        </CardHeader>
        {d.description ? <CardContent className="text-sm text-neutral-700">{d.description}</CardContent> : null}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{r.reference}</CardTitle>
            {reference.data?.sourceUrl ? (
              <a
                href={reference.data.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-accent-700 hover:underline"
              >
                {r.viewSource} <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : null}
          </CardHeader>
          <CardContent>
            {!d.referenceId ? (
              <p className="text-sm text-muted">{r.noReference}</p>
            ) : reference.isPending ? (
              <Skeleton className="aspect-[3/4] w-full" />
            ) : reference.isError ? (
              <ErrorState error={reference.error} className="py-6" />
            ) : (
              <div className="space-y-2">
                <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-neutral-100">
                  <SafeImage src={reference.data.imageUrl} alt={reference.data.title ?? r.reference} fit="contain" sizes="600px" />
                </div>
                {reference.data.title ? <p className="text-sm font-medium">{reference.data.title}</p> : null}
                {reference.data.licenseNote ? <p className="text-xs text-muted">{reference.data.licenseNote}</p> : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{r.designImages}</CardTitle>
            <Badge>{d.images.length}</Badge>
          </CardHeader>
          <CardContent>
            {d.images.length === 0 ? (
              <p className="text-sm text-muted">{strings.editor.images.empty}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {d.images.map((img) => (
                  <div
                    key={img.id}
                    className={cn('relative aspect-[3/4] overflow-hidden rounded-md bg-neutral-100', img.isPrimary && 'ring-2 ring-accent-500')}
                  >
                    <SafeImage src={img.url} alt={img.alt ?? d.name} fallbackText={d.name} sizes="300px" />
                    {img.isPrimary ? (
                      <Badge tone="accent" className="absolute left-2 top-2">
                        {strings.editor.images.primary}
                      </Badge>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <DesignAiCard design={d} />
    </div>
  );
}

/** /designs?status=IN_REVIEW: queue on the left, side-by-side comparison on the right. */
export function ReviewQueue() {
  const query = useDesigns({ status: 'IN_REVIEW' });
  const items = React.useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const activeId = selected && items.some((i) => i.id === selected) ? selected : (items[0]?.id ?? null);

  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>{r.title}</CardTitle>
          <Badge>{items.length}</Badge>
        </CardHeader>
        {query.isPending ? (
          <TableSkeleton rows={5} cols={2} />
        ) : items.length === 0 ? (
          <EmptyState title={r.empty} />
        ) : (
          <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto" role="listbox" aria-label={r.title}>
            {items.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={d.id === activeId}
                  onClick={() => setSelected(d.id)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none',
                    d.id === activeId && 'bg-accent-50 hover:bg-accent-50',
                  )}
                >
                  <Thumb src={d.primaryImageUrl} alt="" fallbackText={d.name} className="h-12 w-9" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{d.name}</span>
                      <AiMatchBadge level={d.aiMatch} className="shrink-0" />
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {d.designer?.name ?? d.designer?.email ?? '—'} · {formatRelative(d.updatedAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.hasNextPage ? (
          <div className="border-t border-border p-2 text-center">
            <Button variant="ghost" size="sm" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>
              {strings.common.loadMore}
            </Button>
          </div>
        ) : null}
      </Card>
      <div className="min-w-0">
        {activeId ? <ReviewPanel designId={activeId} /> : items.length > 0 ? <p className="text-sm text-muted">{r.selectOne}</p> : null}
      </div>
    </div>
  );
}
