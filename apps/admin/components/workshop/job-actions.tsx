'use client';

import {
  STITCHING_PROBLEM_TYPES,
  type ProductionStage,
  type StitchingProblemType,
  type WorkshopAction,
  type WorkshopItemDetail,
} from '@abaya/contracts';
import {
  Camera,
  CircleAlert,
  CircleHelp,
  ClipboardCheck,
  Hand,
  Play,
  Scissors,
  Truck,
  Undo2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PhotoPicker } from '@/components/orders/photo-picker';
import { QcDialog } from '@/components/orders/production-dialogs';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { strings } from '@/content/strings';
import { useShipItems } from '@/lib/queries/orders';
import {
  useAdvanceJob,
  useClaimJob,
  useHoldJob,
  useRefreshWorkshop,
  useReleaseJob,
  useResumeJob,
} from '@/lib/queries/workshop';

const w = strings.workshop;
const p = strings.production;
const st = w.stitching;

type Open =
  | { kind: 'step'; action: WorkshopAction }
  | { kind: 'hold' }
  | { kind: 'resume'; to: ProductionStage | null }
  | { kind: 'qc' }
  | { kind: 'ship' }
  | null;

const advanceLabel = (to: ProductionStage | null) => (to ? (w.actions.advance[to] ?? to) : '');

/** The station's buttons for this job (only what the API says this person may do now). */
export function JobActions({ item, backHref }: { item: WorkshopItemDetail; backHref: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState<Open>(null);
  const claim = useClaimJob(item.id);
  const release = useReleaseJob(item.id);
  const refresh = useRefreshWorkshop();
  const close = () => setOpen(null);

  if (item.actions.length === 0) return <p className="text-sm text-muted">{w.noActions}</p>;

  // At the pattern table, "send to cutting" lives in the pattern form (it saves and checks the pattern first).
  // Same at cutting: "Cutting done" is the cutting form (lot, metres, pieces, photo), and at
  // stitching: "Stitching done" is the checklist and self-check form.
  const formStep: Partial<Record<ProductionStage, ProductionStage>> = {
    PATTERN: 'CUTTING',
    CUTTING: 'STITCHING',
    STITCHING: 'QC',
  };
  const actions = item.actions.filter(
    (a) => !(a.kind === 'advance' && formStep[item.stage] === a.to),
  );
  const atStitching = item.stage === 'STITCHING';
  // The main step is the big button; taking/giving back and questions are secondary.
  const main = actions.find((a) => ['advance', 'qc', 'ship', 'deliver', 'resume'].includes(a.kind));
  const others = actions.filter((a) => a !== main);

  function press(action: WorkshopAction) {
    if (action.kind === 'claim')
      return void claim
        .mutateAsync()
        .then(() =>
          toast.success(
            item.assignedTo || item.stage === 'STITCHING' ? w.done.started : w.done.claim,
          ),
        )
        .catch(() => undefined);
    if (action.kind === 'release')
      return void release
        .mutateAsync()
        .then(() => toast.success(w.done.release))
        .catch(() => undefined);
    if (action.kind === 'hold') return setOpen({ kind: 'hold' });
    if (action.kind === 'resume') return setOpen({ kind: 'resume', to: action.to });
    if (action.kind === 'qc') return setOpen({ kind: 'qc' });
    if (action.kind === 'ship') return setOpen({ kind: 'ship' });
    return setOpen({ kind: 'step', action });
  }

  // A stitching problem offers two ways on: carry on, or re-cut.
  const recut = (a: WorkshopAction) =>
    a.kind === 'resume' && a.to === 'CUTTING' && item.heldFromStage === 'STITCHING';
  const labelFor = (a: WorkshopAction) =>
    a.kind === 'advance' || a.kind === 'deliver'
      ? advanceLabel(a.to)
      : a.kind === 'claim' && (atStitching || item.assignedTo)
        ? atStitching
          ? w.actions.startStitching
          : (w.start[item.station ?? ''] ?? w.actions.claim)
        : a.kind === 'hold'
          ? atStitching
            ? w.actions.reportProblem
            : w.actions.hold
          : recut(a)
            ? st.recut
            : a.kind === 'resume' && item.heldFromStage === 'STITCHING'
              ? st.carryOn
              : w.actions[a.kind];
  const iconFor = (a: WorkshopAction) =>
    a.kind === 'claim'
      ? atStitching || item.assignedTo
        ? Play
        : Hand
      : a.kind === 'release'
        ? Undo2
        : a.kind === 'hold'
          ? atStitching
            ? CircleAlert
            : CircleHelp
          : recut(a)
            ? Scissors
            : a.kind === 'qc'
              ? ClipboardCheck
              : a.kind === 'ship'
                ? Truck
                : a.photoRequired
                  ? Camera
                  : Play;

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {main ? (
          <Button size="lg" className="h-12 w-full text-base sm:w-auto" onClick={() => press(main)}>
            {React.createElement(iconFor(main), { 'aria-hidden': true })} {labelFor(main)}
          </Button>
        ) : null}
        {others.map((a) => (
          <Button
            key={`${a.kind}-${a.to ?? ''}`}
            size="lg"
            variant={a.kind === 'claim' && !main ? 'primary' : 'secondary'}
            className="h-12 w-full sm:w-auto"
            loading={
              (a.kind === 'claim' && claim.isPending) || (a.kind === 'release' && release.isPending)
            }
            onClick={() => press(a)}
          >
            {React.createElement(iconFor(a), { 'aria-hidden': true })} {labelFor(a)}
          </Button>
        ))}
      </div>

      {open?.kind === 'step' ? (
        <StepDialog
          item={item}
          action={open.action}
          onClose={close}
          onMovedOn={() => {
            toast.success(w.done.advance);
            router.push(backHref);
          }}
        />
      ) : null}
      {open?.kind === 'hold' ? (
        atStitching ? (
          <ProblemDialog itemId={item.id} onClose={close} />
        ) : (
          <HoldDialog itemId={item.id} onClose={close} />
        )
      ) : null}
      {open?.kind === 'resume' ? (
        <ResumeDialog
          itemId={item.id}
          to={open.to}
          fromStitching={item.heldFromStage === 'STITCHING'}
          onClose={close}
          onMovedOn={() => router.push(backHref)}
        />
      ) : null}
      {open?.kind === 'qc' ? (
        <QcDialog
          open
          onOpenChange={(o) => !o && close()}
          orderId={item.orderId}
          itemId={item.id}
          uploadVia="workshop"
          onDone={() => {
            refresh();
            router.push(backHref);
          }}
        />
      ) : null}
      {open?.kind === 'ship' ? (
        <ShipDialog
          item={item}
          onClose={close}
          onDone={() => {
            refresh();
            toast.success(w.done.shipped);
          }}
        />
      ) : null}
    </>
  );
}

