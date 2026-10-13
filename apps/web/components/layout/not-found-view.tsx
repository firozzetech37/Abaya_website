'use client';

import { Link } from '@/components/i18n/navigation';
import { useStrings } from '@/components/i18n/locale-provider';
import { Button } from '@/components/ui/button';

export function NotFoundView() {
  const { errors } = useStrings();
  return (
    <div className="container flex flex-col items-center py-24 text-center">
      <p className="font-display text-7xl font-semibold text-accent-800/30">404</p>
      <h1 className="mt-4 font-display text-4xl font-semibold">{errors.notFoundTitle}</h1>
      <p className="mt-3 max-w-md text-neutral-600">{errors.notFoundBody}</p>
      <Button asChild className="mt-8">
        <Link href="/">{errors.notFoundCta}</Link>
      </Button>
    </div>
  );
}
