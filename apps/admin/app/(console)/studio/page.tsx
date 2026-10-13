'use client';

import type { GenerationDto } from '@abaya/contracts';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FilePen,
  Images,
  MessageSquareWarning,
  Package,
  Pin,
  Sparkles,
  Store,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { NewDesignDialog } from '@/components/designs/new-design-dialog';
import { SafeImage } from '@/components/safe-image';
import { StatTile } from '@/components/stat-tile';
import { EmptyState, ErrorState, ForbiddenState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { strings } from '@/content/strings';
import { useCurrentUser } from '@/lib/current-user';
import { formatMoney, formatRelative } from '@/lib/format';
import { useGenerations, useStudioLimits, useStudioSummary } from '@/lib/queries/studio';

const s = strings.studio;

export default function StudioHomePage() {
  const me = useCurrentUser();
  const [uploading, setUploading] = React.useState(false);
  if (!me.can('useStudio')) return <ForbiddenState />;

  return (
    <div className="space-y-6">
      {/* Welcome band */}
      <section className="relative overflow-hidden rounded-2xl bg-accent-900 px-6 py-7 text-white shadow-sm sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full border-[28px] border-white/5"
        />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 right-24 size-56 rounded-full border-[18px] border-white/5" />
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent-200/80">{s.homeTitle}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">{s.greeting(me.name)}</h1>
        <p className="mt-1 max-w-xl text-sm text-accent-100/80">{s.homeSubtitle}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild className="bg-white text-accent-900 hover:bg-accent-50">
            <Link href="/studio/ai">
              <Sparkles className="size-4" aria-hidden /> {s.newAiDesign}
            </Link>
          </Button>
          <Button
            variant="secondary"
            className="border-white/20 bg-white/10 text-white hover:bg-white/20"
            onClick={() => setUploading(true)}
          >
            <Upload className="size-4" aria-hidden /> {s.newUpload}
          </Button>
          <Button asChild variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
            <Link href="/studio/inspiration">
              <Pin className="size-4" aria-hidden /> {s.findInspiration}
            </Link>
          </Button>
        </div>
      </section>

      <SummaryTiles />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <RecentAi />
        <div className="space-y-6">
          <NeedsAttention />
          <HowItWorks />
        </div>
      </div>

      <NewDesignDialog open={uploading} onOpenChange={setUploading} />
    </div>
  );
}

function SummaryTiles() {
  const summary = useStudioSummary();
  const limits = useStudioLimits();
  if (summary.isPending) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }
  if (summary.isError) {
    return (
      <Card>
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      </Card>
    );
  }
  const d = summary.data;
  const n = (k: keyof typeof d.byStatus) => d.byStatus[k] ?? 0;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatTile label={s.statDrafts} value={n('DRAFT')} icon={<FilePen className="size-4" />} href="/designs?mine=true&status=DRAFT" />
      <StatTile label={s.statInReview} value={n('IN_REVIEW') + n('PRICED')} icon={<ClipboardCheck className="size-4" />} tone="accent" href="/designs?mine=true&status=IN_REVIEW" />
      <StatTile
        label={s.statChanges}
        value={n('CHANGES_REQUESTED')}
        icon={<MessageSquareWarning className="size-4" />}
        tone={n('CHANGES_REQUESTED') > 0 ? 'warning' : 'neutral'}
        href="/designs?mine=true&status=CHANGES_REQUESTED"
      />
      <StatTile label={s.statLive} value={n('PUBLISHED')} icon={<Store className="size-4" />} tone="accent" href="/designs?mine=true&status=PUBLISHED" />
      <StatTile
        label={s.statApproval}
        value={d.averageApprovalHours === null ? '—' : s.hours(d.averageApprovalHours)}
        hint={s.statApprovalHint}
        icon={<Clock className="size-4" />}
      />
      <StatTile label={s.statOrders} value={d.orders} hint={`${s.statRevenue} ${formatMoney(d.revenueInPaise)}`} icon={<Package className="size-4" />} />
      <StatTile
        label={s.statAiToday}
        value={d.aiGenerationsToday}
        hint={limits.data ? s.usage(limits.data.usedToday, limits.data.dailyLimit) : undefined}
        icon={<Sparkles className="size-4" />}
        href="/studio/ai"
      />
      <StatTile
        label={s.statReferences}
        value={d.assignedReferences}
        icon={<Images className="size-4" />}
        tone={d.assignedReferences > 0 ? 'accent' : 'neutral'}
        href="/references?status=NEEDS_DESIGN"
      />
    </div>
  );
}

function NeedsAttention() {
  const summary = useStudioSummary();
  const items = summary.data?.needsAttention ?? [];
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
        <MessageSquareWarning className="size-5 text-amber-600" aria-hidden /> {s.needsAttention}
      </h2>
      {summary.isPending ? (
        <Skeleton className="mt-4 h-20" />
      ) : items.length === 0 ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-muted">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
          {s.needsAttentionEmpty}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {items.map((d) => (
            <li key={d.id}>
              <Link href={`/designs/${d.id}`} className="group block py-3">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium group-hover:text-accent-700">{d.name}</span>
                  <span className="text-xs text-muted">{formatRelative(d.updatedAt)}</span>
                </span>
                {d.reviewNotes ? <span className="mt-0.5 line-clamp-2 block text-sm text-amber-900">{d.reviewNotes}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function HowItWorks() {
  return (
    <Card className="p-5">
      <h2 className="font-display text-xl font-semibold">{s.howItWorks}</h2>
      <ol className="mt-4 space-y-4">
        {s.steps.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-50 text-sm font-semibold text-accent-800 ring-1 ring-accent-200">
              {i + 1}
            </span>
            <span>
              <span className="block text-sm font-medium">{step.title}</span>
              <span className="block text-sm text-muted">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function RecentAi() {
  const generations = useGenerations();
  const recent = (generations.data ?? []).filter((g) => g.images.length > 0).slice(0, 4);
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
          <Sparkles className="size-5 text-accent-700" aria-hidden /> {s.recentAi}
        </h2>
        <Link href="/studio/ai" className="inline-flex items-center gap-1 text-sm text-accent-700 hover:underline">
          {s.aiTitle} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      {generations.isPending ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4]" />
          ))}
        </div>
      ) : recent.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="size-5" />}
          title={s.recentAiEmpty}
          action={
            <Button asChild size="sm">
              <Link href="/studio/ai">{s.newAiDesign}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="mt-4 space-y-5">
          {recent.map((g) => (
            <RecentRow key={g.id} g={g} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentRow({ g }: { g: GenerationDto }) {
  return (
    <li>
      <p className="line-clamp-1 text-sm text-neutral-700">
        <span className="text-muted">{formatRelative(g.createdAt)} · </span>
        {g.prompt}
      </p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {g.images.map((img) => (
          <Link
            key={img.id}
            href={img.designId ? `/designs/${img.designId}` : '/studio/ai'}
            className="relative aspect-[3/4] overflow-hidden rounded-lg bg-neutral-100 ring-1 ring-border transition hover:ring-accent-400"
          >
            <SafeImage src={img.url} alt={g.prompt} sizes="160px" />
            {img.designId ? (
              <span className="absolute inset-x-1 bottom-1 rounded bg-accent-900/85 px-1.5 py-0.5 text-center text-[10px] font-medium text-white">
                {s.openDesign}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </li>
  );
}
