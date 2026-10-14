import type { MetadataRoute } from 'next';

/**
 * The website as an installable app (PWA): "Add to Home Screen" on phones, "Install" in desktop
 * Chrome and Edge. Opens full-screen in the brand colours with the gold arch icon. The service
 * worker (public/sw.js) only adds an offline page; pages are never cached, so updates show at once.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Abaya Atelier',
    short_name: 'Abaya Atelier',
    description: 'Made-to-measure abayas: redesign any abaya, try it on with AI, and have it stitched to your measurements.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F8F2E7',
    theme_color: '#44111B',
    categories: ['shopping', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Shop abayas', url: '/abayas', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Virtual try-on', url: '/#try-on', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'العربية', url: '/ar', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
