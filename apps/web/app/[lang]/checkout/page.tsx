import type { Metadata } from 'next';
import { RequireAuth } from '@/components/account/require-auth';
import { CheckoutView } from '@/components/checkout/checkout-view';
import { ComingSoonPage, WhenOrderingOpen } from '@/components/ordering/coming-soon';
import { stringsFor } from '@/content/i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { checkout } = (await stringsFor(params)).strings;
  return { title: checkout.metaTitle, robots: { index: false } };
}

export default function CheckoutPage() {
  return (
    <WhenOrderingOpen fallback={<ComingSoonPage />}>
      <RequireAuth>
        <CheckoutView />
      </RequireAuth>
    </WhenOrderingOpen>
  );
}
