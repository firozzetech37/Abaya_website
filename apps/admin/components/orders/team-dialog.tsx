'use client';

import {
  type AdminOrderItemDto,
  missingTeam,
  TEAM_SLOTS,
  type TeamSlot,
  teamBody,
} from '@abaya/contracts';
import { addDays, format } from 'date-fns';
import { Users } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/states';
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
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { strings } from '@/content/strings';
import { useSetTeam, useTeamOptions } from '@/lib/queries/orders';

const t = strings.production.team;

/** Abayas whose team can still change (not shipped, delivered or cancelled). */
export const teamEditable = (item: Pick<AdminOrderItemDto, 'stage'>) =>
  !['SHIPPED', 'DELIVERED', 'CANCELLED'].includes(item.stage);

type Picks = Record<TeamSlot, string>;

const picksOf = (item: AdminOrderItemDto): Picks => ({
  pattern: item.team.pattern?.id ?? '',
  cutting: item.team.cutting?.id ?? '',
  stitching: item.team.stitching?.id ?? '',
  qc: item.team.qc?.id ?? '',
  finishing: item.team.finishing?.id ?? '',
});

/**
 * Assign team: one person per station for this abaya (docs/apps/workshop.md "Team"),
 * optionally the same team for every open abaya of the order.
 */
export function TeamDialog({
  orderId,
  item,
  siblings,
  onOpenChange,
}: {
  orderId: string;
  item: AdminOrderItemDto;
  /** Every item of the order (for "same team for all"). */
  siblings: AdminOrderItemDto[];
  onOpenChange: (open: boolean) => void;
}) {
  const options = useTeamOptions();
  const setTeam = useSetTeam(orderId);
  const [picks, setPicks] = React.useState<Picks>(() => picksOf(item));
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const [due, setDue] = React.useState(() =>
    item.dueDate ? item.dueDate.slice(0, 10) : format(addDays(new Date(), 14), 'yyyy-MM-dd'),
  );
  const others = siblings.filter((s) => s.id !== item.id && teamEditable(s));
  const [applyAll, setApplyAll] = React.useState(others.length > 0);
  const [error, setError] = React.useState<string | null>(null);

  const missing = missingTeam({
    pattern: picks.pattern,
    cutting: picks.cutting,
    qc: picks.qc,
    finishing: picks.finishing,
    makerId: picks.stitching || null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (missing.length > 0) return setError(t.missing);
    if (!due || due < tomorrow) return setError(t.due);
    const parsed = teamBody.parse({
      pattern: picks.pattern,
      cutting: picks.cutting,
      qc: picks.qc,
      finishing: picks.finishing,
      makerId: picks.stitching,
      dueDate: new Date(`${due}T18:00:00`).toISOString(),
    });
    const targets = applyAll ? [item, ...others] : [item];
    // One request per abaya; each is checked (roles, stage) and audited on its own.
    for (const target of targets) await setTeam.mutateAsync({ itemId: target.id, body: parsed });
    toast.success(targets.length > 1 ? t.savedAll(targets.length) : t.saved);
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form
          noValidate
          onSubmit={(e) => void submit(e).catch(() => undefined)}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader>
            <DialogTitle>{t.dialogTitle}</DialogTitle>
            <DialogDescription>{t.dialogBody}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {options.isPending ? (
              <div className="space-y-3">
                {TEAM_SLOTS.map((s) => (
                  <Skeleton key={s} className="h-14" />
                ))}
              </div>
            ) : options.isError ? (
              <ErrorState error={options.error} onRetry={() => void options.refetch()} />
            ) : (
              <>
                <ol className="space-y-3">
                  {TEAM_SLOTS.map((slot, i) => {
                    const people = options.data[slot];
                    return (
                      <li key={slot} className="flex items-start gap-3">
                        <span
                          className="mt-7 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-50 text-xs font-semibold text-accent-700"
                          aria-hidden
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <Field label={t.stations[slot]!} htmlFor={`team-${slot}`}>
                            {people.length === 0 ? (
                              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                {t.nobody(t.stations[slot]!)}
                              </p>
                            ) : (
                              <NativeSelect
                                id={`team-${slot}`}
                                value={picks[slot]}
                                onChange={(e) => {
                                  setPicks((p) => ({ ...p, [slot]: e.target.value }));
                                  setError(null);
                                }}
                              >
                                <option value="">{strings.common.selectPlaceholder}</option>
                                {people.map((person) => (
                                  <option key={person.id} value={person.id}>
                                    {person.name ?? '—'} · {t.jobs(person.activeJobs)}
                                  </option>
                                ))}
                              </NativeSelect>
                            )}
                          </Field>
                          {slot === 'stitching' && picks.stitching ? (
                            <Field label={t.due} htmlFor="team-due" className="mt-2">
                              <Input
                                id="team-due"
                                type="date"
                                min={tomorrow}
                                value={due}
                                onChange={(e) => setDue(e.target.value)}
                              />
                            </Field>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
                {others.length > 0 ? (
                  <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5 text-sm">
                    <Checkbox checked={applyAll} onCheckedChange={(v) => setApplyAll(v === true)} />
                    {t.applyAll(others.length + 1)}
                  </label>
                ) : null}
              </>
            )}
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
            <Button type="submit" loading={setTeam.isPending} disabled={!options.data}>
              <Users /> {t.assign}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
