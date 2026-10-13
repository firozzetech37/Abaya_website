'use client';

import type { StitchingDto } from '@abaya/contracts';
import { SafeImage } from '@/components/safe-image';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { strings } from '@/content/strings';
import { formatDateTime } from '@/lib/format';

const st = strings.workshop.stitching;
const LEVEL_TONE = { ok: 'success', warn: 'warning', off: 'danger' } as const;

/** Read-only stitching records (newest first) for QC and the admin order page. */
export function StitchingView({ stitchings }: { stitchings: StitchingDto[] }) {
  if (stitchings.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{st.records}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {stitchings.map((s) => {
          const open = s.checklist.filter((l) => !l.done);
          return (
            <div
              key={s.attempt}
              className="flex gap-3 border-b border-border pb-4 last:border-0 last:pb-0"
            >
              {s.photoUrl ? (
                <a
                  href={s.photoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative size-20 shrink-0 overflow-hidden rounded-md bg-neutral-100"
                >
                  <SafeImage src={s.photoUrl} alt={st.photo} sizes="80px" />
                </a>
              ) : null}
              <div className="min-w-0 flex-1 space-y-1.5 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{st.attempt(s.attempt)}</span>
                  {s.hours !== null ? <Badge>{st.hours(s.hours)}</Badge> : null}
                  {s.makerName ? <span className="text-xs text-muted">{s.makerName}</span> : null}
                </div>
                {s.measurements.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {s.measurements.map((m) => (
                      <Badge key={m.key} tone={m.level ? LEVEL_TONE[m.level] : 'neutral'}>
                        <span className="tabular-nums">
                          {st.points[m.key] ?? m.key} {m.measuredCm}
                          {m.targetCm !== null ? ` / ${m.targetCm}` : ''} cm
                        </span>
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <p className="text-xs text-muted">
                  {open.length === 0
                    ? `${st.checklist}: ${s.checklist.length}/${s.checklist.length}`
                    : open.map((l) => l.label).join(' · ')}
                </p>
                {s.notes ? <p className="whitespace-pre-line text-neutral-700">{s.notes}</p> : null}
                <p className="text-xs text-muted">
                  {st.by(s.stitchedBy?.name ?? null, formatDateTime(s.finishedAt))}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
