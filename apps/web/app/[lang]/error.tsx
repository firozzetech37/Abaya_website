'use client';

import { Button } from '@/components/ui/button';
import { useStrings } from '@/components/i18n/locale-provider';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { common, errors } = useStrings();
  return (
    <div className="container flex flex-col items-center py-24 text-center">
      <h1 className="font-display text-4xl font-semibold">{errors.errorTitle}</h1>
      <p className="mt-3 max-w-md text-neutral-600">{errors.errorBody}</p>
      <Button className="mt-8" onClick={reset}>
        {common.retry}
      </Button>
    </div>
  );
}
