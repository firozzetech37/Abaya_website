import { cn } from '@/lib/utils';

/**
 * The atelier monogram: two nested arches, echoing the arch frames used across the site.
 * `draw` makes the arches draw themselves once (a CSS animation that ends fully drawn).
 */
export function BrandMark({ className, draw = false }: { className?: string; draw?: boolean }) {
  return (
    <svg viewBox="0 0 32 40" className={cn('h-8 w-auto', draw && 'brand-draw', className)} fill="none" aria-hidden>
      <path d="M2.5 39V16.5a13.5 13.5 0 0 1 27 0V39" stroke="currentColor" strokeWidth="1.6" pathLength={1} />
      <path d="M8 39V18a8 8 0 0 1 16 0v21" stroke="currentColor" strokeWidth="1.2" opacity="0.55" pathLength={1} />
      <circle cx="16" cy="9" r="1.4" fill="currentColor" />
    </svg>
  );
}
