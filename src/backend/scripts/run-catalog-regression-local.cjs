/** Creates isolated clones of the existing synthetic local fixture; no migrations, services or container changes. */
const { PrismaClient } = require('@prisma/client');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { mkdirSync, writeFileSync } = require('node:fs');
const backend = resolve(__dirname, '..');
const out = resolve(backend, '../../docs/biblioteca-dominio/evidencia/cierre-importador-20261030');
const admin = new PrismaClient({ datasources: { db: { url: 'postgresql://pgtest@127.0.0.1:55433/postgres' } } });
(async () => {
  const identity = await admin.$queryRawUnsafe('SELECT current_database() AS db, inet_server_addr()::text AS host, inet_server_port() AS port');
  if (identity[0]?.db !== 'postgres' || !['127.0.0.1', '127.0.0.1/32'].includes(identity[0]?.host) || identity[0]?.port !== 55433) throw new Error('Unexpected local PostgreSQL destination');
  const template = new PrismaClient({ datasources: { db: { url: 'postgresql://pgtest@127.0.0.1:55433/mt_journey?schema=public' } } });
  try {
    const columns = await template.$queryRawUnsafe("SELECT column_name,is_nullable FROM information_schema.columns WHERE table_name='products' AND column_name IN ('brandId','categoryId')");
    if (columns.length !== 2 || columns.some((column) => column.is_nullable !== 'YES')) throw new Error('Existing fixture lacks candidate classification schema; no migration is run automatically');
  } finally { await template.$disconnect(); }
  const env = { ...process.env, NODE_ENV: 'test', LIBRARY_DATABASE_MODE: 'legacy' };
  const databases = [];
  for (const kind of ['race', 'backfill']) {
    const name = `mt_close_tests_${kind}_${randomBytes(3).toString('hex')}`;
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}" TEMPLATE "mt_journey"`);
    env[`CATALOG_${kind.toUpperCase()}_TEST_URL`] = `postgresql://pgtest@127.0.0.1:55433/${name}?schema=public`;
    databases.push(name);
    console.log(`Verified local PostgreSQL 127.0.0.1:55433: ${name}`);
  }
  env.DATABASE_URL = env.CATALOG_RACE_TEST_URL;
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, 'regression-destinations.json'), JSON.stringify({ identity: identity[0], template: 'mt_journey', databases, retained: true, migrationsRun: false }, null, 2));
  const result = spawnSync(process.execPath, ['node_modules/jest/bin/jest.js', '--runInBand', '--json', `--outputFile=${resolve(out, 'regression-resolved.json')}`, '--runTestsByPath',
    'src/modules/products/import/pipeline/batch-executor.service.spec.ts', 'src/modules/products/product-revisions.backfill.spec.ts',
    'src/modules/products/products.biblioteca-grants.spec.ts', 'src/modules/products/transition.service.spec.ts'], { cwd: backend, env, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => admin.$disconnect());
