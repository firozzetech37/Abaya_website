import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/**
 * Words that rise out of an invisible line, the way editorial magazines reveal headings.
 * `mode="view"`: when the text scrolls into view (the reveal observer sets data-shown; styles
 * in globals.css). `mode="load"`: on first paint, for the hero, as a CSS animation so nothing
 * is ever hidden without JavaScript. Plain markup, so server components can use it.
 */
export function MaskedText({
  text,
  mode = 'view',
  delay = 0,
  className,
  wordClassName,
}: {
  text: string;
  mode?: 'view' | 'load';
  /** Milliseconds before the first word moves. */
  delay?: number;
  className?: string;
  wordClassName?: string;
}) {
  const words = text.split(/\s+/).filter(Boolean);
  const style = (mode === 'load' ? { '--rise-delay': `${delay}ms` } : { '--reveal-delay': `${delay}ms` }) as unknown as CSSProperties;
  return (
    <span className={cn(mode === 'load' && 'mask-rise', className)} style={style} data-reveal={mode === 'view' ? 'mask' : undefined}>
      {words.map((word, i) => (
        // The space lives between the clipped boxes, where it cannot be collapsed away.
        <span key={`${word}-${i}`}>
          <span className="-mb-[0.1em] inline-block overflow-hidden pb-[0.1em] align-baseline">
            <span
              className={cn('mask-word inline-block will-change-transform', mode === 'load' && 'motion-safe:animate-rise', wordClassName)}
              style={{ '--i': i } as CSSProperties}
            >
              {word}
            </span>
          </span>
          {i < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </span>
  );
}
