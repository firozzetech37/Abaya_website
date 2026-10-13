'use client';

import type { AbayaStyle, AiInsightsDto, AiMatchLevel, AiSimilarItem } from '@abaya/contracts';
import { AlertTriangle, Check, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { Thumb } from '@/components/safe-image';
import { ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { STYLE_LABELS, strings } from '@/content/strings';
import { useAiStatus } from '@/lib/queries/ai';
import { cn } from '@/lib/utils';

const a = strings.ai;

export function AiMatchBadge({ level, className }: { level: AiMatchLevel | null; className?: string }) {
  if (!level) return null;
  return (
    <Badge tone={level === 'DUPLICATE' ? 'danger' : 'warning'} className={className}>
      {level === 'DUPLICATE' ? <AlertTriangle className="size-3" aria-hidden /> : null}
      {level === 'DUPLICATE' ? a.duplicate : a.similarBadge}
    </Badge>
  );
}

/** Look-alike designs and references, strongest first. */
export function SimilarList({ items }: { items: AiSimilarItem[] }) {
  if (items.length === 0) return <p className="text-sm text-muted">{a.noSimilar}</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const hidden = item.name === null && item.imageUrl === null;
        const label =
          item.kind === 'DESIGN'
            ? (item.name ?? a.hiddenDesign)
            : hidden
              ? a.hiddenReference
              : (item.name ?? a.untitledReference);
        const href = hidden ? null : item.kind === 'DESIGN' ? `/designs/${item.id}` : `/references?focus=${item.id}`;
        const body = (
          <>
            <Thumb src={item.imageUrl} alt="" fallbackText={label} className="h-14 w-10" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{label}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span>{item.kind === 'DESIGN' ? a.designLabel : a.referenceLabel}</span>
                <span aria-hidden>·</span>
                <span className="tabular-nums">{a.match(item.score)}</span>
                {item.isOwnReference ? <Badge tone="info">{a.ownReference}</Badge> : null}
              </span>
            </span>
            <AiMatchBadge level={item.level} className="shrink-0" />
          </>
        );
        return (
          <li key={`${item.kind}:${item.id}`}>
            {href ? (
              <Link
                href={href}
                className="flex items-center gap-3 rounded-md border border-border p-2 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              >
                {body}
              </Link>
            ) : (
              <div className="flex items-center gap-3 rounded-md border border-dashed border-border p-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ProgressLine({ data }: { data: AiInsightsDto }) {
  // Only ask for service health when analysis seems to be waiting.
  const status = useAiStatus(data.status === 'PENDING');
  if (data.status !== 'PENDING') return null;
  const problem = status.data && (!status.data.reachable ? a.offline : !status.data.modelLoaded ? a.modelLoading : null);
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-2 text-sm text-neutral-700">
        <Loader2 className="size-4 animate-spin text-accent-600" aria-hidden />
        {a.analysing(data.analysedImages, data.totalImages)}
      </p>
      {problem ? <p className="text-xs text-amber-800">{problem}</p> : null}
    </div>
  );
}

export interface ApplyChoice {
  tags: string[];
  style?: AbayaStyle;
  altText?: string;
}

/** Tag chips (click to select), style and alt text, with Apply / Dismiss. */
function Suggestions({
  data,
  canEdit,
  withStyleAndAlt,
  applying,
  dismissing,
  onApply,
  onDismiss,
}: {
  data: NonNullable<AiInsightsDto['suggestion']>;
  canEdit: boolean;
  withStyleAndAlt: boolean;
  applying: boolean;
  dismissing: boolean;
  onApply: (choice: ApplyChoice) => Promise<unknown>;
  onDismiss: () => Promise<unknown>;
}) {
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [useStyle, setUseStyle] = React.useState(false);
  const [useAlt, setUseAlt] = React.useState(false);
  const toggle = (tag: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  const style = withStyleAndAlt ? data.style : null;
  const altText = withStyleAndAlt ? data.altText : null;
  const nothingPicked = picked.size === 0 && !useStyle && !useAlt;

  return (
    <div className="space-y-3">
      {data.tags.length > 0 ? (
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{a.suggestions}</p>
            {canEdit ? (
              <button
                type="button"
                className="text-xs font-medium text-accent-700 hover:underline"
                onClick={() => setPicked(picked.size === data.tags.length ? new Set() : new Set(data.tags.map((t) => t.tag)))}
              >
                {picked.size === data.tags.length ? a.clear : a.selectAll}
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={a.suggestions}>
            {data.tags.map((t) => {
              const on = picked.has(t.tag);
              return (
                <button
                  key={t.tag}
                  type="button"
                  disabled={!canEdit}
                  aria-pressed={on}
                  title={`${t.group} · ${a.sure(t.score)}`}
                  onClick={() => toggle(t.tag)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-default',
                    on ? 'border-accent-600 bg-accent-600 text-white' : 'border-border bg-surface text-neutral-800 hover:border-accent-400',
                  )}
                >
                  {on ? <Check className="size-3" aria-hidden /> : null}
                  {t.label}
                  <span className={cn('tabular-nums', on ? 'text-white/75' : 'text-muted')}>{Math.round(t.score * 100)}%</span>
                </button>
              );
            })}
          </div>
          {canEdit ? <p className="mt-1.5 text-xs text-muted">{a.suggestionsHint}</p> : null}
        </div>
      ) : null}

      {style ? (
        <label className={cn('flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2', canEdit && 'cursor-pointer')}>
          <span className="min-w-0">
            <span className="block text-xs text-muted">{a.style}</span>
            <span className="text-sm font-medium">
              {STYLE_LABELS[style.value]} <span className="text-xs font-normal text-muted">· {a.sure(style.score)}</span>
            </span>
          </span>
          {canEdit ? (
            <span className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" className="size-4 accent-accent-600" checked={useStyle} onChange={(e) => setUseStyle(e.target.checked)} />
              {a.useStyle}
            </span>
          ) : null}
        </label>
      ) : null}

      {altText ? (
        <label className={cn('flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2', canEdit && 'cursor-pointer')}>
          <span className="min-w-0">
            <span className="block text-xs text-muted">{a.altText}</span>
            <span className="text-sm">{altText}</span>
          </span>
          {canEdit ? (
            <span className="flex shrink-0 items-center gap-1.5 text-xs">
              <input type="checkbox" className="size-4 accent-accent-600" checked={useAlt} onChange={(e) => setUseAlt(e.target.checked)} />
              {a.useAltText}
            </span>
          ) : null}
        </label>
      ) : null}

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={nothingPicked || dismissing}
            loading={applying}
            onClick={() =>
              void onApply({
                tags: [...picked],
                ...(useStyle && style ? { style: style.value } : {}),
                ...(useAlt && altText ? { altText } : {}),
              })
                .then(() => toast.success(a.applied))
                .catch(() => undefined)
            }
          >
            <Sparkles /> {a.addSelected(picked.size)}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={applying}
            loading={dismissing}
            onClick={() =>
              void onDismiss()
                .then(() => toast.success(a.dismissed))
                .catch(() => undefined)
            }
          >
            {a.dismiss}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The AI assistant card: analysis progress, suggestions to accept, and look-alikes.
 * Used in the design editor, the review queue and for references.
 */
export function AiPanel({
  query,
  canEdit,
  withStyleAndAlt = true,
  applying = false,
  dismissing = false,
  onApply,
  onDismiss,
  className,
}: {
  query: { data?: AiInsightsDto; isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  canEdit: boolean;
  withStyleAndAlt?: boolean;
  applying?: boolean;
  dismissing?: boolean;
  onApply: (choice: ApplyChoice) => Promise<unknown>;
  onDismiss: () => Promise<unknown>;
  className?: string;
}) {
  const data = query.data;
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-accent-600" aria-hidden />
          {a.title}
        </CardTitle>
        {data?.hasDuplicate ? <AiMatchBadge level="DUPLICATE" /> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isPending ? (
          <Skeleton className="h-24" />
        ) : query.isError || !data ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} className="py-4" />
        ) : data.status === 'OFF' ? (
          <p className="text-sm text-muted">{a.off}</p>
        ) : data.totalImages === 0 ? (
          <p className="text-sm text-muted">{a.noImages}</p>
        ) : (
          <>
            <ProgressLine data={data} />
            {data.status === 'FAILED' ? <p className="text-sm text-amber-800">{a.failed}</p> : null}
            {data.hasDuplicate ? (
              <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {a.duplicateWarning}
              </div>
            ) : null}
            {data.suggestion ? (
              <Suggestions
                // Fresh selections whenever the suggestion changes.
                key={JSON.stringify(data.suggestion)}
                data={data.suggestion}
                canEdit={canEdit}
                withStyleAndAlt={withStyleAndAlt}
                applying={applying}
                dismissing={dismissing}
                onApply={onApply}
                onDismiss={onDismiss}
              />
            ) : data.status === 'READY' ? (
              <p className="text-sm text-muted">{a.noSuggestions}</p>
            ) : null}
            {data.status !== 'PENDING' || data.similar.length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">{a.similar}</p>
                <SimilarList items={data.similar} />
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
