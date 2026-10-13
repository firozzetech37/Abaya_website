'use client';

import {
  FABRIC_OVERUSE_THRESHOLD,
  fabricVariancePercent,
  isFabricOveruse,
  missingForStitching,
  type WorkshopItemDetail,
} from '@abaya/contracts';
import { CheckCircle2, CircleAlert, Scissors } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { PhotoPicker } from '@/components/orders/photo-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { strings } from '@/content/strings';
import { useCompleteCutting } from '@/lib/queries/workshop';
import { cn } from '@/lib/utils';
import { metres } from './pattern-view';

const ct = strings.workshop.cutting;
const LIMIT = Math.round(FABRIC_OVERUSE_THRESHOLD * 100);

/** Metres typed by the cutter → whole centimetres (null while empty). */
const toCm = (value: string) =>
  value.trim() === '' ? null : Math.round(Number(value) * 100) || null;

/**
 * The cutter's "Cutting done" form: lot, colour check, metres against the pattern's
 * estimate, every pattern piece ticked, the cut-pieces photo and notes for the tailor.
 */
export function CuttingForm({ item }: { item: WorkshopItemDetail }) {
  const router = useRouter();
  const complete = useCompleteCutting(item.id);
  const pattern = item.pattern;
  const canCut = item.actions.some((a) => a.kind === 'advance' && a.to === 'STITCHING');
  const [lot, setLot] = React.useState('');
  const [colourOk, setColourOk] = React.useState(false);
  const [used, setUsed] = React.useState('');
  const [wastage, setWastage] = React.useState('');
  const [lining, setLining] = React.useState('');
  const [cut, setCut] = React.useState<Set<string>>(new Set());
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [notes, setNotes] = React.useState('');

  if (!canCut)
    return (
      <p className="rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-700">{ct.takeHint}</p>
    );
  if (!pattern)
    return (
      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{ct.noPattern}</p>
    );

  const colour =
    item.techPack?.colour ||
    item.options.find((o) => /colou?r/i.test(o.groupName))?.valueName ||
    null;
  const usedCm = toCm(used);
  const variance = usedCm ? fabricVariancePercent(usedCm, pattern.fabricLengthCm) : null;
  const overuse = usedCm ? isFabricOveruse(usedCm, pattern.fabricLengthCm) : false;
  const body = {
    fabricLot: lot,
    colourConfirmed: colourOk,
    fabricUsedCm: usedCm ?? 0,
    wastageCm: toCm(wastage),
    liningUsedCm: pattern.liningLengthCm ? toCm(lining) : null,
    pieces: pattern.pieces.map((p) => ({ ...p, cut: cut.has(p.name) })),
    notes,
    photoPath: photo,
  };
  const missing = missingForStitching(body, pattern);

  async function submit() {
    const result = await complete.mutateAsync({ ...body, photoPath: photo! });
    toast.success(ct.sent);
    if (result.item === null) router.push('/workshop/cutting');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scissors className="size-4 text-accent-700" aria-hidden /> {ct.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={ct.lot} htmlFor="cut-lot">
            <Input
              id="cut-lot"
              className="font-mono"
              placeholder={ct.lotPlaceholder}
              maxLength={60}
              value={lot}
              onChange={(e) => setLot(e.target.value)}
            />
          </Field>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2.5 sm:mt-6">
            <Checkbox
              className="mt-0.5"
              checked={colourOk}
              onCheckedChange={(v) => setColourOk(v === true)}
            />
            <span className="text-sm">{colour ? ct.colour(colour) : ct.colourUnknown}</span>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={ct.used} htmlFor="cut-used">
            <Input
              id="cut-used"
              type="number"
              step={0.05}
              min={0}
              inputMode="decimal"
              className="tabular-nums"
              value={used}
              onChange={(e) => setUsed(e.target.value)}
            />
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              {pattern.fabricLengthCm ? ct.estimate(metres(pattern.fabricLengthCm)) : null}
              {variance !== null ? (
                <Badge tone={overuse ? 'warning' : 'neutral'}>{ct.variance(variance)}</Badge>
              ) : null}
            </p>
          </Field>
          <Field label={ct.wastage} htmlFor="cut-wastage" optional>
            <Input
              id="cut-wastage"
              type="number"
              step={0.05}
              min={0}
              inputMode="decimal"
              className="tabular-nums"
              value={wastage}
              onChange={(e) => setWastage(e.target.value)}
            />
          </Field>
          {pattern.liningLengthCm ? (
            <Field label={ct.lining} htmlFor="cut-lining" optional>
              <Input
                id="cut-lining"
                type="number"
                step={0.05}
                min={0}
                inputMode="decimal"
                className="tabular-nums"
                value={lining}
                onChange={(e) => setLining(e.target.value)}
              />
            </Field>
          ) : null}
        </div>
        {overuse ? (
          <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {ct.overuse(LIMIT)}
          </p>
        ) : null}

        <fieldset>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <legend className="text-sm font-medium">{ct.pieces}</legend>
            <button
              type="button"
              className="text-xs font-medium text-accent-700 hover:underline"
              onClick={() => setCut(new Set(pattern.pieces.map((p) => p.name)))}
            >
              {ct.tickAll}
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {pattern.pieces.map((p) => {
              const on = cut.has(p.name);
              return (
                <label
                  key={p.name}
                  className={cn(
                    'flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm',
                    on ? 'border-accent-300 bg-accent-50' : 'border-border',
                  )}
                >
                  <Checkbox
                    checked={on}
                    onCheckedChange={(v) =>
                      setCut((s) => {
                        const next = new Set(s);
                        if (v) next.add(p.name);
                        else next.delete(p.name);
                        return next;
                      })
                    }
                  />
                  <span className="flex-1">{p.name}</span>
                  <span className="tabular-nums text-muted">×{p.count}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">{ct.photo}</p>
          <PhotoPicker
            purpose="STAGE_PHOTO"
            via="workshop"
            onChange={(paths) => setPhoto(paths[0] ?? null)}
            onBusyChange={setUploading}
          />
        </div>

        <Field label={overuse ? ct.notesOveruse : ct.notes} htmlFor="cut-notes" optional={!overuse}>
          <Textarea
            id="cut-notes"
            rows={3}
            maxLength={1000}
            placeholder={ct.notesPlaceholder}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <div className="space-y-3 rounded-lg bg-neutral-50 p-3">
          {missing.length > 0 ? (
            <p className="flex gap-2 text-sm text-amber-900">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="font-medium">{ct.missingTitle}</span>{' '}
                {missing.map((m) => ct.missing[m]).join(' · ')}
              </span>
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="size-4" aria-hidden /> {ct.ready}
            </p>
          )}
          <Button
            type="button"
            size="lg"
            className="h-12 w-full"
            disabled={missing.length > 0 || uploading}
            loading={complete.isPending}
            onClick={() => void submit().catch(() => undefined)}
          >
            <Scissors /> {ct.done}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
