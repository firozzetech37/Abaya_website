/**
 * Opening the virtual try-on from anywhere: `/abayas/<slug>?tryon=1` opens that abaya with the
 * try-on window already open (the AI studio reads the query; a signed-out visitor is sent to
 * log in and comes back to it). On the abaya's own page, a button fires OPEN_TRYON_EVENT instead.
 */
export const TRYON_PARAM = 'tryon';
export const OPEN_TRYON_EVENT = 'abaya:open-try-on';
export const tryOnHref = (slug: string) => `/abayas/${slug}?${TRYON_PARAM}=1`;

