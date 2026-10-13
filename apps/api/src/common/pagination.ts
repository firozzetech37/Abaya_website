import { DomainError } from './errors/domain-error';

/** Opaque cursor = base64url of the last returned row id (Prisma `cursor` + `skip: 1`). */
export const encodeCursor = (id: string): string => Buffer.from(id, 'utf8').toString('base64url');

export function decodeCursor(cursor: string | undefined): string | undefined {
  if (!cursor) return undefined;
  const id = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new DomainError('VALIDATION', 'VALIDATION_FAILED', 'Invalid cursor.');
  }
  return id;
}

/** Prisma args for one page: fetch limit + 1 rows to know whether another page exists. */
export function pageArgs(cursor: string | undefined, limit: number) {
  const id = decodeCursor(cursor);
  return { take: limit + 1, ...(id ? { cursor: { id }, skip: 1 } : {}) };
}

/** Trim the extra row and compute the next cursor. */
export function toPage<T extends { id: string }, R>(
  rows: T[],
  limit: number,
  map: (row: T) => R,
): { items: R[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];
  return { items: pageRows.map(map), nextCursor: hasMore && last ? encodeCursor(last.id) : null };
}
