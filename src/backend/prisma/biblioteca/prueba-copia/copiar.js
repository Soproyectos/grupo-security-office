// T11 development-only contract copy. No URLs, credentials, DDL or production
// entrypoint. Callers supply already isolated clients and exact run identities.
// Copies T03 + UploadedFile; refuses nonempty additive tables rather than losing them.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const contract = require('./contrato.json');
const tables = new Map(contract.tables.map((table) => [table.name, table]));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 10000;
const options = { isolationLevel: 'RepeatableRead', timeout: 30000, maxWait: 5000 };
const quote = (name) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('GS_COPY_IDENTIFIER');
  return `"${name}"`;
};
const relation = (name) => {
  if (!tables.has(name) && !contract.libraryExtras.includes(name)) throw new Error('GS_COPY_TABLE');
  return `public.${quote(name)}`;
};

function insertionOrder() {
  const result = [];
  const pending = new Set(tables.keys());
  while (pending.size) {
    const ready = [...pending].filter((table) => contract.foreignKeys
      .filter((fk) => fk.table === table && contract.cycleFields[table] !== fk.column)
      .every((fk) => result.includes(fk.target))).sort();
    if (!ready.length) throw new Error('GS_COPY_UNSUPPORTED_CYCLE');
    ready.forEach((table) => { pending.delete(table); result.push(table); });
  }
  return result;
}
const order = insertionOrder();

function expectedTables(expected) {
  return [...tables.keys(), ...(expected.role === 'library' ? contract.libraryExtras : [])].sort();
}

async function identity(client, expected) {
  if (!['library', 'operational'].includes(expected.role)
      || !/^\d{14}-[a-f0-9]{8}$/.test(expected.run)
      || !/^\d{1,3}(\.\d{1,3}){3}$/.test(expected.ip)) throw new Error('GS_COPY_EXPECTED_IDENTITY');
  const prefix = expected.role === 'library' ? 'biblioteca' : 'operativo';
  assert.equal(expected.database, `gs_test_${prefix}_${expected.run.replace('-', '_')}`, 'GS_COPY_DATABASE_NAME');
  assert.equal(expected.cluster, `gs-test-runtime-${expected.role}-${expected.run}`, 'GS_COPY_CLUSTER_NAME');
  const rows = await client.$queryRawUnsafe(`SELECT current_database()::text AS database,
    current_user::text AS username, session_user::text AS session_username,
    host(inet_server_addr()) AS ip, inet_server_port() AS port,
    current_setting('cluster_name') AS cluster,current_setting('data_directory') AS data_directory,
    current_setting('server_version_num')::int AS version`);
  assert.equal(rows.length, 1, 'GS_COPY_IDENTITY_ROWS');
  const actual = rows[0];
  assert.ok(actual.version >= 180000 && actual.version < 190000, 'GS_COPY_PG18');
  assert.deepEqual({ ...actual, version: undefined }, { database: expected.database, username: 'gs_it', session_username: 'gs_it',
    ip: expected.ip, port: 5432, cluster: expected.cluster, data_directory: '/var/lib/postgresql/18/docker', version: undefined }, 'GS_COPY_DESTINATION_IDENTITY');
}

async function session(client) {
  await client.$executeRawUnsafe('SET LOCAL search_path = public, pg_catalog');
  await client.$executeRawUnsafe("SET LOCAL statement_timeout = '3s'");
  await client.$executeRawUnsafe("SET LOCAL lock_timeout = '1s'");
  await client.$executeRawUnsafe("SET LOCAL idle_in_transaction_session_timeout = '5s'");
  await client.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
}

