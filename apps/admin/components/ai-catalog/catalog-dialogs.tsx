'use client';

import {
  ABAYA_STYLES,
  type AbayaStyle,
  type CatalogImageDto,
  type CatalogJobDto,
} from '@abaya/contracts';
import { Check, Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
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
import { Textarea } from '@/components/ui/textarea';
import { STYLE_LABELS, strings } from '@/content/strings';
import { errorMessage } from '@/lib/api-client';
import {
  useAddSetToDesign,
  useCreateDesignFromImage,
  useUseAsDesignPhoto,
} from '@/lib/queries/ai-catalog';
import { useOptionGroups } from '@/lib/queries/catalog';
import { useDesigns } from '@/lib/queries/designs';
import { cn } from '@/lib/utils';

const t = strings.aiCatalog;

type Target = 'existing' | 'new';

/** Existing design (pick one) or a new draft design, chosen with a two-way switch. */
function TargetPicker({
  target,
  onTarget,
  designId,
  onDesign,
  list,
}: {
  target: Target;
  onTarget: (t: Target) => void;
  designId: string;
  onDesign: (id: string) => void;
  list: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-3">
      <div
        role="radiogroup"
        aria-label={t.catalogTitle}
        className="flex gap-1 rounded-lg bg-neutral-100 p-1"
      >
        {(['existing', 'new'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={target === v}
            disabled={v === 'existing' && list.length === 0}
            onClick={() => onTarget(v)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40',
              target === v
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted hover:text-foreground',
            )}
          >
            {v === 'existing' ? t.existingDesign : t.newDesign}
          </button>
        ))}
      </div>
      {target === 'existing' ? (
        <Field label={t.design} htmlFor="catalog-design">
          <NativeSelect
            id="catalog-design"
            value={designId}
            onChange={(e) => onDesign(e.target.value)}
          >
            {list.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
    </div>
  );
}

function NewDesignFields({
  name,
  setName,
  style,
  setStyle,
  description,
  setDescription,
}: {
  name: string;
  setName: (v: string) => void;
  style: AbayaStyle;
  setStyle: (v: AbayaStyle) => void;
  description: string;
  setDescription: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Field label={t.designName} htmlFor="new-design-name">
        <Input
          id="new-design-name"
          autoFocus
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label={t.designStyle} htmlFor="new-design-style">
        <NativeSelect
          id="new-design-style"
          value={style}
          onChange={(e) => setStyle(e.target.value as AbayaStyle)}
        >
          {ABAYA_STYLES.map((s) => (
            <option key={s} value={s}>
              {STYLE_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={t.designDescription} htmlFor="new-design-description" optional>
        <Textarea
          id="new-design-description"
          rows={2}
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
    </div>
  );
}

/** The colour the photo(s) show: customers who pick it on the website see these photos. */
export function ColourPicker({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const groups = useOptionGroups();
  const colours = groups.data?.find((g) => g.code === 'COLOUR')?.values.filter((v) => v.isActive) ?? [];
  if (colours.length === 0) return null;
  return (
    <Field label={t.colour} htmlFor={id} hint={t.colourHint} optional>
      <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t.colourAny}</option>
        {colours.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}

function useMyDesigns() {
  const designs = useDesigns({ mine: true });
  return { list: designs.data?.pages.flatMap((p) => p.items) ?? [], loading: designs.isPending };
}

/** One approved image: to an existing design (optionally as main photo) or a new draft design. */
export function AddToCatalogDialog({
  job,
  image,
  onClose,
}: {
  job: CatalogJobDto;
  image: CatalogImageDto;
  onClose: () => void;
}) {
  const router = useRouter();
  const { list, loading } = useMyDesigns();
  const use = useUseAsDesignPhoto();
  const create = useCreateDesignFromImage();
  const [target, setTarget] = React.useState<Target | null>(null);
  const [designId, setDesignId] = React.useState('');
  const [primary, setPrimary] = React.useState(false);
  const [colour, setColour] = React.useState('');
  const [name, setName] = React.useState('');
  const [style, setStyle] = React.useState<AbayaStyle>(job.style ?? 'CLOSED');
  const [description, setDescription] = React.useState('');
  const chosenTarget: Target = target ?? (list.length ? 'existing' : 'new');
  const chosenDesign = designId || list[0]?.id || '';

  async function go() {
    try {
      if (chosenTarget === 'new') {
        const d = await create.mutateAsync({
          imageId: image.id,
          body: { name: name.trim(), style, description: description.trim() || undefined },
        });
        toast.success(t.created(d.name), {
          action: { label: t.openDesign, onClick: () => router.push(`/designs/${d.id}`) },
        });
      } else {
        await use.mutateAsync({ imageId: image.id, designId: chosenDesign, primary, colourValueId: colour || undefined });
        toast.success(t.added, {
          action: { label: t.openDesign, onClick: () => router.push(`/designs/${chosenDesign}`) },
        });
      }
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const disabled = chosenTarget === 'new' ? name.trim().length < 3 : !chosenDesign;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.catalogTitle}</DialogTitle>
          <DialogDescription>{t.catalogBody}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {loading ? null : (
            <TargetPicker
              target={chosenTarget}
              onTarget={setTarget}
              designId={chosenDesign}
              onDesign={setDesignId}
              list={list}
            />
          )}
          {chosenTarget === 'new' ? (
            <NewDesignFields
              name={name}
              setName={setName}
              style={style}
              setStyle={setStyle}
              description={description}
              setDescription={setDescription}
            />
          ) : (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={primary} onCheckedChange={(v) => setPrimary(v === true)} />
                {t.makeMain}
              </label>
              <ColourPicker id="catalog-colour" value={colour} onChange={setColour} />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {strings.common.cancel}
          </Button>
          <Button
            disabled={disabled}
            loading={use.isPending || create.isPending}
            onClick={() => void go()}
          >
            {t.addToCatalog}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The whole approved set (master, poses, edits) in order, into an existing design or a new one;
 * the starred image becomes the main photo.
 */
export function AddSetDialog({ jobs, onClose }: { jobs: CatalogJobDto[]; onClose: () => void }) {
  const router = useRouter();
  const { list, loading } = useMyDesigns();
  const addSet = useAddSetToDesign();
  const create = useCreateDesignFromImage();
  const approved = jobs.flatMap((j) =>
    j.images.filter((i) => i.review === 'APPROVED').map((i) => ({ job: j, image: i })),
  );
  const [picked, setPicked] = React.useState<string[]>(() =>
    approved.filter((a) => !a.image.designId).map((a) => a.image.id),
  );
  const [main, setMain] = React.useState<string | null>(approved[0]?.image.id ?? null);
  const [target, setTarget] = React.useState<Target | null>(null);
  const [designId, setDesignId] = React.useState('');
  const [name, setName] = React.useState('');
  const [style, setStyle] = React.useState<AbayaStyle>(jobs[0]?.style ?? 'CLOSED');
  const [description, setDescription] = React.useState('');
  const [colour, setColour] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const chosenTarget: Target = target ?? (list.length ? 'existing' : 'new');
  const chosenDesign = designId || list[0]?.id || '';
  const ordered = approved.filter((a) => picked.includes(a.image.id)).map((a) => a.image.id);

  async function go() {
    if (ordered.length === 0) return;
    setBusy(true);
    try {
      let target = chosenDesign;
      let rest = ordered;
      if (chosenTarget === 'new') {
        // The main photo starts the new design; the rest follow in order.
        const first = main && ordered.includes(main) ? main : ordered[0]!;
        const d = await create.mutateAsync({
          imageId: first,
          body: { name: name.trim(), style, description: description.trim() || undefined },
        });
        target = d.id;
        rest = ordered.filter((id) => id !== first);
      }
      const res = rest.length
        ? await addSet.mutateAsync({
            designId: target,
            imageIds: rest,
            primaryImageId: chosenTarget === 'existing' && main ? main : undefined,
            colourValueId: chosenTarget === 'existing' && colour ? colour : undefined,
          })
        : { added: 0, skipped: 0 };
      toast.success(t.setAdded(res.added + (chosenTarget === 'new' ? 1 : 0), res.skipped), {
        action: { label: t.openDesign, onClick: () => router.push(`/designs/${target}`) },
      });
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const disabled =
    ordered.length === 0 || (chosenTarget === 'new' ? name.trim().length < 3 : !chosenDesign);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t.addSetTitle}</DialogTitle>
          <DialogDescription>{approved.length ? t.addSetBody : t.addSetNothing}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {approved.length ? (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {approved.map(({ job, image }) => {
                const on = picked.includes(image.id);
                return (
                  <li key={image.id} className="space-y-1">
                    <div
                      className={cn(
                        'relative aspect-[4/5] overflow-hidden rounded-lg ring-2',
                        on ? 'ring-accent-500' : 'ring-transparent opacity-60',
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
                      <img src={image.url} alt="" className="size-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setMain(image.id)}
                        aria-pressed={main === image.id}
                        aria-label={t.mainPhoto}
                        title={t.mainPhoto}
                        className={cn(
                          'absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full shadow-sm',
                          main === image.id
                            ? 'bg-amber-400 text-amber-950'
                            : 'bg-white/90 text-neutral-500',
                        )}
                      >
                        <Star
                          className={cn('size-3.5', main === image.id && 'fill-current')}
                          aria-hidden
                        />
                      </button>
                      {image.designId ? (
                        <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          <Check className="size-3" aria-hidden /> {t.inCatalog}
                        </span>
                      ) : null}
                    </div>
                    <label className="flex items-center gap-1.5 text-xs">
                      <Checkbox
                        checked={on}
                        onCheckedChange={(v) =>
                          setPicked((cur) =>
                            v === true ? [...cur, image.id] : cur.filter((x) => x !== image.id),
                          )
                        }
                      />
                      {t.views[job.view] ?? job.view}
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {loading || !approved.length ? null : (
            <TargetPicker
              target={chosenTarget}
              onTarget={setTarget}
              designId={chosenDesign}
              onDesign={setDesignId}
              list={list}
            />
          )}
          {approved.length && chosenTarget === 'existing' ? (
            <ColourPicker id="set-colour" value={colour} onChange={setColour} />
          ) : null}
          {approved.length && chosenTarget === 'new' ? (
            <NewDesignFields
              name={name}
              setName={setName}
              style={style}
              setStyle={setStyle}
              description={description}
              setDescription={setDescription}
            />
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {strings.common.cancel}
          </Button>
          <Button disabled={disabled} loading={busy} onClick={() => void go()}>
            {t.addSetButton(ordered.length)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
