import type { Metadata } from 'next';
import { BagView } from '@/components/cart/bag-view';
import { ComingSoonPage, WhenOrderingOpen } from '@/components/ordering/coming-soon';
import { stringsFor } from '@/content/i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { bag } = (await stringsFor(params)).strings;
  return { title: bag.metaTitle, robots: { index: false } };
}

export default function BagPage() {
  return (
    <WhenOrderingOpen fallback={<ComingSoonPage />}>
      <BagView />
    </WhenOrderingOpen>
  );
}
