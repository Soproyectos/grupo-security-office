// Deletes the access sources that an old "work package" left behind, ONLY in the local copy
// of production data. The API already ignores these rows (they grant nothing); this script
// removes them for good so the copy matches what the app shows.
//
// Usage (from src/backend):
//   DATABASE_URL=<local copy url> node scripts/purge-package-access-sources.mjs          # dry-run (default)
//   DATABASE_URL=<local copy url> node scripts/purge-package-access-sources.mjs --apply  # deletes
//
// Safety: it aborts unless DATABASE_URL contains `127.0.0.1:54329/gs_prod_copy`. The URL is never printed.
// What counts as a package source: kind = 'template' and templateId <> 'biblioteca-seleccion'
// (the Library checkbox selection is a direct choice, not a package, and is kept).
// Manual sources are never touched. Their grants are deleted by the foreign key (ON DELETE CASCADE).
import pg from 'pg';

const REQUIRED_TARGET = '127.0.0.1:54329/gs_prod_copy';
const KEEP_TEMPLATE_ID = 'biblioteca-seleccion';
const PACKAGE_SOURCE = `kind = 'template' AND "templateId" IS DISTINCT FROM $1`;

const url = process.env.DATABASE_URL ?? '';
if (!url.includes(REQUIRED_TARGET)) {
  console.error(`ABORTED: DATABASE_URL must point to ${REQUIRED_TARGET} (the local copy). Nothing was done.`);
  process.exit(1);
}
const apply = process.argv.includes('--apply');

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const sources = await client.query(`SELECT COUNT(*)::int AS n, COUNT(DISTINCT "userId")::int AS users FROM access_sources WHERE ${PACKAGE_SOURCE}`, [KEEP_TEMPLATE_ID]);
  const grants = await client.query(`SELECT COUNT(*)::int AS n FROM access_grants WHERE "sourceId" IN (SELECT id FROM access_sources WHERE ${PACKAGE_SOURCE})`, [KEEP_TEMPLATE_ID]);
  const byPackage = await client.query(`SELECT "templateId", COUNT(*)::int AS n FROM access_sources WHERE ${PACKAGE_SOURCE} GROUP BY "templateId" ORDER BY n DESC`, [KEEP_TEMPLATE_ID]);
  const kept = await client.query(`SELECT COUNT(*)::int AS n FROM access_sources WHERE NOT (${PACKAGE_SOURCE})`, [KEEP_TEMPLATE_ID]);

  console.log(`Package sources found: ${sources.rows[0].n} (users affected: ${sources.rows[0].users}, grants inside: ${grants.rows[0].n})`);
  for (const row of byPackage.rows) console.log(`  ${row.templateId ?? '(no templateId)'}: ${row.n}`);
  console.log(`Sources that stay (manual + Library selection): ${kept.rows[0].n}`);

  if (!apply) {
    console.log('Dry-run: nothing was deleted. Run again with --apply to delete.');
  } else if (sources.rows[0].n === 0) {
    console.log('Nothing to delete.');
  } else {
    await client.query('BEGIN');
    const deleted = await client.query(`DELETE FROM access_sources WHERE ${PACKAGE_SOURCE}`, [KEEP_TEMPLATE_ID]);
    const left = await client.query(`SELECT COUNT(*)::int AS n FROM access_sources WHERE ${PACKAGE_SOURCE}`, [KEEP_TEMPLATE_ID]);
    if (left.rows[0].n !== 0) throw new Error('Package sources still present after delete; rolled back.');
    await client.query('COMMIT');
    console.log(`Deleted ${deleted.rowCount} package sources (their grants went with them).`);
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('FAILED:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
