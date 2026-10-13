import type { Metadata } from 'next';
import { RequireAuth } from '@/components/account/require-auth';
import { OrdersList } from '@/components/orders/orders-list';
import { stringsFor } from '@/content/i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { orders } = (await stringsFor(params)).strings;
  return { title: orders.metaTitle, robots: { index: false } };
}

export default function OrdersPage() {
  return (
    <RequireAuth>
      <OrdersList />
    </RequireAuth>
  );
}