async function schema(client, expected) {
  const names = await client.$queryRawUnsafe(`SELECT c.relname::text AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`);
  assert.deepEqual(names.map((r) => r.name).sort(), expectedTables(expected), 'GS_COPY_SCHEMA_TABLES');
  const columns = await client.$queryRawUnsafe(`SELECT c.relname::text AS table_name,a.attname::text AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS "notNull"
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`);
  const pks = await client.$queryRawUnsafe(`SELECT c.relname::text AS table_name,k.conname::text AS name,array_agg(a.attname::text ORDER BY key_column.key_position) AS columns
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL unnest(k.conkey) WITH ORDINALITY AS key_column(attnum,key_position)
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=key_column.attnum WHERE n.nspname='public' AND k.contype='p' GROUP BY c.relname,k.conname`);
  for (const table of tables.values()) {
    assert.deepEqual(columns.filter((c) => c.table_name === table.name).map(({ table_name, ...rest }) => rest), table.columns, `GS_COPY_COLUMNS_${table.name}`);
    const key = pks.find((p) => p.table_name === table.name);
    assert.deepEqual(key && { name: key.name, columns: key.columns }, table.primaryKey, `GS_COPY_PK_${table.name}`);
  }
  const fks = await client.$queryRawUnsafe(`SELECT c.relname::text AS "table",k.conname::text AS name,a.attname::text AS column,t.relname::text AS target,b.attname::text AS "targetColumn",k.confdeltype::text AS "deleteAction",k.confupdtype::text AS "updateAction"
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class t ON t.oid=k.confrelid
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.conkey[1] JOIN pg_attribute b ON b.attrelid=t.oid AND b.attnum=k.confkey[1]
    WHERE n.nspname='public' AND k.contype='f' AND k.convalidated AND k.conenforced AND NOT k.condeferrable`);
  assert.deepEqual(fks.filter((f) => tables.has(f.table)).sort((a, b) => a.name.localeCompare(b.name)), [...contract.foreignKeys].sort((a, b) => a.name.localeCompare(b.name)), 'GS_COPY_FKS');
}

async function empty(client, names, prefix = 'GS_COPY_TARGET_NOT_EMPTY') {
  for (const name of names) {
    const rows = await client.$queryRawUnsafe(`SELECT EXISTS(SELECT FROM ${relation(name)} LIMIT 1) AS occupied`);
    if (rows[0].occupied) throw new Error(`${prefix}_${name}`);
  }
}

async function capture(client) {
  let bytes = 0;
  const result = new Map();
  for (const name of order) {
    const keys = tables.get(name).primaryKey.columns.map((k) => `t.${quote(k)}`).join(',');
    // jsonb_populate_record maps JSON null to SQL NULL. Encode JSONB columns as
    // their SQL text so literal JSON null remains distinct from a null column.
    const json = tables.get(name).columns.filter((c) => c.type === 'jsonb');
    const encoded = json.length ? `to_jsonb(t) || jsonb_build_object(${json.map((c) => `'${c.name}',t.${quote(c.name)}::text`).join(',')})` : 'to_jsonb(t)';
    const [{ rows, payload }] = await client.$queryRawUnsafe(`SELECT count(*)::int AS rows,COALESCE(jsonb_agg(${encoded} ORDER BY ${keys}),'[]'::jsonb)::text AS payload FROM ${relation(name)} AS t`);
    bytes += Buffer.byteLength(payload);
    if (rows > MAX_ROWS || bytes > MAX_BYTES) throw new Error('GS_COPY_SYNTHETIC_LIMIT');
    result.set(name, { rows, payload, sha256: sha(payload) });
  }
  return result;
}
const report = (snapshot) => Object.fromEntries([...snapshot].map(([name, { rows, sha256 }]) => [name, { rows, sha256 }]));

async function snapshot(client, expected) {
  await identity(client, expected);
  return client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await identity(tx, expected);
    await session(tx);
    await schema(tx, expected);
    if (expected.role === 'library') await empty(tx, contract.libraryExtras, 'GS_COPY_UNSUPPORTED_ADDITIVE_DATA');
    return capture(tx);
  }, options);
}

