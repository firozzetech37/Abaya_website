'use client';

import { type AdminDesignDetail, DEFAULT_DOWNLOAD_PRICE_IN_PAISE } from '@abaya/contracts';
import { Download } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { strings } from '@/content/strings';
import { errorMessage } from '@/lib/api-client';
import { useCurrentUser } from '@/lib/current-user';
import { formatMoney, paiseToRupeesInput, rupeesInputToPaise } from '@/lib/format';
import { useUpdateDesign } from '@/lib/queries/designs';

const t = strings.downloads;

/**
 * Sell the design's HD images (catalog manager). Every change is audited by the API.
 * The page keys this card on the saved values, so it resets after a save.
 */
export function DownloadCard({ design }: { design: AdminDesignDetail }) {
  const me = useCurrentUser();
  const update = useUpdateDesign(design.id);
  const canEdit = me.can('manageCatalog');
  const [enabled, setEnabled] = React.useState(design.downloadEnabled);
  const [price, setPrice] = React.useState(paiseToRupeesInput(design.downloadPriceInPaise));
  const [error, setError] = React.useState<string | null>(null);

  const paise = price.trim() === '' ? null : rupeesInputToPaise(price);
  const invalid = price.trim() !== '' && (paise === null || paise < 100 || paise > 1_000_000);
  const dirty = enabled !== design.downloadEnabled || (!invalid && paise !== design.downloadPriceInPaise);

  async function save() {
    if (invalid) {
      setError(t.priceInvalid);
      return;
    }
    try {
      await update.mutateAsync({ downloadEnabled: enabled, downloadPriceInPaise: paise });
      toast.success(t.saved);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Download className="size-4 text-accent-700" aria-hidden /> {t.cardTitle}
          </h2>
          <p className="mt-1 text-xs text-muted">{t.cardBody}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canEdit} aria-label={t.enable} />
      </div>
      {enabled ? (
        <Field label={t.priceLabel} htmlFor="download-price" hint={t.priceHint(formatMoney(DEFAULT_DOWNLOAD_PRICE_IN_PAISE))} error={error ?? undefined}>
          <Input
            id="download-price"
            inputMode="decimal"
            value={price}
            disabled={!canEdit}
            placeholder={paiseToRupeesInput(DEFAULT_DOWNLOAD_PRICE_IN_PAISE)}
            onChange={(e) => {
              setPrice(e.target.value);
              setError(null);
            }}
          />
        </Field>
      ) : null}
      {enabled && design.status !== 'PUBLISHED' ? <p className="text-xs text-amber-800">{t.onlyPublished}</p> : null}
      {canEdit ? (
        dirty ? (
          <Button size="sm" onClick={() => void save()} loading={update.isPending}>
            {strings.common.save}
          </Button>
        ) : null
      ) : (
        <p className="text-xs text-muted">{t.managerOnly}</p>
      )}
    </Card>
  );
}
