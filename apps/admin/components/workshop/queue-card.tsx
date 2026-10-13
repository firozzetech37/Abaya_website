'use client';

import type { WorkshopQueueItem } from '@abaya/contracts';
import { AlarmClock, Check, CircleHelp, RotateCcw, Timer, UserRound, X } from 'lucide-react';
import Link from 'next/link';
import { Thumb } from '@/components/safe-image';
import { StageBadge } from '@/components/status-badges';
import { Badge } from '@/components/ui/badge';
import { STYLE_LABELS, strings } from '@/content/strings';
import { formatDate, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { jobOwner } from './job-owner';

const w = strings.workshop;

const REQUIREMENTS = ['measurements', 'pieces', 'fabric', 'files'] as const;

/** Key facts of the job: body measurements, chosen options and (pattern) progress. */
function Brief({ item }: { item: WorkshopQueueItem }) {
  const { measurements, options, pattern } = item.brief;
  const atPattern =
    item.stage === 'SPEC_APPROVED' || item.stage === 'PATTERN' || item.heldFromStage === 'PATTERN';
  return (
    <div className="space-y-2 border-t border-border pt-2">
      {measurements.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {measurements.map((m) => (
            <span
              key={m.key}
              className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] tabular-nums text-neutral-700"
            >
              {w.pattern.points[m.key] ?? m.key} <span className="font-semibold">{m.cm}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted">{w.briefStandard(item.sizeBandCode)}</p>
      )}
      {options.length > 0 ? (
        <p className="line-clamp-2 text-[11px] text-muted">
          {options.map((o) => `${o.group}: ${o.value}`).join(' · ')}
        </p>
      ) : null}
      {atPattern ? (
        <div className="flex flex-wrap items-center gap-1">
          <span
            className={cn(
              'mr-1 text-[11px] font-medium',
              !pattern
                ? 'text-muted'
                : pattern.missing.length === 0
                  ? 'text-emerald-700'
                  : 'text-amber-800',
            )}
          >
            {!pattern
              ? w.patternNotStarted
              : pattern.status === 'CONFIRMED'
                ? w.patternConfirmed(pattern.version)
                : pattern.missing.length === 0
                  ? `${w.patternDraft(pattern.version)} · ${w.patternReady}`
                  : w.patternDraft(pattern.version)}
          </span>
          {pattern
            ? REQUIREMENTS.map((r) => {
                const ok = !pattern.missing.includes(r);
                return (
                  <span
                    key={r}
                    className={cn(
                      'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                      ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900',
                    )}
                  >
                    {ok ? (
                      <Check className="size-2.5" aria-hidden />
                    ) : (
                      <X className="size-2.5" aria-hidden />
                    )}
                    {w.requirement[r]}
                  </span>
                );
              })
            : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One job in a station queue: what it is, when it is due, and who has it. `detailed` (the
 * station page) adds the measurements, options and pattern progress.
 */
export function QueueCard({
  item,
  meId,
  detailed = false,
}: {
  item: WorkshopQueueItem;
  meId: string;
  detailed?: boolean;
}) {
  const owner = jobOwner(item, meId);
  const mine = owner.mine;
  return (
    <Link
      href={`/workshop/item/${item.id}`}
      className={cn(
        'flex gap-3 rounded-xl border bg-surface p-3 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
        mine ? 'border-accent-300 ring-1 ring-accent-200' : 'border-border',
        item.stage === 'ON_HOLD' && 'border-amber-300 bg-amber-50/40',
      )}
    >
      <Thumb
        src={item.primaryImageUrl}
        alt=""
        fallbackText={item.designName}
        className="h-24 w-[72px]"
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <StageBadge stage={item.stage} />
          {item.isRework ? (
            <Badge tone="danger">
              <RotateCcw className="size-3" aria-hidden /> {w.rework}
            </Badge>
          ) : null}
          {item.isOverdue ? (
            <Badge tone="danger">
              <AlarmClock className="size-3" aria-hidden /> {w.overdue}
            </Badge>
          ) : null}
        </div>
        <p className="line-clamp-1 font-semibold leading-tight">{item.designName}</p>
        <p className="text-xs text-muted">
          {STYLE_LABELS[item.style]} · {w.size(item.sizeBandCode)} ·{' '}
          <span className="font-mono">{item.orderNumber}</span>
        </p>
        {item.stage === 'ON_HOLD' && item.holdReason ? (
          <p className="flex items-start gap-1 text-xs text-amber-900">
            <CircleHelp className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="line-clamp-2">{item.holdReason}</span>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {item.dueDate ? (
            <span className={cn(item.isOverdue ? 'font-medium text-danger' : 'text-muted')}>
              {w.due(formatDate(item.dueDate))}
            </span>
          ) : null}
          <span
            className={cn(
              'inline-flex items-center gap-1',
              mine ? 'font-medium text-accent-700' : 'text-muted',
            )}
          >
            <UserRound className="size-3.5" aria-hidden />
            {owner.text}
          </span>
          {item.claimedAt ? (
            <span className="inline-flex items-center gap-1 text-muted">
              <Timer className="size-3.5" aria-hidden />
              {w.startedWhen(formatRelative(item.claimedAt))}
            </span>
          ) : null}
        </div>
        {detailed ? <Brief item={item} /> : null}
      </div>
    </Link>
  );
}
