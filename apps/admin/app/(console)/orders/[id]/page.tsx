'use client';

import { ArrowLeft, EyeOff, RotateCcw, Truck } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { AuditHistory } from '@/components/audit-history';
import { ItemCard } from '@/components/orders/item-card';
import { RefundDialog, ShipDialog, shippableItems } from '@/components/orders/production-dialogs';
import { ErrorState, ForbiddenState, PageSkeleton } from '@/components/states';
import { OrderStatusBadge, PaymentStatusBadge, RefundStatusBadge } from '@/components/status-badges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SHIPMENT_STATUS_LABELS, strings } from '@/content/strings';
import { useCurrentUser } from '@/lib/current-user';
import { formatDateTime, formatMoney } from '@/lib/format';
import { useOrder } from '@/lib/queries/orders';

const o = strings.order;

function Hidden() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted">
      <EyeOff className="size-4" aria-hidden /> {o.hiddenForRole}
    </p>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const me = useCurrentUser();
  const order = useOrder(id);
  const [shipping, setShipping] = React.useState(false);
  const [refunding, setRefunding] = React.useState(false);

  React.useEffect(() => {
    // Scroll to #item-<id> once items render (links from the board).
    if (!order.data || typeof window === 'undefined' || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [order.data]);

  if (!me.can('viewOrders')) return <ForbiddenState />;
  if (order.isPending) return <PageSkeleton />;
  if (order.isError) {
    return (
      <Card>
        <ErrorState error={order.error} onRetry={() => void order.refetch()} />
      </Card>
    );
  }

  const d = order.data;
  const canShip = me.can('manageProduction') && shippableItems(d).length > 0;
  const canRefund = me.can('refund') && d.payments.some((p) => p.amountInPaise > p.refundedInPaise && (p.status === 'CAPTURED' || p.status === 'PARTIALLY_REFUNDED'));

  return (
    <div className="space-y-5">
      <div>
        <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> {o.back}
        </Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-2xl font-semibold">{d.orderNumber}</h1>
              <OrderStatusBadge status={d.status} placedAt={d.placedAt} />
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {d.placedAt ? o.placedOn(formatDateTime(d.placedAt)) : strings.orders.createdOn(formatDateTime(d.createdAt))} · {strings.common.items(d.items.length)} · {formatMoney(d.totalInPaise)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canShip ? (
              <Button onClick={() => setShipping(true)}>
                <Truck /> {o.markShipped}
              </Button>
            ) : null}
            {canRefund ? (
              <Button variant="danger-outline" onClick={() => setRefunding(true)}>
                <RotateCcw /> {o.refund}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <h2 className="sr-only">{o.items}</h2>
          {d.items.map((item, i) => (
            <ItemCard key={item.id} orderId={d.id} orderStatus={d.status} item={item} index={i} siblings={d.items} />
          ))}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{o.customer}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {d.customer ? (
                <>
                  <p className="font-medium">{d.customer.name ?? '—'}</p>
                  {d.customer.email ? (
                    <a href={`mailto:${d.customer.email}`} className="block text-accent-700 hover:underline">
                      {d.customer.email}
                    </a>
                  ) : null}
                  {d.customer.phone ? (
                    <a href={`tel:${d.customer.phone}`} className="block text-accent-700 hover:underline">
                      {d.customer.phone}
                    </a>
                  ) : null}
                </>
              ) : (
                <Hidden />
              )}
              {d.customerNote ? (
                <div className="mt-3 rounded-md bg-amber-50 p-2.5 text-amber-900">
                  <p className="text-xs font-medium uppercase tracking-wide">{o.customerNote}</p>
                  <p className="mt-0.5 whitespace-pre-line">{d.customerNote}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{o.address}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {d.shippingAddress ? (
                <address className="not-italic leading-relaxed">
                  <span className="font-medium">{d.shippingAddress.fullName}</span>
                  <br />
                  {d.shippingAddress.line1}
                  {d.shippingAddress.line2 ? (
                    <>
                      <br />
                      {d.shippingAddress.line2}
                    </>
                  ) : null}
                  {d.shippingAddress.landmark ? (
                    <>
                      <br />
                      {d.shippingAddress.landmark}
                    </>
                  ) : null}
                  <br />
                  {d.shippingAddress.city}, {d.shippingAddress.state} {d.shippingAddress.pincode}
                  <br />
                  {d.shippingAddress.phone}
                </address>
              ) : (
                <Hidden />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{o.totals}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">{o.subtotal}</dt>
                  <dd className="tabular-nums">{formatMoney(d.subtotalInPaise)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">{o.shipping}</dt>
                  <dd className="tabular-nums">{formatMoney(d.shippingInPaise)}</dd>
                </div>
                {d.discountInPaise > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-muted">{o.discount}</dt>
                    <dd className="tabular-nums">−{formatMoney(d.discountInPaise)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-border pt-1 font-semibold">
                  <dt>{o.total}</dt>
                  <dd className="tabular-nums">{formatMoney(d.totalInPaise)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{o.payments}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {d.payments.length === 0 ? (
                <p className="text-sm text-muted">{o.noPayments}</p>
              ) : (
                d.payments.map((p) => (
                  <div key={p.id} className="space-y-1 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium tabular-nums">{formatMoney(p.amountInPaise)}</span>
                      <PaymentStatusBadge status={p.status} />
                    </div>
                    <p className="text-xs text-muted">
                      {p.method ?? '—'} · <span className="font-mono">{p.providerPaymentId ?? p.providerOrderId}</span> · {formatDateTime(p.createdAt)}
                    </p>
                    {p.refundedInPaise > 0 ? (
                      <p className="text-xs">
                        {o.refunded}: <span className="tabular-nums">{formatMoney(p.refundedInPaise)}</span>
                      </p>
                    ) : null}
                    {p.refunds.length ? (
                      <ul className="mt-1 space-y-1 border-l-2 border-border pl-3">
                        {p.refunds.map((r) => (
                          <li key={r.id} className="text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="tabular-nums">{formatMoney(r.amountInPaise)}</span>
                              <RefundStatusBadge status={r.status} />
                            </div>
                            <p className="text-muted">
                              {r.reason} · {formatDateTime(r.createdAt)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{o.shipments}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {d.shipments.length === 0 ? (
                <p className="text-sm text-muted">{o.noShipments}</p>
              ) : (
                d.shipments.map((s) => (
                  <div key={s.id} className="text-sm">
                    <p className="font-medium">
                      {s.carrier ?? '—'} · <span className="font-mono">{s.trackingNumber ?? '—'}</span>
                    </p>
                    <p className="text-xs text-muted">
                      {SHIPMENT_STATUS_LABELS[s.status]} · {formatDateTime(s.shippedAt)} · {strings.common.items(s.orderItemIds.length)}
                    </p>
                    {s.trackingUrl ? (
                      <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-700 hover:underline">
                        {s.trackingUrl}
                      </a>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <AuditHistory entityType="Order" entityId={d.id} />
        </aside>
      </div>

      {shipping ? <ShipDialog open onOpenChange={setShipping} order={d} /> : null}
      {refunding ? (
        <RefundDialog open onOpenChange={setRefunding} orderId={d.id} payments={d.payments} isSuperAdmin={me.hasRole('SUPER_ADMIN')} />
      ) : null}
    </div>
  );
}
