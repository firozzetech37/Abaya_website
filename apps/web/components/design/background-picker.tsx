'use client';

import { TRYON_BACKGROUND_TEXT_MAX, TRYON_BACKGROUNDS, type TryOnBackground } from '@abaya/contracts';
import { Building2, Check, Flower2, Gem, ImageIcon, Landmark, Lightbulb, PenLine, Sun, type LucideIcon } from 'lucide-react';
import { useStrings } from '@/components/i18n/locale-provider';
import { cn } from '@/lib/utils';

/** Her background choice: her own (null), a ready-made scene, or her own words. */
export type BackgroundChoice = null | { preset: TryOnBackground } | { text: string };

/** Each scene as a small painted tile (no photos to load): its light and colours, and an icon. */
const SCENES: Record<TryOnBackground, { icon: LucideIcon; paint: string; ink: string }> = {
  studio: { icon: Lightbulb, paint: 'bg-[radial-gradient(80%_70%_at_50%_30%,#FFFCF6_0%,#F3E9D8_55%,#E3D3BA_100%)]', ink: 'text-accent-900' },
  courtyard: {
    icon: Landmark,
    paint: 'bg-[radial-gradient(60%_50%_at_50%_100%,#B58F63_0%,transparent_70%),linear-gradient(180deg,#E9D3B0_0%,#D8B88E_60%,#C49A6B_100%)]',
    ink: 'text-accent-950',
  },
  desert: { icon: Sun, paint: 'bg-[radial-gradient(50%_40%_at_70%_25%,#FFE3A3_0%,transparent_70%),linear-gradient(180deg,#F6C47E_0%,#E39B57_45%,#C9773D_100%)]', ink: 'text-accent-950' },
  marble: {
    icon: Gem,
    paint: 'bg-[linear-gradient(135deg,#F7F3EC_0%,#E8E1D6_30%,#F7F3EC_45%,#DCD3C6_70%,#F2ECE3_100%)]',
    ink: 'text-accent-900',
  },
  garden: {
    icon: Flower2,
    paint: 'bg-[radial-gradient(30%_30%_at_30%_40%,#E9A0AE_0%,transparent_70%),radial-gradient(25%_25%_at_70%_55%,#F2B8C2_0%,transparent_70%),linear-gradient(180deg,#9FBF8B_0%,#6E9864_100%)]',
    ink: 'text-white',
  },
  skyline: {
    icon: Building2,
    paint: 'bg-[radial-gradient(4px_4px_at_20%_70%,#FFE7A8_50%,transparent_51%),radial-gradient(3px_3px_at_55%_62%,#FFE7A8_50%,transparent_51%),radial-gradient(3px_3px_at_80%_75%,#FFE7A8_50%,transparent_51%),linear-gradient(180deg,#2B2A55_0%,#6B3F6E_55%,#D98A6A_100%)]',
    ink: 'text-white',
  },
};

/**
 * "Background" in the try-on window: keep her own (or, for a model, a plain studio), one of six
 * ready-made scenes, or (when Gemini can check it) a scene in her own words. A new background is
 * one more AI step: only the scene changes, she and the abaya stay exactly as they are.
 */
export function BackgroundPicker({
  value,
  onChange,
  modelMode,
  canDescribe,
}: {
  value: BackgroundChoice;
  onChange: (v: BackgroundChoice) => void;
  modelMode: boolean;
  /** Her own words can be checked (Gemini key on): show "Describe your own". */
  canDescribe: boolean;
}) {
  const { tryOn } = useStrings();
  const t = tryOn.background;
  const describing = value !== null && 'text' in value;
  const tile =
    'group relative flex aspect-[4/5] flex-col items-center justify-end overflow-hidden rounded-xl border p-1.5 text-center transition-[transform,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 hover:-translate-y-0.5';
  const selected = 'border-accent-800 shadow-[0_0_0_2px_#fff,0_0_0_4px_#6B1F2A]';
  const tick = (
    <span className="absolute end-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-accent-900 text-gold-100 shadow">
      <Check className="size-3" aria-hidden />
    </span>
  );

  return (
    <fieldset className="space-y-2.5">
      <legend className="text-sm font-semibold text-neutral-900">{t.title}</legend>
      <p className="-mt-1 text-xs text-muted">{t.hint}</p>
      <div role="radiogroup" aria-label={t.title} className="grid grid-cols-4 gap-2 sm:gap-2.5">
        {/* Her own background (or a plain studio for "a model like me") */}
        <button type="button" role="radio" aria-checked={value === null} onClick={() => onChange(null)} className={cn(tile, 'border-border bg-sand-100', value === null && selected)}>
          <ImageIcon className="absolute inset-x-0 top-[30%] mx-auto size-6 text-accent-800" aria-hidden />
          <span className="relative w-full rounded-md bg-surface/85 px-1 py-0.5 text-[10.5px] font-medium leading-tight text-accent-950 backdrop-blur-sm">{modelMode ? t.keepModel : t.keepPhoto}</span>
          {value === null && tick}
        </button>
        {TRYON_BACKGROUNDS.map((b) => {
          const on = value !== null && 'preset' in value && value.preset === b;
          const { icon: Icon, paint, ink } = SCENES[b];
          return (
            <button key={b} type="button" role="radio" aria-checked={on} onClick={() => onChange({ preset: b })} className={cn(tile, 'border-transparent', paint, on && selected)}>
              <Icon className={cn('absolute inset-x-0 top-[30%] mx-auto size-6 opacity-80 transition-transform duration-300 group-hover:scale-110', ink)} aria-hidden />
              <span className="relative w-full rounded-md bg-surface/85 px-1 py-0.5 text-[10.5px] font-medium leading-tight text-accent-950 backdrop-blur-sm">{t.presets[b]}</span>
              {on && tick}
            </button>
          );
        })}
        {canDescribe && (
          <button
            type="button"
            role="radio"
            aria-checked={describing}
            onClick={() => onChange({ text: describing ? value.text : '' })}
            className={cn(tile, 'border-dashed border-gold-400 bg-gold-50', describing && selected)}
          >
            <PenLine className="absolute inset-x-0 top-[30%] mx-auto size-6 text-gold-600" aria-hidden />
            <span className="relative w-full rounded-md bg-surface/85 px-1 py-0.5 text-[10.5px] font-medium leading-tight text-accent-950">{t.custom}</span>
            {describing && tick}
          </button>
        )}
      </div>
      {describing && (
        <div>
          <label htmlFor="tryon-background-text" className="sr-only">
            {t.customLabel}
          </label>
          <input
            id="tryon-background-text"
            autoFocus
            maxLength={TRYON_BACKGROUND_TEXT_MAX}
            value={value.text}
            onChange={(e) => onChange({ text: e.target.value })}
            placeholder={t.customPlaceholder}
            className="h-11 w-full rounded-lg border border-neutral-300 bg-surface px-3 text-sm placeholder:text-muted focus-visible:border-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/30"
          />
          <p className="mt-1 text-xs text-muted">{t.customHint}</p>
        </div>
      )}
      {value !== null && <p className="text-xs text-accent-800">{t.extra}</p>}
    </fieldset>
  );
}
