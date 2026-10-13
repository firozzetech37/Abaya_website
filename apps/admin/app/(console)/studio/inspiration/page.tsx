'use client';

import { isPinterestUrl, type PinPreviewDto, type PinterestPinDto } from '@abaya/contracts';
import { BookmarkPlus, ExternalLink, Info, LayoutGrid, Pin, Search, Sparkles } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, ForbiddenState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { strings } from '@/content/strings';
import { errorMessage } from '@/lib/api-client';
import { useCurrentUser } from '@/lib/current-user';
import { useBoardPins, usePinPreview, usePinterestBoards, useSavePin } from '@/lib/queries/studio';
import { cn } from '@/lib/utils';

const s = strings.studio;

/**
 * Pinterest for ideas: a pasted pin (official oEmbed) and the company's boards (API). Images
 * load straight from Pinterest in the browser; we keep only links.
 */
export default function InspirationPage() {
  const me = useCurrentUser();
  if (!me.can('useStudio')) return <ForbiddenState />;
  return (
    <div className="space-y-5">
      <PageHeader title={s.inspTitle} subtitle={s.inspSubtitle} />
      <p className="flex items-start gap-2 rounded-lg border border-accent-200 bg-accent-50/60 px-4 py-3 text-sm text-accent-900">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        {s.rules}
      </p>
      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <PastePin />
        <Boards />
      </div>
    </div>
  );
}

function PastePin({ initial }: { initial?: string }) {
  const preview = usePinPreview();
  const save = useSavePin();
  const [url, setUrl] = React.useState(initial ?? '');
  const [note, setNote] = React.useState('');
  const [pin, setPin] = React.useState<PinPreviewDto | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function show(e: React.FormEvent) {
    e.preventDefault();
    const value = url.trim();
    if (!isPinterestUrl(value)) {
      setError(s.pinInvalid);
      return;
    }
    setError(null);
    try {
      setPin(await preview.mutateAsync(value));
    } catch (err) {
      setPin(null);
      setError(errorMessage(err));
    }
  }

  async function onSave() {
    if (!pin) return;
    try {
      await save.mutateAsync({ url: pin.url, note: note.trim() || undefined });
      toast.success(s.saved);
      setNote('');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Card className="h-fit p-5">
      <form onSubmit={show} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label={s.pasteLabel} htmlFor="pin-url" error={error ?? undefined} className="flex-1">
          <Input
            id="pin-url"
            type="url"
            value={url}
            placeholder={s.inspirationPlaceholder}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
          />
        </Field>
        <Button type="submit" variant="secondary" loading={preview.isPending} className={cn(error && 'sm:mb-6')}>
          <Search className="size-4" aria-hidden /> {s.preview}
        </Button>
      </form>

      {pin ? (
        <div className="mt-5 grid gap-5 sm:grid-cols-[220px_1fr]">
          <a href={pin.url} target="_blank" rel="noreferrer noopener" className="block overflow-hidden rounded-xl ring-1 ring-border hover:ring-accent-400">
            {pin.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- shown from Pinterest, never proxied or stored
              <img src={pin.imageUrl} alt={pin.title ?? s.inspTitle} referrerPolicy="no-referrer" className="w-full object-cover" />
            ) : (
              <div className="flex aspect-[3/4] items-center justify-center bg-neutral-100 text-xs text-muted">{s.openOnPinterest}</div>
            )}
          </a>
          <div className="min-w-0 space-y-3">
            <div>
              <p className="font-display text-xl font-semibold">{pin.title ?? s.inspTitle}</p>
              {pin.author ? <p className="text-sm text-muted">{s.by(pin.author)}</p> : null}
              <a href={pin.url} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex items-center gap-1 text-sm text-accent-700 hover:underline">
                {s.openOnPinterest} <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </div>
            <Field label={s.noteLabel} htmlFor="pin-note" optional>
              <Input id="pin-note" maxLength={300} value={note} placeholder={s.notePlaceholder} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void onSave()} loading={save.isPending}>
                <BookmarkPlus className="size-4" aria-hidden /> {s.save}
              </Button>
              <Button asChild variant="secondary">
                <Link href={`/studio/ai?pin=${encodeURIComponent(pin.url)}`}>
                  <Sparkles className="size-4" aria-hidden /> {s.useInAi}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState className="mt-2" icon={<Pin className="size-5" />} title={s.previewEmpty} />
      )}
    </Card>
  );
}

function Boards() {
  const boards = usePinterestBoards();
  const [boardId, setBoardId] = React.useState<string | null>(null);
  const pins = useBoardPins(boardId);

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
        <LayoutGrid className="size-5 text-accent-700" aria-hidden /> {s.boardsTitle}
      </h2>
      {boards.isPending ? (
        <Skeleton className="mt-4 h-40" />
      ) : boards.isError ? (
        <ErrorState error={boards.error} onRetry={() => void boards.refetch()} />
      ) : !boards.data.connected ? (
        <EmptyState icon={<Pin className="size-5" />} title={s.boardsNotConnected} />
      ) : boards.data.boards.length === 0 ? (
        <EmptyState icon={<Pin className="size-5" />} title={s.boardsEmpty} />
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2" role="tablist">
            {boards.data.boards.map((b) => (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={b.id === boardId}
                onClick={() => setBoardId(b.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                  b.id === boardId ? 'border-accent-700 bg-accent-800 text-white' : 'border-border hover:bg-neutral-50',
                )}
              >
                {b.name}
                {b.pinCount !== null ? <span className="ml-1.5 text-xs opacity-70">{b.pinCount}</span> : null}
              </button>
            ))}
          </div>
          {boardId === null ? null : pins.isPending ? (
            <div className="mt-4 columns-2 gap-3 md:columns-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="mb-3 h-48 break-inside-avoid" />
              ))}
            </div>
          ) : pins.isError ? (
            <ErrorState error={pins.error} onRetry={() => void pins.refetch()} />
          ) : (
            <div className="mt-4 columns-2 gap-3 md:columns-3">
              {pins.data.map((p) => (
                <BoardPin key={p.id} pin={p} />
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function BoardPin({ pin }: { pin: PinterestPinDto }) {
  const save = useSavePin();
  return (
    <figure className="group relative mb-3 break-inside-avoid overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-border">
      {pin.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- shown from Pinterest, never proxied or stored
        <img src={pin.imageUrl} alt={pin.title ?? ''} referrerPolicy="no-referrer" loading="lazy" className="w-full" />
      ) : (
        <div className="aspect-[3/4]" />
      )}
      <figcaption className="absolute inset-x-0 bottom-0 flex flex-wrap gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-100 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <Button
          size="sm"
          variant="secondary"
          loading={save.isPending}
          onClick={() =>
            save.mutate({ url: pin.url }, { onSuccess: () => toast.success(s.saved), onError: (e) => toast.error(errorMessage(e)) })
          }
        >
          <BookmarkPlus className="size-3.5" aria-hidden /> {s.save}
        </Button>
        <Button asChild size="sm" variant="secondary">
          <Link href={`/studio/ai?pin=${encodeURIComponent(pin.url)}`}>
            <Sparkles className="size-3.5" aria-hidden /> AI
          </Link>
        </Button>
        <a href={pin.url} target="_blank" rel="noreferrer noopener" aria-label={s.openOnPinterest} className="ml-auto flex size-8 items-center justify-center rounded-md bg-white/90 text-neutral-700">
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </figcaption>
    </figure>
  );
}
