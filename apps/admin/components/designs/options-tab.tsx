'use client';

import {
  type AdminDesignDetail,
  type AdminOptionGroupDto,
  type AdminOptionValueDto,
  type AdminSizeBandDto,
  calculatePrice,
  type PriceBreakdown,
  PricingError, MAX_PAISE } from '@abaya/contracts';
import { AlertTriangle, Plus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { AddValueDialog } from '@/components/options/add-value-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { MoneyInput } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { strings } from '@/content/strings';
import { formatMoney, paiseToRupeesInput, rupeesInputToPaise } from '@/lib/format';
import { useSetDesignOptions, useUpdateDesign } from '@/lib/queries/designs';
import { cn } from '@/lib/utils';

const t = strings.editor.options;
const MAX_PAISE_LOCAL = MAX_PAISE;

interface ValueState {
  allowed: boolean;
  override: string; // ₹ text; empty = standard surcharge
  isDefault: boolean;
}

type OptionState = Record<string, ValueState>;

const EMPTY: ValueState = { allowed: false, override: '', isDefault: false };

function initialState(design: AdminDesignDetail, groups: AdminOptionGroupDto[]): OptionState {
  const byId = new Map(design.options.map((o) => [o.optionValueId, o]));
  const state: OptionState = {};
  for (const g of groups) {
    for (const v of g.values) {
      const o = byId.get(v.id);
      state[v.id] = {
        allowed: Boolean(o),
        override: o ? paiseToRupeesInput(o.surchargeOverrideInPaise) : '',
        isDefault: o?.isDefault ?? false,
      };
    }
  }
  return state;
}

const validMoney = (text: string): boolean => {
  if (text.trim() === '') return true;
  const p = rupeesInputToPaise(text);
  return p !== null && p <= MAX_PAISE_LOCAL;
};

/** Live example price using calculatePrice() with the default options and a chosen size. */
export function examplePrice(input: {
  basePriceInPaise: number | null;
  groups: AdminOptionGroupDto[];
  allowed: { optionValueId: string; surchargeOverrideInPaise: number | null; isDefault: boolean }[];
  sizeBandAdjustmentInPaise: number;
}): PriceBreakdown | null {
  if (input.basePriceInPaise === null) return null;
  try {
    return calculatePrice({
      basePriceInPaise: input.basePriceInPaise,
      groups: input.groups.map((g) => ({ code: g.code, name: g.name, selectionType: g.selectionType, isRequired: g.isRequired })),
      values: input.groups.flatMap((g) => g.values),
      allowed: input.allowed,
      selectedOptionValueIds: input.allowed.filter((a) => a.isDefault).map((a) => a.optionValueId),
      sizeBandAdjustmentInPaise: input.sizeBandAdjustmentInPaise,
    });
  } catch (e) {
    if (e instanceof PricingError) return null;
    throw e;
  }
}

function OptionsEditor({
  design,
  groups,
  sizeBands,
  readOnly,
  showMargin,
}: {
  design: AdminDesignDetail;
  groups: AdminOptionGroupDto[];
  sizeBands: AdminSizeBandDto[];
  readOnly: boolean;
  showMargin: boolean;
}) {
  const [state, setState] = React.useState<OptionState>(() => initialState(design, groups));
  const [optionsDirty, setOptionsDirty] = React.useState(false);
  const [base, setBase] = React.useState(paiseToRupeesInput(design.basePriceInPaise));
  const [making, setMaking] = React.useState(paiseToRupeesInput(design.makingCostInPaise));
  // Re-sync the price inputs when the saved prices change (render-time sync, no effect needed).
  const [priceSource, setPriceSource] = React.useState({ base: design.basePriceInPaise, making: design.makingCostInPaise });
  if (priceSource.base !== design.basePriceInPaise || priceSource.making !== design.makingCostInPaise) {
    setPriceSource({ base: design.basePriceInPaise, making: design.makingCostInPaise });
    setBase(paiseToRupeesInput(design.basePriceInPaise));
    setMaking(paiseToRupeesInput(design.makingCostInPaise));
  }
  const activeBands = sizeBands.filter((b) => b.isActive);
  const [bandId, setBandId] = React.useState(() => (activeBands.find((b) => b.code === 'M') ?? activeBands[0])?.id ?? '');
  const [confirmPrices, setConfirmPrices] = React.useState(false);
  const [addingTo, setAddingTo] = React.useState<AdminOptionGroupDto | null>(null);
  const saveOptions = useSetDesignOptions(design.id);
  const updateDesign = useUpdateDesign(design.id);

  const pricesDirty = base !== paiseToRupeesInput(design.basePriceInPaise) || making !== paiseToRupeesInput(design.makingCostInPaise);
  const baseValid = validMoney(base);
  const makingValid = validMoney(making);

  function patch(valueId: string, next: Partial<ValueState>, group?: AdminOptionGroupDto) {
    setOptionsDirty(true);
    setState((prev) => {
      const out = { ...prev, [valueId]: { ...(prev[valueId] ?? EMPTY), ...next } };
      // Single-select groups have at most one default.
      if (next.isDefault && group?.selectionType === 'SINGLE') {
        for (const v of group.values) if (v.id !== valueId) out[v.id] = { ...(out[v.id] ?? EMPTY), isDefault: false };
      }
      return out;
    });
  }

  /** Tick (or untick) every value of a group; a required or single-choice group gets a default. */
  function selectAll(group: AdminOptionGroupDto, on: boolean) {
    setOptionsDirty(true);
    setState((prev) => {
      const out = { ...prev };
      const choices = on ? group.values.filter((v) => v.isActive) : group.values;
      for (const v of choices) {
        const cur = prev[v.id] ?? EMPTY;
        out[v.id] = on ? { ...cur, allowed: true } : { ...cur, allowed: false, isDefault: false };
      }
      const first = choices[0];
      if (on && first && (group.isRequired || group.selectionType === 'SINGLE') && !group.values.some((v) => out[v.id]?.isDefault)) {
        out[first.id] = { ...out[first.id]!, isDefault: true };
      }
      return out;
    });
  }

  /** A value just added from this tab: ticked for this design (and the default if the group has none). */
  function added(group: AdminOptionGroupDto, value: AdminOptionValueDto) {
    const hasDefault = group.values.some((v) => state[v.id]?.isDefault);
    patch(value.id, { allowed: true, override: '', isDefault: !hasDefault && (group.isRequired || group.selectionType === 'SINGLE') }, group);
  }

  const allowedList = groups.flatMap((g) =>
    g.values
      .filter((v) => state[v.id]?.allowed)
      .map((v) => ({
        optionValueId: v.id,
        surchargeOverrideInPaise: rupeesInputToPaise(state[v.id]?.override ?? ''),
        isDefault: state[v.id]?.isDefault ?? false,
      })),
  );
  const missingRequired = groups.filter((g) => g.isRequired && !g.values.some((v) => state[v.id]?.allowed));
  const invalidOverride = groups.some((g) => g.values.some((v) => state[v.id]?.allowed && !validMoney(state[v.id]!.override)));

  const band = activeBands.find((b) => b.id === bandId);
  const example = examplePrice({
    basePriceInPaise: baseValid ? rupeesInputToPaise(base) : null,
    groups,
    allowed: allowedList,
    sizeBandAdjustmentInPaise: band?.adjustmentInPaise ?? 0,
  });
  const makingPaise = makingValid ? rupeesInputToPaise(making) : null;
  const margin = example && makingPaise !== null ? example.unitPriceInPaise - makingPaise : null;

  async function onSaveOptions() {
    if (allowedList.length === 0) {
      toast.error(t.noneAllowed);
      return;
    }
    await saveOptions.mutateAsync({ options: allowedList });
    setOptionsDirty(false);
    toast.success(t.optionsSaved);
  }

  async function onSavePrices() {
    const basePaise = rupeesInputToPaise(base);
    await updateDesign.mutateAsync({
      ...(basePaise !== null ? { basePriceInPaise: basePaise } : {}),
      ...(makingPaise !== null ? { makingCostInPaise: makingPaise } : {}),
    });
    toast.success(t.pricesSaved);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        {readOnly ? <p className="rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-700">{t.readOnlyNotice}</p> : null}
        <p className="text-sm text-muted">{t.hint}</p>
        {groups.map((g) => {
          const missing = missingRequired.includes(g);
          const activeValues = g.values.filter((v) => v.isActive);
          const ticked = activeValues.filter((v) => state[v.id]?.allowed).length;
          const allTicked = activeValues.length > 0 && ticked === activeValues.length;
          return (
            <Card key={g.code} className={cn(missing && 'border-amber-300')}>
              <CardHeader>
                <div>
                  <CardTitle>{g.name}</CardTitle>
                  <CardDescription>{g.selectionType === 'SINGLE' ? t.single : t.multi}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {!readOnly && activeValues.length > 0 ? (
                    <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-700">
                      <Checkbox
                        checked={allTicked ? true : ticked > 0 ? 'indeterminate' : false}
                        onCheckedChange={() => selectAll(g, !allTicked)}
                        aria-label={`${t.selectAll}: ${g.name}`}
                      />
                      {allTicked ? t.clearAll : t.selectAll}
                    </label>
                  ) : null}
                  <Badge tone={g.isRequired ? 'accent' : 'neutral'}>{g.isRequired ? t.requiredGroup : t.optionalGroup}</Badge>
                </div>
              </CardHeader>
              {missing ? (
                <p className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                  <AlertTriangle className="size-3.5" aria-hidden /> {t.requiredMissing(g.name)}
                </p>
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr className="border-b border-border">
                      <th className="w-10 px-4 py-2 font-medium">
                        <span className="sr-only">{strings.common.allowed}</span>
                      </th>
                      <th className="px-2 py-2 font-medium">{strings.options.name}</th>
                      <th className="px-2 py-2 text-right font-medium">{t.standard}</th>
                      <th className="w-36 px-2 py-2 font-medium">{t.override}</th>
                      <th className="w-20 px-4 py-2 text-center font-medium" title={t.defaultHint}>
                        {t.default}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.values.map((v) => {
                      const st = state[v.id] ?? EMPTY;
                      const overrideOk = validMoney(st.override);
                      return (
                        <tr key={v.id} className={cn('border-b border-border last:border-0', !st.allowed && 'text-muted')}>
                          <td className="px-4 py-2">
                            <Checkbox
                              id={`allow-${v.id}`}
                              checked={st.allowed}
                              disabled={readOnly}
                              onCheckedChange={(c) => patch(v.id, c ? { allowed: true } : { allowed: false, isDefault: false }, g)}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <label htmlFor={`allow-${v.id}`} className="flex items-center gap-2">
                              {v.colourHex ? (
                                <span className="size-4 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: v.colourHex }} aria-hidden />
                              ) : null}
                              <span className={cn(st.allowed && 'text-foreground')}>{v.name}</span>
                              {!v.isActive ? <Badge tone="neutral">{t.inactiveValue}</Badge> : null}
                            </label>
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{formatMoney(v.surchargeInPaise)}</td>
                          <td className="px-2 py-1.5">
                            <MoneyInput
                              aria-label={`${t.override}: ${v.name}`}
                              placeholder={paiseToRupeesInput(v.surchargeInPaise)}
                              value={st.override}
                              disabled={readOnly || !st.allowed}
                              aria-invalid={!overrideOk}
                              onChange={(e) => patch(v.id, { override: e.target.value })}
                              className="h-8"
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            {g.selectionType === 'SINGLE' ? (
                              <input
                                type="radio"
                                name={`default-${g.code}`}
                                aria-label={`${t.default}: ${v.name}`}
                                className="size-4 accent-[#6B1F2A]"
                                checked={st.isDefault}
                                disabled={readOnly || !st.allowed}
                                onChange={() => patch(v.id, { isDefault: true }, g)}
                              />
                            ) : (
                              <Checkbox
                                aria-label={`${t.default}: ${v.name}`}
                                checked={st.isDefault}
                                disabled={readOnly || !st.allowed}
                                onCheckedChange={(c) => patch(v.id, { isDefault: Boolean(c) }, g)}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!readOnly ? (
                <div className="border-t border-border px-4 py-2.5">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAddingTo(g)}>
                    <Plus className="size-4" aria-hidden /> {t.addTo(g.name)}
                  </Button>
                </div>
              ) : null}
            </Card>
          );
        })}
        {addingTo ? (
          <AddValueDialog
            group={addingTo}
            open
            onOpenChange={(o) => !o && setAddingTo(null)}
            onCreated={(value) => added(addingTo, value)}
          />
        ) : null}
        {!readOnly ? (
          <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
            {optionsDirty ? <span className="text-xs text-amber-700">{strings.editor.images.unsaved}</span> : null}
            <Button
              onClick={() => void onSaveOptions().catch(() => undefined)}
              loading={saveOptions.isPending}
              disabled={!optionsDirty || invalidOverride}
            >
              {t.saveOptions}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <Card>
          <CardHeader>
            <CardTitle>{t.pricesTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {design.status === 'PUBLISHED' && !readOnly ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{t.publishedWarning}</p>
            ) : null}
            <Field label={strings.designs.basePrice} htmlFor="price-base" error={baseValid ? undefined : strings.common.moneyInvalid}>
              <MoneyInput id="price-base" value={base} disabled={readOnly} aria-invalid={!baseValid} onChange={(e) => setBase(e.target.value)} />
            </Field>
            <Field
              label={strings.designs.makingCost}
              htmlFor="price-making"
              hint={strings.designs.makingCostHint}
              error={makingValid ? undefined : strings.common.moneyInvalid}
            >
              <MoneyInput id="price-making" value={making} disabled={readOnly} aria-invalid={!makingValid} onChange={(e) => setMaking(e.target.value)} />
            </Field>
            {!readOnly ? (
              <Button
                className="w-full"
                disabled={!pricesDirty || !baseValid || !makingValid}
                loading={updateDesign.isPending}
                onClick={() => (design.status === 'PUBLISHED' ? setConfirmPrices(true) : void onSavePrices().catch(() => undefined))}
              >
                {t.savePrices}
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t.exampleTitle}</CardTitle>
              <CardDescription>{t.exampleHint}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label={t.exampleSize} htmlFor="example-band">
              <NativeSelect id="example-band" value={bandId} onChange={(e) => setBandId(e.target.value)}>
                {activeBands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label} {b.adjustmentInPaise > 0 ? `(+${formatMoney(b.adjustmentInPaise)})` : ''}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {example ? (
              <>
                <dl className="space-y-1 text-sm">
                  {example.lines.map((l, i) => (
                    <div key={`${l.kind}-${l.optionValueId ?? i}`} className="flex justify-between gap-2">
                      <dt className="text-neutral-600">{l.kind === 'SIZE' ? `${l.label} ${band?.label ?? ''}` : l.label}</dt>
                      <dd className="tabular-nums">{formatMoney(l.amountInPaise)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                  <span>{t.unitPrice}</span>
                  <span className="tabular-nums">{formatMoney(example.unitPriceInPaise)}</span>
                </div>
                {showMargin && margin !== null ? (
                  <div className="flex justify-between text-sm" title={t.marginHint}>
                    <span className="text-neutral-600">{t.margin}</span>
                    <span className={cn('font-medium tabular-nums', margin < 0 ? 'text-danger' : 'text-emerald-700')}>
                      {margin < 0 ? '−' : ''}
                      {formatMoney(Math.abs(margin))}
                      {example.unitPriceInPaise > 0 ? (
                        <span className="ml-1 text-xs text-muted">({Math.round((margin / example.unitPriceInPaise) * 100)}%)</span>
                      ) : null}
                    </span>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted">{t.exampleUnavailable}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmPrices}
        onOpenChange={setConfirmPrices}
        title={t.savePrices}
        description={t.publishedWarning}
        confirmLabel={t.savePrices}
        onConfirm={onSavePrices}
      />
    </div>
  );
}

export function OptionsTab(props: {
  design: AdminDesignDetail;
  groups: AdminOptionGroupDto[];
  sizeBands: AdminSizeBandDto[];
  readOnly: boolean;
  showMargin: boolean;
}) {
  // Fresh local option state whenever the saved options change.
  const signature = props.design.options
    .map((o) => `${o.optionValueId}:${o.surchargeOverrideInPaise ?? ''}:${o.isDefault ? 1 : 0}`)
    .sort()
    .join('|');
  return <OptionsEditor key={signature} {...props} />;
}
