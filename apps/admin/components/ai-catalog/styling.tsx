'use client';

import {
  CATALOG_ACCESSORIES,
  CATALOG_FRAMINGS,
  CATALOG_HANDBAGS,
  CATALOG_SHOES,
  type CatalogStyling,
} from '@abaya/contracts';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { strings } from '@/content/strings';
import { cn } from '@/lib/utils';

const t = strings.aiCatalog;

/** Framing (realistic size in the scene), handbag and shoes for the master. */
export function StylingFields({
  value,
  onChange,
  framing = true,
}: {
  value: CatalogStyling;
  onChange: (v: CatalogStyling) => void;
  /** Off with a saved model: framing comes from the model photo. */
  framing?: boolean;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{t.stylingTitle}</legend>
      <p className="text-xs text-muted">{t.stylingHint}</p>
      {framing ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">{t.framing}</p>
          <div role="radiogroup" aria-label={t.framing} className="grid gap-1.5 sm:grid-cols-3">
            {CATALOG_FRAMINGS.map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={value.framing === f}
                onClick={() => onChange({ ...value, framing: f })}
                className={cn(
                  'rounded-md border p-2 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                  value.framing === f
                    ? 'border-accent-500 bg-accent-50/60'
                    : 'border-border hover:bg-neutral-50',
                )}
              >
                <span className="block font-medium">{t.framings[f]}</span>
                <span className="mt-0.5 block text-[11px] text-muted">{t.framingHints[f]}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">{t.framingFromModel}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Field label={t.handbag} htmlFor="styling-bag">
            <NativeSelect
              id="styling-bag"
              value={value.handbag}
              onChange={(e) =>
                onChange({ ...value, handbag: e.target.value as CatalogStyling['handbag'] })
              }
            >
              {CATALOG_HANDBAGS.map((b) => (
                <option key={b} value={b}>
                  {t.handbags[b]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {value.handbag === 'CUSTOM' ? (
            <CustomText
              id="styling-bag-custom"
              value={value.handbagCustom ?? ''}
              placeholder={t.handbagCustomPlaceholder}
              onChange={(v) => onChange({ ...value, handbagCustom: v })}
            />
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Field label={t.shoes} htmlFor="styling-shoes">
            <NativeSelect
              id="styling-shoes"
              value={value.shoes}
              onChange={(e) =>
                onChange({ ...value, shoes: e.target.value as CatalogStyling['shoes'] })
              }
            >
              {CATALOG_SHOES.map((s) => (
                <option key={s} value={s}>
                  {t.shoeStyles[s]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {value.shoes === 'CUSTOM' ? (
            <CustomText
              id="styling-shoes-custom"
              value={value.shoesCustom ?? ''}
              placeholder={t.shoesCustomPlaceholder}
              onChange={(v) => onChange({ ...value, shoesCustom: v })}
            />
          ) : null}
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium">{t.accessoriesTitle}</p>
        <p className="text-[11px] text-muted">{t.accessoriesHint}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {CATALOG_ACCESSORIES.map((a) => (
            <label key={a} className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={value.accessories.includes(a)}
                onCheckedChange={(v) =>
                  onChange({
                    ...value,
                    accessories:
                      v === true
                        ? [...value.accessories, a]
                        : value.accessories.filter((x) => x !== a),
                  })
                }
              />
              {t.accessoryNames[a]}
            </label>
          ))}
        </div>
        <Input
          aria-label={t.accessoriesTitle}
          className="h-8 text-xs"
          maxLength={200}
          placeholder={t.accessoriesCustomPlaceholder}
          value={value.accessoriesCustom ?? ''}
          onChange={(e) => onChange({ ...value, accessoriesCustom: e.target.value })}
        />
      </div>
    </fieldset>
  );
}

/** The designer's own bag or shoes (shown when "Custom…" is chosen). */
function CustomText({
  id,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const empty = !value.trim();
  return (
    <div className="space-y-1">
      <Input
        id={id}
        className="h-8 text-xs"
        maxLength={160}
        autoFocus
        placeholder={placeholder}
        aria-invalid={empty}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {empty ? <p className="text-[11px] text-danger">{t.customRequired}</p> : null}
    </div>
  );
}

/** A custom bag or shoes needs a description before generating. */
export const stylingComplete = (s: CatalogStyling): boolean =>
  (s.handbag !== 'CUSTOM' || Boolean(s.handbagCustom?.trim())) &&
  (s.shoes !== 'CUSTOM' || Boolean(s.shoesCustom?.trim()));
