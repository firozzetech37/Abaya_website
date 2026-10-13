'use client';

import { domMax, LazyMotion, MotionConfig } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Framer Motion, loaded lazily with the "domMax" feature set (animations plus drag gestures), and switched to
 * instant transitions for people who prefer reduced motion. Components use `m.*`, never `motion.*`.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
