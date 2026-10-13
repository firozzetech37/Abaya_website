import { NotFoundView } from '@/components/layout/not-found-view';

/** Unknown pages in either language; the view reads the page language from context. */
export default function NotFound() {
  return <NotFoundView />;
}
