'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Product image with a graceful placeholder. Seed images do not exist in development,
 * and any storage hiccup should show a calm tile rather than a broken image.
 */
export function DesignImage({
  src,
  alt,
  name,
  sizes,
  priority,
  className,
  onFail,
  imagePosition,
  fit = 'cover',
}: {
  src: string | null | undefined;
  alt: string;
  /** Used for the placeholder monogram. */
  name: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  /** Called once when the photo cannot be loaded (the placeholder is shown). */
  onFail?: (src: string) => void;
  /** CSS object-position, for close-up crops (e.g. "50% 68%"). */
  imagePosition?: string;
  /** "contain" shows the whole photo (nothing cropped) on a soft champagne ground; "cover" fills the frame. */
  fit?: 'cover' | 'contain';
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = !src || failedSrc === src;

  return (
    // Previews are web-size; this only stops casual saving (right-click, drag, long-press).
    <div
      className={cn('relative select-none overflow-hidden bg-sand-100 [-webkit-touch-callout:none]', className)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {failed ? (
        <ImagePlaceholder name={name} label={alt} />
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          draggable={false}
          className={cn('pointer-events-none', fit === 'contain' ? 'object-contain' : 'object-cover')}
          style={imagePosition ? { objectPosition: imagePosition } : undefined}
          onError={() => {
            setFailedSrc(src);
            onFail?.(src);
          }}
        />
      )}
    </div>
  );
}

export function ImagePlaceholder({ name, label }: { name: string; label?: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || 'A';
  return (
    <div
      role={label ? 'img' : undefined}
      aria-label={label}
      className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-sand-100 to-sand-200 text-accent-800/70"
    >
      <svg viewBox="0 0 60 120" className="h-1/2 max-h-48 w-auto opacity-40" aria-hidden>
        <path
          d="M30 6c-4 0-7 3-7 7 0 3 1 5 3 6l-10 6c-3 2-4 5-5 9L4 112h52L49 34c-1-4-2-7-5-9l-10-6c2-1 3-3 3-6 0-4-3-7-7-7z"
          fill="currentColor"
        />
      </svg>
      <span className="mt-3 font-display text-3xl font-semibold" aria-hidden>
        {initial}
      </span>
    </div>
  );
}
