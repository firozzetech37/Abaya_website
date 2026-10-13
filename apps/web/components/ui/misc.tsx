import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { EyebrowStar } from '@/components/ornament/geometric';
import { Lantern } from '@/components/ornament/geometric';
import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-neutral-200/70', className)} />;
}

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
  children: ReactNode;
}) {
  const tones = {
    neutral: 'bg-neutral-100 text-neutral-700',
    accent: 'bg-accent-50 text-accent-800',
    success: 'bg-green-50 text-success',
    warning: 'bg-amber-50 text-warning',
    danger: 'bg-red-50 text-danger',
    info: 'bg-blue-50 text-info',
  } as const;
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium', tones[tone], className)}
    >
      {children}
    </span>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  className,
  action,
}: {
  tone?: 'info' | 'danger' | 'success' | 'warning';
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertCircle;
  const tones = {
    info: 'border-accent-100 bg-accent-50 text-accent-900',
    danger: 'border-red-200 bg-red-50 text-red-900',
    success: 'border-green-200 bg-green-50 text-green-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
  } as const;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border p-4 text-sm', tones[tone], className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center rounded-xl border border-dashed border-neutral-300 px-6 py-12 text-center', className)}>
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-sand-100 text-accent-700">
        {icon ?? <Lantern glow className="h-9 text-gold-500" />}
      </div>
      <p className="font-display text-2xl font-semibold text-foreground">{title}</p>
      {body && <p className="mt-2 max-w-sm text-sm text-neutral-600">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Card({ className, children, as: Tag = 'div' }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'article' }) {
  return <Tag className={cn('rounded-xl border border-border bg-surface p-5 sm:p-6', className)}>{children}</Tag>;
}

export function SectionHeading({ title, eyebrow, body, action }: { title: ReactNode; eyebrow?: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="mb-3 flex items-center gap-2.5 text-xs font-medium uppercase tracking-[0.28em] text-accent-700">
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-gold-400 rtl:bg-gradient-to-l" aria-hidden />
            <EyebrowStar />
            {eyebrow}
          </p>
        )}
        <h2 className="font-display text-4xl font-semibold text-foreground sm:text-5xl">{title}</h2>
        {body && <p className="mt-2 text-neutral-600">{body}</p>}
      </div>
      {action}
    </div>
  );
}
