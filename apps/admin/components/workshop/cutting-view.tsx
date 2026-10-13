'use client';

import type { CuttingDto } from '@abaya/contracts';
import { SafeImage } from '@/components/safe-image';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { strings } from '@/content/strings';
import { formatDateTime } from '@/lib/format';
import { metres } from './pattern-view';

const ct = strings.workshop.cutting;

/** Read-only cutting records (newest first) for stitching, QC and the admin order page. */
export function CuttingView({ cuttings }: { cuttings: CuttingDto[] }) {
  if (cuttings.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{ct.records}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {cuttings.map((c) => (
          <div
            key={c.attempt}
            className="flex gap-3 border-b border-border pb-4 last:border-0 last:pb-0"
          >
            {c.photoUrl ? (
              <a
                href={c.photoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="relative size-20 shrink-0 overflow-hidden rounded-md bg-neutral-100"
              >
                <SafeImage src={c.photoUrl} alt={ct.photo} sizes="80px" />
              </a>
            ) : null}
            <div className="min-w-0 flex-1 space-y-1 text-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{ct.attempt(c.attempt)}</span>
                {c.variancePercent !== null ? (
                  <Badge tone={c.variancePercent > 15 ? 'warning' : 'neutral'}>
                    {ct.variance(c.variancePercent)}
                  </Badge>
                ) : null}
              </div>
              <p>
                <span className="text-muted">{ct.lot}: </span>
                <span className="font-mono">{c.fabricLot}</span>
              </p>
              <p className="tabular-nums">
                {ct.usedOf(metres(c.fabricUsedCm), c.estimateCm ? metres(c.estimateCm) : null)}
                {c.wastageCm !== null ? (
                  <span className="text-muted">
                    {' '}
                    · {ct.wastage}: {metres(c.wastageCm)}
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-muted">
                {c.pieces.map((p) => `${p.name} ×${p.count}`).join(' · ')}
              </p>
              {c.notes ? <p className="whitespace-pre-line text-neutral-700">{c.notes}</p> : null}
              <p className="text-xs text-muted">
                {ct.by(c.cutBy?.name ?? null, formatDateTime(c.createdAt))}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
