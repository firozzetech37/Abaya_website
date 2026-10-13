'use client';

import type { AdminDesignListItem } from '@abaya/contracts';
import { EyeOff, RotateCcw, Trash2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { DESIGN_STATUS_LABELS, strings } from '@/content/strings';
import { errorMessage } from '@/lib/api-client';
import { useTransitionDesign } from '@/lib/queries/designs';

const t = strings.editor;

/**
 * Quick catalog actions on a designs-list row (catalog managers): a published design can be
 * **unpublished** (back to Priced, hidden from customers until published again) or **removed**
 * from the catalog (archived); an archived one can be re-published. Each asks first. The same
 * transitions, with their role checks and audit, as on the design page.
 */
export function CatalogRowActions({ design }: { design: Pick<AdminDesignListItem, 'id' | 'status'> }) {
  const transition = useTransitionDesign(design.id);
  const [pending, setPending] = React.useState<'PRICED' | 'ARCHIVED' | 'PUBLISHED' | null>(null);
  if (design.status !== 'PUBLISHED' && design.status !== 'ARCHIVED') return null;

  const copy =
    pending === 'ARCHIVED'
      ? { title: t.archiveTitle, body: t.archiveBody, label: t.removeFromCatalog }
      : pending === 'PRICED'
        ? { title: t.unpublishTitle, body: t.unpublishBody, label: t.unpublish }
        : { title: t.publishTitle, body: t.publishBody, label: t.transitionFromArchived };

  return (
    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {design.status === 'PUBLISHED' ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => setPending('PRICED')} title={t.unpublishTitle}>
            <EyeOff /> {t.unpublish}
          </Button>
          <Button variant="ghost" size="sm" className="text-danger hover:bg-red-50" onClick={() => setPending('ARCHIVED')} title={t.archiveTitle}>
            <Trash2 /> {t.removeFromCatalog}
          </Button>
        </>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setPending('PUBLISHED')}>
          <RotateCcw /> {t.transitionFromArchived}
        </Button>
      )}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={copy.title}
        description={copy.body}
        confirmLabel={copy.label}
        tone={pending === 'ARCHIVED' ? 'danger' : 'primary'}
        onConfirm={async () => {
          if (!pending) return;
          try {
            await transition.mutateAsync({ to: pending });
            toast.success(t.transitionDone(DESIGN_STATUS_LABELS[pending]));
            setPending(null);
          } catch (e) {
            toast.error(errorMessage(e));
            return false;
          }
        }}
      />
    </div>
  );
}
