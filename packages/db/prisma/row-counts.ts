/**
 * Print the exact row count of every table in the public schema, plus whether
 * Row Level Security is enabled on it. Read-only.
 *
 * Run: pnpm --filter @abaya/db counts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tables = await prisma.$queryRaw<{ name: string; rls: boolean }[]>`
    SELECT c.relname AS name, c.relrowsecurity AS rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname`;

  const rows: { table: string; rows: number; rls: string }[] = [];
  for (const t of tables) {
    // Table names come from pg_class above, never from user input; quoted as identifiers.
    const [result] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*) AS count FROM public."${t.name.replace(/"/g, '""')}"`,
    );
    rows.push({ table: t.name, rows: Number(result?.count ?? 0), rls: t.rls ? 'on' : 'OFF' });
  }

  console.table(rows);
  const withoutRls = rows.filter((r) => r.rls === 'OFF').map((r) => r.table);
  if (withoutRls.length > 0) {
    console.warn(`RLS is OFF on: ${withoutRls.join(', ')}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
