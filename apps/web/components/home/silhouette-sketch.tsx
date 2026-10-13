import type { AbayaStyle } from '@abaya/contracts';
import { cn } from '@/lib/utils';

/** Original line drawings of the cuts (gold hairlines on burgundy), drawn on when scrolled into view. */
const SKETCHES: Partial<Record<AbayaStyle, string[]>> = {
  // Open front: a straight fall, the two fronts parted, a belt at the waist
  OPEN_FRONT: [
    'M60 14c-7 0-11 5-11 11s4 11 11 11 11-5 11-11-4-11-11-11Z',
    'M46 44c-9 4-15 9-18 17L16 180h88L92 61c-3-8-9-13-18-17',
    'M46 44c4 6 10 9 14 9s10-3 14-9',
    'M55 56c-1 40-1 82 0 124M65 56c1 40 1 82 0 124',
    'M34 98c8-2 16-3 26-3s18 1 26 3M34 104c8-2 16-3 26-3s18 1 26 3',
    'M60 104c-2 10-1 20 3 30M60 104c-5 8-7 16-7 26',
  ],
  // Butterfly: the wide wings of a single-piece cut, falling from the shoulders to the wrists
  BUTTERFLY: [
    'M60 14c-7 0-11 5-11 11s4 11 11 11 11-5 11-11-4-11-11-11Z',
    'M47 43c-12 5-25 16-38 36l-5 46 20 4c6 14 8 32 8 51h76c0-19 2-37 8-51l20-4-5-46c-13-20-26-31-38-36',
    'M47 43c4 5 8 8 13 8s9-3 13-8',
    'M24 129c10-6 24-9 36-9s26 3 36 9',
    'M4 125c12-10 26-14 40-14M116 125c-12-10-26-14-40-14',
  ],
  // Closed: one piece, a round neckline, a long straight fall
  CLOSED: [
    'M60 14c-7 0-11 5-11 11s4 11 11 11 11-5 11-11-4-11-11-11Z',
    'M46 44c-9 4-16 10-18 20L18 180h84L92 64c-2-10-9-16-18-20',
    'M46 44c3 7 8 10 14 10s11-3 14-10',
    'M60 54v16',
    'M30 120h60',
    'M44 180l2-54M76 180l-2-54',
  ],
};

export function SilhouetteSketch({ style, className }: { style: AbayaStyle; className?: string }) {
  const paths = SKETCHES[style] ?? SKETCHES.CLOSED!;
  return (
    <svg viewBox="0 0 120 200" aria-hidden className={cn('silhouette-sketch h-full w-auto', className)} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d, i) => (
        <path key={d} d={d} pathLength={1} style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
    </svg>
  );
}
