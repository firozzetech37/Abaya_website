'use client';

import { ChevronDown, History } from 'lucide-react';
import * as React from 'react';
import { strings } from '@/content/strings';
import { formatDateTime } from '@/lib/format';
import { useAuditLogs } from '@/lib/queries/platform';
import { JsonDiff } from './json-diff';
import { ErrorState } from './states';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Skeleton } from './ui/skeleton';

/** History of one record (design, order item...). Any staff may read a single record's trail. */
export function AuditHistory({ entityType, entityId, title }: { entityType: string; entityId: string; title?: string }) {
  const query = useAuditLogs({ entityType, entityId });
  const entries = query.data?.pages.flatMap((p) => p.items) ?? [];
  const [openId, setOpenId] = React.useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4 text-muted" aria-hidden />
          {title ?? strings.editor.history}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {query.isPending ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} className="py-6" />
        ) : entries.length === 0 ? (
          <p className="p-4 text-sm text-muted">{strings.editor.historyEmpty}</p>
        ) : (
          <ol className="divide-y divide-border">
            {entries.map((e) => {
              const open = openId === e.id;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none"
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : e.id)}
                  >
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs text-foreground">{e.action}</span>
                      <span className="block text-xs text-muted">
                        {e.actor?.name ?? e.actor?.email ?? strings.audit.system} · {formatDateTime(e.createdAt)}
                      </span>
                    </span>
                    <ChevronDown className={`mt-1 size-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
                  </button>
                  {open ? (
                    <div className="px-4 pb-3">
                      <JsonDiff before={e.before} after={e.after} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
        {query.hasNextPage ? (
          <div className="border-t border-border p-2 text-center">
            <Button variant="ghost" size="sm" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>
              {strings.common.loadMore}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
