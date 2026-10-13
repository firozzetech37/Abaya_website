/**
 * Recreates the e2e database, applies every migration and runs the seed.
 * Refuses to touch anything that is not on localhost.
 */
const { execSync } = require('node:child_process');
const path = require('node:path');

module.exports = async () => {
  const url = new URL(process.env.E2E_DATABASE_URL || 'postgresql://postgres@127.0.0.1:55432/abaya_e2e');
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) && process.env.E2E_ALLOW_REMOTE !== '1') {
    throw new Error(`Refusing to reset a non-local database (${url.hostname}). E2E tests wipe the database.`);
  }
  const dbName = url.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';

  const db = path.resolve(__dirname, '../../../packages/db');
  const run = (cmd, env = {}) =>
    execSync(cmd, { cwd: db, stdio: 'pipe', env: { ...process.env, ...env } });

  const sql = (q) => run(`psql "${admin.toString()}" -v ON_ERROR_STOP=1 -qc "${q}"`);
  sql(`DROP DATABASE IF EXISTS \\"${dbName}\\" WITH (FORCE)`);
  sql(`CREATE DATABASE \\"${dbName}\\"`);

  const env = { DATABASE_URL: url.toString(), DIRECT_URL: url.toString() };
  run('npx prisma migrate deploy', env);
  run('npx tsx prisma/seed.ts', env);
};
