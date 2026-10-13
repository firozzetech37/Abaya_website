'use client';

import { TEAM_SLOTS, type WorkshopItemDetail } from '@abaya/contracts';
import {
  AlarmClock,
  ArrowLeft,
  Camera,
  CircleHelp,
  IndianRupee,
  MapPin,
  Phone,
  RotateCcw,
  Timer,
  UserRound,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { AiPreviewCompare } from '@/components/orders/ai-preview-compare';
import { SafeImage } from '@/components/safe-image';
import { ErrorState, PageSkeleton } from '@/components/states';
import { StageBadge } from '@/components/status-badges';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CuttingForm } from '@/components/workshop/cutting-form';
import { CuttingView } from '@/components/workshop/cutting-view';
import { JobActions } from '@/components/workshop/job-actions';
import { PatternEditor } from '@/components/workshop/pattern-editor';
import { PatternView } from '@/components/workshop/pattern-view';
import { StitchingForm } from '@/components/workshop/stitching-form';
import { StitchingView } from '@/components/workshop/stitching-view';
import { jobOwner } from '@/components/workshop/job-owner';
import { MEASUREMENT_LABELS, STAGE_LABELS, STYLE_LABELS, strings } from '@/content/strings';
import { useCurrentUser } from '@/lib/current-user';
import { formatDate, formatDateTime, formatMoney, formatRelative } from '@/lib/format';
import { useWorkshopItem } from '@/lib/queries/workshop';
import { cn } from '@/lib/utils';

const w = strings.workshop;
const pr = strings.production;
const st = w.stitching;

