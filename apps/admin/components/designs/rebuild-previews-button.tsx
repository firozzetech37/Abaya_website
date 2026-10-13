'use client';

import { Stamp } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { strings } from '@/content/strings';
import { useRebuildPreviews } from '@/lib/queries/downloads';

const t = strings.downloads;

/** Super admin: remake the customer previews of every live design (one-off after the update). */
export function RebuildPreviewsButton() {
  const rebuild = useRebuildPreviews();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Stamp /> {t.rebuild}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t.rebuildTitle}
        description={t.rebuildBody}
        confirmLabel={t.rebuild}
        onConfirm={async () => {
          const res = await rebuild.mutateAsync();
          toast.success(t.rebuilt(res.designs, res.images));
        }}
      />
    </>
  );
}
