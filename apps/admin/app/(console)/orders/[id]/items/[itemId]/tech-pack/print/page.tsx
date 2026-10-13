'use client';

import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { SafeImage } from '@/components/safe-image';
import { ErrorState, PageSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { MEASUREMENT_LABELS, STAGE_LABELS, STYLE_LABELS, strings } from '@/content/strings';
import { formatDate, formatDateTime } from '@/lib/format';
import { useOrder, useTechPack } from '@/lib/queries/orders';

const p = strings.production;

/** A4 printable tech pack for the tailor. Opens without the console chrome. */
export default function TechPackPrintPage() {
  const { id, itemId } = useParams<{ id: string; itemId: string }>();
  const order = useOrder(id);
  const techPack = useTechPack(itemId);

  if (order.isPending || techPack.isPending) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <PageSkeleton />
      </div>
    );
  }
  if (order.isError || techPack.isError) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <ErrorState error={order.error ?? techPack.error} />
      </div>
    );
  }

  const item = order.data.items.find((i) => i.id === itemId);
  const saved = techPack.data.saved;
  const content = saved?.content ?? techPack.data.draft;
  const approved = saved?.status === 'APPROVED';
  const rows: [string, string][] = [
    [p.style, STYLE_LABELS[content.style as keyof typeof STYLE_LABELS] ?? content.style],
    [p.fabric, content.fabric],
    [p.colour, content.colour],
    [p.patternColour, content.patternColour || '—'],
    [p.sleeve, content.sleeve],
    [p.closure, content.closure],
    [p.embellishments, content.embellishments || '—'],
    [p.addOns, content.addOns || '—'],
  ];

  return (
    <div className="min-h-screen bg-neutral-100 py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4">
        <Link href={`/orders/${id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> {order.data.orderNumber}
        </Link>
        <Button onClick={() => window.print()}>
          <Printer /> {strings.common.print}
        </Button>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white p-10 text-[13px] leading-relaxed text-neutral-900 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-2 border-neutral-900 pb-4">
          <div>
            <p className="font-display text-3xl font-semibold">{p.printTitle}</p>
            <p className="mt-1 text-sm">
              {p.printOrder} <span className="font-mono font-semibold">{order.data.orderNumber}</span> · {p.printItem}{' '}
              <span className="font-mono">{itemId.slice(0, 8)}</span>
            </p>
          </div>
          <div className="text-right text-xs">
            <p className="font-semibold">Abaya</p>
            <p>
              {p.printGenerated}: {formatDateTime(new Date())}
            </p>
            {item ? (
              <p>
                {p.printStatus}: {STAGE_LABELS[item.stage]}
                {item.dueDate ? ` · ${strings.order.dueDate} ${formatDate(item.dueDate)}` : ''}
              </p>
            ) : null}
            {item?.maker ? (
              <p>
                {p.makerLabel}: {item.maker.name}, {item.maker.city}
              </p>
            ) : null}
          </div>
        </header>

        {!approved ? (
          <p className="mt-4 border-2 border-dashed border-neutral-900 px-3 py-2 text-center text-sm font-semibold uppercase tracking-widest">
            {p.printDraftWarning}
          </p>
        ) : (
          <p className="mt-3 text-xs">{strings.order.techPackApproved(saved?.approvedBy?.name ?? '—', formatDateTime(saved?.approvedAt))}</p>
        )}

        <section className="mt-6 grid grid-cols-[1fr_160px] gap-6">
          <div>
            <h2 className="mb-2 text-lg font-semibold">{item?.design.name ?? ''}</h2>
            <table className="w-full border-collapse">
              <tbody>
                {rows.map(([k, v]) => (
                  <tr key={k} className="border-b border-neutral-300">
                    <th className="w-40 py-1.5 pr-3 text-left align-top font-medium text-neutral-600">{k}</th>
                    <td className="py-1.5">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {item ? (
            <div className="relative aspect-[3/4] overflow-hidden border border-neutral-300 bg-neutral-100">
              <SafeImage src={item.design.primaryImageUrl} alt={item.design.name} fallbackText={item.design.name} sizes="160px" />
            </div>
          ) : null}
        </section>

        <section className="mt-6 break-inside-avoid">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide">{p.measurementsCm}</h3>
          <table className="w-full border-collapse border border-neutral-400">
            <tbody>
              {Object.entries(content.measurements).map(([k, v]) => (
                <tr key={k} className="border-b border-neutral-300">
                  <th className="w-1/2 border-r border-neutral-300 px-3 py-1.5 text-left font-medium">{MEASUREMENT_LABELS[k] ?? k}</th>
                  <td className="px-3 py-1.5 text-right font-mono text-base tabular-nums">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-6 break-inside-avoid">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide">{p.constructionNotes}</h3>
          <div className="min-h-[80px] whitespace-pre-line border border-neutral-300 p-3">{content.constructionNotes || '—'}</div>
        </section>

        <footer className="mt-10 grid grid-cols-2 gap-10 text-xs">
          <div className="border-t border-neutral-500 pt-1">{p.tailorSignature}</div>
          <div className="border-t border-neutral-500 pt-1">{p.qcSignature}</div>
        </footer>
      </article>
    </div>
  );
}
