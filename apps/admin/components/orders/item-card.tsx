'use client';

import {
  type AdminOrderItemDto,
  missingTeam,
  type OrderStatus,
  type ProductionStage,
  stationForStage,
  TEAM_SLOTS,
} from '@abaya/contracts';
import {
  Ban,
  Camera,
  CheckCircle2,
  ClipboardList,
  FileText,
  Printer,
  Users,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { AuditHistory } from '@/components/audit-history';
import { AiPreviewCompare } from '@/components/orders/ai-preview-compare';
import { SafeImage, Thumb } from '@/components/safe-image';
import { StageBadge } from '@/components/status-badges';
import { CuttingView } from '@/components/workshop/cutting-view';
import { StitchingView } from '@/components/workshop/stitching-view';
import { PatternView } from '@/components/workshop/pattern-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MEASUREMENT_LABELS, STAGE_LABELS, STYLE_LABELS, strings } from '@/content/strings';
import { useCurrentUser } from '@/lib/current-user';
import { formatDate, formatDateTime, formatMoney, isPast } from '@/lib/format';
import { canMoveToStage, GENERIC_TARGETS } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { CancelItemDialog, MoveStageDialog, QcDialog } from './production-dialogs';
import { TeamDialog, teamEditable } from './team-dialog';
import { TechPackDialog } from './tech-pack-dialog';

const o = strings.order;
const p = strings.production;

const t = p.team;

type ActiveDialog =
  | { kind: 'tech-pack' }
  | { kind: 'team' }
  | { kind: 'qc' }
  | { kind: 'cancel' }
  | { kind: 'move'; to: ProductionStage };

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('min-w-0', className)}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

