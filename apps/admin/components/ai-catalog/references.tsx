'use client';

import {
  DESIGN_REFERENCE_TYPES,
  type DesignReferenceType,
  MAX_DESIGN_REFERENCES,
} from '@abaya/contracts';
import { Loader2, Plus, Sparkles, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { strings } from '@/content/strings';
import { errorMessage } from '@/lib/api-client';
import { useDescribeReference } from '@/lib/queries/ai-catalog';
import { uploadImage } from '@/lib/upload';

const t = strings.aiCatalog;

export interface DesignReferenceInput {
  key: string;
  type: DesignReferenceType;
  path?: string;
  preview?: string;
  note: string;
  /** The note was filled in by the AI (the designer may change it). */
  autoNote?: boolean;
}

/**
 * Fabric, print, embroidery, lace, buttons… for the master. The notes go into the prompt;
 * each photo can be applied to the result with a design edit (FASHN takes one reference at a time).
 */
export function DesignReferences({
  value,
  onChange,
}: {
  value: DesignReferenceInput[];
  onChange: (v: DesignReferenceInput[]) => void;
}) {
  const update = (key: string, patch: Partial<DesignReferenceInput>) =>
    onChange(value.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t.referencesTitle}</legend>
      <p className="text-xs text-muted">{t.referencesBody}</p>
      <ul className="space-y-2">
        {value.map((r) => (
          <ReferenceRow
            key={r.key}
            item={r}
            onChange={(patch) => update(r.key, patch)}
            onRemove={() => onChange(value.filter((x) => x.key !== r.key))}
          />
        ))}
      </ul>
      {value.length < MAX_DESIGN_REFERENCES ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() =>
            onChange([
              ...value,
              {
                key: crypto.randomUUID(),
                type: value.length === 0 ? 'FABRIC_COLOUR' : 'FABRIC_PATTERN',
                note: '',
              },
            ])
          }
        >
          <Plus className="size-4" aria-hidden /> {t.addReference}
        </Button>
      ) : null}
    </fieldset>
  );
}

function ReferenceRow({
  item,
  onChange,
  onRemove,
}: {
  item: DesignReferenceInput;
  onChange: (patch: Partial<DesignReferenceInput>) => void;
  onRemove: () => void;
}) {
  const file = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const describe = useDescribeReference();

  /** Fill an empty note from the photo (free Gemini); silently skipped when unavailable. */
  async function autoDescribe(path: string, type: DesignReferenceType) {
    try {
      const res = await describe.mutateAsync({ type, path });
      if (res.description) onChange({ note: res.description, autoNote: true });
    } catch {
      // The designer can still write the note.
    }
  }

  async function take(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try {
      const path = await uploadImage(f, 'CATALOG_INPUT');
      onChange({ path, preview: URL.createObjectURL(f) });
      if (!item.note.trim()) void autoDescribe(path, item.type);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  }

  return (
    <li className="flex gap-2.5 rounded-lg border border-border p-2">
      <button
        type="button"
        onClick={() => file.current?.click()}
        className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-neutral-300 bg-neutral-50 text-xs text-muted hover:border-accent-400"
        aria-label={t.upload}
      >
        {item.preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local preview
          <img src={item.preview} alt="" className="absolute inset-0 size-full object-cover" />
        ) : busy ? (
          '…'
        ) : (
          <Plus className="size-4" aria-hidden />
        )}
      </button>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex gap-1.5">
          <NativeSelect
            aria-label={t.referenceType}
            className="h-8 text-xs"
            value={item.type}
            onChange={(e) => onChange({ type: e.target.value as DesignReferenceType })}
          >
            {DESIGN_REFERENCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t.referenceTypes[type]}
              </option>
            ))}
          </NativeSelect>
          <Button type="button" size="sm" variant="ghost" onClick={onRemove} aria-label={t.remove}>
            <X className="size-4" aria-hidden />
          </Button>
        </div>
        <div className="flex gap-1.5">
          <Input
            aria-label={t.referenceNote}
            className="h-8 text-xs"
            maxLength={200}
            placeholder={describe.isPending ? t.describing : t.referenceNotePlaceholder}
            value={item.note}
            onChange={(e) => onChange({ note: e.target.value, autoNote: false })}
          />
          {item.path ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={describe.isPending}
              onClick={() => void autoDescribe(item.path!, item.type)}
              aria-label={t.describe}
              title={t.describe}
            >
              {describe.isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-3.5" aria-hidden />
              )}
            </Button>
          ) : null}
        </div>
        {item.autoNote ? <p className="text-[11px] text-accent-700">{t.autoDescribed}</p> : null}
      </div>
      <input
        ref={file}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void take(e.target.files?.[0])}
      />
    </li>
  );
}
