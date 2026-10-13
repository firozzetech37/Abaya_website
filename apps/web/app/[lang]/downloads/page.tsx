import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RequireAuth } from '@/components/account/require-auth';
import { DownloadsList } from '@/components/downloads/downloads-list';
import { stringsFor } from '@/content/i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { downloads } = (await stringsFor(params)).strings;
  return { title: downloads.metaTitle, robots: { index: false } };
}

export default function DownloadsPage() {
  return (
    <RequireAuth>
      <Suspense>
        <DownloadsList />
      </Suspense>
    </RequireAuth>
  );
}
