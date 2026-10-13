import { notFound } from 'next/navigation';

/** Any unknown address in either language shows that language's not-found page. */
export default function CatchAll() {
  notFound();
}
