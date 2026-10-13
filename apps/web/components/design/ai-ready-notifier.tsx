'use client';

import type { CustomerPreviewDto } from '@abaya/contracts';
import { useQueries } from '@tanstack/react-query';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { usePathname, useRouter } from '@/components/i18n/navigation';
import { useStrings } from '@/components/i18n/locale-provider';
import { api, isApiError } from '@/lib/api-client';
import { listWatched, OPEN_PICTURE_EVENT, PICTURE_PARAM, subscribeWatched, unwatchPicture, type WatchedPicture } from '@/lib/ai-watch';
import { useAuth } from '@/lib/auth';
import { qk } from '@/lib/queries/keys';

const NONE: WatchedPicture[] = [];
/** How often a watched try-on is checked. */
const CHECK_EVERY_MS = 4_000;

/**
 * Site-wide: keeps checking the try-ons she left running ("Keep browsing") and shows a small
 * notice when each is ready, with "View" to open it on its design page. A failed one gets a
 * gentle notice too. Mounted once, in the app's providers.
 */
export function AiReadyNotifier() {
  const { tryOn: t } = useStrings();
  const signedIn = useAuth().status === 'authenticated';
  const router = useRouter();
  const pathname = usePathname();
  const watched = useSyncExternalStore(subscribeWatched, listWatched, () => NONE);
  const told = useRef(new Set<string>());

  const results = useQueries({
    queries: watched.map((w) => ({
      queryKey: qk.aiPicture(w.id),
      queryFn: () => api<CustomerPreviewDto>(`/me/try-on/${w.id}`),
      enabled: signedIn,
      retry: false,
      refetchInterval: (q: { state: { data?: CustomerPreviewDto } }) =>
        q.state.data && (q.state.data.status === 'DONE' || q.state.data.status === 'FAILED') ? false : CHECK_EVERY_MS,
    })),
  });

  // Where "View" goes: her picture on its design page (opened at once if she is already there).
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    results.forEach((r, i) => {
      const w = watched[i];
      if (!w || told.current.has(w.id)) return;
      const view = () => {
        const page = `/abayas/${w.designSlug}`;
        if (pathRef.current === page) window.dispatchEvent(new CustomEvent(OPEN_PICTURE_EVENT, { detail: w.id }));
        else router.push(`${page}?${PICTURE_PARAM}=${encodeURIComponent(w.id)}`);
      };
      if (r.data?.status === 'DONE') {
        told.current.add(w.id);
        unwatchPicture(w.id);
        toast.success(t.readyTitle, { description: t.readyBody(w.designName), duration: 20_000, action: { label: t.readyView, onClick: view } });
      } else if (r.data?.status === 'FAILED') {
        told.current.add(w.id);
        unwatchPicture(w.id);
        toast.error(t.readyFailedTitle, { description: t.readyFailedBody(w.designName), duration: 12_000 });
      } else if (r.error && isApiError(r.error) && r.error.status === 404) {
        // Deleted, or no longer hers to see: nothing to tell.
        told.current.add(w.id);
        unwatchPicture(w.id);
      }
    });
  }, [results, watched, router, t]);

  return null;
}
