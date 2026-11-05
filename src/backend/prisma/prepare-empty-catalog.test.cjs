'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')
const { REQUIRED_MIGRATIONS, SEEDED_BANNER_IDS, parseCli, prepareEmptyCatalog } = require('./prepare-empty-catalog.cjs')

const DATABASE_URL = 'postgresql://synthetic:synthetic@localhost/source_catalog?schema=public'
const TARGET_NAME = 'gs_empty_20261105_release'
const PUBLIC_TABLES = [
  '_prisma_migrations', 'categories', 'storefront_banners', 'roles', 'role_permissions', 'users', 'user_roles',
  'user_mfa', 'mfa_backup_codes', 'user_permissions', 'access_states', 'access_sources', 'access_grants',
  'subcategories', 'products', 'prices',
]

const sourceRows = {
  users: [{ id: 'sa-synthetic', email: 'admin@example.test', name: 'Synthetic Admin', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', password: 'synthetic-password-hash', supervisorId: null, passwordChangedAt: null }],
  roles: [
    { id: 'role-admin', name: 'Super Admin', description: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'role-operator', name: 'Operador', description: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  ],
  role_permissions: [
    { roleId: 'role-admin', permission: 'users:manage', createdAt: '2026-01-01T00:00:00.000Z' },
    { roleId: 'role-operator', permission: 'products:read', createdAt: '2026-01-01T00:00:00.000Z' },
  ],
  user_roles: [
    { userId: 'sa-synthetic', roleId: 'role-admin', createdAt: '2026-01-01T00:00:00.000Z' },
    { userId: 'sa-synthetic', roleId: 'role-operator', createdAt: '2026-01-01T00:00:00.000Z' },
    { userId: 'other-user', roleId: 'role-operator', createdAt: '2026-01-01T00:00:00.000Z' },
  ],
  user_mfa: [
    { id: 'mfa-synthetic', userId: 'sa-synthetic', secret: 'synthetic-mfa-secret', enabled: true, confirmedAt: null, lastUsedAt: null, lastCode: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'mfa-other', userId: 'other-user', secret: 'other-synthetic-secret', enabled: true, confirmedAt: null, lastUsedAt: null, lastCode: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  ],
  mfa_backup_codes: [
    { id: 'backup-synthetic', mfaId: 'mfa-synthetic', codeHash: 'synthetic-code-hash', usedAt: null, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'backup-other', mfaId: 'mfa-other', codeHash: 'other-synthetic-hash', usedAt: null, createdAt: '2026-01-01T00:00:00.000Z' },
  ],
  user_permissions: [
    { id: 'permission-synthetic', userId: 'sa-synthetic', permission: 'dashboard:pack:admin', effect: 'GRANT', grantedById: null, reason: null, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'permission-other', userId: 'other-user', permission: 'products:read', effect: 'GRANT', grantedById: null, reason: null, createdAt: '2026-01-01T00:00:00.000Z' },
  ],
  access_states: [
    { userId: 'sa-synthetic', version: 3, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { userId: 'other-user', version: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  ],
  access_sources: [
    { id: 'access-source-synthetic', userId: 'sa-synthetic', kind: 'template', templateId: 'admin', catalogVersion: 'v1', grantedById: 'sa-synthetic', reason: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'access-source-other', userId: 'other-user', kind: 'template', templateId: 'operator', catalogVersion: 'v1', grantedById: 'sa-synthetic', reason: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  ],
  access_grants: [
    { id: 'access-grant-synthetic', sourceId: 'access-source-synthetic', actionId: 'products:read', scopeKind: 'global', resourceId: '', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'access-grant-other', sourceId: 'access-source-other', actionId: 'products:read', scopeKind: 'own', resourceId: '', createdAt: '2026-01-01T00:00:00.000Z' },
  ],
}

const migrationRows = REQUIRED_MIGRATIONS.map((migration_name) => ({ migration_name, finished_at: new Date('2026-01-01T00:00:00.000Z'), rolled_back_at: null, logs: null }))
const bannerRows = SEEDED_BANNER_IDS.map((id) => ({ id }))

class FakeClient {
  constructor(kind, options = {}) {
    this.kind = kind
    this.options = options
    this.log = []
    this.rows = Object.fromEntries(Object.keys(sourceRows).map((table) => [table, []]))
    this.rows.categories = []
    this.rows.subcategories = []
    this.rows.products = []
    this.rows.prices = []
    this.rows.storefront_banners = [...bannerRows]
    this.failInsertTable = options.failInsertTable
    this.nonEmptyTable = options.nonEmptyTable
    this.migrationRows = options.migrationRows ?? migrationRows
    this.eventHandlers = new Map()
    this.connected = false
    this.inTransaction = false
    this.snapshotBeforeTransaction = null
  }

  async connect() { this.connected = true }
  async end() { this.connected = false }
  on(event, handler) { this.eventHandlers.set(event, handler); return this }

  async query(text, params = []) {
    this.log.push({ text, params })
    const sql = text.replace(/\s+/g, ' ').trim()
    if (this.kind === 'source' && this.inTransaction && !/^(SELECT|ROLLBACK|COMMIT|SELECT set_config)/i.test(sql)) {
      throw new Error('synthetic source write rejected')
    }
    if (sql.startsWith('BEGIN')) {
      this.inTransaction = true
      if (this.kind === 'target') this.snapshotBeforeTransaction = structuredClone(this.rows)
      return { rows: [], rowCount: null }
    }
    if (sql === 'COMMIT') { this.inTransaction = false; return { rows: [], rowCount: null } }
    if (sql === 'ROLLBACK') {
      if (this.kind === 'target' && this.snapshotBeforeTransaction) this.rows = this.snapshotBeforeTransaction
      this.inTransaction = false
      return { rows: [], rowCount: null }
    }
    if (sql.startsWith('SELECT set_config')) return { rows: [{ set_config: '' }], rowCount: 1 }
    if (sql === 'SELECT current_database() AS name') {
      return { rows: [{ name: this.kind === 'source' ? 'source_catalog' : (this.options.targetDatabase ?? TARGET_NAME) }], rowCount: 1 }
    }

    if (this.kind === 'source') return this.sourceQuery(sql, params)
    return this.targetQuery(sql, params)
  }

  sourceQuery(sql, params) {
    if (sql.includes('FROM public."users" users') || sql.includes('FROM public."users"')) {
      const tableRows = this.options.sourceUsers ?? sourceRows.users
      if (sql.includes('EXISTS') && params[0] === 'Super Admin') {
        const columns = sql.slice('SELECT '.length, sql.indexOf(' FROM')).split(',').map((value) => value.trim().replaceAll('"', ''))
        return { rows: tableRows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]]))), rowCount: tableRows.length }
      }
    }
    const table = sql.match(/FROM public\."([a-z_]+)"/)?.[1]
    if (!table || !sourceRows[table]) throw new Error('synthetic unexpected source select')
    let rows = sourceRows[table]
    if (sql.includes('"userId" = $1')) rows = rows.filter((row) => row.userId === params[0] || row.id === params[0])
    if (sql.includes('"mfaId" = ANY')) rows = rows.filter((row) => params[0].includes(row.mfaId))
    if (sql.includes('"sourceId" = ANY')) rows = rows.filter((row) => params[0].includes(row.sourceId))
    const columns = sql.slice('SELECT '.length, sql.indexOf(' FROM')).split(',').map((value) => value.trim().replaceAll('"', ''))
    return { rows: rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]]))), rowCount: rows.length }
  }

  targetQuery(sql, params) {
    if (sql.includes('FROM pg_catalog.pg_tables')) {
      return { rows: PUBLIC_TABLES.map((tablename) => ({ tablename })), rowCount: PUBLIC_TABLES.length }
    }
    if (sql.includes('FROM public."_prisma_migrations"')) return { rows: this.migrationRows, rowCount: this.migrationRows.length }
    if (sql.includes('COUNT(*)::text AS count FROM public."categories"')) return { rows: [{ count: String(this.rows.categories.length) }], rowCount: 1 }
    if (sql.includes('FROM public."storefront_banners"')) return { rows: this.rows.storefront_banners, rowCount: this.rows.storefront_banners.length }
    if (sql.startsWith('SELECT EXISTS')) {
      const table = sql.match(/FROM public\."([a-z_]+)"/)?.[1]
      return { rows: [{ present: table === this.nonEmptyTable }], rowCount: 1 }
    }
    if (sql.startsWith('INSERT INTO public.')) {
      const match = sql.match(/^INSERT INTO public\."([a-z_]+)" \(([^)]+)\) VALUES/)
      if (!match) throw new Error('synthetic insert SQL unsupported')
      const [, table, rawColumns] = match
      if (table === this.failInsertTable) throw new Error('synthetic insert failure with secret details')
      const columns = rawColumns.split(',').map((value) => value.trim().replaceAll('"', ''))
      const row = Object.fromEntries(columns.map((column, index) => [column, params[index]]))
      if (!this.rows[table]) this.rows[table] = []
      this.rows[table].push(row)
      return { rows: [], rowCount: 1 }
    }
    if (sql.includes('COUNT(*)::int FROM public."users"')) {
      return { rows: [{ users: this.rows.users.length, products: this.rows.products.length, prices: this.rows.prices.length }], rowCount: 1 }
    }
    if (sql.includes('COUNT(*)::int AS count FROM public."categories"')) {
      return { rows: [{ count: this.rows.categories.filter((row) => row.parentId === null).length }], rowCount: 1 }
    }
    if (sql.includes('COUNT(*)::int AS count FROM public."subcategories"')) return { rows: [{ count: this.rows.subcategories.length }], rowCount: 1 }
    if (sql.includes('COUNT(*)::int AS count FROM public."products"')) return { rows: [{ count: this.rows.products.length }], rowCount: 1 }
    if (sql.includes('COUNT(*)::int AS count FROM public."prices"')) return { rows: [{ count: this.rows.prices.length }], rowCount: 1 }

    const table = sql.match(/FROM public\."([a-z_]+)"/)?.[1]
    if (!table) throw new Error('synthetic unexpected target query')
    let rows = this.rows[table] ?? []
    if (sql.includes('"userId" = $1')) rows = rows.filter((row) => row.userId === params[0] || row.id === params[0])
    if (sql.includes('"mfaId" = ANY')) rows = rows.filter((row) => params[0].includes(row.mfaId))
    if (sql.includes('"sourceId" = ANY')) rows = rows.filter((row) => params[0].includes(row.sourceId))
    const columns = sql.slice('SELECT '.length, sql.indexOf(' FROM')).split(',').map((value) => value.trim().replaceAll('"', ''))
    return { rows: rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]]))), rowCount: rows.length }
  }
}