const TECH_PACK_FIELDS = [
  ['fabric', pr.fabric],
  ['colour', pr.colour],
  ['patternColour', pr.patternColour],
  ['sleeve', pr.sleeve],
  ['closure', pr.closure],
  ['embellishments', pr.embellishments],
  ['addOns', pr.addOns],
] as const;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function Spec({ item }: { item: WorkshopItemDetail }) {
  const measurements = item.measurements ? Object.entries(item.measurements) : [];
  const pack = item.techPack;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{w.options}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl>
            {item.options.map((o) => (
              <Row key={`${o.groupName}-${o.valueName}`} label={o.groupName} value={o.valueName} />
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{w.measurements}</CardTitle>
          <Badge>{w.size(item.sizeBandCode)}</Badge>
        </CardHeader>
        <CardContent>
          {measurements.length > 0 ? (
            <dl className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
              {measurements.map(([k, v]) => (
                <Row
                  key={k}
                  label={MEASUREMENT_LABELS[k] ?? k}
                  value={<span className="tabular-nums">{v}</span>}
                />
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted">{w.standardSize(item.sizeBandCode)}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{w.techPack}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!pack ? (
            <p className="text-sm text-muted">{w.techPackMissing}</p>
          ) : (
            <>
              <dl>
                <Row label={pr.style} value={pack.style} />
                {TECH_PACK_FIELDS.filter(([k]) => pack[k]).map(([k, label]) => (
                  <Row key={k} label={label} value={pack[k]} />
                ))}
              </dl>
              {Object.keys(pack.measurements).length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                    {pr.measurementsCm}
                  </p>
                  <dl className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
                    {Object.entries(pack.measurements).map(([k, v]) => (
                      <Row
                        key={k}
                        label={MEASUREMENT_LABELS[k] ?? k}
                        value={<span className="tabular-nums">{v}</span>}
                      />
                    ))}
                  </dl>
                </div>
              ) : null}
              {pack.constructionNotes ? (
                <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide">
                    {w.constructionNotes}
                  </p>
                  <p className="whitespace-pre-line">{pack.constructionNotes}</p>
                </div>
              ) : null}
            </>
          )}
          {item.aiPreview ? (
            <AiPreviewCompare designUrl={item.primaryImageUrl} designName={item.designName} preview={item.aiPreview} className="max-w-md" />
          ) : null}
          {item.referenceImageUrls.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                {w.references}
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {item.referenceImageUrls.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative aspect-square overflow-hidden rounded-md bg-neutral-100"
                  >
                    <SafeImage src={url} alt={w.references} sizes="160px" />
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

/** Stitching rework: what QC found last time, in red, above everything else. */
function ReworkBox({ item }: { item: WorkshopItemDetail }) {
  const fail = [...item.qcChecks].reverse().find((q) => q.result === 'FAIL');
  return (
    <div
      className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-950"
      role="note"
    >
      <p className="flex items-center gap-2 font-semibold">
        <RotateCcw className="size-4" aria-hidden /> {fail ? st.rework : st.reworkEmpty}
      </p>
      {fail ? (
        <>
          {fail.checklist.filter((c) => !c.ok).length > 0 ? (
            <ul className="mt-2 list-inside list-disc">
              {fail.checklist
                .filter((c) => !c.ok)
                .map((c) => (
                  <li key={c.item}>{c.item}</li>
                ))}
            </ul>
          ) : null}
          {fail.notes ? <p className="mt-2 whitespace-pre-line">{fail.notes}</p> : null}
          {fail.photoUrls.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {fail.photoUrls.map((u) => (
                <a
                  key={u}
                  href={u}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative size-20 overflow-hidden rounded-md bg-white"
                >
                  <SafeImage src={u} alt={w.photo} sizes="80px" />
                </a>
              ))}
            </div>
          ) : null}
          <p className="mt-2 text-xs text-red-800">{formatDateTime(fail.createdAt)}</p>
        </>
      ) : null}
    </div>
  );
}

/** Who does each station for this abaya, and who gets it next. */
function Team({
  item,
  meId,
  isTailor,
}: {
  item: WorkshopItemDetail;
  meId: string;
  isTailor: boolean;
}) {
  const t = strings.production.team;
  const here = item.station ? TEAM_SLOTS.indexOf(item.station as (typeof TEAM_SLOTS)[number]) : -1;
  const next = here >= 0 ? TEAM_SLOTS.slice(here + 1).find((s) => item.team[s]) : undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4 text-accent-700" aria-hidden /> {w.team}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="grid gap-2 sm:grid-cols-5">
          {TEAM_SLOTS.map((slot, i) => {
            const member = item.team[slot];
            const done = here > i;
            const now = here === i;
            // Tailors only ever see their own stitching jobs, so the tailor slot is theirs.
            const you = member && (member.id === meId || (slot === 'stitching' && isTailor));
            return (
              <li
                key={slot}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm',
                  now ? 'border-accent-600 bg-accent-50' : 'border-border',
                  done && 'opacity-60',
                )}
              >
                <p className="text-xs text-muted">
                  {i + 1}. {t.short[slot]}
                  {done ? ` · ${t.doneStation}` : ''}
                </p>
                <p className={cn('truncate font-medium', !member && 'text-amber-800')}>
                  {member ? (member.name ?? '—') : t.notAssigned}
                  {you ? (
                    <span className="ml-1 text-xs font-normal text-accent-700">({w.teamYou})</span>
                  ) : null}
                </p>
              </li>
            );
          })}
        </ol>
        {next ? (
          <p className="text-sm text-muted">
            {w.nextUp(t.stations[next]!, item.team[next]!.name ?? '—')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function History({ item }: { item: WorkshopItemDetail }) {
  const events = [...item.events].reverse();
  return (
    <div className="space-y-4">
      {item.qcChecks.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{w.qcHistory}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[...item.qcChecks].reverse().map((q) => (
              <div key={q.createdAt} className="rounded-md border border-border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={q.result === 'PASS' ? 'success' : 'danger'}>
                    {q.result === 'PASS' ? pr.qcPassed : pr.qcFailed}
                  </Badge>
                  <span className="text-xs text-muted">{formatDateTime(q.createdAt)}</span>
                </div>
                {q.notes ? <p className="mt-2 whitespace-pre-line">{q.notes}</p> : null}
                {q.photoUrls.length > 0 ? (
                  <div className="mt-2 flex gap-2">
                    {q.photoUrls.map((u) => (
                      <a
                        key={u}
                        href={u}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative size-16 overflow-hidden rounded-md bg-neutral-100"
                      >
                        <SafeImage src={u} alt={w.photo} sizes="64px" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{w.timeline}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {events.map((e) => (
              <li key={`${e.createdAt}-${e.toStage}`} className="flex gap-3 text-sm">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{STAGE_LABELS[e.toStage]}</p>
                  <p className="text-xs text-muted">
                    {formatDateTime(e.createdAt)}
                    {e.actorName ? ` · ${e.actorName}` : ''}
                  </p>
                  {e.note ? (
                    <p className="mt-1 whitespace-pre-line text-neutral-700">{e.note}</p>
                  ) : null}
                </div>
                {e.photoUrl ? (
                  <a
                    href={e.photoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative size-14 shrink-0 overflow-hidden rounded-md bg-neutral-100"
                    aria-label={w.photo}
                  >
                    <SafeImage src={e.photoUrl} alt={w.photo} sizes="56px" />
                    <Camera
                      className="absolute bottom-1 right-1 size-3 text-white drop-shadow"
                      aria-hidden
                    />
                  </a>
                ) : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

/** /workshop/item/[id]: the job card every station works from. */
export default function JobCardPage() {
  const { id } = useParams<{ id: string }>();
  const me = useCurrentUser();
  const query = useWorkshopItem(id);

  if (query.isPending) return <PageSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const item = query.data;
  const station = item.station;
  const backHref = station ? `/workshop/${station}` : '/workshop';
  const owner = jobOwner(item, me.id);
  const mine = owner.mine;
  const stitching = item.stage === 'STITCHING';
  // The tailor finishes after "Start stitching"; the production manager may finish for them.
  const canStitch =
    stitching &&
    item.actions.some((a) => a.kind === 'advance' && a.to === 'QC') &&
    (mine || me.can('manageProduction'));

  return (
    <div className="space-y-5 pb-4">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />{' '}
        {w.backTo(station ? w.stations[station].name : w.home)}
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative aspect-[3/4] w-full shrink-0 overflow-hidden rounded-xl bg-neutral-100 sm:w-44">
          <SafeImage
            src={item.primaryImageUrl}
            alt={item.designName}
            fallbackText={item.designName}
            sizes="(max-width: 640px) 100vw, 176px"
            priority
          />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
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
          <h1 className="font-display text-2xl font-semibold leading-tight sm:text-3xl">
            {item.designName}
          </h1>
          <p className="text-sm text-muted">
            {STYLE_LABELS[item.style]} · {w.size(item.sizeBandCode)} ·{' '}
            <span className="font-mono">{w.order(item.orderNumber)}</span>
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {item.dueDate ? (
              <span className={cn(item.isOverdue ? 'font-medium text-danger' : 'text-muted')}>
                {w.due(formatDate(item.dueDate))}
              </span>
            ) : null}
            <span className="text-muted">{w.since(formatRelative(item.stageSince))}</span>
            {item.makerName ? (
              <span className="text-muted">
                {pr.makerLabel}: {item.makerName}
              </span>
            ) : null}
            <span
              className={cn(
                'inline-flex items-center gap-1',
                mine ? 'font-medium text-accent-700' : 'text-muted',
              )}
            >
              <UserRound className="size-4" aria-hidden />
              {owner.text}
            </span>
          </div>
          {stitching && (item.claimedAt || item.makingChargeInPaise !== null) ? (
            <div className="flex flex-wrap gap-2 text-sm">
              {item.claimedAt ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-3 py-1 font-medium text-accent-800">
                  <Timer className="size-4" aria-hidden />{' '}
                  {st.startedAgo(formatRelative(item.claimedAt))}
                </span>
              ) : null}
              {item.makingChargeInPaise !== null ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-800">
                  <IndianRupee className="size-4" aria-hidden />{' '}
                  {st.pays(formatMoney(item.makingChargeInPaise))}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {item.stage === 'ON_HOLD' && item.holdReason ? (
        <div
          className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
          role="note"
        >
          <CircleHelp className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">
              {w.heldReason}
              {item.heldFromStage ? ` · ${STAGE_LABELS[item.heldFromStage]}` : ''}
            </p>
            <p className="mt-1 whitespace-pre-line">{item.holdReason}</p>
            {item.heldFromStage === 'STITCHING' && item.actions.length === 0 ? (
              <p className="mt-2 text-xs">{st.waiting}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {stitching && item.isRework ? <ReworkBox item={item} /> : null}

      {/* The station's buttons: sticky at the bottom on phones, inline on larger screens. */}
      <div className="sticky bottom-3 z-20 rounded-xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur md:static md:bottom-auto md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none">
        <JobActions item={item} backHref={backHref} />
      </div>

      {/* Pattern: edited at the pattern station, read by every station after it. */}
      {station === 'pattern' ? (
        <PatternEditor item={item} />
      ) : item.pattern ? (
        <PatternView pattern={item.pattern} />
      ) : null}

      {/* Cutting: recorded at the cutting station, read by the stations after it. */}
      {station === 'cutting' && item.stage === 'CUTTING' ? <CuttingForm item={item} /> : null}
      {item.cuttings.length > 0 ? <CuttingView cuttings={item.cuttings} /> : null}

      {/* Stitching: the tailor's checklist and self-check; QC and later stations read the record. */}
      {canStitch ? <StitchingForm item={item} /> : null}
      {stitching && !canStitch && item.actions.some((a) => a.kind === 'claim') ? (
        <p className="rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
          {st.startHint}
        </p>
      ) : null}
      {item.stitchings.length > 0 ? <StitchingView stitchings={item.stitchings} /> : null}

      {item.customer || item.shippingAddress ? (
        <Card className="border-accent-200">
          <CardHeader>
            <CardTitle>{w.customer}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {item.shippingAddress ? (
              <p className="flex gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                <span>
                  <span className="font-medium">{item.shippingAddress.fullName}</span>
                  <br />
                  {[
                    item.shippingAddress.line1,
                    item.shippingAddress.line2,
                    item.shippingAddress.landmark,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                  <br />
                  {item.shippingAddress.city}, {item.shippingAddress.state}{' '}
                  {item.shippingAddress.pincode}
                </span>
              </p>
            ) : null}
            {item.customer?.phone ? (
              <p className="flex items-center gap-2">
                <Phone className="size-4 text-muted" aria-hidden />
                <a
                  href={`tel:${item.customer.phone}`}
                  className="font-medium text-accent-700 hover:underline"
                >
                  {item.customer.phone}
                </a>
              </p>
            ) : null}
            <p className="text-xs text-muted">{w.customerNote}</p>
          </CardContent>
        </Card>
      ) : null}

      <Team item={item} meId={me.id} isTailor={me.roles.includes('MAKER')} />

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Spec item={item} />
        <History item={item} />
      </div>
    </div>
  );
}
