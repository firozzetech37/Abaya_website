'use client';

import type { AdminDesignListItem, DesignStatus } from '@abaya/contracts';
import { EyeOff, RotateCcw, Trash2, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { strings } from '@/content/strings';
import { useBulkTransitionDesigns } from '@/lib/queries/designs';

const t = strings.editor;

/**
 * Appears when rows are ticked: Unpublish / Remove from catalog for the published ones, Re-publish
 * for the archived ones. Each action asks first and applies to the ticked designs it fits; the rest
 * of the selection is left alone.
 */
export function BulkCatalogBar({ selected, onClear }: { selected: AdminDesignListItem[]; onClear: () => void }) {
  const bulk = useBulkTransitionDesigns();
  const [pending, setPending] = React.useState<DesignStatus | null>(null);
  const published = selected.filter((d) => d.status === 'PUBLISHED');
  const archived = selected.filter((d) => d.status === 'ARCHIVED');
  if (selected.length === 0) return null;

  const targets = pending === 'PUBLISHED' ? archived : published;
  const copy =
    pending === 'ARCHIVED'
      ? { title: t.bulkArchiveTitle(targets.length), body: t.archiveBody, label: t.removeFromCatalog }
      : pending === 'PRICED'
        ? { title: t.bulkUnpublishTitle(targets.length), body: t.unpublishBody, label: t.unpublish }
        : { title: t.bulkRepublishTitle(targets.length), body: t.publishBody, label: t.transitionFromArchived };

  return (
    <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface/95 px-4 py-3 shadow-lg backdrop-blur">
      <p className="text-sm font-medium">{t.selectedCount(selected.length)}</p>
      <div className="ms-auto flex flex-wrap items-center gap-2">
        {published.length > 0 ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => setPending('PRICED')}>
              <EyeOff /> {t.unpublish} ({published.length})
            </Button>
            <Button variant="danger-outline" size="sm" onClick={() => setPending('ARCHIVED')}>
              <Trash2 /> {t.removeFromCatalog} ({published.length})
            </Button>
          </>
        ) : null}
        {archived.length > 0 ? (
          <Button variant="secondary" size="sm" onClick={() => setPending('PUBLISHED')}>
            <RotateCcw /> {t.transitionFromArchived} ({archived.length})
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onClear} aria-label={strings.common.cancel}>
          <X /> {strings.common.cancel}
        </Button>
      </div>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={copy.title}
        description={copy.body}
        confirmLabel={copy.label}
        tone={pending === 'ARCHIVED' ? 'danger' : 'primary'}
        onConfirm={async () => {
          if (!pending) return;
          const result = await bulk.mutateAsync({ ids: targets.map((d) => d.id), to: pending });
          if (result.failed.length) toast.error(t.bulkPartly(result.done, result.failed.length));
          else toast.success(t.bulkDone(result.done));
          setPending(null);
          onClear();
        }}
      />
    </div>
  );
}
