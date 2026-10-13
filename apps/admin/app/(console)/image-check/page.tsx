'use client';

import type { ImageCheckResultDto } from '@abaya/contracts';
import { CheckCircle2, ImageUp, Info, ScanSearch, SearchX, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { ForbiddenState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { strings } from '@/content/strings';
import { errorMessage } from '@/lib/api-client';
import { useCurrentUser } from '@/lib/current-user';
import { formatDateTime, humanize } from '@/lib/format';
import { useCheckImage } from '@/lib/queries/image-check';
import { ACCEPTED_IMAGE_TYPES, isAcceptedImage } from '@/lib/upload';
import { cn } from '@/lib/utils';

const t = strings.imageCheck;

/** Admin "Check an image": which design or customer request a picture found elsewhere came from. */
export default function ImageCheckPage() {
  const me = useCurrentUser();
  const check = useCheckImage();
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);

  if (!me.can('manageCatalog')) return <ForbiddenState />;

  const choose = (file: File | null | undefined) => {
    if (!file) return;
    if (!isAcceptedImage(file)) {
      setRejected(`${file.name}: only JPEG, PNG or WebP images.`);
      return;
    }
    setRejected(null);
    if (picked) URL.revokeObjectURL(picked.url);
    setPicked({ file, url: URL.createObjectURL(file) });
    check.reset();
    check.mutate(file);
  };

  return (
    <div className="space-y-5" onPaste={(e) => choose(Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/')))}>
      <PageHeader title={t.title} subtitle={t.subtitle} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card className="p-4">
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              choose(e.dataTransfer.files[0]);
            }}
            className={cn(
              'flex w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-lg border-2 border-dashed p-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
              picked ? 'min-h-0 border-border bg-neutral-50' : 'min-h-72',
              dragging ? 'border-accent-500 bg-accent-50' : 'border-border hover:border-accent-300 hover:bg-neutral-50',
            )}
          >
            {picked ? (
              // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file
              <img src={picked.url} alt={t.previewAlt} className="max-h-[28rem] w-auto rounded-md object-contain" />
            ) : (
              <>
                <span className="flex size-12 items-center justify-center rounded-full bg-accent-50 text-accent-700">
                  <ImageUp className="size-6" aria-hidden />
                </span>
                <span className="font-medium">{t.dropTitle}</span>
                <span className="text-sm text-muted">{t.dropHint}</span>
              </>
            )}
          </button>
          <input
            ref={input}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              choose(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Info className="size-3.5 shrink-0" aria-hidden /> {t.privacy}
            </p>
            <Button variant="secondary" size="sm" onClick={() => input.current?.click()} disabled={check.isPending}>
              <ImageUp className="size-4" aria-hidden /> {picked ? t.another : t.choose}
            </Button>
          </div>
          {rejected ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              {rejected}
            </p>
          ) : null}
        </Card>

        <div className="space-y-4">
          {check.isPending ? (
            <Card className="flex items-center gap-3 p-5 text-sm" aria-busy="true">
              <ScanSearch className="size-5 animate-pulse text-accent-700" aria-hidden />
              {t.checking}
            </Card>
          ) : check.isError ? (
            <Card className="p-5 text-sm text-danger" role="alert">
              {errorMessage(check.error)}
            </Card>
          ) : check.data ? (
            <ResultCard result={check.data} />
          ) : null}

          <Card className="p-5">
            <h2 className="text-sm font-semibold">{t.tipsTitle}</h2>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-muted">
              {t.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: ImageCheckResultDto }) {
  if (!result.found) {
    return (
      <Card className="p-5" aria-live="polite">
        <h2 className="flex items-center gap-2 font-semibold">
          <SearchX className="size-5 text-muted" aria-hidden /> {t.notFoundTitle}
        </h2>
        <p className="mt-1 text-sm text-muted">{t.notFoundBody}</p>
      </Card>
    );
  }
  const kind = result.kind ? t.kinds[result.kind] : null;
  const strength = result.confidence !== null ? Math.round(result.confidence * 100) : null;
  return (
    <Card className="overflow-hidden" aria-live="polite">
      <div className={cn('flex flex-wrap items-center justify-between gap-2 px-5 py-4', result.recordGone ? 'bg-amber-50' : 'bg-emerald-50')}>
        <h2 className="flex items-center gap-2 font-semibold">
          {result.recordGone ? (
            <ShieldAlert className="size-5 text-amber-700" aria-hidden />
          ) : (
            <CheckCircle2 className="size-5 text-emerald-700" aria-hidden />
          )}
          {result.recordGone ? t.goneTitle : t.foundTitle}
        </h2>
        <span className="flex items-center gap-2">
          {kind ? <Badge tone="accent">{kind}</Badge> : null}
          {strength !== null ? <Badge tone="neutral">{t.confidence(strength)}</Badge> : null}
        </span>
      </div>
      {result.recordGone ? <p className="px-5 pt-4 text-sm text-muted">{t.goneBody}</p> : null}
      <dl className="divide-y divide-border px-5 text-sm">
        {result.design ? (
          <Row label={t.design}>
            <span className="flex flex-wrap items-center justify-end gap-2">
              <Link href={`/designs/${result.design.id}`} className="font-medium text-accent-700 hover:underline">
                {result.design.name}
              </Link>
              <Badge tone="neutral">{humanize(result.design.status)}</Badge>
            </span>
          </Row>
        ) : null}
        {result.request ? (
          <>
            <Row label={t.customer}>
              {result.request.customer ? (
                <span className="text-end">
                  <span className="block font-medium">{result.request.customer.name ?? result.request.customer.email}</span>
                  {result.request.customer.name && result.request.customer.email ? (
                    <span className="block text-xs text-muted">{result.request.customer.email}</span>
                  ) : null}
                </span>
              ) : (
                <span className="italic text-muted">{t.deletedCustomer}</span>
              )}
            </Row>
            <Row label={t.madeOn}>{formatDateTime(result.request.createdAt)}</Row>
            {result.request.choices.length > 0 ? (
              <Row label={t.choices}>
                <span className="text-end text-muted">{result.request.choices.join(' · ')}</span>
              </Row>
            ) : null}
          </>
        ) : null}
      </dl>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
