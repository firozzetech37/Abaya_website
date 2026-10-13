'use client';

import { type MakerDto, updateMakerBody } from '@abaya/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { MailPlus, Pencil, Wallet } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, ForbiddenState, TableSkeleton } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { strings } from '@/content/strings';
import { useCurrentUser } from '@/lib/current-user';
import { formatDate, formatMoney } from '@/lib/format';
import {
  type MakerPayoutDto,
  useMakerPayouts,
  useMakers,
  useMarkPayoutPaid,
  useUpdateMaker,
} from '@/lib/queries/makers';
import { parseTags, tagsToText } from '@/lib/tags';
import { cn } from '@/lib/utils';

const m = strings.makers;

// The login email is set in Staff & roles; here only the tailor's details change.
// Phone is optional (typed as text, may be empty).
const formSchema = updateMakerBody
  .omit({ skills: true, phone: true })
  .required({ name: true, city: true, capacityPerWeek: true, isActive: true })
  .extend({ skillsText: z.string().max(1000), phone: z.string().max(20) });
type FormValues = z.input<typeof formSchema>;

function MakerDialog({
  maker,
  onOpenChange,
}: {
  maker: MakerDto;
  onOpenChange: (o: boolean) => void;
}) {
  const update = useUpdateMaker();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: maker.name,
      phone: maker.phone ?? '',
      city: maker.city,
      skillsText: tagsToText(maker.skills),
      capacityPerWeek: maker.capacityPerWeek,
      isActive: maker.isActive,
    },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async ({ skillsText, phone, ...v }) => {
    const parsed = updateMakerBody.safeParse({
      ...v,
      phone: phone.trim() || null,
      skills: parseTags(skillsText),
    });
    if (!parsed.success) {
      form.setError('phone', { message: parsed.error.issues[0]?.message });
      return;
    }
    const body = parsed.data;
    await update.mutateAsync({ id: maker.id, body });
    toast.success(m.saved);
    onOpenChange(false);
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form
          noValidate
          onSubmit={(e) => void onSubmit(e).catch(() => undefined)}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader>
            <DialogTitle>{m.editTitle}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Field label={m.name} htmlFor="mk-name" error={errors.name?.message}>
              <Input id="mk-name" autoFocus {...form.register('name')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={m.phone} htmlFor="mk-phone" optional error={errors.phone?.message}>
                <Input
                  id="mk-phone"
                  type="tel"
                  inputMode="tel"
                  placeholder="+91"
                  {...form.register('phone')}
                />
              </Field>
              <Field label={m.city} htmlFor="mk-city" error={errors.city?.message}>
                <Input id="mk-city" {...form.register('city')} />
              </Field>
            </div>
            {maker.email ? <p className="text-xs text-muted">{maker.email}</p> : null}
            <Field label={m.skills} htmlFor="mk-skills" hint={m.skillsHint} optional>
              <Input id="mk-skills" {...form.register('skillsText')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={m.capacity} htmlFor="mk-cap" error={errors.capacityPerWeek?.message}>
                <Input
                  id="mk-cap"
                  type="number"
                  min={1}
                  max={200}
                  {...form.register('capacityPerWeek', { valueAsNumber: true })}
                />
              </Field>
              <div className="flex items-end pb-2">
                <Controller
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={Boolean(field.value)}
                        onCheckedChange={field.onChange}
                        aria-label={m.activeLabel}
                      />
                      {m.activeLabel}
                    </label>
                  )}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {strings.common.cancel}
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {strings.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayoutsDialog({
  maker,
  onOpenChange,
}: {
  maker: MakerDto;
  onOpenChange: (o: boolean) => void;
}) {
  const payouts = useMakerPayouts(maker.id);
  const markPaid = useMarkPayoutPaid(maker.id);
  const [paying, setPaying] = React.useState<MakerPayoutDto | null>(null);
  const [reference, setReference] = React.useState('');
  const [refError, setRefError] = React.useState<string | null>(null);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{m.payoutsTitle(maker.name)}</DialogTitle>
        </DialogHeader>
        <DialogBody className="p-0">
          {payouts.isPending ? (
            <TableSkeleton rows={4} cols={4} />
          ) : payouts.isError ? (
            <ErrorState error={payouts.error} onRetry={() => void payouts.refetch()} />
          ) : payouts.data.length === 0 ? (
            <EmptyState title={m.noPayouts} />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{strings.audit.colWhen}</TH>
                  <TH className="text-right">{strings.order.total}</TH>
                  <TH>{m.colStatus}</TH>
                  <TH>{m.reference}</TH>
                  <TH>
                    <span className="sr-only">{m.markPaid}</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {payouts.data.map((p) => (
                  <TR key={p.id}>
                    <TD className="text-xs text-muted">{formatDate(p.createdAt)}</TD>
                    <TD className="text-right tabular-nums">{formatMoney(p.amountInPaise)}</TD>
                    <TD>
                      <Badge tone={p.status === 'PAID' ? 'success' : 'warning'}>
                        {m.payoutStatus[p.status]}
                      </Badge>
                    </TD>
                    <TD className="font-mono text-xs">
                      {p.reference ?? '—'}
                      {p.paidAt ? (
                        <span className="ml-1 text-muted">({formatDate(p.paidAt)})</span>
                      ) : null}
                    </TD>
                    <TD className="text-right">
                      {p.status === 'PENDING' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setReference('');
                            setRefError(null);
                            setPaying(p);
                          }}
                        >
                          {m.markPaid}
                        </Button>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </DialogBody>
        <ConfirmDialog
          open={Boolean(paying)}
          onOpenChange={(o) => !o && setPaying(null)}
          title={m.markPaidTitle}
          description={paying ? m.markPaidBody(formatMoney(paying.amountInPaise)) : undefined}
          confirmLabel={m.markPaid}
          onConfirm={async () => {
            if (!paying) return;
            if (reference.trim().length < 3) {
              setRefError(m.reference);
              return false;
            }
            await markPaid.mutateAsync({ payoutId: paying.id, reference: reference.trim() });
            toast.success(m.paid);
          }}
        >
          <Field label={m.reference} htmlFor="payout-ref" error={refError ?? undefined}>
            <Input
              id="payout-ref"
              autoFocus
              className="font-mono"
              maxLength={100}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
        </ConfirmDialog>
      </DialogContent>
    </Dialog>
  );
}

export default function TailorsPage() {
  const me = useCurrentUser();
  const makers = useMakers(me.can('manageMakers'));
  const [editing, setEditing] = React.useState<MakerDto | null>(null);
  const [payoutsFor, setPayoutsFor] = React.useState<MakerDto | null>(null);

  if (!me.can('manageMakers')) return <ForbiddenState />;

  return (
    <>
      <PageHeader
        title={m.title}
        subtitle={m.subtitle}
        actions={
          me.can('manageStaff') ? (
            <Button asChild>
              <Link href="/staff">
                <MailPlus /> {m.addInStaff}
              </Link>
            </Button>
          ) : null
        }
      />
      <Card>
        {makers.isPending ? (
          <TableSkeleton />
        ) : makers.isError ? (
          <ErrorState error={makers.error} onRetry={() => void makers.refetch()} />
        ) : makers.data.length === 0 ? (
          <EmptyState title={m.empty} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{m.colMaker}</TH>
                <TH>{m.colCapacity}</TH>
                <TH className="text-right">{m.colPending}</TH>
                <TH className="hidden md:table-cell text-right">{m.colRating}</TH>
                <TH>{m.colStatus}</TH>
                <TH>
                  <span className="sr-only">{strings.common.edit}</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {makers.data.map((mk) => {
                const load = mk.capacityPerWeek > 0 ? mk.activeItemCount / mk.capacityPerWeek : 0;
                return (
                  <TR key={mk.id} className="hover:bg-neutral-50">
                    <TD>
                      <p className="font-medium">{mk.name}</p>
                      <p className="text-xs text-muted">
                        {[mk.city, mk.phone].filter(Boolean).join(' · ')}
                        {mk.email ? ` · ${mk.email}` : ''}
                      </p>
                      {mk.skills.length ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {mk.skills.map((s) => (
                            <Badge key={s}>{s}</Badge>
                          ))}
                        </div>
                      ) : null}
                    </TD>
                    <TD className="min-w-[140px]">
                      <div className="flex items-center justify-between text-xs">
                        <span className="tabular-nums">
                          {mk.activeItemCount} / {mk.capacityPerWeek}
                        </span>
                        {load >= 1 ? <span className="text-danger">{m.overCapacity}</span> : null}
                      </div>
                      <div
                        className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100"
                        aria-hidden
                      >
                        <div
                          className={cn(
                            'h-full rounded-full',
                            load >= 1
                              ? 'bg-danger'
                              : load >= 0.8
                                ? 'bg-amber-500'
                                : 'bg-accent-500',
                          )}
                          style={{ width: `${Math.min(100, load * 100)}%` }}
                        />
                      </div>
                    </TD>
                    <TD className="text-right tabular-nums">
                      {formatMoney(mk.pendingPayoutInPaise)}
                    </TD>
                    <TD className="hidden text-right tabular-nums md:table-cell">
                      {mk.rating.toFixed(1)}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={mk.isActive ? 'success' : 'neutral'}>
                          {mk.isActive ? strings.common.active : strings.common.inactive}
                        </Badge>
                        <Badge tone={mk.hasLogin ? 'info' : 'neutral'}>
                          {mk.hasLogin ? m.signedIn : m.notSignedIn}
                        </Badge>
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap text-right">
                      <Button variant="ghost" size="sm" onClick={() => setPayoutsFor(mk)}>
                        <Wallet /> {m.payouts}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(mk)}>
                        <Pencil /> {strings.common.edit}
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      {editing ? (
        <MakerDialog maker={editing} onOpenChange={(o) => !o && setEditing(null)} />
      ) : null}
      {payoutsFor ? (
        <PayoutsDialog maker={payoutsFor} onOpenChange={(o) => !o && setPayoutsFor(null)} />
      ) : null}
    </>
  );
}
