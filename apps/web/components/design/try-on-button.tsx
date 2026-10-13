'use client';

import { Camera, Sparkles } from 'lucide-react';
import { useStrings } from '@/components/i18n/locale-provider';
import { Button } from '@/components/ui/button';
import { OPEN_TRYON_EVENT } from '@/lib/try-on-link';
import { cn } from '@/lib/utils';

/**
 * Under the price on an abaya's page: the virtual try-on, up front. It asks the AI studio further
 * down the page to open its try-on window (and scroll to it); signed-out visitors log in first.
 */
export function TryOnButton({ className }: { className?: string }) {
  const { design: t, home } = useStrings();
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
      <Button variant="gold" size="lg" onClick={() => window.dispatchEvent(new Event(OPEN_TRYON_EVENT))}>
        <Camera aria-hidden />
        {t.tryOnButton}
        <span className="ms-1 inline-flex items-center gap-1 rounded-full bg-accent-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-100">
          <Sparkles className="!size-3" aria-hidden />
          {home.newTag}
        </span>
      </Button>
      <p className="text-sm text-muted">{t.tryOnHint}</p>
    </div>
  );
}
