'use client';

import { animate } from 'framer-motion';
import { useEffect } from 'react';
import { takeFly } from '@/lib/fly';

const FLIGHT_S = 0.75;

/**
 * Animates the photo the customer clicked on a product card from where it was into the
 * gallery's frame (the element with `targetId`). Imperative, outside React's tree, so the
 * page's own markup never depends on sessionStorage. Nothing happens for reduced motion or
 * when there is no remembered start.
 */
export function FlyImage({ src, targetId }: { src: string | null | undefined; targetId: string }) {
  useEffect(() => {
    if (!src) return;
    const from = takeFly(src);
    const frame = document.getElementById(targetId);
    if (!from || !frame || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const to = frame.getBoundingClientRect();
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    Object.assign(img.style, {
      position: 'fixed',
      left: `${from.rect.x}px`,
      top: `${from.rect.y}px`,
      width: `${from.rect.w}px`,
      height: `${from.rect.h}px`,
      objectFit: 'cover',
      borderRadius: '9999px 9999px 1rem 1rem',
      zIndex: '60',
      pointerEvents: 'none',
      boxShadow: '0 40px 80px -40px rgba(68,17,27,0.6)',
    });
    document.body.appendChild(img);
    frame.style.visibility = 'hidden';

    const flight = animate(
      img,
      { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, borderRadius: '0.75rem' },
      { duration: FLIGHT_S, ease: [0.22, 1, 0.36, 1] },
    );
    const land = () => {
      frame.style.visibility = '';
      img.remove();
    };
    void flight.then(land);
    return () => {
      flight.stop();
      land();
    };
  }, [src, targetId]);

  return null;
}
