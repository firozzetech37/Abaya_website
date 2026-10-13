'use client';

import { m, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { StarPattern } from '@/components/ornament/geometric';
import { cn } from '@/lib/utils';

/**
 * A "breathing" arabesque: the girih lattice drifts slower than the content as the section
 * scrolls (depth), and a soft gold glint travels across it. Fills its parent; decorative only.
 */
export function ParallaxPattern({
  className,
  size = 72,
  strokeWidth = 1,
  distance = 56,
  glint = true,
}: {
  className?: string;
  size?: number;
  strokeWidth?: number;
  /** How far the pattern drifts, in px, over the section's time on screen. */
  distance?: number;
  glint?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const drift = useSpring(useTransform(scrollYProgress, [0, 1], [-distance, distance]), { stiffness: 60, damping: 22 });

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <m.div className="absolute inset-x-0 -inset-y-20" style={{ y: reduced ? 0 : drift }}>
        <StarPattern size={size} strokeWidth={strokeWidth} className={cn('text-accent-700/[0.07]', className)} />
      </m.div>
      {glint && (
        <span className="absolute inset-y-0 start-0 w-1/3 bg-gradient-to-r from-transparent via-gold-200/[0.16] to-transparent motion-safe:animate-glint" />
      )}
    </div>
  );
}
