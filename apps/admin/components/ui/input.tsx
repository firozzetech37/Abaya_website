import { MAX_PAISE } from '@abaya/contracts';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const inputClass =
  'flex h-9 w-full rounded-md border border-border bg-surface px-3 py-1 text-sm text-foreground shadow-sm transition-colors placeholder:text-neutral-400 focus-visible:border-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/30 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:opacity-70 aria-[invalid=true]:border-danger';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input ref={ref} type={type} className={cn(inputClass, className)} {...props} />
  ),
);
Input.displayName = 'Input';

/** ₹ prefix input for rupee amounts; the value is a plain string of rupees. */
/** No business cap on amounts; the only bound is the database's 32-bit column (`MAX_PAISE` in contracts). */
export const MAX_RUPEES = Math.floor(MAX_PAISE / 100);

/**
 * Keeps a typed amount sane as it is typed: digits and one decimal point only (two decimals at
 * most), no sign, and never above MAX_RUPEES. Anything else is dropped, so a stray letter or an
 * extra zero cannot get in. Returns the cleaned text.
 */
export function cleanMoneyInput(raw: string, max = MAX_RUPEES): string {
  let s = raw.replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  if (dot >= 0) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  // Leading zeros fall away ("007" → "7"), but "0.5" and a lone "0" stay.
  s = s.replace(/^0+(?=\d)/, '');
  if (s !== '' && s !== '.' && Number(s) > max) return String(max);
  return s;
}

export const MoneyInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { maxRupees?: number }>(
  ({ className, onChange, maxRupees, ...props }, ref) => (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted" aria-hidden>
        ₹
      </span>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn(inputClass, 'pl-7 tabular-nums', className)}
        onChange={(e) => {
          const cleaned = cleanMoneyInput(e.target.value, maxRupees ?? MAX_RUPEES);
          if (cleaned !== e.target.value) {
            // Rewrite the field in place so controlled and uncontrolled uses both see the clean value.
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            setter?.call(e.target, cleaned);
          }
          onChange?.(e);
        }}
        {...props}
      />
    </div>
  ),
);
MoneyInput.displayName = 'MoneyInput';
