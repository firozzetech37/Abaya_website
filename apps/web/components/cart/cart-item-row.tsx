'use client';

import {type CartItemDto } from '@abaya/contracts';
import { AlertCircle, Minus, Plus, Trash2 } from 'lucide-react';
import { Link } from '@/components/i18n/navigation';
import { toast } from 'sonner';
import { DesignImage } from '@/components/design/design-image';
import { PriceLines } from '@/components/design/redesign-panel';
import { Button } from '@/components/ui/button';
import { useStrings } from '@/components/i18n/locale-provider';
import type { Dictionary } from '@/content/i18n';
import { errorMessage } from '@/lib/api-client';
import { useRemoveCartItem, useUpdateCartItem } from '@/lib/queries/cart';
import { cn } from '@/lib/utils';
import { useMoney } from '@/lib/currency';

export function sizeSummary(size: CartItemDto['size'], t: Dictionary['bag']): string {
  return size.kind === 'BAND' ? `${t.size}: ${size.label}` : t.measurements(size.profileName);
}

export function CartItemRow({ item, editable = true }: { item: CartItemDto; editable?: boolean }) {
  const money = useMoney();
  const { bag: t, common } = useStrings();
  const update = useUpdateCartItem();
  const remove = useRemoveCartItem();
  const busy = update.isPending || remove.isPending;

  const setQty = (quantity: number) =>
    update.mutate({ id: item.id, quantity }, { onError: (e) => toast.error(errorMessage(e)) });

  return (
    <li className={cn('flex gap-4 py-5', busy && 'opacity-70')}>
      <Link href={`/abayas/${item.design.slug}`} className="w-24 shrink-0 sm:w-28">
        <DesignImage src={item.design.primaryImageUrl} alt={item.design.name} name={item.design.name} sizes="112px" className="aspect-[3/4] rounded-md" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <Link href={`/abayas/${item.design.slug}`} className="font-display text-xl font-semibold leading-tight hover:text-accent-800">
            {item.design.name}
          </Link>
          <p className="shrink-0 text-end font-medium tabular-nums">
            {item.price ? money(item.price.totalInPaise) : <span className="text-danger">{t.unavailable}</span>}
          </p>
        </div>
        <p className="mt-1 text-sm text-neutral-600">{item.selectedOptions.map((o) => o.valueName).join(' · ')}</p>
        <p className="mt-0.5 text-sm text-neutral-600">{sizeSummary(item.size, t)}</p>
        {item.price && item.quantity > 1 && (
          <p className="mt-0.5 text-xs text-muted">
            {money(item.price.unitPriceInPaise)} {t.each}
          </p>
        )}

        {item.problem && (
          <p role="alert" className="mt-2 flex items-start gap-1.5 rounded-md bg-red-50 px-2.5 py-2 text-sm text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {item.problem}
          </p>
        )}

        {item.price && (
          <details className="mt-2">
            <summary className="inline-flex min-h-9 cursor-pointer items-center text-xs font-medium text-accent-800">{t.priceBreakdown}</summary>
            <PriceLines breakdown={item.price} />
          </details>
        )}

        {editable && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="inline-flex items-center rounded-full border border-neutral-300" role="group" aria-label={common.quantity}>
              <button
                type="button"
                className="inline-flex size-10 items-center justify-center rounded-full hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-40"
                onClick={() => setQty(item.quantity - 1)}
                disabled={busy || item.quantity <= 1}
                aria-label={common.decrease}
              >
                <Minus className="size-4" aria-hidden />
              </button>
              <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">
                {item.quantity}
              </span>
              <button
                type="button"
                className="inline-flex size-10 items-center justify-center rounded-full hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-40"
                onClick={() => setQty(item.quantity + 1)}
                disabled={busy || item.quantity >= 10}
                aria-label={common.increase}
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                remove.mutate(item.id, {
                  onSuccess: () => toast.success(t.removed),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
              disabled={busy}
            >
              <Trash2 aria-hidden />
              {t.remove}
            </Button>
          </div>
        )}
        {!editable && <p className="mt-1 text-sm text-neutral-600">{`${common.quantity}: ${item.quantity}`}</p>}
      </div>
    </li>
  );
}
