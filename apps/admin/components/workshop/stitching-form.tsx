'use client';

import {
  missingForQc,
  SELF_CHECK_POINTS,
  type SelfCheckPoint,
  selfCheckLevel,
  stitchingChecklist,
  type WorkshopItemDetail,
} from '@abaya/contracts';
import { CheckCircle2, CircleAlert, Shirt } from 'lucide-react';
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
import { useCompleteStitching } from '@/lib/queries/workshop';
import { cn } from '@/lib/utils';

const st = strings.workshop.stitching;
const LEVEL_TONE = { ok: 'success', warn: 'warning', off: 'danger' } as const;

/** What the tailor must tick and measure: the same rules the API checks (stitchingExpectations). */
export function stitchingTargets(item: WorkshopItemDetail) {
  const targets: Partial<Record<SelfCheckPoint, number>> = {};
  for (const p of SELF_CHECK_POINTS) {
    const cm = item.pattern?.measurements.find((m) => m.key === p)?.finishedCm;
    if (cm !== null && cm !== undefined) targets[p] = cm;
  }
  const checklist = stitchingChecklist({
    techPack: item.techPack,
    pieces: item.pattern?.pieces ?? [],
    finishedLengthCm: targets.fullLengthCm ?? null,
  });
  return { checklist, targets };
}

/**
 * The tailor's "Stitching done" form: every checklist line from the tech pack and pattern,
 * the finished piece measured against the pattern, a photo, and notes for QC.
 */
export function StitchingForm({ item }: { item: WorkshopItemDetail }) {
  const router = useRouter();
  const complete = useCompleteStitching(item.id);
  const expected = React.useMemo(() => stitchingTargets(item), [item]);
  const points = SELF_CHECK_POINTS.filter((p) => expected.targets[p] !== undefined);
  const [done, setDone] = React.useState<Set<string>>(new Set());
  const [measured, setMeasured] = React.useState<Partial<Record<SelfCheckPoint, string>>>({});
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [notes, setNotes] = React.useState('');

  const body = {
    checklist: expected.checklist.map((l) => ({ key: l.key, done: done.has(l.key) })),
    measurements: points.flatMap((p) => {
      const cm = Number(measured[p]);
      return measured[p]?.trim() && cm > 0 ? [{ key: p, measuredCm: cm }] : [];
    }),
    notes,
    photoPath: photo,
  };
  const missing = missingForQc(body, expected);
  const levels = new Map(
    body.measurements.map((m) => [m.key, selfCheckLevel(m.measuredCm, expected.targets[m.key]!)]),
  );
  const anyOff = [...levels.values()].includes('off');

  async function submit() {
    const result = await complete.mutateAsync({ ...body, photoPath: photo! });
    toast.success(st.sent);
    if (result.item === null) router.push('/workshop/stitching');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shirt className="size-4 text-accent-700" aria-hidden /> {st.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <fieldset>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <legend className="text-sm font-medium">{st.checklist}</legend>
            <button
              type="button"
              className="text-xs font-medium text-accent-700 hover:underline"
              onClick={() => setDone(new Set(expected.checklist.map((l) => l.key)))}
            >
              {st.tickAll}
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {expected.checklist.map((l) => {
              const on = done.has(l.key);
              return (
                <label
                  key={l.key}
                  className={cn(
                    'flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm',
                    on ? 'border-accent-300 bg-accent-50' : 'border-border',
                  )}
                >
                  <Checkbox
                    checked={on}
                    onCheckedChange={(v) =>
                      setDone((s) => {
                        const next = new Set(s);
                        if (v) next.add(l.key);
                        else next.delete(l.key);
                        return next;
                      })
                    }
                  />
                  <span className="flex-1">{l.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="space-y-2">
          <div>
            <p className="text-sm font-medium">{st.selfCheck}</p>
            <p className="text-xs text-muted">{st.selfCheckHint}</p>
          </div>
          {points.length === 0 ? (
            <p className="text-sm text-muted">{st.noTargets}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {points.map((p) => {
                const target = expected.targets[p]!;
                const level = levels.get(p);
                const cm = Number(measured[p]);
                return (
                  <Field key={p} label={st.points[p] ?? p} htmlFor={`self-${p}`}>
                    <Input
                      id={`self-${p}`}
                      type="number"
                      step={0.5}
                      min={0}
                      inputMode="decimal"
                      className="tabular-nums"
                      value={measured[p] ?? ''}
                      onChange={(e) => setMeasured((m) => ({ ...m, [p]: e.target.value }))}
                    />
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      {st.target(target)}
                      {level ? (
                        <Badge tone={LEVEL_TONE[level]}>
                          {st.levels[level]} · {st.diff(Math.round((cm - target) * 10) / 10)}
                        </Badge>
                      ) : null}
                    </p>
                  </Field>
                );
              })}
            </div>
          )}
          {anyOff ? (
            <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {st.offHint}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">{st.photo}</p>
          <PhotoPicker
            purpose="STAGE_PHOTO"
            via="workshop"
            onChange={(paths) => setPhoto(paths[0] ?? null)}
            onBusyChange={setUploading}
          />
        </div>

        <Field label={anyOff ? st.notesOff : st.notes} htmlFor="stitch-notes" optional={!anyOff}>
          <Textarea
            id="stitch-notes"
            rows={3}
            maxLength={1000}
            placeholder={st.notesPlaceholder}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <div className="space-y-3 rounded-lg bg-neutral-50 p-3">
          {missing.length > 0 ? (
            <p className="flex gap-2 text-sm text-amber-900">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="font-medium">{st.missingTitle}</span>{' '}
                {missing.map((m) => st.missing[m]).join(' · ')}
              </span>
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="size-4" aria-hidden /> {st.ready}
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
            <Shirt /> {st.done}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
