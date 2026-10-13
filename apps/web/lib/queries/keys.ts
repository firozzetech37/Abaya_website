import type { ListDesignsQuery } from '@abaya/contracts';

/** Query keys. Everything user-specific starts with 'me' so sign-out can clear it in one go. */
export const qk = {
  designs: (filters: Partial<ListDesignsQuery>) => ['designs', filters] as const,
  design: (slug: string) => ['design', slug] as const,
  quote: (body: unknown) => ['quote', body] as const,
  me: ['me'] as const,
  addresses: ['me', 'addresses'] as const,
  measurements: ['me', 'measurements'] as const,
  measurement: (id: string) => ['me', 'measurements', id] as const,
  wishlist: ['me', 'wishlist'] as const,
  cart: ['me', 'cart'] as const,
  orders: ['me', 'orders'] as const,
  order: (orderNumber: string) => ['me', 'orders', orderNumber] as const,
  downloads: ['me', 'downloads'] as const,
  aiLimits: ['me', 'try-on', 'limits'] as const,
  aiPicture: (id: string) => ['me', 'try-on', id] as const,
  aiRecent: (designId: string) => ['me', 'try-on', 'recent', designId] as const,
  download: (id: string) => ['me', 'downloads', id] as const,
};
