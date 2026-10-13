'use client';

import { useMoney } from '@/lib/currency';

/** An amount in paise, in the display currency; for server components that cannot use the hook. */
export function Price({ paise, className }: { paise: number; className?: string }) {
  const money = useMoney();
  return <span className={className}>{money(paise)}</span>;
}
