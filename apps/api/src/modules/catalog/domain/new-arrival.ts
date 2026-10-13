import { NEW_ARRIVAL_DAYS } from '@abaya/contracts';

/** "New arrival" on the storefront: published within the last NEW_ARRIVAL_DAYS days. */
export const isNewArrival = (publishedAt: Date | null, now = new Date()): boolean =>
  publishedAt !== null && now.getTime() - publishedAt.getTime() < NEW_ARRIVAL_DAYS * 86_400_000;
