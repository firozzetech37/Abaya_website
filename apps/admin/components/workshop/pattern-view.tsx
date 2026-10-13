'use client';

import type { PatternDto } from '@abaya/contracts';
import { FileText, Ruler } from 'lucide-react';
import { SafeImage } from '@/components/safe-image';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { strings } from '@/content/strings';
import { formatDateTime } from '@/lib/format';

const pt = strings.workshop.pattern;

export const metres = (cm: number | null) =>
  cm === null ? '—' : (cm / 100).toFixed(2).replace(/\.?0+$/, '');

/** One pattern file: a thumbnail for photos, an icon for PDF/CAD, opening in a new tab. */
export function PatternFileLink({
  file,
}: {
  file: { name: string; contentType: string; url?: string };
}) {
  const image = file.contentType.startsWith('image/');
  const body = (
    <>
      <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-neutral-100 text-neutral-500">
        {image && file.url ? (
          <SafeImage src={file.url} alt={file.name} sizes="48px" />
        ) : file.contentType === 'application/dxf' ? (
          <Ruler className="size-5" aria-hidden />
        ) : (
          <FileText className="size-5" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{file.name}</span>
        <span className="block text-xs uppercase text-muted">{file.contentType.split('/')[1]}</span>
      </span>
    </>
  );
  return file.url ? (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-md border border-border p-2 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
    >
      {body}
    </a>
  ) : (
    <div className="flex items-center gap-3 rounded-md border border-border p-2">{body}</div>
  );
}

/** Read-only pattern for the stations after pattern (cutting, stitching, QC) and the order page. */
export function PatternView({
  pattern,
  compact = false,
}: {
  pattern: PatternDto;
  compact?: boolean;
}) {
  const rows = pattern.measurements.filter((m) => m.finishedCm !== null);
  return (
    <Card>
      <CardHeader className="flex-wrap">
        <CardTitle>
          {pt.title} · {pt.version(pattern.version)}
        </CardTitle>
        <Badge tone={pattern.status === 'CONFIRMED' ? 'success' : 'warning'}>
          {pattern.status === 'CONFIRMED' ? pt.confirmed : pt.draft}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {pattern.confirmedAt ? (
          <p className="text-xs text-muted">
            {pt.by(pattern.confirmedBy?.name ?? null, formatDateTime(pattern.confirmedAt))}
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1.5 pr-3 font-medium">{pt.point}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{pt.body}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{pt.ease}</th>
                <th className="py-1.5 text-right font-medium">{pt.finished}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.key} className="border-t border-border">
                  <td className="py-1.5 pr-3">{pt.points[m.key] ?? m.key}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-muted">{m.bodyCm}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-muted">
                    {m.easeCm > 0 ? `+${m.easeCm}` : m.easeCm}
                  </td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{m.finishedCm}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              {pt.pieces}
            </p>
            <ul className="space-y-1 text-sm">
              {pattern.pieces.map((p) => (
                <li key={p.name} className="flex justify-between gap-2">
                  <span>{p.name}</span>
                  <span className="tabular-nums text-muted">×{p.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              {pt.fabric}
            </p>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt>{pt.fabricWidth}</dt>
                <dd className="tabular-nums">
                  {pattern.fabricWidthCm ? pt.widthCm(pattern.fabricWidthCm) : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{pt.fabricLength}</dt>
                <dd className="font-semibold tabular-nums">{metres(pattern.fabricLengthCm)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{pt.lining}</dt>
                <dd className="tabular-nums">
                  {pattern.liningLengthCm ? `${metres(pattern.liningLengthCm)} m` : pt.lining_none}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{pt.seamAllowance}</dt>
                <dd className="tabular-nums">{pattern.seamAllowanceMm}</dd>
              </div>
            </dl>
          </div>
        </div>
        {pattern.notes ? (
          <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide">{pt.notes}</p>
            <p className="whitespace-pre-line">{pattern.notes}</p>
          </div>
        ) : null}
        {!compact || pattern.files.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              {pt.files}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {pattern.files.map((f) => (
                <PatternFileLink key={f.path} file={f} />
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
