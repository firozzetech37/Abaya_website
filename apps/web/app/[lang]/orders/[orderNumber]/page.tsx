import type { Metadata } from 'next';
import { RequireAuth } from '@/components/account/require-auth';
import { OrderDetail } from '@/components/orders/order-detail';
import { stringsFor } from '@/content/i18n';

type Props = { params: Promise<{ lang: string; orderNumber: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orders } = (await stringsFor(params)).strings;
  const { orderNumber } = await params;
  return { title: orders.detailMetaTitle(decodeURIComponent(orderNumber)), robots: { index: false } };
}

export default async function OrderPage({ params }: Props) {
  const { orderNumber } = await params;
  return (
    <RequireAuth>
      <OrderDetail orderNumber={decodeURIComponent(orderNumber)} />
    </RequireAuth>
  );
}