export function ItemCard({
  orderId,
  orderStatus,
  item,
  index,
  siblings,
}: {
  orderId: string;
  orderStatus: OrderStatus;
  item: AdminOrderItemDto;
  index: number;
  /** All items of the order (Assign team can apply to every abaya). */
  siblings: AdminOrderItemDto[];
}) {
  const me = useCurrentUser();
  const [dialog, setDialog] = React.useState<ActiveDialog | null>(null);
  const [showHistory, setShowHistory] = React.useState(false);
  const close = (open: boolean) => !open && setDialog(null);

  // Production only happens on paid orders; a cancelled or refunded order shows its items as cancelled.
  const paid = orderStatus === 'PAID';
  const shownStage =
    orderStatus === 'CANCELLED' || orderStatus === 'REFUNDED' ? 'CANCELLED' : item.stage;
  const canProduce = paid && me.can('manageProduction');
  // QC results and holds have their own forms (QC dialog, workshop hold/resume).
  const moves = item.nextStages.filter(
    (s) =>
      paid &&
      GENERIC_TARGETS.includes(s) &&
      item.stage !== 'QC' &&
      item.stage !== 'ON_HOLD' &&
      // The cut is recorded at the workshop Cutting station (lot, metres, pieces).
      !(item.stage === 'CUTTING' && s === 'STITCHING') &&
      // ...and the stitching (checklist, self-check) at the Stitching station.
      !(item.stage === 'STITCHING' && s === 'QC') &&
      canMoveToStage(me.roles, s),
  );
  const canTechPack = canProduce && (item.stage === 'PLACED' || item.techPack !== null);
  // The team (one person per station, tailor included) is picked before the tech pack is approved.
  const canAssign = canProduce && teamEditable(item);
  const teamMissing = missingTeam({
    pattern: item.team.pattern?.id,
    cutting: item.team.cutting?.id,
    qc: item.team.qc?.id,
    finishing: item.team.finishing?.id,
    makerId: item.team.stitching?.id ?? null,
  });
  const currentStation = stationForStage(
    item.stage === 'ON_HOLD' ? (item.stageEvents.at(-1)?.fromStage ?? item.stage) : item.stage,
  );
  const canQc = paid && item.stage === 'QC' && me.can('recordQc');
  const canCancel = paid && item.nextStages.includes('CANCELLED') && me.can('cancelItems');
  const late =
    item.dueDate &&
    isPast(item.dueDate) &&
    !['SHIPPED', 'DELIVERED', 'CANCELLED'].includes(item.stage);
  const events = [...item.stageEvents].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const qcChecks = [...item.qcChecks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const measurementEntries = item.measurements
    ? Object.entries(item.measurements).filter(([, v]) => v !== null && v !== '')
    : [];
  const hasActions = canTechPack || canAssign || canQc || canCancel || moves.length > 0;

  return (
    <Card id={`item-${item.id}`} className="scroll-mt-4 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start">
        <Thumb
          src={item.design.primaryImageUrl}
          alt={item.design.name}
          fallbackText={item.design.name}
          className="h-24 w-[72px]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">
              {o.item} {index + 1}
            </span>
            <StageBadge stage={shownStage} />
            {item.techPack ? (
              <Badge tone={item.techPack.status === 'APPROVED' ? 'success' : 'warning'}>
                {o.techPack}:{' '}
                {item.techPack.status === 'APPROVED' ? strings.common.yes : o.techPackDraft}
              </Badge>
            ) : null}
          </div>
          <h2 className="mt-1 text-lg font-semibold">
            {me.can('viewDesigns') ? (
              <Link href={`/designs/${item.design.id}`} className="hover:underline">
                {item.design.name}
              </Link>
            ) : (
              item.design.name
            )}
          </h2>
          <p className="text-sm text-muted">
            {STYLE_LABELS[item.design.style]} · {o.size} {item.sizeBandCode} · {o.quantity}{' '}
            {item.quantity} · {formatMoney(item.unitPriceInPaise)}
          </p>
          {item.dueDate ? (
            <p className={cn('mt-1 text-sm', late ? 'font-medium text-danger' : 'text-muted')}>
              {o.dueDate} {formatDate(item.dueDate)}
              {late ? ` · ${strings.orders.late}` : ''}
            </p>
          ) : null}
          {/* The team, in production order; the station working on it now is highlighted. */}
          <ol className="mt-2 flex flex-wrap gap-1.5" aria-label={t.title}>
            {TEAM_SLOTS.map((slot) => {
              const member = item.team[slot];
              const now = slot === currentStation && paid;
              return (
                <li
                  key={slot}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs',
                    now
                      ? 'border-accent-600 bg-accent-50 font-medium text-accent-800'
                      : 'border-border',
                    !member && 'border-amber-300 bg-amber-50 text-amber-900',
                  )}
                >
                  <span className="text-muted">{t.short[slot]}: </span>
                  {member ? (member.name ?? '—') : t.notAssigned}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      {item.aiPreview ? (
        <div className="border-b border-border p-4">
          <AiPreviewCompare designUrl={item.design.primaryImageUrl} designName={item.design.name} preview={item.aiPreview} className="max-w-md" />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-neutral-50 px-4 py-2.5">
        {!hasActions ? <span className="text-xs text-muted">{o.noActions}</span> : null}
        {canTechPack ? (
          <Button
            size="sm"
            variant={item.stage === 'PLACED' ? 'primary' : 'secondary'}
            onClick={() => setDialog({ kind: 'tech-pack' })}
          >
            <FileText /> {p.techPackOpen}
          </Button>
        ) : null}
        {canTechPack ? (
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/orders/${orderId}/items/${item.id}/tech-pack/print`} target="_blank">
              <Printer /> {p.printable}
            </Link>
          </Button>
        ) : null}
        {canAssign ? (
          <Button
            size="sm"
            variant={teamMissing.length > 0 ? 'primary' : 'secondary'}
            onClick={() => setDialog({ kind: 'team' })}
          >
            <Users /> {teamMissing.length > 0 ? t.assign : t.change}
          </Button>
        ) : null}
        {moves.map((to) => (
          <Button
            key={to}
            size="sm"
            variant={to === 'REMAKE' ? 'danger-outline' : 'primary'}
            onClick={() => setDialog({ kind: 'move', to })}
          >
            {p.move(STAGE_LABELS[to])}
          </Button>
        ))}
        {canQc ? (
          <Button size="sm" onClick={() => setDialog({ kind: 'qc' })}>
            <ClipboardList /> {p.qcRecord}
          </Button>
        ) : null}
        {canCancel ? (
          <Button
            size="sm"
            variant="danger-outline"
            className="ml-auto"
            onClick={() => setDialog({ kind: 'cancel' })}
          >
            <Ban /> {p.cancel}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-6 p-4 lg:grid-cols-3">
        <Section title={o.options}>
          <dl className="space-y-1 text-sm">
            {item.options.map((opt) => (
              <div key={opt.valueId} className="flex justify-between gap-3">
                <dt className="text-muted">{opt.groupName}</dt>
                <dd className="text-right">{opt.valueName}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title={o.measurements}>
          {measurementEntries.length === 0 ? (
            <p className="text-sm text-muted">{o.noMeasurements}</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {measurementEntries.map(([k, v]) => (
                  <tr key={k} className="border-b border-border last:border-0">
                    <th className="py-1 pr-2 text-left font-normal text-muted">
                      {MEASUREMENT_LABELS[k] ?? k}
                    </th>
                    <td className="py-1 text-right tabular-nums">
                      {typeof v === 'number' ? `${v} cm` : String(v)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title={o.priceBreakdown}>
          <dl className="space-y-1 text-sm">
            {item.priceBreakdown.lines.map((l, i) => (
              <div key={`${l.kind}-${l.optionValueId ?? i}`} className="flex justify-between gap-3">
                <dt className="text-muted">{l.label}</dt>
                <dd className="tabular-nums">{formatMoney(l.amountInPaise)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-t border-border pt-1 font-medium">
              <dt>
                {o.total} ({o.quantity} {item.priceBreakdown.quantity})
              </dt>
              <dd className="tabular-nums">{formatMoney(item.priceBreakdown.totalInPaise)}</dd>
            </div>
          </dl>
        </Section>

        <Section title={o.timeline} className="lg:col-span-2">
          {events.length === 0 ? (
            <p className="text-sm text-muted">{o.noEvents}</p>
          ) : (
            <ol className="relative space-y-3 border-l border-border pl-5">
              {events.map((e) => (
                <li key={e.id} className="relative">
                  <span
                    className="absolute -left-[25px] top-1 size-2.5 rounded-full border-2 border-surface bg-accent-500"
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {e.fromStage ? (
                      <>
                        <StageBadge stage={e.fromStage} />
                        <span className="text-muted" aria-hidden>
                          →
                        </span>
                      </>
                    ) : null}
                    <StageBadge stage={e.toStage} />
                    <span className="text-xs text-muted">{formatDateTime(e.createdAt)}</span>
                  </div>
                  {e.note ? (
                    <p className="mt-1 whitespace-pre-line text-sm text-neutral-700">{e.note}</p>
                  ) : null}
                  {e.photoUrl ? (
                    <a
                      href={e.photoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-2 text-xs text-accent-700 hover:underline"
                    >
                      <span className="relative block h-20 w-16 overflow-hidden rounded border border-border bg-neutral-100">
                        <SafeImage src={e.photoUrl} alt={o.stagePhoto} sizes="64px" />
                      </span>
                      <Camera className="size-3.5" aria-hidden /> {o.stagePhoto}
                    </a>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title={o.qcHistory}>
          {qcChecks.length === 0 ? (
            <p className="text-sm text-muted">—</p>
          ) : (
            <ul className="space-y-3">
              {qcChecks.map((q) => (
                <li key={q.id} className="rounded-md border border-border p-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 font-medium',
                        q.result === 'PASS' ? 'text-emerald-700' : 'text-danger',
                      )}
                    >
                      {q.result === 'PASS' ? (
                        <CheckCircle2 className="size-4" aria-hidden />
                      ) : (
                        <XCircle className="size-4" aria-hidden />
                      )}
                      {q.result === 'PASS' ? p.qcPassed : p.qcFailed}
                    </span>
                    <span className="text-xs text-muted">{formatDateTime(q.createdAt)}</span>
                  </div>
                  <p className="text-xs text-muted">{q.checkedBy?.name ?? ''}</p>
                  {q.notes ? (
                    <p className="mt-1 whitespace-pre-line text-neutral-700">{q.notes}</p>
                  ) : null}
                  {q.checklist.some((c) => !c.ok) ? (
                    <ul className="mt-1 list-inside list-disc text-xs text-danger">
                      {q.checklist
                        .filter((c) => !c.ok)
                        .map((c) => (
                          <li key={c.item}>{c.item}</li>
                        ))}
                    </ul>
                  ) : null}
                  {q.photoUrls.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {q.photoUrls.map((url, i) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative block size-12 overflow-hidden rounded border border-border"
                        >
                          <SafeImage src={url} alt={`${p.qcPhotos} ${i + 1}`} sizes="48px" />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="border-t border-border px-4 py-2">
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={showHistory}
          onClick={() => setShowHistory((v) => !v)}
        >
          {o.history}
        </Button>
        {showHistory ? (
          <div className="pb-2 pt-1">
            <AuditHistory entityType="OrderItem" entityId={item.id} />
          </div>
        ) : null}
      </div>

      {item.pattern || item.cuttings.length > 0 || item.stitchings.length > 0 ? (
        <div className="space-y-4 border-t border-border p-4">
          {item.pattern ? <PatternView pattern={item.pattern} compact /> : null}
          <CuttingView cuttings={item.cuttings} />
          <StitchingView stitchings={item.stitchings} />
        </div>
      ) : null}

      {dialog?.kind === 'tech-pack' ? (
        <TechPackDialog
          open
          onOpenChange={close}
          orderId={orderId}
          item={item}
          teamReady={teamMissing.length === 0}
        />
      ) : null}
      {dialog?.kind === 'team' ? (
        <TeamDialog orderId={orderId} item={item} siblings={siblings} onOpenChange={close} />
      ) : null}
      {dialog?.kind === 'qc' ? (
        <QcDialog open onOpenChange={close} orderId={orderId} itemId={item.id} />
      ) : null}
      {dialog?.kind === 'cancel' ? (
        <CancelItemDialog open onOpenChange={close} orderId={orderId} item={item} />
      ) : null}
      {dialog?.kind === 'move' ? (
        <MoveStageDialog open onOpenChange={close} orderId={orderId} item={item} to={dialog.to} />
      ) : null}
    </Card>
  );
}
