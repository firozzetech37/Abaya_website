import type { Metadata } from 'next';
import { PolicyPageView } from '@/components/layout/policy-page';
import { alternatesFor, stringsFor } from '@/content/i18n';

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, strings } = await stringsFor(params);
  const page = strings.policyPages['shipping'];
  return {
    title: page.title,
    description: page.description,
    alternates: alternatesFor(locale, '/policies/shipping'),
    openGraph: { title: page.title, description: page.description },
  };
}

export default function Page() {
  return <PolicyPageView slug="shipping" />;
}