function clients(options = {}) {
  const made = []
  const factory = (url) => {
    const client = new FakeClient(url.includes('/source_catalog') ? 'source' : 'target', options)
    made.push(client)
    return client
  }
  return { factory, made }
}

function validInput(overrides = {}) {
  return {
    databaseUrl: DATABASE_URL,
    targetName: TARGET_NAME,
    apply: true,
    approvedTarget: TARGET_NAME,
    ...overrides,
  }
}

test('rechaza CLI sin argumentos y gates inválidos antes de crear conexiones', async () => {
  const noArgs = spawnSync(process.execPath, [path.join(__dirname, 'prepare-empty-catalog.cjs')], {
    encoding: 'utf8', env: { ...process.env, DATABASE_URL: DATABASE_URL, GS_EMPTY_CATALOG_APPROVED: TARGET_NAME },
  })
  assert.notEqual(noArgs.status, 0)
  assert.match(noArgs.stderr, /GS_EMPTY_USAGE/)
  assert.doesNotMatch(noArgs.stderr, /source_catalog|synthetic/)

  const state = clients()
  await assert.rejects(prepareEmptyCatalog({ ...validInput(), apply: false, clientFactory: state.factory }), { code: 'GS_EMPTY_APPLY_REQUIRED' })
  await assert.rejects(prepareEmptyCatalog({ ...validInput(), approvedTarget: 'different', clientFactory: state.factory }), { code: 'GS_EMPTY_TARGET_APPROVAL' })
  await assert.rejects(prepareEmptyCatalog({ ...validInput(), targetName: 'source_catalog', clientFactory: state.factory }), { code: 'GS_EMPTY_TARGET_NAME' })
  assert.equal(state.made.length, 0)
  assert.throws(() => parseCli(['--target', TARGET_NAME, '--apply'], 'different'), { code: 'GS_EMPTY_TARGET_APPROVAL' })
})

