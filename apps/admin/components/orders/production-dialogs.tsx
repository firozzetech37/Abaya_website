'use client';

import {
  type AdminOrderDetail,
  type AdminOrderItemDto,
  cancelItemBody,
  type PaymentDto,
  type ProductionStage,
  QC_SEND_BACK_STAGES,
  refundBody,
  shipItemsBody,
  SUPPORT_REFUND_LIMIT_IN_PAISE,
} from '@abaya/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, MoneyInput } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { STAGE_LABELS, strings } from '@/content/strings';
import { formatMoney, rupeesInputToPaise } from '@/lib/format';
import { requiresStageNote, requiresStagePhoto } from '@/lib/permissions';
import {
  useCancelItem,
  useMoveStage,
  useQcChecklist,
  useRecordQc,
  useRefund,
  useShipItems,
} from '@/lib/queries/orders';
import { cn } from '@/lib/utils';
import { PhotoPicker } from './photo-picker';

const p = strings.production;

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Footer with a second "are you sure" step for money / destructive actions. */
function ConfirmingFooter({
  confirming,
  setConfirming,
  question,
  submitLabel,
  busy,
  disabled,
  danger,
  onCancel,
}: {
  confirming: boolean;
  setConfirming: (v: boolean) => void;
  question: string;
  submitLabel: string;
  busy: boolean;
  disabled?: boolean;
  danger?: boolean;
  onCancel: () => void;
}) {
  if (confirming) {
    return (
      <DialogFooter className="items-center sm:justify-between">
        <p className="text-sm font-medium text-foreground" role="alert">
          {question}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
            {strings.common.back}
          </Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} loading={busy}>
            {strings.common.confirm}
          </Button>
        </div>
      </DialogFooter>
    );
  }
  return (
    <DialogFooter>
      <Button variant="secondary" onClick={onCancel}>
        {strings.common.cancel}
      </Button>
      <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={disabled}>
        {submitLabel}
      </Button>
    </DialogFooter>
  );
}

// ───────────── Generic stage move ─────────────

