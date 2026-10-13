'use client';

import {type CreateDownloadResponse, type DownloadOffer as Offer } from '@abaya/contracts';
import { Check, Download, FileImage, Scissors, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Link, usePathname, useRouter } from '@/components/i18n/navigation';
import { useStrings } from '@/components/i18n/locale-provider';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/misc';
import { errorMessage, isApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { useMyDownloads, useSimulateDownloadPayment, useStartDownload, waitUntilPaid } from '@/lib/queries/downloads';
import { useMe } from '@/lib/queries/me';
import { useVerifyPayment } from '@/lib/queries/orders';
import { loadRazorpay } from '@/lib/razorpay';
import { loginHref } from '@/lib/utils';
import { useMoney } from '@/lib/currency';

const THEME_COLOUR = '#1A534C';

type Phase = 'idle' | 'starting' | 'paying' | 'confirming';

/**
 * The second way to buy a design: its HD images (full quality, personal licence). Ordering
 * the stitched abaya stays the main path above; this never creates an order.
 */
export function DownloadOffer({ design, offer }: { design: { id: string; name: string }; offer: Offer }) {
  const money = useMoney();
  const { downloads: t } = useStrings();
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const mine = useMyDownloads();
  const owned = mine.data?.find((d) => d.design.id === design.id);
  const [open, setOpen] = useState(false);
  const price = money(offer.priceInPaise);

  return (
    <section aria-labelledby="two-ways" className="mt-8 rounded-2xl border border-sand-200 bg-sand-50/60 p-5 sm:p-6">
      <h2 id="two-ways" className="font-display text-xl font-semibold">
        {t.twoWaysTitle}
      </h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        <li className="flex gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Scissors className="size-4" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-semibold">{t.orderTitle}</span>
            <span className="block text-sm text-neutral-700">{t.orderBody}</span>
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-accent-700/30 bg-surface text-accent-800">
            <FileImage className="size-4" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-semibold">{t.downloadTitle}</span>
            <span className="block text-sm text-neutral-700">{t.downloadBody(offer.imageCount)}</span>
          </span>
        </li>
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {owned ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-800">
              <Check className="size-4" aria-hidden /> {t.owned}
            </span>
            <Button asChild variant="secondary">
              <Link href={`/downloads?new=${owned.id}`}>
                <Download aria-hidden /> {t.ownedCta}
              </Link>
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            onClick={() => (status === 'authenticated' ? setOpen(true) : router.push(loginHref(pathname)))}
          >
            <Download aria-hidden /> {t.downloadCta(price)}
          </Button>
        )}
        <span className="text-xs text-muted">{t.previewNote}</span>
      </div>

      {open ? <PurchaseDialog design={design} offer={offer} price={price} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

function PurchaseDialog({
  design,
  offer,
  price,
  onClose,
}: {
  design: { id: string; name: string };
  offer: Offer;
  price: string;
  onClose: () => void;
}) {
  const { downloads: t, common } = useStrings();
  const router = useRouter();
  const me = useMe();
  const start = useStartDownload();
  const simulate = useSimulateDownloadPayment();
  const verify = useVerifyPayment();
  const [accepted, setAccepted] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<{ tone: 'danger' | 'warning'; text: string } | null>(null);
  // Keep the started purchase so "try again" reuses it.
  const [purchase, setPurchase] = useState<CreateDownloadResponse | null>(null);

  const done = (id: string) => {
    toast.success(t.bought);
    router.push(`/downloads?new=${id}`);
  };

  const afterPayment = async (id: string) => {
    setPhase('confirming');
    if (await waitUntilPaid(id)) done(id);
    else {
      setPhase('idle');
      setMessage({ tone: 'warning', text: t.slow });
    }
  };

  const pay = async () => {
    if (!accepted) {
      setMessage({ tone: 'danger', text: t.acceptRequired });
      return;
    }
    setMessage(null);
    let p = purchase;
    if (!p) {
      setPhase('starting');
      try {
        p = await start.mutateAsync(design.id);
        setPurchase(p);
      } catch (e) {
        setPhase('idle');
        if (isApiError(e) && e.code === 'ALREADY_PURCHASED') {
          router.push('/downloads');
          return;
        }
        setMessage({ tone: 'danger', text: errorMessage(e) });
        return;
      }
    }

    if (p.paymentMode === 'test') {
      setPhase('confirming');
      try {
        await simulate.mutateAsync(p.downloadId);
        done(p.downloadId);
      } catch (e) {
        setPhase('idle');
        setMessage({ tone: 'danger', text: errorMessage(e) });
      }
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
    const current = p;
    const rzp = new Razorpay({
      key: current.razorpay.keyId,
      order_id: current.razorpay.orderId,
      amount: current.razorpay.amount,
      currency: current.razorpay.currency,
      name: 'Abaya',
      description: t.razorpayDescription(design.name),
      prefill: { name: me.data?.name ?? undefined, email: me.data?.email ?? undefined, contact: me.data?.phone ?? undefined },
      notes: { downloadId: current.downloadId },
      theme: { color: THEME_COLOUR },
      handler: (res) => {
        setPhase('confirming');
        verify.mutate(
          { razorpayOrderId: res.razorpay_order_id, razorpayPaymentId: res.razorpay_payment_id, razorpaySignature: res.razorpay_signature },
          {
            // Either way the webhook also confirms it; wait for the download to show as paid.
            onSettled: () => void afterPayment(current.downloadId),
          },
        );
      },
      modal: {
        ondismiss: () => {
          setPhase((ph) => (ph === 'confirming' ? ph : 'idle'));
          setMessage((m) => m ?? { tone: 'warning', text: t.dismissed });
        },
      },
    });
    rzp.on('payment.failed', (res) => setMessage({ tone: 'danger', text: t.failed(res.error.description) }));
    rzp.open();
  };

  const busy = phase !== 'idle';
  const testMode = purchase?.paymentMode === 'test';

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle className="font-display text-2xl font-semibold">{t.dialogTitle}</DialogTitle>
        <DialogDescription className="text-sm text-neutral-700">
          <span className="font-medium text-foreground">{design.name}</span> · {t.dialogBody(offer.imageCount)}
        </DialogDescription>

        <ul className="mt-4 space-y-2 text-sm">
          {t.includes.map((line) => (
            <li key={line} className="flex items-center gap-2">
              <Check className="size-4 text-accent-700" aria-hidden /> {line}
            </li>
          ))}
        </ul>

        <div className="mt-5 rounded-lg border border-sand-200 bg-sand-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-accent-700" aria-hidden /> {t.licenceTitle}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-700">{t.licence}</p>
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm font-medium">
            <Checkbox
              checked={accepted}
              disabled={busy}
              onCheckedChange={(v) => {
                setAccepted(v === true);
                setMessage(null);
              }}
            />
            {t.accept}
          </label>
        </div>

        {message ? (
          <Alert tone={message.tone} className="mt-4">
            {message.text}
          </Alert>
        ) : null}
        {testMode ? <p className="mt-3 text-xs text-muted">{t.testMode}</p> : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {common.cancel}
          </Button>
          <Button onClick={() => void pay()} loading={busy} className="sm:min-w-48">
            {phase === 'confirming' ? t.confirming : phase === 'paying' ? t.paying : testMode ? t.simulatePay(price) : t.pay(price)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
