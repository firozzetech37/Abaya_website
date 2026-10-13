'use client';

import { Expand, Sparkles } from 'lucide-react';
import * as React from 'react';
import { SafeImage } from '@/components/safe-image';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { strings } from '@/content/strings';
import { cn } from '@/lib/utils';

const t = strings.aiPreviewCompare;

/**
 * Our design photo next to the customer's website AI preview of this abaya (never a try-on).
 * The preview is approximate: the ordered options are the specification. Click to compare full size.
 */
export function AiPreviewCompare({
  designUrl,
  designName,
  preview,
  className,
}: {
  designUrl: string | null;
  designName: string;
  preview: { url: string; inspirationOnly: boolean };
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const note = preview.inspirationOnly ? t.inspiration : t.approximate;
  const pictures = [
    { key: 'design', label: t.ourDesign, url: designUrl },
    { key: 'preview', label: t.herPreview, url: preview.url },
  ];
  return (
    <div className={cn('rounded-lg border border-violet-200 bg-violet-50/40 p-3', className)}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-900">
          <Sparkles className="size-3.5" aria-hidden /> {t.title}
        </p>
        <Badge tone={preview.inspirationOnly ? 'warning' : 'violet'}>{preview.inspirationOnly ? t.inspirationBadge : t.approximateBadge}</Badge>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group grid w-full grid-cols-2 gap-2 rounded-md text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        aria-label={t.compare}
      >
        {pictures.map((p) => (
          <span key={p.key} className="block">
            <span className="relative block aspect-[4/5] overflow-hidden rounded-md bg-neutral-100 ring-1 ring-border">
              <SafeImage src={p.url} alt={`${p.label}: ${designName}`} fallbackText={designName} sizes="220px" fit="contain" />
              <span className="absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                <Expand className="size-3" aria-hidden />
              </span>
            </span>
            <span className="mt-1 block text-[11px] font-medium text-muted">{p.label}</span>
          </span>
        ))}
      </button>
      <p className="mt-2 text-xs text-violet-950/80">{note}</p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl" className="max-w-[min(96vw,1200px)]">
          <DialogHeader>
            <DialogTitle>{t.compareTitle(designName)}</DialogTitle>
            <DialogDescription>{note}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-4 md:grid-cols-2">
              {pictures.map((p) => (
                <figure key={p.key}>
                  <figcaption className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{p.label}</figcaption>
                  <div className="relative aspect-[4/5] max-h-[70vh] overflow-hidden rounded-lg bg-neutral-50 ring-1 ring-border">
                    <SafeImage src={p.url} alt={`${p.label}: ${designName}`} fallbackText={designName} sizes="(min-width: 768px) 560px, 92vw" fit="contain" />
                  </div>
                </figure>
              ))}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
