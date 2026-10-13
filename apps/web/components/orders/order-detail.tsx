'use client';

import {
  CUSTOMER_STAGE_FLOW,
  customerStage, type OrderDetailDto,
  type OrderItemDto,
  type ProductionStage,
  type StageEventDto,
 } from '@abaya/contracts';
import { ArrowLeft, Check, ExternalLink, LifeBuoy, Truck } from 'lucide-react';
import { Link } from '@/components/i18n/navigation';
import { DesignImage } from '@/components/design/design-image';
import { PriceLines } from '@/components/design/redesign-panel';
import { AddressLines } from '@/components/account/address-form';
import { Button } from '@/components/ui/button';
import { Alert, Card, Skeleton } from '@/components/ui/misc';
import { useStrings } from '@/components/i18n/locale-provider';
import { errorMessage, isApiError } from '@/lib/api-client';
import { useOrder } from '@/lib/queries/orders';
import { cn, formatDate, formatDateTime } from '@/lib/utils';
import { OrderStatusChip } from './status-chip';
import { useMoney } from '@/lib/currency';

const MAIN_STAGES = CUSTOMER_STAGE_FLOW;

/** QC sending work back to a station is internal; customers just see that step again. */
const isRework = (e: StageEventDto) => e.fromStage === 'QC' && e.toStage !== 'FINISHING' && e.toStage !== 'CANCELLED';

