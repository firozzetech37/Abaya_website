import Link from 'next/link';
import { strings } from '@/content/strings';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <p className="font-display text-5xl font-semibold text-accent-800">404</p>
      <h1 className="text-lg font-medium">{strings.common.notFoundTitle}</h1>
      <p className="text-sm text-muted">{strings.common.notFoundBody}</p>
      <Link href="/" className="mt-2 text-sm font-medium text-accent-700 hover:underline">
        {strings.nav.dashboard}
      </Link>
    </main>
  );
}
