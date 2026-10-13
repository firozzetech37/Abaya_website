'use client';

import { useEffect, useState } from 'react';

/** Returns `value` after it has stopped changing for `delay` ms. Pass primitives (e.g. a JSON key). */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
