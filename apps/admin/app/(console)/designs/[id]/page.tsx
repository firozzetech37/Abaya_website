'use client';

import { ArrowLeft, BadgeCheck, MessageSquareWarning, Pin, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AiMatchBadge } from '@/components/ai/ai-panel';
import { DesignAiCard } from '@/components/ai/design-ai-card';
import { AuditHistory } from '@/components/audit-history';
import { DetailsTab } from '@/components/designs/details-tab';
import { DownloadCard } from '@/components/designs/download-card';
import { ImagesTab } from '@/components/designs/images-tab';
import { NewDesignDialog } from '@/components/designs/new-design-dialog';
import { examplePrice, OptionsTab } from '@/components/designs/options-tab';
import { PreviewTab } from '@/components/designs/preview-tab';
import { TransitionActions } from '@/components/designs/transition-actions';
import { ErrorState, PageSkeleton } from '@/components/states';
import { DesignStatusBadge } from '@/components/status-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { STYLE_LABELS, strings } from '@/content/strings';
import { useCurrentUser } from '@/lib/current-user';
import { formatDateTime } from '@/lib/format';
import { useOptionGroups, useSizeBands } from '@/lib/queries/catalog';
import { useDesign } from '@/lib/queries/designs';

const e = strings.editor;

export default function DesignEditorPage() {
  const { id } = useParams<{ id: string }>();
  const me = useCurrentUser();
  const [creating, setCreating] = useState(false);
  const design = useDesign(id);
  const groups = useOptionGroups();
  const sizeBands = useSizeBands();

  if (design.isPending) return <PageSkeleton />;
  if (design.isError) {
    return (
      <Card>
        <ErrorState error={design.error} onRetry={() => void design.refetch()} />
      </Card>
    );
  }

  const d = design.data;
  const canEdit = me.can('editDesigns');
  const isCatalogManager = me.can('manageCatalog');
  const primary = d.images.find((i) => i.isPrimary) ?? d.images[0];

  const fromPrice =
    groups.data && d.basePriceInPaise !== null
      ? (examplePrice({
          basePriceInPaise: d.basePriceInPaise,
          groups: groups.data,
          allowed: d.options.map((o) => ({ ...o })),
          sizeBandAdjustmentInPaise: 0,
        })?.unitPriceInPaise ?? d.basePriceInPaise)
      : d.basePriceInPaise;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/designs" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> {strings.designs.title}
        </Link>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate font-display text-3xl font-semibold">{d.name}</h1>
              <DesignStatusBadge status={d.status} />
              <AiMatchBadge level={d.aiMatch} />
              {d.source === 'AI_GENERATED' ? (
                <Badge tone="accent">
                  <Sparkles className="mr-1 size-3" aria-hidden />
                  {e.sourceAi}
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {STYLE_LABELS[d.style]} · <span className="font-mono">{d.slug}</span> · {d.designer?.name ?? d.designer?.email ?? '—'} ·{' '}
              {formatDateTime(d.updatedAt)}
              {d.referenceId ? (
                <>
                  {' · '}
                  <Link href={`/references?focus=${d.referenceId}`} className="text-accent-700 hover:underline">
                    {strings.designs.referenceFrom}
                  </Link>
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 shadow-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">{e.statusLabel}</span>
              <TransitionActions design={d} size="sm" />
            </div>
            {/* Once this design is published, start the next one from here (no trip back to the list). */}
            {canEdit && d.status === 'PUBLISHED' ? (
              <Button onClick={() => setCreating(true)}>
                <Plus aria-hidden /> {strings.designs.newDesign}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {d.status === 'PUBLISHED' && canEdit ? (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
          <BadgeCheck className="size-4 shrink-0" aria-hidden />
          {e.publishedNext}
        </p>
      ) : null}
      <NewDesignDialog open={creating} onOpenChange={setCreating} />

      {d.reviewNotes && (d.status === 'CHANGES_REQUESTED' || d.status === 'DRAFT' || d.status === 'IN_REVIEW') ? (
        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="note">
          <MessageSquareWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">{e.reviewNotesFromManager}</p>
            <p className="mt-1 whitespace-pre-line">{d.reviewNotes}</p>
          </div>
        </div>
      ) : null}

      {d.aiGeneration || d.inspirationUrl || d.originalityConfirmedAt ? (
        <Card className="space-y-2 p-4 text-sm">
          {d.aiGeneration ? (
            <div className="flex gap-3">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-700" aria-hidden />
              <div className="min-w-0">
                <p className="font-medium">{e.aiPromptTitle}</p>
                <p className="mt-1 whitespace-pre-line text-neutral-700">
                  <span className="text-muted">{e.aiPromptLabel}: </span>
                  {d.aiGeneration.prompt}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {e.aiModelLabel}: <span className="font-mono">{d.aiGeneration.model}</span> · {formatDateTime(d.aiGeneration.createdAt)}
                </p>
              </div>
            </div>
          ) : null}
          {d.inspirationUrl ? (
            <p className="flex items-center gap-3">
              <Pin className="size-4 shrink-0 text-accent-700" aria-hidden />
              <span className="text-muted">{e.inspirationLabel}:</span>
              <a href={d.inspirationUrl} target="_blank" rel="noreferrer noopener" className="truncate text-accent-700 hover:underline">
                {d.inspirationUrl}
              </a>
            </p>
          ) : null}
          {d.originalityConfirmedAt ? (
            <p className="flex items-center gap-3 text-emerald-800">
              <BadgeCheck className="size-4 shrink-0" aria-hidden />
              {e.originalityConfirmed(formatDateTime(d.originalityConfirmedAt))}
            </p>
          ) : null}
        </Card>
      ) : null}

      {!canEdit ? <p className="rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-700">{e.readOnly}</p> : null}

      <div className="grid gap-6 2xl:grid-cols-[1fr_320px]">
        <Tabs defaultValue="details" className="min-w-0">
          <TabsList>
            <TabsTrigger value="details">{e.tabs.details}</TabsTrigger>
            <TabsTrigger value="images">
              {e.tabs.images}
              <Badge className="ml-1">{d.images.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="options">{e.tabs.options}</TabsTrigger>
            <TabsTrigger value="preview">{e.tabs.preview}</TabsTrigger>
          </TabsList>
          <TabsContent value="details">
            <DetailsTab design={d} readOnly={!canEdit} />
          </TabsContent>
          <TabsContent value="images">
            <ImagesTab design={d} readOnly={!canEdit} />
          </TabsContent>
          <TabsContent value="options">
            {groups.isPending || sizeBands.isPending ? (
              <Skeleton className="h-96" />
            ) : groups.isError || sizeBands.isError ? (
              <ErrorState error={groups.error ?? sizeBands.error} onRetry={() => void Promise.all([groups.refetch(), sizeBands.refetch()])} />
            ) : (
              <OptionsTab design={d} groups={groups.data} sizeBands={sizeBands.data} readOnly={!isCatalogManager} showMargin={isCatalogManager} />
            )}
          </TabsContent>
          <TabsContent value="preview">
            <PreviewTab key={primary?.id ?? 'none'} design={d} groups={groups.data ?? []} fromPriceInPaise={fromPrice} />
          </TabsContent>
        </Tabs>
        <aside className="space-y-4 2xl:pt-12">
          <DesignAiCard design={d} />
          {isCatalogManager || d.downloadEnabled ? <DownloadCard key={`${d.downloadEnabled}-${d.downloadPriceInPaise}`} design={d} /> : null}
          <AuditHistory entityType="Design" entityId={d.id} />
        </aside>
      </div>
    </div>
  );
}