export function OrderDetail({ orderNumber }: { orderNumber: string }) {
  const money = useMoney();
  const { nav, orders: t } = useStrings();
  const query = useOrder(orderNumber);

  if (query.isPending) {
    return (
      <div className="container max-w-4xl space-y-4 py-12">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="container max-w-4xl py-12">
        <Alert
          tone="danger"
          title={isApiError(query.error) && query.error.status === 404 ? t.notFound : errorMessage(query.error)}
          action={
            <Button asChild size="sm" variant="secondary">
              <Link href="/orders">{nav.orders}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const order = query.data;
  const headline = order.items.map((i) => i.stage).find((s) => s !== 'CANCELLED' && s !== 'DELIVERED') ?? order.items[0]?.stage ?? null;

  return (
    <div className="container max-w-4xl py-10 sm:py-14">
      <Link href="/orders" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm text-neutral-600 hover:text-foreground">
        <ArrowLeft className="rtl:-scale-x-100 size-4" aria-hidden />
        {nav.orders}
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-semibold">{t.orderNumber(order.orderNumber)}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {order.placedAt ? t.placedOn(formatDate(order.placedAt)) : t.createdOn(formatDate(order.createdAt))} · {t.items(order.items.length)}
          </p>
        </div>
        <OrderStatusChip status={order.status} stage={headline} />
      </header>

      {order.status === 'PENDING_PAYMENT' && (
        <Alert tone="warning" className="mt-6">
          {t.awaitingPayment}
        </Alert>
      )}

      <div className="mt-8 space-y-6">
        {order.items.map((item, i) => (
          <ItemCard key={item.id} item={item} index={i} count={order.items.length} />
        ))}

        {order.shipments.length > 0 && <Shipments order={order} />}

        <div className="grid gap-6 sm:grid-cols-2">
          <Card as="section">
            <h2 className="font-display text-2xl font-semibold">{t.deliveryAddress}</h2>
            <div className="mt-3">
              <AddressLines a={order.shippingAddress} />
            </div>
            {order.customerNote && (
              <p className="mt-4 text-sm text-neutral-600">
                <span className="font-medium text-neutral-800">{t.note}: </span>
                {order.customerNote}
              </p>
            )}
          </Card>
          <Card as="section">
            <h2 className="font-display text-2xl font-semibold">{t.payment}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label={t.subtotal} value={money(order.subtotalInPaise)} />
              <Row label={t.shipping} value={order.shippingInPaise > 0 ? money(order.shippingInPaise) : t.free} />
              {order.discountInPaise > 0 && <Row label={t.discount} value={`−${money(order.discountInPaise)}`} />}
              <div className="flex items-baseline justify-between border-t border-border pt-3">
                <dt className="font-medium">{t.total}</dt>
                <dd className="font-display text-2xl font-semibold tabular-nums">{money(order.totalInPaise)}</dd>
              </div>
            </dl>
          </Card>
        </div>

        <Card as="section" className="flex flex-col items-start gap-4 bg-sand-50 sm:flex-row sm:items-center">
          <LifeBuoy className="size-6 shrink-0 text-accent-700" aria-hidden />
          <div className="flex-1">
            <h2 className="font-medium">{t.help}</h2>
            <p className="text-sm text-neutral-600">{t.helpBody}</p>
          </div>
          <Button asChild variant="secondary">
            <Link href={`/help?order=${encodeURIComponent(order.orderNumber)}#contact`}>{t.helpCta}</Link>
          </Button>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral-600">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function ItemCard({ item, index, count }: { item: OrderItemDto; index: number; count: number }) {
  const money = useMoney();
  const { orders: t } = useStrings();
  const measurementsName = item.measurements && typeof item.measurements.profileName === 'string' ? item.measurements.profileName : null;
  return (
    <Card as="article" className="p-0 sm:p-0">
      <div className="flex gap-4 border-b border-border p-5 sm:p-6">
        <Link href={`/abayas/${item.design.slug}`} className="w-20 shrink-0 sm:w-24">
          <DesignImage src={item.design.primaryImageUrl} alt={item.design.name} name={item.design.name} sizes="96px" className="aspect-[3/4] rounded-md" />
        </Link>
        <div className="min-w-0 flex-1">
          {count > 1 && <p className="text-xs text-muted">{t.itemTitle(index + 1, count)}</p>}
          <h2 className="font-display text-2xl font-semibold leading-tight">{item.design.name}</h2>
          <p className="mt-1 text-sm text-neutral-600">{item.options.map((o) => o.valueName).join(' · ')}</p>
          <p className="mt-0.5 text-sm text-neutral-600">
            {item.measurements ? `${t.madeToMeasure}${measurementsName ? ` (${measurementsName})` : ''}` : `${t.size}: ${item.sizeBandCode}`}
          </p>
          <p className="mt-1 font-medium tabular-nums">{money(item.unitPriceInPaise)}</p>
        </div>
      </div>
      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[1fr_240px]">
        <StageTimeline item={item} />
        <details className="h-fit rounded-lg bg-neutral-50 p-4">
          <summary className="flex min-h-9 cursor-pointer items-center text-sm font-medium">{t.priceBreakdown}</summary>
          <PriceLines breakdown={item.priceBreakdown} />
        </details>
      </div>
    </Card>
  );
}

function StageTimeline({ item }: { item: OrderItemDto }) {
  const { orders: t, stageLabels } = useStrings();
  const events = [...item.stageEvents].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  let currentIdx: number;
  if (item.stage === 'CANCELLED') {
    const reached = events.map((e) => MAIN_STAGES.indexOf(customerStage(e.fromStage ?? 'PLACED'))).filter((i) => i >= 0);
    currentIdx = reached.length ? Math.max(...reached) : 0;
  } else if (item.stage === 'REMAKE') {
    currentIdx = MAIN_STAGES.indexOf('PATTERN') - 1;
  } else {
    currentIdx = MAIN_STAGES.indexOf(customerStage(item.stage));
  }

  const lastEventFor = (stage: ProductionStage) => [...events].reverse().find((e) => e.toStage === stage);
  const photosFor = (stage: ProductionStage) => events.filter((e) => e.toStage === stage && e.photoUrl);

  return (
    <section aria-label={t.progress}>
      <h3 className="mb-4 text-sm font-medium uppercase tracking-[0.14em] text-muted">{t.progress}</h3>
      {item.stage === 'CANCELLED' && (
        <Alert tone="danger" className="mb-4">
          {t.cancelledItem}
        </Alert>
      )}
      {item.stage === 'REMAKE' && (
        <Alert tone="info" className="mb-4">
          {t.remakeItem}
        </Alert>
      )}
      <ol className="relative">
        {MAIN_STAGES.map((stage, i) => {
          const done = i < currentIdx || (i === currentIdx && stage === 'DELIVERED');
          const current = i === currentIdx && item.stage !== 'CANCELLED' && stage !== 'DELIVERED';
          const reached = i <= currentIdx;
          const event = reached ? lastEventFor(stage) : undefined;
          const photos = reached ? photosFor(stage) : [];
          const isLast = i === MAIN_STAGES.length - 1;
          return (
            <li key={stage} className="relative flex gap-4 pb-6 last:pb-0" aria-current={current ? 'step' : undefined}>
              {!isLast && (
                <span aria-hidden className={cn('absolute start-[11px] top-7 h-[calc(100%-1.5rem)] w-0.5', i < currentIdx ? 'bg-primary' : 'bg-neutral-200')} />
              )}
              <span
                aria-hidden
                className={cn(
                  'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                  done ? 'border-primary bg-primary text-white' : current ? 'border-primary bg-surface' : 'border-neutral-300 bg-surface',
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : current ? <span className="size-2 animate-pulse rounded-full bg-primary" /> : null}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className={cn('text-sm', reached ? 'font-medium text-foreground' : 'text-neutral-500')}>
                  {stageLabels[stage]}
                  <span className="sr-only">{done ? ' (done)' : current ? ' (current)' : ''}</span>
                </p>
                {event && <p className="text-xs text-muted">{formatDateTime(event.createdAt)}</p>}
                {event?.note && !isRework(event) && <p className="mt-1 text-sm text-neutral-600">{event.note}</p>}
                {photos.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2" aria-label={t.stagePhotos}>
                    {photos.map((p) => (
                      <li key={p.id}>
                        <a
                          href={p.photoUrl!}
                          target="_blank"
                          rel="noreferrer"
                          className="block overflow-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                        >
                          <DesignImage
                            src={p.photoUrl}
                            alt={t.stagePhotoAlt(stageLabels[stage])}
                            name={stageLabels[stage]}
                            sizes="96px"
                            className="size-20 sm:size-24"
                          />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Shipments({ order }: { order: OrderDetailDto }) {
  const { orders: t, stageLabels } = useStrings();
  return (
    <Card as="section">
      <h2 className="font-display text-2xl font-semibold">{t.shipments}</h2>
      <ul className="mt-4 space-y-3">
        {order.shipments.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4">
            <Truck className="size-5 text-accent-700" aria-hidden />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">{t.trackingNumber(s.carrier, s.trackingNumber) || stageLabels.SHIPPED}</p>
              <p className="text-neutral-600">
                {s.deliveredAt
                  ? `${stageLabels.DELIVERED} ${formatDate(s.deliveredAt)}`
                  : s.shippedAt
                    ? `${stageLabels.SHIPPED} ${formatDate(s.shippedAt)}`
                    : null}
              </p>
            </div>
            {s.trackingUrl && /^https?:\/\//.test(s.trackingUrl) && (
              <Button asChild size="sm" variant="secondary">
                <a href={s.trackingUrl} target="_blank" rel="noreferrer">
                  {t.tracking}
                  <ExternalLink aria-hidden />
                </a>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
