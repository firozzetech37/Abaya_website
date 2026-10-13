import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/**
 * The hero heading: two lines that rise out of their own clipped boxes on first paint (a CSS
 * animation, so nothing is hidden without JavaScript), the emphasised word in italic green with
 * a gold thread drawing itself underneath. Lines are clipped as blocks, not word by word, so the
 * line spacing stays as tight as the type. Plain markup (server-safe).
 */
export function HeroHeadline({ parts, className, id }: { parts: { before: string; emphasis: string; after: string }; className?: string; id?: string }) {
  // Punctuation that follows the emphasis (", not a size chart") stays glued to it.
  const lead = /^[,.!?;:،؛]+/.exec(parts.after)?.[0] ?? '';
  const after = parts.after.slice(lead.length);
  const rise = (ms: number) => ({ animationDelay: `${ms}ms` }) as CSSProperties;
  return (
    <h1 id={id} className={cn('font-display font-normal uppercase tracking-[-0.01em] text-foreground', className, 'leading-[0.96]')}>
      <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]">
        <span className="block motion-safe:animate-rise" style={rise(80)}>
          {parts.before.trim()}
        </span>
      </span>
      <span className="-mb-[0.1em] block overflow-hidden pb-[0.1em]">
        <span className="block motion-safe:animate-rise" style={rise(260)}>
          <em className="relative inline-block whitespace-nowrap font-normal italic text-accent-700">
            {parts.emphasis}
            {lead}
            <svg aria-hidden viewBox="0 0 120 12" preserveAspectRatio="none" className="absolute -bottom-1 left-0 h-3 w-full text-gold-400">
              <path
                d="M2 9C30 3 70 2 118 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                pathLength={1}
                className="hero-underline"
              />
            </svg>
          </em>{' '}
          {after.trim()}
        </span>
      </span>
    </h1>
  );
}
