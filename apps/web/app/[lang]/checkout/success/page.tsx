import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CheckoutSuccess } from '@/components/checkout/checkout-success';
import { stringsFor } from '@/content/i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { checkout } = (await stringsFor(params)).strings;
  return { title: checkout.successMetaTitle, robots: { index: false } };
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense>
      <CheckoutSuccess />
    </Suspense>
  );
}