test('usa snapshot de solo lectura y copia solo al Super Admin, sus permisos y taxonomía', async () => {
  const state = clients()
  const result = await prepareEmptyCatalog({ ...validInput(), clientFactory: state.factory })
  const [source, target] = state.made
  assert.equal(result.categories, 9)
  assert.equal(result.subcategories, 66)
  assert.equal(result.products, 0)
  assert.equal(result.prices, 0)
  assert.ok(source.log.some(({ text }) => text === 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'))
  assert.ok(source.log.every(({ text }) => /^(SELECT|ROLLBACK|BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY)/i.test(text.replace(/\s+/g, ' ').trim())))
  assert.ok(source.log.some(({ text }) => text === 'ROLLBACK'))
  assert.equal(target.rows.users.length, 1)
  assert.deepEqual(target.rows.user_roles.map((row) => row.userId), ['sa-synthetic', 'sa-synthetic'])
  assert.equal(target.rows.roles.length, 2)
  assert.equal(target.rows.role_permissions.length, 2)
  assert.equal(target.rows.user_mfa.length, 1)
  assert.equal(target.rows.mfa_backup_codes.length, 1)
  assert.equal(target.rows.user_permissions.length, 1)
  assert.equal(target.rows.access_states.length, 1)
  assert.equal(target.rows.access_sources.length, 1)
  assert.equal(target.rows.access_grants.length, 1)
  assert.equal(target.rows.categories.length, 9)
  assert.equal(target.rows.categories.filter((row) => row.parentId !== null).length, 0)
  assert.equal(target.rows.subcategories.length, 66)
  const categoryIds = new Set(target.rows.categories.map((row) => row.id))
  assert.ok(target.rows.subcategories.every((row) => categoryIds.has(row.categoryId)))
  assert.equal(target.rows.categories[0].name, 'Alarmas')
  assert.equal(target.rows.subcategories[0].name, 'Accesorios para alarmas')
  assert.equal(target.rows.products.length, 0)
  assert.equal(target.rows.prices.length, 0)
  assert.deepEqual(target.rows.storefront_banners.map((row) => row.id), SEEDED_BANNER_IDS)
  assert.ok(target.log.some(({ text }) => text === 'COMMIT'))
})

test('rechaza destino con cualquier tabla pública ocupada antes de escribir', async () => {
  const state = clients({ nonEmptyTable: 'roles' })
  await assert.rejects(prepareEmptyCatalog({ ...validInput(), clientFactory: state.factory }), { code: 'GS_EMPTY_TARGET_HAS_DATA' })
  const target = state.made[1]
  assert.equal(target.log.some(({ text }) => text.startsWith('INSERT ')), false)
  assert.ok(target.log.some(({ text }) => text === 'ROLLBACK'))
})

test('cuenta todos los usuarios con rol SA antes de admitir al único activo sin supervisor', async () => {
  const validAdmin = sourceRows.users[0]
  const otherSupervisedAdmin = { ...validAdmin, id: 'sa-supervised', email: 'supervised@example.test', supervisorId: 'manager-synthetic' }
  const multipleAdmins = clients({ sourceUsers: [validAdmin, otherSupervisedAdmin] })
  await assert.rejects(prepareEmptyCatalog({ ...validInput(), clientFactory: multipleAdmins.factory }), { code: 'GS_EMPTY_SOURCE_ADMIN_COUNT' })
  assert.equal(multipleAdmins.made[1].log.some(({ text }) => text.startsWith('INSERT ')), false)

  const oneSupervisedAdmin = clients({ sourceUsers: [otherSupervisedAdmin] })
  await assert.rejects(prepareEmptyCatalog({ ...validInput(), clientFactory: oneSupervisedAdmin.factory }), { code: 'GS_EMPTY_SOURCE_ADMIN_INVALID' })
  assert.equal(oneSupervisedAdmin.made[1].log.some(({ text }) => text.startsWith('INSERT ')), false)
})

test('rechaza migraciones incompletas y seeds de banner distintos sin hacer writes', async () => {
  const migrationState = clients({ migrationRows: [{ ...migrationRows[0], finished_at: null }] })
  await assert.rejects(prepareEmptyCatalog({ ...validInput(), clientFactory: migrationState.factory }), { code: 'GS_EMPTY_MIGRATIONS_INCOMPLETE' })
  assert.equal(migrationState.made[1].log.some(({ text }) => text.startsWith('INSERT ')), false)

  const bannersState = clients({})
  bannersState.factory = (url) => {
    const client = new FakeClient(url.includes('/source_catalog') ? 'source' : 'target')
    if (client.kind === 'target') client.rows.storefront_banners = [{ id: 'unexpected-seed' }]
    bannersState.made.push(client)
    return client
  }
  await assert.rejects(prepareEmptyCatalog({ ...validInput(), clientFactory: bannersState.factory }), { code: 'GS_EMPTY_TARGET_BANNERS_UNEXPECTED' })
  assert.equal(bannersState.made[1].log.some(({ text }) => text.startsWith('INSERT ')), false)

  const forbiddenState = clients({ migrationRows: [...migrationRows, { migration_name: '20261104090000_remove_legacy_storefront_banners', finished_at: new Date(), rolled_back_at: null, logs: null }] })
  await assert.rejects(prepareEmptyCatalog({ ...validInput(), clientFactory: forbiddenState.factory }), { code: 'GS_EMPTY_MIGRATIONS_INCOMPLETE' })
  assert.equal(forbiddenState.made[1].log.some(({ text }) => text.startsWith('INSERT ')), false)

  const wrongIdentity = clients({ targetDatabase: 'different_database' })
  await assert.rejects(prepareEmptyCatalog({ ...validInput(), clientFactory: wrongIdentity.factory }), { code: 'GS_EMPTY_DATABASE_IDENTITY' })
  assert.equal(wrongIdentity.made[1].log.some(({ text }) => text.startsWith('INSERT ')), false)
})

test('una escritura fallida revierte el destino y oculta el error de conexión', async () => {
  const state = clients({ failInsertTable: 'subcategories' })
  await assert.rejects(prepareEmptyCatalog({ ...validInput(), clientFactory: state.factory }), (error) => {
    assert.equal(error.code, 'GS_EMPTY_PREPARATION_FAILED')
    assert.doesNotMatch(error.message, /synthetic insert failure|secret details/)
    return true
  })
  const [source, target] = state.made
  assert.ok(source.log.some(({ text }) => text === 'ROLLBACK'))
  assert.ok(target.log.some(({ text }) => text === 'ROLLBACK'))
  assert.equal(target.log.some(({ text }) => text === 'COMMIT'), false)
  assert.equal(target.rows.users.length, 0)
  assert.equal(target.rows.categories.length, 0)
  assert.deepEqual(target.rows.storefront_banners.map((row) => row.id), SEEDED_BANNER_IDS)
})
