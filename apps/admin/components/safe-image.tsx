'use client';

import { ImageOff } from 'lucide-react';
import Image from 'next/image';
import * as React from 'react';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

interface SafeImageProps {
  src: string | null | undefined;
  alt: string;
  /** Text used for the placeholder initial when the image is missing or fails. */
  fallbackText?: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  fit?: 'cover' | 'contain';
}

/**
 * Fills its (relatively positioned) parent. Seed and signed URLs may be missing
 * or expired, so every image degrades to a calm neutral tile.
 */
export function SafeImage({ src, alt, fallbackText, className, sizes = '200px', priority, fit = 'cover' }: SafeImageProps) {
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  const failed = !src || failedSrc === src;

  if (failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn('absolute inset-0 flex items-center justify-center bg-neutral-100 text-neutral-400', className)}
      >
        {fallbackText ? (
          <span className="font-display text-2xl font-semibold">{initials(fallbackText)}</span>
        ) : (
          <ImageOff className="size-5" aria-hidden />
        )}
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      unoptimized
      sizes={sizes}
      priority={priority}
      onError={() => setFailedSrc(src)}
      className={cn(fit === 'cover' ? 'object-cover' : 'object-contain', className)}
    />
  );
}

/** Square/portrait thumbnail box with the SafeImage inside. */
export function Thumb({
  src,
  alt,
  fallbackText,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  fallbackText?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative size-10 shrink-0 overflow-hidden rounded-md border border-border bg-neutral-100', className)}>
      <SafeImage src={src} alt={alt} fallbackText={fallbackText} sizes="80px" />
    </div>
  );
}
