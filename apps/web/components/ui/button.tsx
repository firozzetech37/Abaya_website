import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] motion-reduce:active:scale-100 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          "relative isolate overflow-hidden bg-primary text-primary-foreground shadow-[0_10px_24px_-14px_rgba(68,17,27,0.8)] before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-1/3 before:-translate-x-[120%] before:bg-gradient-to-r before:from-transparent before:via-white/25 before:to-transparent hover:-translate-y-px hover:bg-accent-800 hover:shadow-[0_16px_30px_-14px_rgba(68,17,27,0.85)] hover:before:animate-[shine_0.9s_ease-out] active:translate-y-0 active:bg-accent-900 motion-reduce:hover:translate-y-0",
        secondary:
          'border border-neutral-300 bg-surface/80 text-foreground backdrop-blur hover:-translate-y-px hover:border-accent-700/40 hover:bg-surface hover:shadow-[0_12px_24px_-16px_rgba(68,17,27,0.5)] active:translate-y-0 motion-reduce:hover:translate-y-0',
        gold: 'relative isolate overflow-hidden rounded-full border border-gold-200/70 bg-[linear-gradient(160deg,#E9D49A_0%,#CCA24A_45%,#B48734_100%)] text-accent-950 shadow-[0_12px_28px_-14px_rgba(107,31,42,0.55),inset_0_1px_0_rgba(255,255,255,0.45)] before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-1/3 before:-translate-x-[120%] before:bg-gradient-to-r before:from-transparent before:via-white/45 before:to-transparent hover:-translate-y-px hover:before:animate-[shine_0.9s_ease-out] active:translate-y-0 motion-reduce:hover:translate-y-0',
        ghost: 'text-foreground hover:bg-neutral-100',
        link: 'h-auto rounded-none px-0 text-accent-700 underline-offset-4 hover:underline',
        danger: 'bg-danger text-white hover:bg-red-800',
        dangerOutline: 'border border-danger/40 text-danger hover:bg-red-50',
      },
      size: {
        sm: 'h-9 px-4',
        md: 'h-11 px-6',
        lg: 'h-12 px-8 text-base',
        icon: 'size-11',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';
