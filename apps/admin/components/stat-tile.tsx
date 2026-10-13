'use client';

import Link from 'next/link';
import type * as React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** A big number with a label and icon (dashboard and workshop summaries). */
export function StatTile({
  label,
  value,
  icon,
  tone = 'neutral',
  href,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone?: 'neutral' | 'warning' | 'danger' | 'accent';
  href?: string;
  /** A short line under the number, e.g. a rate. */
  hint?: React.ReactNode;
}) {
  const body = (
    <Card className={cn('h-full p-4 transition-colors', href && 'hover:border-neutral-300 hover:bg-neutral-50')}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        <span
          className={cn(
            'flex size-8 items-center justify-center rounded-md',
            tone === 'neutral' && 'bg-neutral-100 text-neutral-600',
            tone === 'accent' && 'bg-accent-50 text-accent-700',
            tone === 'warning' && 'bg-amber-50 text-amber-700',
            tone === 'danger' && 'bg-red-50 text-red-700',
          )}
          aria-hidden
        >
          {icon}
        </span>
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-foreground">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
      {body}
    </Link>
  ) : (
    body
  );
}
