'use client';

import {type DesignDetail, isSwatchGroup } from '@abaya/contracts';
import { Check } from 'lucide-react';
import { useStrings } from '@/components/i18n/locale-provider';
import { cn } from '@/lib/utils';
import { useMoney } from '@/lib/currency';

type Group = DesignDetail['optionGroups'][number];
type Value = Group['values'][number];


/**
 * One section of the redesign panel. Uses native radio/checkbox inputs (visually hidden)
 * so keyboard and screen-reader behaviour comes for free.
 */
export function OptionGroup({
  group,
  selected,
  onChange,
  step,
}: {
  group: Group;
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Its number in the panel (shown as 01, 02…). */
  step?: number;
}) {
  const money = useMoney();
  const { design: t } = useStrings();
  const surchargeLabel = (v: Value) => (v.surchargeInPaise > 0 ? t.surcharge(money(v.surchargeInPaise)) : t.noSurcharge);
  const multi = group.selectionType === 'MULTI';
  const inputName = `option-${group.code}`;
  const selectedNames = group.values.filter((v) => selected.includes(v.id)).map((v) => v.name);

  const toggle = (id: string) => {
    if (multi) onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
    else if (!group.isRequired && selected.includes(id)) onChange([]);
    else onChange([id]);
  };

  return (
    <fieldset className="border-t border-dashed border-gold-200/80 py-6 first:border-t-0 first:pt-0">
      <legend className="float-left mb-4 flex w-full items-baseline justify-between gap-3">
        <span className="flex items-baseline gap-3">
          {step !== undefined && (
            <span className="font-display text-sm font-semibold tabular-nums text-gold-500" aria-label={t.stepLabel(step)}>
              {String(step).padStart(2, '0')}
            </span>
          )}
          <span className="font-display text-lg font-semibold text-foreground">{group.name}</span>
          {multi && <span className="text-xs font-normal text-muted">{t.chooseOneOrMore}</span>}
        </span>
        <span className="truncate text-sm font-medium text-accent-800">{selectedNames.join(', ')}</span>
      </legend>

      {isSwatchGroup(group.code) ? (
        <div className="clear-both flex flex-wrap gap-x-2 gap-y-3">
          {group.values.map((v) => {
            const checked = selected.includes(v.id);
            return (
              <label key={v.id} className="group relative flex w-16 cursor-pointer flex-col items-center gap-1.5" title={`${v.name} ${surchargeLabel(v)}`}>
                <input
                  type={multi ? 'checkbox' : 'radio'}
                  name={inputName}
                  value={v.id}
                  checked={checked}
                  onChange={() => toggle(v.id)}
                  onClick={() => {
                    if (!multi && !group.isRequired && checked) toggle(v.id);
                  }}
                  className="peer sr-only"
                  aria-label={v.surchargeInPaise > 0 ? `${v.name}, ${surchargeLabel(v)}` : v.name}
                />
                <span
                  className={cn(
                    'flex size-12 items-center justify-center rounded-full border-2 transition-all duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-accent-500 peer-focus-visible:ring-offset-2',
                    checked ? 'border-gold-400 p-[3px] shadow-[0_6px_16px_-8px_rgba(107,31,42,0.6)]' : 'border-transparent p-[3px] hover:border-gold-200',
                  )}
                  aria-hidden
                >
                  <span
                    className="relative flex size-full items-center justify-center rounded-full ring-1 ring-inset ring-neutral-950/15"
                    style={{ backgroundColor: v.colourHex ?? '#D3CDC3' }}
                  >
                    {checked && <Check className={cn('size-4', isLight(v.colourHex) ? 'text-neutral-900' : 'text-white')} strokeWidth={3} />}
                  </span>
                </span>
                <span aria-hidden className={cn('line-clamp-2 text-center text-[0.7rem] leading-tight', checked ? 'font-semibold text-accent-900' : 'text-neutral-600')}>
                  {v.name}
                  {v.surchargeInPaise > 0 && <span className="block font-normal text-muted">{surchargeLabel(v)}</span>}
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <div className={cn('clear-both grid gap-2', multi ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
          {group.values.map((v) => {
            const checked = selected.includes(v.id);
            return (
              <label key={v.id} className="relative cursor-pointer">
                <input
                  type={multi ? 'checkbox' : 'radio'}
                  name={inputName}
                  value={v.id}
                  checked={checked}
                  onChange={() => toggle(v.id)}
                  onClick={() => {
                    if (!multi && !group.isRequired && checked) toggle(v.id);
                  }}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    'relative flex min-h-[3.75rem] items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-all duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-accent-500 peer-focus-visible:ring-offset-2',
                    checked
                      ? 'border-primary bg-gradient-to-br from-accent-50 to-surface shadow-[0_10px_24px_-18px_rgba(107,31,42,0.75)]'
                      : 'border-neutral-200 bg-surface hover:-translate-y-px hover:border-gold-300 hover:shadow-[0_8px_20px_-16px_rgba(35,28,23,0.5)] motion-reduce:hover:translate-y-0',
                  )}
                >
                  {!multi && checked && (
                    <span aria-hidden className="absolute -end-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-white shadow-sm ring-2 ring-surface">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                  {multi && (
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-sm border',
                        checked ? 'border-primary bg-primary text-white' : 'border-neutral-400',
                      )}
                    >
                      {checked && <Check className="size-3.5" strokeWidth={3} />}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-tight text-foreground">{v.name}</span>
                    <span className={cn('mt-0.5 block text-xs', v.surchargeInPaise > 0 ? 'text-neutral-700' : 'text-muted')}>
                      {surchargeLabel(v)}
                    </span>
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

function isLight(hex: string | null): boolean {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return true;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}
