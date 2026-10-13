'use client';

import { formatINR } from '@abaya/contracts';
import { Link, useRouter } from '@/components/i18n/navigation';

import { Lock, Plus, ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { AddressForm, AddressLines } from '@/components/account/address-form';
import { CartItemRow } from '@/components/cart/cart-item-row';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Textarea } from '@/components/ui/input';
import { Alert, Badge, Card, EmptyState, Skeleton } from '@/components/ui/misc';
import { useStrings } from '@/components/i18n/locale-provider';
import { errorMessage, isApiError } from '@/lib/api-client';
import { useCart } from '@/lib/queries/cart';
import { useAddresses, useMe } from '@/lib/queries/me';
import { type CheckoutResult, useCheckout, usePaymentConfig, useSimulatePayment, useVerifyPayment } from '@/lib/queries/orders';
import { loadRazorpay } from '@/lib/razorpay';
import { cn } from '@/lib/utils';
import { useCurrency, useMoney } from '@/lib/currency';

/** Accent colour for the Razorpay sheet (tokens: primary / accent-700). */
const THEME_COLOUR = '#1A534C';

type Phase = 'idle' | 'creating' | 'paying' | 'verifying';

export function CheckoutView() {
  const money = useMoney();
  const { currency } = useCurrency();
  const { account, checkout: t, common } = useStrings();
  const router = useRouter();
  const cart = useCart();
  const addresses = useAddresses();
  const me = useMe();
  const createOrder = useCheckout();
  const verify = useVerifyPayment();
  const simulate = useSimulatePayment();
  const paymentConfig = usePaymentConfig();

  const [chosenAddressId, setChosenAddressId] = useState<string | null>(null);
  const [addingAddress, setAddingAddress] = useState(false);
  const [note, setNote] = useState('');
  // Once the API has created the order we keep it, so "try again" reopens the same payment.
  const [order, setOrder] = useState<CheckoutResult | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<{ tone: 'danger' | 'warning'; text: string } | null>(null);

  const list = addresses.data ?? [];
  const addressId =
    (chosenAddressId && list.some((a) => a.id === chosenAddressId) ? chosenAddressId : null) ??
    list.find((a) => a.isDefault)?.id ??
    list[0]?.id ??
    null;
  const address = list.find((a) => a.id === addressId);

  /** Development test mode: no Razorpay; the API marks the order paid through the normal capture path. */
  const simulatePayment = (o: CheckoutResult) => {
    setMessage(null);
    setPhase('verifying');
    simulate.mutate(o.orderNumber, {
      onSuccess: () => router.replace(`/checkout/success?order=${encodeURIComponent(o.orderNumber)}`),
      onError: (e) => {
        setPhase('idle');
        setMessage({ tone: 'danger', text: errorMessage(e) });
      },
    });
  };

  const openPayment = async (o: CheckoutResult) => {
    if (o.paymentMode === 'test') {
      // Show the test-mode panel; the customer confirms with "Simulate payment".
      setPhase('idle');
      return;
    }
    setPhase('paying');
    let Razorpay;
    try {
      Razorpay = await loadRazorpay();
    } catch {
      setPhase('idle');
      setMessage({ tone: 'danger', text: t.scriptError });
      return;
    }
    const rzp = new Razorpay({
      key: o.razorpay.keyId,
      order_id: o.razorpay.orderId,
      amount: o.razorpay.amount,
      currency: o.razorpay.currency,
      name: t.razorpayName,
      description: t.razorpayDescription(o.orderNumber),
      prefill: {
        name: me.data?.name ?? address?.fullName ?? undefined,
        email: me.data?.email ?? undefined,
        contact: me.data?.phone ?? address?.phone ?? undefined,
      },
      notes: { orderNumber: o.orderNumber },
      theme: { color: THEME_COLOUR },
      handler: (res) => {
        setPhase('verifying');
        verify.mutate(
          {
            razorpayOrderId: res.razorpay_order_id,
            razorpayPaymentId: res.razorpay_payment_id,
            razorpaySignature: res.razorpay_signature,
          },
          {
            onSuccess: () => router.replace(`/checkout/success?order=${encodeURIComponent(o.orderNumber)}`),
            onError: (e) => {
              setPhase('idle');
              setMessage({
                tone: 'danger',
                text: isApiError(e) && e.code === 'INVALID_SIGNATURE' ? t.verifyFailed : `${errorMessage(e)} ${t.verifyFailed}`,
              });
            },
          },
        );
      },
      modal: {
        ondismiss: () => {
          setPhase((p) => (p === 'verifying' ? p : 'idle'));
          setMessage((m) => m ?? { tone: 'warning', text: t.dismissed });
        },
      },
    });
    rzp.on('payment.failed', (res) => {
      setMessage({ tone: 'danger', text: t.failed(res.error.description) });
    });
    setMessage(null);
    rzp.open();
  };

  /** Test mode: one click creates the order (if needed) and marks it paid. */
  const payInTestMode = () => {
    setMessage(null);
    if (order) {
      simulatePayment(order);
      return;
    }
    if (!addressId) return;
    setPhase('creating');
    createOrder.mutate(
      { addressId, ...(note.trim() ? { customerNote: note.trim() } : {}) },
      {
        onSuccess: (o) => {
          setOrder(o);
          simulatePayment(o);
        },
        onError: (e) => {
          setPhase('idle');
          setMessage({ tone: 'danger', text: errorMessage(e) });
          if (isApiError(e) && (e.code === 'CART_NOT_READY' || e.code === 'CART_EMPTY')) void cart.refetch();
        },
      },
    );
  };

  const pay = () => {
    setMessage(null);
    if (order) {
      void openPayment(order);
      return;
    }
    if (!addressId) return;
    setPhase('creating');
    // Only the address and note are sent; the API re-prices every item itself.
    createOrder.mutate(
      { addressId, ...(note.trim() ? { customerNote: note.trim() } : {}) },
      {
        onSuccess: (o) => {
          setOrder(o);
          void openPayment(o);
        },
        onError: (e) => {
          setPhase('idle');
          setMessage({ tone: 'danger', text: errorMessage(e) });
          if (isApiError(e) && (e.code === 'CART_NOT_READY' || e.code === 'CART_EMPTY')) void cart.refetch();
        },
      },
    );
  };

  if (cart.isPending || addresses.isPending) {
    return (
      <div className="container max-w-5xl space-y-4 py-12">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (cart.isError) {
    return (
      <div className="container max-w-5xl py-12">
        <Alert tone="danger" title={errorMessage(cart.error)} action={<Button size="sm" variant="secondary" onClick={() => void cart.refetch()}>{common.retry}</Button>} />
      </div>
    );
  }
  if (cart.data.items.length === 0 && !order) {
    return (
      <div className="container max-w-5xl py-12">
        <EmptyState
          icon={<ShoppingBag className="size-5" aria-hidden />}
          title={t.bagEmpty}
          action={
            <Button asChild>
              <Link href="/abayas">{t.continueShopping}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const busy = phase !== 'idle';
  const locked = Boolean(order);
  const totalInPaise = order?.totalInPaise ?? cart.data.subtotalInPaise;

  return (
    <div className="container max-w-5xl py-10 sm:py-14">
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">{t.title}</h1>

      {!cart.data.canCheckout && !order && (
        <Alert
          tone="warning"
          className="mt-6"
          title={t.bagProblems}
          action={
            <Button asChild size="sm" variant="secondary">
              <Link href="/bag">{t.goToBag}</Link>
            </Button>
          }
        />
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card as="section">
            <StepTitle n={1} title={t.stepAddress} />
            {addresses.isError ? (
              <Alert tone="danger">{errorMessage(addresses.error)}</Alert>
            ) : (
              <fieldset disabled={locked || busy} className="mt-4 space-y-3">
                <legend className="sr-only">{t.selectAddress}</legend>
                {list.length === 0 && <p className="text-sm text-neutral-600">{t.noAddresses}</p>}
                {list.map((a) => (
                  <label
                    key={a.id}
                    className={cn(
                      'flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-500',
                      a.id === addressId ? 'border-primary bg-accent-50/50' : 'border-neutral-300 hover:border-neutral-500',
                    )}
                  >
                    <input
                      type="radio"
                      name="address"
                      value={a.id}
                      checked={a.id === addressId}
                      onChange={() => setChosenAddressId(a.id)}
                      className="mt-1 size-4 accent-[#1A534C]"
                    />
                    <div className="flex-1">
                      {a.isDefault && <Badge tone="accent" className="mb-1">{account.addresses.default}</Badge>}
                      <AddressLines a={a} />
                    </div>
                  </label>
                ))}
                <Button type="button" variant="secondary" size="sm" onClick={() => setAddingAddress(true)}>
                  <Plus aria-hidden />
                  {t.addNewAddress}
                </Button>
              </fieldset>
            )}
            <FormField id="checkout-note" label={`${t.note} (${common.optional})`} hint={t.noteHint} className="mt-6">
              <Textarea
                id="checkout-note"
                aria-describedby="checkout-note-hint"
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={locked || busy}
                className="min-h-20"
              />
            </FormField>
          </Card>

          <Card as="section">
            <StepTitle n={2} title={t.stepReview} />
            <ul className="mt-2 divide-y divide-border">
              {cart.data.items.map((item) => (
                <CartItemRow key={item.id} item={item} editable={false} />
              ))}
            </ul>
          </Card>
        </div>

        <aside className="h-fit space-y-4 rounded-xl border border-border bg-sand-50 p-5 lg:sticky lg:top-24">
          <StepTitle n={3} title={t.stepPay} />
          {address && (
            <div className="text-sm">
              <p className="mb-1 font-medium">{t.deliverTo}</p>
              <AddressLines a={address} />
            </div>
          )}
          <dl className="space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-600">{t.subtotal}</dt>
              <dd className="tabular-nums">{money(cart.data.subtotalInPaise)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-600">{t.shipping}</dt>
              <dd className="text-neutral-600">{order ? money(Math.max(0, order.totalInPaise - cart.data.subtotalInPaise)) : t.shippingCalculated}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <dt className="font-medium">{t.total}</dt>
              <dd className="font-display text-3xl font-semibold tabular-nums">{money(totalInPaise)}</dd>
            </div>
            {currency !== 'INR' && (
              <div className="mt-2 text-xs text-muted">
                <p>{t.chargedInInr(formatINR(order?.totalInPaise ?? totalInPaise), currency)}</p>
              </div>
            )}
            <div className="hidden">
            </div>
          </dl>

          {message && (
            <Alert tone={message.tone} aria-live="assertive">
              {message.text}
            </Alert>
          )}

          {paymentConfig.data?.mode === 'test' || order?.paymentMode === 'test' ? (
            <div className="space-y-3">
              <Alert tone="warning" title={t.testModeTitle}>
                {t.testModeBody}
              </Alert>
              <Button
                size="lg"
                className="w-full"
                onClick={payInTestMode}
                disabled={!addressId || (!cart.data.canCheckout && !order)}
                loading={phase === 'creating' || phase === 'verifying'}
              >
                {t.simulatePay(formatINR(order?.totalInPaise ?? totalInPaise))}
              </Button>
            </div>
          ) : (
          <Button
            size="lg"
            className="w-full"
            onClick={pay}
            disabled={!addressId || (!cart.data.canCheckout && !order)}
            loading={busy}
          >
            {!busy && <Lock aria-hidden />}
            {phase === 'verifying'
              ? t.verifying
              : phase === 'creating' || phase === 'paying'
                ? t.paying
                : order && message
                  ? t.retry
                  : t.pay(formatINR(totalInPaise))}
          </Button>
          )}
          <p className="text-xs leading-relaxed text-muted">{t.securedBy}</p>
        </aside>
      </div>

      <Dialog open={addingAddress} onOpenChange={setAddingAddress}>
        <DialogContent>
          <DialogTitle>{account.addresses.formTitleNew}</DialogTitle>
          <div className="mt-5">
            <AddressForm
              defaultName={me.data?.name}
              defaultPhone={me.data?.phone}
              onCancel={() => setAddingAddress(false)}
              onSaved={(a) => {
                setChosenAddressId(a.id);
                setAddingAddress(false);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-3 font-display text-2xl font-semibold">
      <span className="flex size-8 items-center justify-center rounded-full bg-primary font-sans text-sm font-semibold text-white">{n}</span>
      {title}
    </h2>
  );
}
