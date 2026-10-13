'use client';

import { type AdminOrderItemDto, type TechPackContent, techPackContent } from '@abaya/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Printer, Trash2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { MEASUREMENT_LABELS, strings } from '@/content/strings';
import { formatDateTime } from '@/lib/format';
import { useSaveTechPack, useTechPack } from '@/lib/queries/orders';

const p = strings.production;

const textSchema = techPackContent.omit({ measurements: true, referenceImagePaths: true });
type TextValues = z.input<typeof textSchema>;

interface Row {
  key: string;
  name: string;
  value: string;
}

const toRows = (m: Record<string, number>): Row[] =>
  Object.entries(m).map(([name, value], i) => ({
    key: `${i}-${name}`,
    name,
    value: String(value),
  }));

function TechPackForm({
  orderId,
  itemId,
  initial,
  readOnly,
  teamReady,
  onDone,
}: {
  orderId: string;
  itemId: string;
  initial: TechPackContent;
  readOnly: boolean;
  /** Approval starts production: the workshop team must be complete first. */
  teamReady: boolean;
  onDone: () => void;
}) {
  const save = useSaveTechPack(orderId, itemId);
  const [rows, setRows] = React.useState<Row[]>(() => toRows(initial.measurements));
  const [rowError, setRowError] = React.useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = React.useState(false);
  const form = useForm<TextValues>({
    resolver: zodResolver(textSchema),
    defaultValues: {
      style: initial.style,
      fabric: initial.fabric,
      colour: initial.colour,
      patternColour: initial.patternColour,
      sleeve: initial.sleeve,
      closure: initial.closure,
      embellishments: initial.embellishments,
      addOns: initial.addOns,
      constructionNotes: initial.constructionNotes,
    },
  });
  const { errors } = form.formState;

  function buildMeasurements(): Record<string, number> | null {
    const out: Record<string, number> = {};
    for (const r of rows) {
      const name = r.name.trim();
      const n = Number(r.value);
      if (!name && r.value === '') continue;
      if (!name || !Number.isFinite(n) || n < 0 || n > 300) return null;
      out[name] = Math.round(n * 10) / 10;
    }
    return out;
  }

  const submit = (approve: boolean) =>
    form.handleSubmit(async (v) => {
      const measurements = buildMeasurements();
      if (!measurements) {
        setRowError(p.measurementRowError);
        return;
      }
      if (approve && !confirmApprove) {
        setConfirmApprove(true);
        return;
      }
      const content = techPackContent.parse({
        ...v,
        measurements,
        referenceImagePaths: initial.referenceImagePaths,
      });
      await save.mutateAsync({ content, approve });
      toast.success(approve ? p.approved : p.draftSaved);
      if (approve) onDone();
    });

  const field = (name: keyof TextValues, label: string, multiline = false) => (
    <Field label={label} htmlFor={`tp-${name}`} error={errors[name]?.message}>
      {multiline ? (
        <Textarea
          id={`tp-${name}`}
          rows={name === 'constructionNotes' ? 5 : 2}
          {...form.register(name)}
        />
      ) : (
        <Input id={`tp-${name}`} {...form.register(name)} />
      )}
    </Field>
  );

  return (
    <form noValidate onSubmit={(e) => e.preventDefault()} className="flex min-h-0 flex-col">
      <DialogBody>
        <fieldset disabled={readOnly || save.isPending} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {field('style', p.style)}
            {field('fabric', p.fabric)}
            {field('colour', p.colour)}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {field('patternColour', p.patternColour)}
            {field('sleeve', p.sleeve)}
            {field('closure', p.closure)}
            {field('embellishments', p.embellishments, true)}
            {field('addOns', p.addOns, true)}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">{p.measurementsCm}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {rows.map((r, i) => (
                <div key={r.key} className="flex items-center gap-2">
                  <Input
                    aria-label={`${p.measurementName} ${i + 1}`}
                    value={r.name}
                    onChange={(e) =>
                      setRows(
                        rows.map((x) => (x.key === r.key ? { ...x, name: e.target.value } : x)),
                      )
                    }
                    className="h-8 flex-1 font-mono text-xs"
                    title={MEASUREMENT_LABELS[r.name] ?? r.name}
                  />
                  <Input
                    aria-label={`${MEASUREMENT_LABELS[r.name] ?? r.name} (cm)`}
                    inputMode="decimal"
                    value={r.value}
                    onChange={(e) => {
                      setRowError(null);
                      setRows(
                        rows.map((x) => (x.key === r.key ? { ...x, value: e.target.value } : x)),
                      );
                    }}
                    className="h-8 w-24 text-right tabular-nums"
                  />
                  {!readOnly ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={strings.common.remove}
                      onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            {!readOnly ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setRows([...rows, { key: `new-${Date.now()}`, name: '', value: '' }])
                }
              >
                <Plus /> {p.addMeasurement}
              </Button>
            ) : null}
            {rowError ? (
              <p role="alert" className="text-xs text-danger">
                {rowError}
              </p>
            ) : null}
          </div>
          {field('constructionNotes', p.constructionNotes, true)}
        </fieldset>
      </DialogBody>
      {!readOnly ? (
        confirmApprove ? (
          <DialogFooter className="items-center sm:justify-between">
            <p className="text-sm font-medium" role="alert">
              {p.approveBody}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setConfirmApprove(false)}>
                {strings.common.back}
              </Button>
              <Button
                onClick={() => void submit(true)().catch(() => undefined)}
                loading={save.isPending}
              >
                {p.approve}
              </Button>
            </div>
          </DialogFooter>
        ) : (
          <DialogFooter className="items-center">
            {!teamReady ? (
              <p className="mr-auto text-xs text-amber-800">{p.team.approveNeedsTeam}</p>
            ) : null}
            <Button
              variant="secondary"
              onClick={() => void submit(false)().catch(() => undefined)}
              loading={save.isPending && !save.variables?.approve}
            >
              {p.saveDraft}
            </Button>
            <Button
              disabled={!teamReady}
              onClick={() => void submit(true)().catch(() => undefined)}
            >
              {p.approve}
            </Button>
          </DialogFooter>
        )
      ) : null}
    </form>
  );
}

export function TechPackDialog({
  open,
  onOpenChange,
  orderId,
  item,
  teamReady,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orderId: string;
  item: AdminOrderItemDto;
  teamReady: boolean;
}) {
  const query = useTechPack(item.id, open);
  const saved = query.data?.saved ?? null;
  const approved = saved?.status === 'APPROVED';
  const readOnly = approved || item.stage !== 'PLACED';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {p.techPackTitle} · {item.design.name}
            {saved ? (
              <Badge tone={approved ? 'success' : 'warning'}>
                {approved
                  ? strings.order.techPackApproved(
                      saved.approvedBy?.name ?? '—',
                      formatDateTime(saved.approvedAt),
                    )
                  : strings.order.techPackDraft}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{p.techPackDescription}</span>
            <Link
              href={`/orders/${orderId}/items/${item.id}/tech-pack/print`}
              target="_blank"
              className="inline-flex items-center gap-1 text-xs font-medium text-accent-700 hover:underline"
            >
              <Printer className="size-3.5" aria-hidden /> {p.printable}
            </Link>
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-32" />
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <TechPackForm
            key={saved?.updatedAt ?? 'draft'}
            orderId={orderId}
            itemId={item.id}
            initial={saved?.content ?? query.data.draft}
            readOnly={readOnly}
            teamReady={teamReady}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
