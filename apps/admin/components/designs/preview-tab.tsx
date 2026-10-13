'use client';

import type { AdminDesignDetail, AdminOptionGroupDto } from '@abaya/contracts';
import * as React from 'react';
import { SafeImage } from '@/components/safe-image';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { STYLE_LABELS, strings } from '@/content/strings';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const p = strings.editor.preview;

/** Approximation of the customer product page, built from the admin detail. */
export function PreviewTab({
  design,
  groups,
  fromPriceInPaise,
}: {
  design: AdminDesignDetail;
  groups: AdminOptionGroupDto[];
  fromPriceInPaise: number | null;
}) {
  const images = [...design.images].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder);
  const [active, setActive] = React.useState(0);
  const current = images[active] ?? images[0];
  const allowed = new Map(design.options.map((o) => [o.optionValueId, o]));

  return (
    <div>
      <p className="mb-3 text-xs text-muted">{p.hint}</p>
      <Card className="overflow-hidden bg-neutral-50">
        <div className="grid gap-8 p-4 md:grid-cols-2 md:p-8">
          <div>
            <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-neutral-100">
              <SafeImage src={current?.url} alt={current?.alt ?? design.name} fallbackText={design.name} sizes="600px" />
            </div>
            {images.length > 1 ? (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {images.map((img, i) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setActive(i)}
                    aria-label={img.alt ?? `${design.name} ${i + 1}`}
                    className={cn(
                      'relative h-20 w-16 shrink-0 overflow-hidden rounded-md border-2',
                      i === active ? 'border-accent-600' : 'border-transparent',
                    )}
                  >
                    <SafeImage src={img.url} alt="" fallbackText={design.name} sizes="64px" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-muted">{STYLE_LABELS[design.style]}</p>
            <h2 className="mt-1 font-display text-4xl font-semibold leading-tight">{design.name}</h2>
            <p className="mt-3 text-lg">
              <span className="text-sm text-muted">{p.from} </span>
              <span className="font-semibold">{formatMoney(fromPriceInPaise)}</span>
            </p>
            <p className="mt-1 text-sm text-muted">{p.leadTime(design.leadTimeDays)}</p>
            <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-neutral-700">{design.description || p.noDescription}</p>
            {design.tags.length ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {design.tags.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
            ) : null}
            <h3 className="mt-8 font-display text-xl font-semibold">{p.options}</h3>
            <div className="mt-3 space-y-4">
              {groups.map((g) => {
                const values = g.values.filter((v) => allowed.has(v.id));
                if (values.length === 0) return null;
                return (
                  <div key={g.code}>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-600">{g.name}</p>
                    <div className="flex flex-wrap gap-2">
                      {values.map((v) => {
                        const o = allowed.get(v.id)!;
                        const surcharge = o.surchargeOverrideInPaise ?? v.surchargeInPaise;
                        return (
                          <span
                            key={v.id}
                            className={cn(
                              'inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1.5 text-sm',
                              o.isDefault ? 'border-accent-600 ring-1 ring-accent-600' : 'border-border',
                            )}
                          >
                            {v.colourHex ? (
                              <span className="size-4 rounded-full border border-black/10" style={{ backgroundColor: v.colourHex }} aria-hidden />
                            ) : null}
                            {v.name}
                            {surcharge > 0 ? <span className="text-xs text-muted">+{formatMoney(surcharge)}</span> : null}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
