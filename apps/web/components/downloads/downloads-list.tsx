'use client';

import {type DownloadDto } from '@abaya/contracts';
import { Download, FileImage, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DesignImage } from '@/components/design/design-image';
import { Link } from '@/components/i18n/navigation';
import { useStrings } from '@/components/i18n/locale-provider';
import { Button } from '@/components/ui/button';
import { Alert, Card, EmptyState, Skeleton } from '@/components/ui/misc';
import { errorMessage } from '@/lib/api-client';
import { downloadFile, useMyDownloads } from '@/lib/queries/downloads';
import { cn, formatDate } from '@/lib/utils';
import { useMoney } from '@/lib/currency';

/** "My downloads": HD designs the customer bought; each click makes a fresh 10-minute link. */
export function DownloadsList() {
  const { downloads: t, common } = useStrings();
  const list = useMyDownloads();
  const fresh = useSearchParams().get('new');

  return (
    <div className="container py-10 sm:py-14">
      <header className="mb-8">
        <h1 className="font-display text-4xl font-semibold sm:text-5xl">{t.title}</h1>
        <p className="mt-2 text-muted">{t.subtitle}</p>
      </header>

      {fresh && list.data?.some((d) => d.id === fresh) ? (
        <Alert tone="success" className="mb-6">
          {t.newPurchase}
        </Alert>
      ) : null}

      {list.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : list.isError ? (
        <Alert tone="danger" action={<Button size="sm" variant="secondary" onClick={() => void list.refetch()}>{common.retry}</Button>}>
          {errorMessage(list.error)}
        </Alert>
      ) : list.data.length === 0 ? (
        <EmptyState
          icon={<FileImage className="size-5" aria-hidden />}
          title={t.empty}
          body={t.emptyBody}
          action={
            <Button asChild>
              <Link href="/abayas">{t.browse}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.data.map((d) => (
            <li key={d.id}>
              <DownloadCard d={d} highlight={d.id === fresh} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DownloadCard({ d, highlight }: { d: DownloadDto; highlight: boolean }) {
  const money = useMoney();
  const { downloads: t } = useStrings();
  const [busy, setBusy] = useState<number | 'all' | null>(null);

  const one = async (index: number) => {
    setBusy(index);
    try {
      await downloadFile(d.id, index);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const all = async () => {
    setBusy('all');
    try {
      for (let i = 0; i < d.imageCount; i++) {
        await downloadFile(d.id, i);
        // Browsers block many downloads fired at once; space them out.
        await new Promise((r) => setTimeout(r, 700));
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className={cn('flex gap-4 p-4 transition-shadow', highlight && 'ring-2 ring-accent-500')}>
      <Link href={`/abayas/${d.design.slug}`} className="w-28 shrink-0 overflow-hidden rounded-lg sm:w-32">
        <DesignImage src={d.previewUrl} alt={d.design.name} name={d.design.name} sizes="128px" className="aspect-[4/5]" />
      </Link>
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-display text-xl font-semibold">{d.design.name}</h2>
        <p className="mt-0.5 text-sm text-muted">
          {d.paidAt ? t.boughtOn(formatDate(d.paidAt)) : null} · {money(d.priceInPaise)}
        </p>
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-accent-800">
          <ShieldCheck className="size-3.5" aria-hidden /> {t.licenceShort}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: d.imageCount }, (_, i) => (
            <Button key={i} size="sm" variant="secondary" loading={busy === i} disabled={busy !== null} onClick={() => void one(i)}>
              <Download aria-hidden /> {t.image(i + 1)}
            </Button>
          ))}
          {d.imageCount > 1 ? (
            <Button size="sm" loading={busy === 'all'} disabled={busy !== null} onClick={() => void all()}>
              {busy === 'all' ? t.preparing : t.downloadAll}
            </Button>
          ) : null}
        </div>
        <Link href={`/abayas/${d.design.slug}`} className="mt-3 inline-block text-sm text-accent-700 underline-offset-4 hover:underline">
          {t.orderThis}
        </Link>
      </div>
    </Card>
  );
}