async function copySynthetic(source, destination, expectedSource, expectedDestination, injectFailureAfterTable) {
  if (expectedSource.role === expectedDestination.role || expectedSource.run !== expectedDestination.run
      || expectedSource.ip === expectedDestination.ip) throw new Error('GS_COPY_DISTINCT_SERVERS_REQUIRED');
  if (injectFailureAfterTable !== undefined && (!Number.isInteger(injectFailureAfterTable) || injectFailureAfterTable < 1 || injectFailureAfterTable > order.length)) throw new Error('GS_COPY_FAILURE_TEST_ARGUMENT');
  const sourceData = await snapshot(source, expectedSource);
  await identity(destination, expectedDestination);
  return destination.$transaction(async (tx) => {
    await identity(tx, expectedDestination);
    await session(tx);
    await schema(tx, expectedDestination);
    await tx.$executeRawUnsafe(`LOCK TABLE ${expectedTables(expectedDestination).map(relation).join(',')} IN ACCESS EXCLUSIVE MODE`);
    await empty(tx, expectedTables(expectedDestination));
    let inserted = 0;
    for (const name of order) {
      const cycle = contract.cycleFields[name];
      const value = cycle ? `jsonb_set(source.value,'{${cycle}}','null'::jsonb)` : 'source.value';
      const columns = tables.get(name).columns;
      const projection = columns.map((c) => c.type === 'jsonb' ? `(source.value->>'${c.name}')::jsonb` : `record_value.${quote(c.name)}`).join(',');
      await tx.$executeRawUnsafe(`INSERT INTO ${relation(name)} (${columns.map((c) => quote(c.name)).join(',')}) SELECT ${projection} FROM jsonb_array_elements($1::jsonb) AS source(value) CROSS JOIN LATERAL jsonb_populate_record(NULL::${relation(name)},${value}) AS record_value`, sourceData.get(name).payload);
      if (++inserted === injectFailureAfterTable) throw new Error('GS_COPY_INJECTED_FAIL');
    }
    for (const [name, column] of Object.entries(contract.cycleFields)) {
      await tx.$executeRawUnsafe(`UPDATE ${relation(name)} AS target SET ${quote(column)}=source.${quote(column)} FROM jsonb_populate_recordset(NULL::${relation(name)},$1::jsonb) AS source WHERE target.id=source.id`, sourceData.get(name).payload);
    }
    const destinationData = await capture(tx);
    assert.deepEqual(report(destinationData), report(sourceData), 'GS_COPY_CONTENT_MISMATCH');
    if (expectedDestination.role === 'library') await empty(tx, contract.libraryExtras);
    return { scope: contract.scope, tableCount: order.length, tables: report(sourceData) };
  }, options);
}

// Test-fixture cleanup only: exact owned identity/schema and complete content
// fingerprint must match before any DELETE. It never drops tables/databases.
async function clearSyntheticFixture(client, expected, expectedContent) {
  await identity(client, expected);
  return client.$transaction(async (tx) => {
    await identity(tx, expected);
    await session(tx);
    await schema(tx, expected);
    await tx.$executeRawUnsafe(`LOCK TABLE ${expectedTables(expected).map(relation).join(',')} IN ACCESS EXCLUSIVE MODE`);
    if (expected.role === 'library') await empty(tx, contract.libraryExtras);
    assert.deepEqual(report(await capture(tx)), expectedContent, 'GS_COPY_FIXTURE_CHANGED_REFUSE_DELETE');
    for (const [name, column] of Object.entries(contract.cycleFields)) {
      await tx.$executeRawUnsafe(`UPDATE ${relation(name)} SET ${quote(column)}=NULL`);
    }
    for (const name of [...order].reverse()) await tx.$executeRawUnsafe(`DELETE FROM ${relation(name)}`);
    await empty(tx, expectedTables(expected));
  }, options);
}

module.exports = { copySynthetic, snapshot, report, insertionOrder, identity, schema, expectedTables, clearSyntheticFixture, contract };
