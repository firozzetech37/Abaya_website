import type { Metadata } from 'next';
import { AccountView } from '@/components/account/account-view';
import { RequireAuth } from '@/components/account/require-auth';
import { stringsFor } from '@/content/i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { account } = (await stringsFor(params)).strings;
  return { title: account.metaTitle, robots: { index: false } };
}

export default function AccountPage() {
  return (
    <RequireAuth>
      <AccountView />
    </RequireAuth>
  );
}
