import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

// One Prisma client per process. In dev, reuse it across hot reloads so we do
// not exhaust Supabase pooler connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
