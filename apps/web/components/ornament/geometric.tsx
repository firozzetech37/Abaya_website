import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Arabic-inspired ornaments (docs/apps/web.md "Look and feel"): the eight-pointed star
 * (khatam) and a girih lattice built from it. Pure SVG in currentColor, so each use picks its
 * colour (gold on green, green on sand). Decorative only: hidden from screen readers.
 */

/** Two squares, one turned 45°: the eight-pointed star, centred in a 64 × 64 box. */
const STAR_PATH = 'M32 8 56 32 32 56 8 32Z M15 15H49V49H15Z';

/** A single eight-pointed star (bullets, dividers, medallions). */
export function EightPointStar({ className, filled = false }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn('shrink-0', className)}>
      <path
        d={STAR_PATH}
        fill={filled ? 'currentColor' : 'none'}
        fillOpacity={filled ? 0.18 : undefined}
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="32" r="5" fill="currentColor" />
    </svg>
  );
}

/**
 * A repeating girih lattice: stars joined to their neighbours by straight lines, like
 * carved screens and tiled walls. Fill the parent (absolute inset-0) behind content.
 */
export function StarPattern({ className, size = 64, strokeWidth = 1 }: { className?: string; size?: number; strokeWidth?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg aria-hidden className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}>
      <defs>
        <pattern id={`girih-${id}`} width={size} height={size} patternUnits="userSpaceOnUse" viewBox="0 0 64 64">
          <g fill="none" stroke="currentColor" strokeWidth={(strokeWidth * 64) / size} strokeLinejoin="round">
            <path d={STAR_PATH} />
            {/* Lines from the star's tips to the tile edges and corners: the lattice. */}
            <path d="M32 0V8 M32 56V64 M0 32H8 M56 32H64 M0 0 15 15 M64 0 49 15 M0 64 15 49 M64 64 49 49" />
            <circle cx="32" cy="32" r="6" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#girih-${id})`} />
    </svg>
  );
}

/**
 * Gold hairline — star — hairline. Add `data-reveal="draw"` on a parent (or pass `reveal`)
 * and the lines draw outwards from the star when it scrolls into view.
 */
export function StarDivider({ className, reveal = true }: { className?: string; reveal?: boolean }) {
  return (
    <div
      aria-hidden
      data-reveal={reveal ? 'draw' : undefined}
      className={cn('flex items-center justify-center gap-3 text-gold-500', className)}
    >
      <span className="ornament-line h-px w-16 bg-gradient-to-l from-current to-transparent sm:w-24" />
      <EightPointStar className="ornament-star size-4" filled />
      <span className="ornament-line h-px w-16 bg-gradient-to-r from-current to-transparent sm:w-24" />
    </div>
  );
}

/** The small star that leads section eyebrows ("Curated edits", "Just in"). */
export function EyebrowStar({ className }: { className?: string }) {
  return <EightPointStar className={cn('size-3.5 text-gold-500', className)} filled />;
}

/**
 * Mashrabiya: the carved wooden screen of Gulf houses, as an octagon-and-square lattice.
 * Laid over dark sections at low opacity. Fill the parent (absolute inset-0).
 */
export function MashrabiyaPattern({ className, size = 56, strokeWidth = 1 }: { className?: string; size?: number; strokeWidth?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg aria-hidden className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}>
      <defs>
        <pattern id={`mashrabiya-${id}`} width={size} height={size} patternUnits="userSpaceOnUse" viewBox="0 0 40 40">
          <g fill="none" stroke="currentColor" strokeWidth={(strokeWidth * 40) / size} strokeLinejoin="round">
            {/* Octagon in the middle, a small turned square at every corner */}
            <path d="M14 4h12l10 10v12L26 36H14L4 26V14Z" />
            <path d="M0 6 6 0M34 0l6 6M40 34l-6 6M6 40l-6-6" />
            <circle cx="20" cy="20" r="3" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#mashrabiya-${id})`} />
    </svg>
  );
}

/** An arabesque vine, repeating along a line: section and footer borders. */
export function ArabesqueBorder({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg aria-hidden className={cn('block h-4 w-full text-gold-400', className)} preserveAspectRatio="none">
      <defs>
        <pattern id={`vine-${id}`} width="96" height="16" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
            <path d="M0 8c12-9 24-9 36 0s24 9 36 0 16-7 24 0" />
            <path d="M18 8c0-4 4-6 8-5-1 4-5 6-8 5ZM54 8c0 4-4 6-8 5 1-4 5-6 8-5Z" fill="currentColor" fillOpacity="0.35" />
          </g>
          <circle cx="36" cy="8" r="1.4" fill="currentColor" />
          <circle cx="72" cy="8" r="1.4" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#vine-${id})`} />
    </svg>
  );
}

/** A hanging lantern (fanous): empty states and the closing medallion. */
export function Lantern({ className, glow = false }: { className?: string; glow?: boolean }) {
  return (
    <svg viewBox="0 0 40 64" aria-hidden className={cn('h-10 w-auto', glow && 'star-glow', className)} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M20 2v6" />
      <circle cx="20" cy="4" r="2" />
      <path d="M12 12h16l-2-4H14ZM10 12h20v4H10Z" />
      <path d="M11 16 7 34c-1 4 2 8 6 8h14c4 0 7-4 6-8l-4-18" />
      <path d="M13 22h14M12 30h16M14 38h12" opacity="0.6" />
      <path d="M20 16v26" opacity="0.4" />
      <path d="M14 42l-2 6h16l-2-6M18 48v6h4v-6M20 54v8" />
      <circle cx="20" cy="29" r="4" fill="currentColor" fillOpacity="0.25" stroke="none" />
    </svg>
  );
}
