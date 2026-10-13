'use client';

import { AlertTriangle, Inbox, Lock, SearchX } from 'lucide-react';
import type * as React from 'react';
import { strings } from '@/content/strings';
import { ApiError, errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';

interface StateProps {
  title: string;
  body?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

function StateBox({ title, body, icon, action, className }: StateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)}>
      <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">{icon}</div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {body ? <div className="max-w-md text-sm text-muted">{body}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function EmptyState({ title, body, action, className, icon }: Omit<StateProps, 'icon'> & { icon?: React.ReactNode }) {
  return <StateBox title={title} body={body} action={action} className={className} icon={icon ?? <Inbox className="size-5" />} />;
}

export function ForbiddenState({ className }: { className?: string }) {
  return (
    <StateBox
      className={className}
      title={strings.common.forbiddenTitle}
      body={strings.common.forbiddenBody}
      icon={<Lock className="size-5" />}
    />
  );
}

/** Error block that explains 403/404 separately from other failures. */
export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  if (error instanceof ApiError && error.isForbidden) return <ForbiddenState className={className} />;
  if (error instanceof ApiError && error.status === 404) {
    return (
      <StateBox
        className={className}
        title={strings.common.notFoundTitle}
        body={strings.common.notFoundBody}
        icon={<SearchX className="size-5" />}
      />
    );
  }
  return (
    <StateBox
      className={className}
      title={strings.common.errorTitle}
      body={errorMessage(error)}
      icon={<AlertTriangle className="size-5 text-danger" />}
      action={
        onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {strings.common.retry}
          </Button>
        ) : null
      }
    />
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border" aria-busy="true" aria-label={strings.common.loading}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-3 py-3">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className={cn('h-4', c === 0 ? 'w-1/4' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={strings.common.loading}>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