/** Finish the station's step: a photo where the work must be shown, and an optional note. */
function StepDialog({
  item,
  action,
  onClose,
  onMovedOn,
}: {
  item: WorkshopItemDetail;
  action: WorkshopAction;
  onClose: () => void;
  onMovedOn: () => void;
}) {
  const advance = useAdvanceJob(item.id);
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (action.photoRequired && !photo) return setError(p.photoRequired);
    const result = await advance.mutateAsync({
      to: action.to!,
      note: note.trim() || undefined,
      photoPath: photo ?? undefined,
    });
    onClose();
    if (result.item === null) onMovedOn();
    else toast.success(w.done.advance);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <form
          onSubmit={(e) => void submit(e).catch(() => undefined)}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader>
            <DialogTitle>{advanceLabel(action.to)}</DialogTitle>
            <DialogDescription>
              {item.designName} · <span className="font-mono">{item.orderNumber}</span>
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {action.photoRequired ? (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">{w.photoLabel}</p>
                <p className="text-xs text-muted">{w.photoHint}</p>
                <PhotoPicker
                  purpose="STAGE_PHOTO"
                  via="workshop"
                  onChange={(paths) => {
                    setPhoto(paths[0] ?? null);
                    setError(null);
                  }}
                  onBusyChange={setUploading}
                />
              </div>
            ) : null}
            <Field label={w.noteLabel} htmlFor="step-note" optional>
              <Textarea
                id="step-note"
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
            <Button variant="secondary" onClick={onClose}>
              {strings.common.cancel}
            </Button>
            <Button type="submit" loading={advance.isPending} disabled={uploading}>
              {advanceLabel(action.to)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HoldDialog({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const hold = useHoldJob(itemId);
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={w.holdTitle}
      description={w.holdBody}
      confirmLabel={w.actions.hold}
      onConfirm={async () => {
        if (reason.trim().length < 3) {
          setError(w.holdReasonRequired);
          return false;
        }
        await hold.mutateAsync({ reason: reason.trim() });
        toast.success(w.done.hold);
      }}
    >
      <Field label={w.holdReason} htmlFor="hold-reason" error={error ?? undefined}>
        <Textarea
          id="hold-reason"
          rows={3}
          maxLength={500}
          autoFocus
          value={reason}
          aria-invalid={Boolean(error)}
          onChange={(e) => {
            setReason(e.target.value);
            setError(null);
          }}
        />
      </Field>
    </ConfirmDialog>
  );
}

/** At stitching: what is wrong with the cut kit, with a photo; the production manager decides. */
function ProblemDialog({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const hold = useHoldJob(itemId);
  const [type, setType] = React.useState<StitchingProblemType>('MISSING_PIECE');
  const [reason, setReason] = React.useState('');
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={st.problemTitle}
      description={st.problemBody}
      confirmLabel={w.actions.reportProblem}
      confirmDisabled={uploading}
      onConfirm={async () => {
        if (reason.trim().length < 3) {
          setError(w.holdReasonRequired);
          return false;
        }
        await hold.mutateAsync({
          reason: reason.trim(),
          problemType: type,
          photoPath: photo ?? undefined,
        });
        toast.success(st.problemSent);
      }}
    >
      <Field label={st.problemType} htmlFor="problem-type">
        <NativeSelect
          id="problem-type"
          value={type}
          onChange={(e) => setType(e.target.value as StitchingProblemType)}
        >
          {STITCHING_PROBLEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {st.problemTypes[t]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={st.problemDetails} htmlFor="problem-reason" error={error ?? undefined}>
        <Textarea
          id="problem-reason"
          rows={3}
          maxLength={500}
          value={reason}
          aria-invalid={Boolean(error)}
          onChange={(e) => {
            setReason(e.target.value);
            setError(null);
          }}
        />
      </Field>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">
          {st.problemPhoto}{' '}
          <span className="font-normal text-muted">({strings.common.optional})</span>
        </p>
        <PhotoPicker
          purpose="STAGE_PHOTO"
          via="workshop"
          onChange={(paths) => setPhoto(paths[0] ?? null)}
          onBusyChange={setUploading}
        />
      </div>
    </ConfirmDialog>
  );
}

function ResumeDialog({
  itemId,
  to,
  fromStitching,
  onClose,
  onMovedOn,
}: {
  itemId: string;
  to: ProductionStage | null;
  fromStitching: boolean;
  onClose: () => void;
  onMovedOn: () => void;
}) {
  const resume = useResumeJob(itemId);
  const [note, setNote] = React.useState('');
  const recut = fromStitching && to === 'CUTTING';
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={recut ? st.recut : fromStitching ? st.carryOn : w.resumeTitle}
      description={recut ? st.recutBody : fromStitching ? st.carryOnBody : w.resumeBody}
      confirmLabel={recut ? st.recut : fromStitching ? st.carryOn : w.actions.resume}
      onConfirm={async () => {
        await resume.mutateAsync({ note: note.trim() || undefined, to: to ?? undefined });
        toast.success(w.done.resume);
        if (recut) onMovedOn();
      }}
    >
      <Field label={w.noteLabel} htmlFor="resume-note" optional>
        <Textarea
          id="resume-note"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
    </ConfirmDialog>
  );
}

/** Logistics: courier and tracking number for this parcel. */
function ShipDialog({
  item,
  onClose,
  onDone,
}: {
  item: WorkshopItemDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const ship = useShipItems(item.orderId);
  const [carrier, setCarrier] = React.useState('');
  const [tracking, setTracking] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!carrier.trim() || !tracking.trim()) return setError(`${p.carrier} · ${p.trackingNumber}`);
    if (url && !/^https?:\/\//.test(url)) return setError(p.trackingUrl);
    await ship.mutateAsync({
      orderItemIds: [item.id],
      carrier: carrier.trim(),
      trackingNumber: tracking.trim(),
      trackingUrl: url || undefined,
    });
    onClose();
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <form
          noValidate
          onSubmit={(e) => void submit(e).catch(() => undefined)}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader>
            <DialogTitle>{w.shipTitle}</DialogTitle>
            <DialogDescription>{w.shipBody}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={p.carrier} htmlFor="ws-carrier">
                <Input
                  id="ws-carrier"
                  placeholder="Delhivery"
                  autoFocus
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                />
              </Field>
              <Field label={p.trackingNumber} htmlFor="ws-awb">
                <Input
                  id="ws-awb"
                  className="font-mono"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                />
              </Field>
            </div>
            <Field label={p.trackingUrl} htmlFor="ws-url" optional>
              <Input
                id="ws-url"
                type="url"
                placeholder="https://"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              {strings.common.cancel}
            </Button>
            <Button type="submit" loading={ship.isPending}>
              <Truck /> {w.actions.ship}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
