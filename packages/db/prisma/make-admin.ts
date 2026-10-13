/**
 * Give an existing user the SUPER_ADMIN role.
 * The user must have logged in once (so the API created their User row).
 *
 * Run: pnpm --filter @abaya/db make-admin you@example.com
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error('Usage: tsx prisma/make-admin.ts <email>');

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user with email ${email}. Log in once first.`);

  const roles = Array.from(new Set([...user.roles, 'SUPER_ADMIN' as const]));
  await prisma.user.update({ where: { id: user.id }, data: { roles } });
  await prisma.auditLog.create({
    data: {
      action: 'user.roles_changed',
      entityType: 'User',
      entityId: user.id,
      before: { roles: user.roles },
      after: { roles },
    },
  });
  console.log(`${email} is now SUPER_ADMIN.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