export function MoveStageDialog({
  open,
  onOpenChange,
  orderId,
  item,
  to,
}: DialogProps & { orderId: string; item: AdminOrderItemDto; to: ProductionStage }) {
  const move = useMoveStage(orderId, item.id);
  const [note, setNote] = React.useState('');
  const [photos, setPhotos] = React.useState<string[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const needsPhoto = requiresStagePhoto(item.stage, to);
  const needsNote = requiresStageNote(to);
  const label = STAGE_LABELS[to];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (needsNote && !note.trim()) return setError(p.moveNoteRequired);
    if (needsPhoto && photos.length === 0) return setError(p.photoRequired);
    await move.mutateAsync({ to, note: note.trim() || undefined, photoPath: photos[0] });
    toast.success(p.moved(label));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form
          onSubmit={(e) => void submit(e).catch(() => undefined)}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader>
            <DialogTitle>{p.moveTitle(label)}</DialogTitle>
            <DialogDescription>
              {item.design.name} · {STAGE_LABELS[item.stage]} → {label}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {needsPhoto ? (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">
                  {p.photoLabel} <span className="text-danger">*</span>
                </p>
                <PhotoPicker
                  purpose="STAGE_PHOTO"
                  onChange={setPhotos}
                  onBusyChange={setUploading}
                />
              </div>
            ) : null}
            <Field label={p.moveNote} htmlFor="move-note" optional={!needsNote}>
              <Textarea
                id="move-note"
                rows={3}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {strings.common.cancel}
            </Button>
            <Button
              type="submit"
              loading={move.isPending}
              disabled={uploading}
              variant={to === 'REMAKE' ? 'danger' : 'primary'}
            >
              {p.move(label)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────── QC ─────────────

/** Used on the admin order page and at the workshop QC station (`onDone` refreshes the station). */
export function QcDialog({
  open,
  onOpenChange,
  orderId,
  itemId,
  uploadVia = 'admin',
  onDone,
}: DialogProps & {
  orderId: string;
  itemId: string;
  uploadVia?: 'admin' | 'workshop';
  onDone?: () => void;
}) {
  const checklist = useQcChecklist(itemId, open);
  const record = useRecordQc(orderId, itemId);
  const [ticks, setTicks] = React.useState<Record<string, boolean>>({});
  const [result, setResult] = React.useState<'PASS' | 'FAIL'>('PASS');
  const [sendBackTo, setSendBackTo] =
    React.useState<(typeof QC_SEND_BACK_STAGES)[number]>('STITCHING');
  const [notes, setNotes] = React.useState('');
  const [photos, setPhotos] = React.useState<string[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const lines = checklist.data ?? [];
  const allOk = lines.length > 0 && lines.every((l) => ticks[l]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (result === 'PASS' && !allOk) return setError(p.qcChecklistIncomplete);
    if (result === 'FAIL' && !notes.trim()) return setError(p.qcNotesRequired);
    await record.mutateAsync({
      result,
      checklist: lines.map((item) => ({ item, ok: Boolean(ticks[item]) })),
      notes: notes.trim() || undefined,
      photoPaths: photos,
      ...(result === 'FAIL' ? { sendBackTo } : {}),
    });
    toast.success(p.qcSaved(result === 'PASS' ? p.qcPassed : p.qcFailed));
    onOpenChange(false);
    onDone?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form
          onSubmit={(e) => void submit(e).catch(() => undefined)}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader>
            <DialogTitle>{p.qcTitle}</DialogTitle>
            <DialogDescription>{p.qcDescription}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {checklist.isPending ? (
              <Skeleton className="h-40" />
            ) : (
              <fieldset className="space-y-2">
                <legend className="sr-only">{p.qcTitle}</legend>
                {lines.map((line, i) => (
                  <div
                    key={line}
                    className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2"
                  >
                    <Checkbox
                      id={`qc-${i}`}
                      checked={Boolean(ticks[line])}
                      onCheckedChange={(v) => {
                        setTicks((t) => ({ ...t, [line]: Boolean(v) }));
                        setError(null);
                      }}
                    />
                    <label htmlFor={`qc-${i}`} className="text-sm">
                      {line}
                    </label>
                  </div>
                ))}
              </fieldset>
            )}
            <div role="radiogroup" aria-label={p.qcTitle} className="grid grid-cols-2 gap-2">
              {(['PASS', 'FAIL'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={result === r}
                  onClick={() => {
                    setResult(r);
                    setError(null);
                  }}
                  className={cn(
                    'h-11 rounded-md border text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                    result === r
                      ? r === 'PASS'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                        : 'border-red-600 bg-red-50 text-red-800'
                      : 'border-border bg-surface text-muted hover:bg-neutral-50',
                  )}
                >
                  {r === 'PASS' ? p.qcPass : p.qcFail}
                </button>
              ))}
            </div>
            {result === 'FAIL' ? (
              <Field label={p.qcSendBackTo} htmlFor="qc-send-back">
                <NativeSelect
                  id="qc-send-back"
                  value={sendBackTo}
                  onChange={(e) => setSendBackTo(e.target.value as typeof sendBackTo)}
                >
                  {QC_SEND_BACK_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {p.qcSendBackOptions[s]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
            <Field label={p.qcNotes} htmlFor="qc-notes" optional={result === 'PASS'}>
              <Textarea
                id="qc-notes"
                rows={3}
                maxLength={1000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">
                {p.qcPhotos}{' '}
                <span className="font-normal text-muted">({strings.common.optional})</span>
              </p>
              <PhotoPicker
                purpose="QC_PHOTO"
                via={uploadVia}
                multiple
                max={10}
                onChange={setPhotos}
                onBusyChange={setUploading}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {strings.common.cancel}
            </Button>
            <Button
              type="submit"
              variant={result === 'FAIL' ? 'danger' : 'primary'}
              loading={record.isPending}
              disabled={uploading || checklist.isPending}
            >
              {result === 'PASS' ? p.qcPass : p.qcFail}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────── Ship ─────────────

const lastQc = (item: AdminOrderItemDto) =>
  [...item.qcChecks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.result ?? null;

export const shippableItems = (order: AdminOrderDetail) =>
  order.items.filter((i) => i.stage === 'PACKED' && lastQc(i) === 'PASS');

const shipForm = shipItemsBody
  .omit({ trackingUrl: true })
  .extend({ trackingUrl: z.union([z.literal(''), z.string().url()]) });
type ShipValues = z.input<typeof shipForm>;

export function ShipDialog({
  open,
  onOpenChange,
  order,
}: DialogProps & { order: AdminOrderDetail }) {
  const ship = useShipItems(order.id);
  const candidates = shippableItems(order);
  const [confirming, setConfirming] = React.useState(false);
  const form = useForm<ShipValues>({
    resolver: zodResolver(shipForm),
    defaultValues: {
      orderItemIds: candidates.map((c) => c.id),
      carrier: '',
      trackingNumber: '',
      trackingUrl: '',
    },
  });
  const { errors } = form.formState;
  const selected = form.watch('orderItemIds'); // eslint-disable-line react-hooks/incompatible-library -- small dialog, re-renders are fine

  const onSubmit = form.handleSubmit(async (v) => {
    if (!confirming) return setConfirming(true);
    await ship.mutateAsync({ ...v, trackingUrl: v.trackingUrl || undefined });
    toast.success(p.shipped);
    setConfirming(false);
    onOpenChange(false);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setConfirming(false);
        onOpenChange(o);
      }}
    >
      <DialogContent size="md">
        <form
          noValidate
          onSubmit={(e) => void onSubmit(e).catch(() => undefined)}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader>
            <DialogTitle>{p.shipTitle}</DialogTitle>
            <DialogDescription>{p.shipDescription}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <fieldset disabled={confirming} className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">{p.shipItems}</p>
                {candidates.length === 0 ? (
                  <p className="text-sm text-muted">{p.shipNone}</p>
                ) : (
                  candidates.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <Checkbox
                        checked={selected.includes(c.id)}
                        onCheckedChange={(v) =>
                          form.setValue(
                            'orderItemIds',
                            v ? [...selected, c.id] : selected.filter((x) => x !== c.id),
                            { shouldValidate: true },
                          )
                        }
                      />
                      {c.design.name}
                    </label>
                  ))
                )}
                {errors.orderItemIds ? <p className="text-xs text-danger">{p.shipNone}</p> : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={p.carrier} htmlFor="ship-carrier" error={errors.carrier?.message}>
                  <Input id="ship-carrier" placeholder="Delhivery" {...form.register('carrier')} />
                </Field>
                <Field
                  label={p.trackingNumber}
                  htmlFor="ship-awb"
                  error={errors.trackingNumber?.message}
                >
                  <Input id="ship-awb" className="font-mono" {...form.register('trackingNumber')} />
                </Field>
              </div>
              <Field
                label={p.trackingUrl}
                htmlFor="ship-url"
                optional
                error={errors.trackingUrl?.message}
              >
                <Input
                  id="ship-url"
                  type="url"
                  placeholder="https://"
                  {...form.register('trackingUrl')}
                />
              </Field>
            </fieldset>
          </DialogBody>
          <ConfirmingFooter
            confirming={confirming}
            setConfirming={setConfirming}
            question={p.shipConfirm(selected.length)}
            submitLabel={p.markShippedLabel}
            busy={ship.isPending}
            disabled={candidates.length === 0}
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────── Cancel item ─────────────

type CancelValues = z.input<typeof cancelItemBody>;

export function CancelItemDialog({
  open,
  onOpenChange,
  orderId,
  item,
}: DialogProps & { orderId: string; item: AdminOrderItemDto }) {
  const cancel = useCancelItem(orderId, item.id);
  const [confirming, setConfirming] = React.useState(false);
  const form = useForm<CancelValues>({
    resolver: zodResolver(cancelItemBody),
    defaultValues: { reason: '', refund: true },
  });
  const refund = form.watch('refund'); // eslint-disable-line react-hooks/incompatible-library -- small dialog
  const { errors } = form.formState;
  const amount = item.unitPriceInPaise * item.quantity;

  const onSubmit = form.handleSubmit(async (v) => {
    if (!confirming) return setConfirming(true);
    await cancel.mutateAsync({ reason: v.reason, refund: v.refund ?? true });
    toast.success(p.cancelled);
    setConfirming(false);
    onOpenChange(false);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setConfirming(false);
        onOpenChange(o);
      }}
    >
      <DialogContent size="sm">
        <form
          noValidate
          onSubmit={(e) => void onSubmit(e).catch(() => undefined)}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader>
            <DialogTitle>{p.cancelTitle}</DialogTitle>
            <DialogDescription>{p.cancelDescription}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <fieldset disabled={confirming} className="space-y-4">
              <p className="text-sm">
                <span className="font-medium">{item.design.name}</span> · {formatMoney(amount)}
              </p>
              <Field label={p.cancelReason} htmlFor="cancel-reason" error={errors.reason?.message}>
                <Textarea
                  id="cancel-reason"
                  rows={3}
                  maxLength={300}
                  autoFocus
                  {...form.register('reason')}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={Boolean(refund)}
                  onCheckedChange={(v) => form.setValue('refund', v)}
                  aria-label={p.cancelRefund}
                />
                {p.cancelRefund} ({formatMoney(amount)})
              </label>
            </fieldset>
          </DialogBody>
          <ConfirmingFooter
            confirming={confirming}
            setConfirming={setConfirming}
            question={
              refund ? `${p.cancelTitle} ${p.refundConfirm(formatMoney(amount))}` : p.cancelTitle
            }
            submitLabel={p.cancelConfirm}
            busy={cancel.isPending}
            danger
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────── Refund ─────────────

const refundForm = refundBody.omit({ amountInPaise: true }).extend({ amount: z.string() });
type RefundValues = z.input<typeof refundForm>;

export function RefundDialog({
  open,
  onOpenChange,
  orderId,
  payments,
  isSuperAdmin,
}: DialogProps & { orderId: string; payments: PaymentDto[]; isSuperAdmin: boolean }) {
  const refund = useRefund(orderId);
  const [confirming, setConfirming] = React.useState(false);
  const refundable = payments
    .filter((x) => x.status === 'CAPTURED' || x.status === 'PARTIALLY_REFUNDED')
    .reduce((sum, x) => sum + (x.amountInPaise - x.refundedInPaise), 0);
  const limit = isSuperAdmin ? Infinity : SUPPORT_REFUND_LIMIT_IN_PAISE;
  const form = useForm<RefundValues>({
    resolver: zodResolver(refundForm),
    defaultValues: { amount: '', reason: '' },
  });
  const { errors } = form.formState;
  const amountText = form.watch('amount'); // eslint-disable-line react-hooks/incompatible-library -- small dialog
  const amountPaise = rupeesInputToPaise(amountText);

  const onSubmit = form.handleSubmit(async (v) => {
    const amountInPaise = rupeesInputToPaise(v.amount);
    const parsed = refundBody.safeParse({ amountInPaise, reason: v.reason });
    if (!parsed.success || amountInPaise === null)
      return form.setError('amount', { message: strings.common.moneyInvalid });
    if (amountInPaise > refundable)
      return form.setError('amount', { message: p.refundable(formatMoney(refundable)) });
    if (amountInPaise > limit)
      return form.setError('amount', {
        message: p.refundOverLimit(formatMoney(SUPPORT_REFUND_LIMIT_IN_PAISE)),
      });
    if (!confirming) return setConfirming(true);
    await refund.mutateAsync(parsed.data);
    toast.success(p.refunded);
    form.reset();
    setConfirming(false);
    onOpenChange(false);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setConfirming(false);
        onOpenChange(o);
      }}
    >
      <DialogContent size="sm">
        <form
          noValidate
          onSubmit={(e) => void onSubmit(e).catch(() => undefined)}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader>
            <DialogTitle>{p.refundTitle}</DialogTitle>
            <DialogDescription>{p.refundDescription}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <fieldset disabled={confirming} className="space-y-4">
              <p className="text-sm text-neutral-700">{p.refundable(formatMoney(refundable))}</p>
              {!isSuperAdmin ? (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {p.refundLimit(formatMoney(SUPPORT_REFUND_LIMIT_IN_PAISE))}
                </p>
              ) : null}
              <Field label={p.refundAmount} htmlFor="refund-amount" error={errors.amount?.message}>
                <MoneyInput
                  id="refund-amount"
                  autoFocus
                  aria-invalid={Boolean(errors.amount)}
                  {...form.register('amount')}
                />
              </Field>
              <Field label={p.refundReason} htmlFor="refund-reason" error={errors.reason?.message}>
                <Textarea
                  id="refund-reason"
                  rows={3}
                  maxLength={300}
                  {...form.register('reason')}
                />
              </Field>
            </fieldset>
          </DialogBody>
          <ConfirmingFooter
            confirming={confirming}
            setConfirming={setConfirming}
            question={p.refundConfirm(formatMoney(amountPaise ?? 0))}
            submitLabel={p.refundTitle}
            busy={refund.isPending}
            disabled={refundable === 0}
            danger
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
