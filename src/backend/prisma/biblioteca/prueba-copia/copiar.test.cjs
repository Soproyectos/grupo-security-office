const { test } = require('node:test');
const assert = require('node:assert/strict');
const { insertionOrder, identity, copySynthetic, clearSyntheticFixture, contract } = require('./copiar');
const expected = { role: 'library', run: '20261023140000-aabbccdd', database: 'gs_test_biblioteca_20261023140000_aabbccdd', ip: '172.19.0.2', cluster: 'gs-test-runtime-library-20261023140000-aabbccdd' };
const never = { $queryRawUnsafe() { throw new Error('must not query'); }, $transaction() { throw new Error('must not transact'); } };

test('scope is the 23-table transition contract plus approved UploadedFile, without operational tables', () => {
  const names = contract.tables.map((t) => t.name);
  assert.equal(names.length, 24);
  assert.equal(new Set(names).size, 24);
  assert.ok(names.includes('uploaded_files'));
  for (const name of ['users', 'roles', 'customers', 'quotes', 'assignments', 'audit_logs', 'stock']) assert.ok(!names.includes(name));
});
test('dependency order inserts parents before children and handles exactly the two nullable cycles', () => {
  const order = insertionOrder();
  for (const [parent, child] of [['brands', 'products'], ['categories', 'products'], ['listas', 'products'], ['products', 'product_revisions'], ['product_catalog_spec_groups', 'product_catalog_spec_items'], ['catalog_jobs', 'export_bundles'], ['price_import_revisions', 'price_import_revision_rows']]) {
    assert.ok(order.indexOf(parent) < order.indexOf(child), `${parent} before ${child}`);
  }
  assert.deepEqual(contract.cycleFields, { categories: 'parentId', products: 'publicRevisionId' });
  for (const [name, column] of Object.entries(contract.cycleFields)) assert.equal(contract.tables.find((t) => t.name === name).columns.find((c) => c.name === column).notNull, false);
});
test('production-like database name is rejected before any client call', async () => {
  await assert.rejects(identity(never, { ...expected, database: 'grupo_security' }), (e) => e.code === 'ERR_ASSERTION' && e.message.startsWith('GS_COPY_DATABASE_NAME'));
});
test('a different cluster is rejected before any client call', async () => {
  await assert.rejects(identity(never, { ...expected, cluster: 'production' }), (e) => e.code === 'ERR_ASSERTION' && e.message.startsWith('GS_COPY_CLUSTER_NAME'));
});
test('same domain/server or different run cannot enter a transfer', async () => {
  await assert.rejects(copySynthetic(never, never, expected, expected), (e) => e.message === 'GS_COPY_DISTINCT_SERVERS_REQUIRED');
  const target = { ...expected, role: 'operational', run: '20261023140001-aabbccdd' };
  await assert.rejects(copySynthetic(never, never, expected, target), (e) => e.message === 'GS_COPY_DISTINCT_SERVERS_REQUIRED');
});
test('fixture cleanup also refuses production-like identity before accessing data', async () => {
  await assert.rejects(clearSyntheticFixture(never, { ...expected, database: 'grupo_security' }, {}), (e) => e.code === 'ERR_ASSERTION' && e.message.startsWith('GS_COPY_DATABASE_NAME'));
});
