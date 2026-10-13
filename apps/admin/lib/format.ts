import { formatINR } from '@abaya/contracts';
import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';

export { formatINR };

export const formatMoney = (paise: number | null | undefined): string =>
  paise === null || paise === undefined ? '—' : formatINR(paise);

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === 'string' ? parseISO(value) : value;
  return isValid(d) ? d : null;
}

export const formatDate = (value: string | Date | null | undefined): string => {
  const d = toDate(value);
  return d ? format(d, 'd MMM yyyy') : '—';
};

export const formatDateTime = (value: string | Date | null | undefined): string => {
  const d = toDate(value);
  return d ? format(d, 'd MMM yyyy, HH:mm') : '—';
};

export const formatRelative = (value: string | Date | null | undefined): string => {
  const d = toDate(value);
  return d ? `${formatDistanceToNowStrict(d)} ago` : '—';
};

export const isPast = (value: string | null | undefined): boolean => {
  const d = toDate(value);
  return d ? d.getTime() < Date.now() : false;
};

/** "CHANGES_REQUESTED" → "Changes requested" (fallback label for enum values). */
export const humanize = (value: string): string =>
  value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');

/** ₹ text input → integer paise, or null when empty/invalid. */
export function rupeesInputToPaise(value: string): number | null {
  const trimmed = value.replace(/[,₹\s]/g, '');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export const paiseToRupeesInput = (paise: number | null | undefined): string =>
  paise === null || paise === undefined ? '' : String(paise / 100);

export const initials = (text: string | null | undefined): string =>
  (text ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';
