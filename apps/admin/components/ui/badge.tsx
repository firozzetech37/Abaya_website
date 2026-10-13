import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
  {
    variants: {
      tone: {
        neutral: 'bg-neutral-100 text-neutral-700 ring-neutral-200',
        dark: 'bg-neutral-700 text-neutral-50 ring-neutral-700',
        accent: 'bg-accent-50 text-accent-800 ring-accent-200',
        success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
        warning: 'bg-amber-50 text-amber-800 ring-amber-200',
        danger: 'bg-red-50 text-red-800 ring-red-200',
        info: 'bg-sky-50 text-sky-800 ring-sky-200',
        violet: 'bg-violet-50 text-violet-800 ring-violet-200',
        orange: 'bg-orange-50 text-orange-800 ring-orange-200',
        indigo: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export function Badge({
  className,
  tone,
  dot,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden /> : null}
      {props.children}
    </span>
  );
}
