'use client';

import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { JsonDiff } from '@/components/json-diff';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, ForbiddenState, TableSkeleton } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { AUDIT_ENTITY_TYPES, strings } from '@/content/strings';
import { useCurrentUser } from '@/lib/current-user';
import { formatDateTime } from '@/lib/format';
import { useDebounced } from '@/lib/hooks/use-debounced';
import { useUrlState } from '@/lib/hooks/use-url-state';
import { useAuditLogs } from '@/lib/queries/platform';
import { cn } from '@/lib/utils';

const a = strings.audit;

function AuditView() {
  const me = useCurrentUser();
  const { params, set } = useUrlState();
  const entityType = params.get('entityType') ?? '';
  const [entityIdText, setEntityIdText] = React.useState(params.get('entityId') ?? '');
  const [actionText, setActionText] = React.useState(params.get('action') ?? '');
  const entityId = useDebounced(entityIdText.trim(), 400);
  const action = useDebounced(actionText.trim(), 400);
  const [open, setOpen] = React.useState<string | null>(null);
  const allowed = me.can('viewAuditLog');

  const query = useAuditLogs(
    { entityType: entityType || undefined, entityId: entityId || undefined, action: action || undefined },
    allowed,
  );
  const entries = query.data?.pages.flatMap((p) => p.items) ?? [];

  if (!allowed) return <ForbiddenState />;

  return (
    <>
      <PageHeader title={a.title} subtitle={a.subtitle} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[200px_1fr_1fr_auto] lg:items-end">
        <Field label={a.entityType} htmlFor="au-type">
          <NativeSelect id="au-type" value={entityType} onChange={(e) => set({ entityType: e.target.value || null })}>
            <option value="">{strings.common.all}</option>
            {AUDIT_ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={a.entityId} htmlFor="au-id">
          <Input id="au-id" className="font-mono" value={entityIdText} onChange={(e) => setEntityIdText(e.target.value)} />
        </Field>
        <Field label={a.action} htmlFor="au-action">
          <Input id="au-action" data-page-search placeholder={a.actionPlaceholder} value={actionText} onChange={(e) => setActionText(e.target.value)} />
        </Field>
        <Button
          variant="ghost"
          onClick={() => {
            setEntityIdText('');
            setActionText('');
            set({ entityType: null, entityId: null, action: null });
          }}
        >
          {a.clear}
        </Button>
      </div>

      <Card>
        {query.isPending ? (
          <TableSkeleton rows={10} cols={4} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : entries.length === 0 ? (
          <EmptyState title={a.empty} />
        ) : (
          <ul className="divide-y divide-border">
            <li className="hidden grid-cols-[170px_200px_1fr_1fr_24px] gap-3 bg-neutral-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted md:grid">
              <span>{a.colWhen}</span>
              <span>{a.colAction}</span>
              <span>{a.colEntity}</span>
              <span>{a.colActor}</span>
              <span />
            </li>
            {entries.map((e) => {
              const isOpen = open === e.id;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : e.id)}
                    className="grid w-full grid-cols-1 gap-1 px-4 py-2.5 text-left text-sm hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none md:grid-cols-[170px_200px_1fr_1fr_24px] md:gap-3"
                  >
                    <span className="text-xs tabular-nums text-muted">{formatDateTime(e.createdAt)}</span>
                    <span className="font-mono text-xs">{e.action}</span>
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge>{e.entityType}</Badge>
                      <span className="truncate font-mono text-xs text-muted">{e.entityId}</span>
                    </span>
                    <span className="truncate text-xs">{e.actor?.name ?? e.actor?.email ?? a.system}</span>
                    <ChevronDown className={cn('hidden size-4 text-muted transition-transform md:block', isOpen && 'rotate-180')} aria-hidden />
                  </button>
                  {isOpen ? (
                    <div className="space-y-3 px-4 pb-4">
                      <JsonDiff before={e.before} after={e.after} />
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted">{a.rawJson}</summary>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <pre className="overflow-x-auto rounded-md bg-neutral-50 p-2 font-mono">{JSON.stringify(e.before, null, 2)}</pre>
                          <pre className="overflow-x-auto rounded-md bg-neutral-50 p-2 font-mono">{JSON.stringify(e.after, null, 2)}</pre>
                        </div>
                      </details>
                      {e.ip ? (
                        <p className="text-xs text-muted">
                          {a.ip}: <span className="font-mono">{e.ip}</span>
                        </p>
                      ) : null}
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => {
                          setEntityIdText(e.entityId);
                          set({ entityType: e.entityType, entityId: e.entityId });
                        }}
                      >
                        {a.colEntity}: {e.entityType} {e.entityId.slice(0, 8)}…
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {query.hasNextPage ? (
          <div className="border-t border-border p-3 text-center">
            <Button variant="secondary" size="sm" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>
              {strings.common.loadMore}
            </Button>
          </div>
        ) : null}
      </Card>
    </>
  );
}

export default function AuditPage() {
  return (
    <React.Suspense fallback={<TableSkeleton />}>
      <AuditView />
    </React.Suspense>
  );
}
