#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { Client } = require('pg')

const REQUIRED_MIGRATIONS = Object.freeze([
  '20261028120000_product_internal_notes',
  '20261029150000_library_subcategories',
  '20261029150100_library_spec_dictionary',
  '20261029150200_library_product_sources',
  '20261029150300_library_spec_value_state',
  '20261029150400_library_classification_optional',
])
const FORBIDDEN_MIGRATION = '20261104090000_remove_legacy_storefront_banners'
const SEEDED_BANNER_IDS = Object.freeze([
  '3f7e1741-886c-4c54-931c-7aa577035e01',
  '3f7e1741-886c-4c54-931c-7aa577035e02',
])
const TAXONOMY_SHA256 = '04c69e3102f6459b2b1aa143fb2f6437db868c53e90917e47e30abba827d5cd5'
const TAXONOMY_PATH = path.join(__dirname, 'seed-data', 'library-taxonomy-9-66.json')
const TARGET_NAME_PATTERN = /^gs_empty_[0-9]{8}_[a-z0-9_]{1,20}$/

class PreparationError extends Error {
  constructor(code) {
    super(code)
    this.name = 'PreparationError'
    this.code = code
  }
}

function reject(code) {
  throw new PreparationError(code)
}

function parseCli(args, approval) {
  if (args.length !== 3 || args[0] !== '--target' || args[2] !== '--apply') reject('GS_EMPTY_USAGE')
  const targetName = args[1]
  if (typeof targetName !== 'string' || !TARGET_NAME_PATTERN.test(targetName)) reject('GS_EMPTY_TARGET_NAME')
  if (approval !== targetName) reject('GS_EMPTY_TARGET_APPROVAL')
  return targetName
}

function deriveTargetUrl(databaseUrl, targetName) {
  let source
  try {
    source = new URL(databaseUrl)
  } catch {
    reject('GS_EMPTY_DATABASE_URL')
  }
  if (source.protocol !== 'postgres:' && source.protocol !== 'postgresql:') reject('GS_EMPTY_DATABASE_URL')
  const sourceName = decodeURIComponent(source.pathname.replace(/^\//, ''))
  if (!sourceName || sourceName === targetName) reject('GS_EMPTY_DATABASE_SAME_TARGET')
  source.pathname = `/${targetName}`
  return { sourceName, targetUrl: source.toString() }
}

function quoteIdentifier(value) {
  if (typeof value !== 'string' || !value) reject('GS_EMPTY_SCHEMA_UNEXPECTED')
  return `"${value.replaceAll('"', '""')}"`
}

async function setLocalTimeouts(client) {
  await client.query(`SELECT
    set_config('statement_timeout', '30000', true),
    set_config('lock_timeout', '5000', true),
    set_config('idle_in_transaction_session_timeout', '60000', true),
    set_config('search_path', 'public', true)`)
}

function validateMigrations(rows) {
  if (!Array.isArray(rows) || rows.length === 0) reject('GS_EMPTY_MIGRATIONS_UNAVAILABLE')
  for (const row of rows) {
    if (!row.migration_name || row.migration_name === FORBIDDEN_MIGRATION || !row.finished_at || row.rolled_back_at || row.logs) {
      reject('GS_EMPTY_MIGRATIONS_INCOMPLETE')
    }
  }
  const present = new Set(rows.map((row) => row.migration_name))
  if (REQUIRED_MIGRATIONS.some((name) => !present.has(name))) reject('GS_EMPTY_MIGRATIONS_MISSING')
}

async function verifyMigratedTarget(client) {
  const tablesResult = await client.query(
    `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  )
  const tables = new Set(tablesResult.rows.map((row) => row.tablename))
  for (const required of ['_prisma_migrations', 'categories', 'storefront_banners']) {
    if (!tables.has(required)) reject('GS_EMPTY_SCHEMA_REQUIRED_TABLE_MISSING')
  }

  const migrations = await client.query(
    `SELECT "migration_name", "finished_at", "rolled_back_at", "logs"
     FROM public."_prisma_migrations" ORDER BY "migration_name"`,
  )
  validateMigrations(migrations.rows)

  const categories = await client.query('SELECT COUNT(*)::text AS count FROM public."categories"')
  if (categories.rows[0]?.count !== '0') reject('GS_EMPTY_TARGET_CATEGORIES_NOT_EMPTY')

  const banners = await client.query('SELECT "id" FROM public."storefront_banners" ORDER BY "id"')
  if (banners.rows.length !== SEEDED_BANNER_IDS.length || banners.rows.some((row, index) => row.id !== SEEDED_BANNER_IDS[index])) {
    reject('GS_EMPTY_TARGET_BANNERS_UNEXPECTED')
  }

  for (const table of tables) {
    if (table === '_prisma_migrations' || table === 'categories' || table === 'storefront_banners') continue
    const result = await client.query(`SELECT EXISTS (SELECT 1 FROM public.${quoteIdentifier(table)} LIMIT 1) AS present`)
    if (result.rows[0]?.present !== false) reject('GS_EMPTY_TARGET_HAS_DATA')
  }
}

function readTaxonomy(taxonomyPath = TAXONOMY_PATH) {
  const bytes = fs.readFileSync(taxonomyPath)
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== TAXONOMY_SHA256) reject('GS_EMPTY_TAXONOMY_HASH')
  let taxonomy
  try {
    taxonomy = JSON.parse(bytes.toString('utf8'))
  } catch {
    reject('GS_EMPTY_TAXONOMY_INVALID')
  }
  if (!Array.isArray(taxonomy.categories) || taxonomy.categories.length !== 9) reject('GS_EMPTY_TAXONOMY_COUNTS')
  const rootNames = new Set()
  const rootSlugs = new Set()
  let subcategoryCount = 0
  const normalized = taxonomy.categories.map((category, categoryIndex) => {
    if (!category || typeof category.name !== 'string' || category.name.trim() !== category.name || !category.name || !Array.isArray(category.subcategories)) {
      reject('GS_EMPTY_TAXONOMY_INVALID')
    }
    const rootSlug = slugify(category.name)
    if (rootNames.has(category.name) || !rootSlug || rootSlugs.has(rootSlug)) reject('GS_EMPTY_TAXONOMY_DUPLICATE')
    rootNames.add(category.name)
    rootSlugs.add(rootSlug)
    const childNames = new Set()
    const childSlugs = new Set()
    const subcategories = category.subcategories.map((child, childIndex) => {
      if (!child || typeof child.name !== 'string' || child.name.trim() !== child.name || !child.name) reject('GS_EMPTY_TAXONOMY_INVALID')
      const childSlug = slugify(child.name)
      if (!childSlug || childNames.has(child.name) || childSlugs.has(childSlug)) reject('GS_EMPTY_TAXONOMY_DUPLICATE')
      childNames.add(child.name)
      childSlugs.add(childSlug)
      subcategoryCount += 1
      return { id: `gs_sub_${categoryIndex + 1}_${childIndex + 1}`, name: child.name, slug: childSlug }
    })
    return { id: `gs_cat_${categoryIndex + 1}`, name: category.name, slug: rootSlug, subcategories }
  })
  if (subcategoryCount !== 66) reject('GS_EMPTY_TAXONOMY_COUNTS')
  return normalized
}

function slugify(value) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const COPY_TABLES = Object.freeze({
  roles: ['id', 'name', 'description', 'createdAt', 'updatedAt'],
  role_permissions: ['roleId', 'permission', 'createdAt'],
  users: ['id', 'email', 'name', 'isActive', 'createdAt', 'updatedAt', 'password', 'supervisorId', 'passwordChangedAt'],
  user_roles: ['userId', 'roleId', 'createdAt'],
  user_mfa: ['id', 'userId', 'secret', 'enabled', 'confirmedAt', 'lastUsedAt', 'lastCode', 'createdAt', 'updatedAt'],
  mfa_backup_codes: ['id', 'mfaId', 'codeHash', 'usedAt', 'createdAt'],
  user_permissions: ['id', 'userId', 'permission', 'effect', 'grantedById', 'reason', 'createdAt'],
  access_states: ['userId', 'version', 'createdAt', 'updatedAt'],
  access_sources: ['id', 'userId', 'kind', 'templateId', 'catalogVersion', 'grantedById', 'reason', 'createdAt', 'updatedAt'],
  access_grants: ['id', 'sourceId', 'actionId', 'scopeKind', 'resourceId', 'createdAt'],
})

function valuesFor(row, columns) {
  return columns.map((column) => row[column])
}

async function readRows(client, table, columns, where = '', params = []) {
  const columnList = columns.map((column) => `"${column}"`).join(', ')
  const result = await client.query(`SELECT ${columnList} FROM public.${quoteIdentifier(table)} ${where}`, params)
  return result.rows
}

async function insertRows(client, table, columns, rows) {
  const columnList = columns.map((column) => `"${column}"`).join(', ')
  for (const row of rows) {
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ')
    await client.query(`INSERT INTO public.${quoteIdentifier(table)} (${columnList}) VALUES (${placeholders})`, valuesFor(row, columns))
  }
}

async function requireSameRows(client, table, columns, where, params, expected) {
  const actual = await readRows(client, table, columns, where, params)
  const sortKey = (row) => JSON.stringify(valuesFor(row, columns))
  const expectedSorted = [...expected].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const actualSorted = [...actual].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  if (JSON.stringify(expectedSorted.map((row) => valuesFor(row, columns))) !== JSON.stringify(actualSorted.map((row) => valuesFor(row, columns)))) {
    reject('GS_EMPTY_AUTH_VERIFY_FAILED')
  }
}

async function snapshotAuthorization(source) {
  const userColumns = COPY_TABLES.users
  const admins = await readRows(source, 'users', userColumns,
    `WHERE EXISTS (SELECT 1 FROM public."user_roles" ur JOIN public."roles" r ON r."id" = ur."roleId"
                   WHERE ur."userId" = users."id" AND r."name" = $1)`, ['Super Admin'])
  if (admins.length !== 1) reject('GS_EMPTY_SOURCE_ADMIN_COUNT')
  const admin = admins[0]
  if (admin.isActive !== true || admin.supervisorId !== null) reject('GS_EMPTY_SOURCE_ADMIN_INVALID')
  const roles = await readRows(source, 'roles', COPY_TABLES.roles, 'ORDER BY "id"')
  const rolePermissions = await readRows(source, 'role_permissions', COPY_TABLES.role_permissions, 'ORDER BY "roleId", "permission"')
  const userRoles = await readRows(source, 'user_roles', COPY_TABLES.user_roles, 'WHERE "userId" = $1 ORDER BY "roleId"', [admin.id])
  const mfas = await readRows(source, 'user_mfa', COPY_TABLES.user_mfa, 'WHERE "userId" = $1 ORDER BY "id"', [admin.id])
  const mfaIds = mfas.map((row) => row.id)
  const backupCodes = mfaIds.length
    ? await readRows(source, 'mfa_backup_codes', COPY_TABLES.mfa_backup_codes, 'WHERE "mfaId" = ANY($1::text[]) ORDER BY "id"', [mfaIds])
    : []
  const userPermissions = await readRows(source, 'user_permissions', COPY_TABLES.user_permissions, 'WHERE "userId" = $1 ORDER BY "id"', [admin.id])
  const accessStates = await readRows(source, 'access_states', COPY_TABLES.access_states, 'WHERE "userId" = $1 ORDER BY "userId"', [admin.id])
  const accessSources = await readRows(source, 'access_sources', COPY_TABLES.access_sources, 'WHERE "userId" = $1 ORDER BY "id"', [admin.id])
  const sourceIds = accessSources.map((row) => row.id)
  const accessGrants = sourceIds.length
    ? await readRows(source, 'access_grants', COPY_TABLES.access_grants, 'WHERE "sourceId" = ANY($1::text[]) ORDER BY "id"', [sourceIds])
    : []
  return { admin, roles, rolePermissions, userRoles, mfas, backupCodes, userPermissions, accessStates, accessSources, accessGrants }
}

async function copyAuthorization(target, snapshot) {
  const rowsByTable = {
    roles: snapshot.roles,
    role_permissions: snapshot.rolePermissions,
    users: [snapshot.admin],
    user_roles: snapshot.userRoles,
    user_mfa: snapshot.mfas,
    mfa_backup_codes: snapshot.backupCodes,
    user_permissions: snapshot.userPermissions,
    access_states: snapshot.accessStates,
    access_sources: snapshot.accessSources,
    access_grants: snapshot.accessGrants,
  }
  for (const [table, rows] of Object.entries(rowsByTable)) {
    await insertRows(target, table, COPY_TABLES[table], rows)
  }
}

async function verifyAuthorization(target, snapshot) {
  const adminId = snapshot.admin.id
  const mfaIds = snapshot.mfas.map((row) => row.id)
  const sourceIds = snapshot.accessSources.map((row) => row.id)
  const checks = [
    ['roles', COPY_TABLES.roles, '', [], snapshot.roles],
    ['role_permissions', COPY_TABLES.role_permissions, '', [], snapshot.rolePermissions],
    ['users', COPY_TABLES.users, 'WHERE "id" = $1', [adminId], [snapshot.admin]],
    ['user_roles', COPY_TABLES.user_roles, 'WHERE "userId" = $1', [adminId], snapshot.userRoles],
    ['user_mfa', COPY_TABLES.user_mfa, 'WHERE "userId" = $1', [adminId], snapshot.mfas],
    ['user_permissions', COPY_TABLES.user_permissions, 'WHERE "userId" = $1', [adminId], snapshot.userPermissions],
    ['access_states', COPY_TABLES.access_states, 'WHERE "userId" = $1', [adminId], snapshot.accessStates],
    ['access_sources', COPY_TABLES.access_sources, 'WHERE "userId" = $1', [adminId], snapshot.accessSources],
  ]
  for (const [table, columns, where, params, rows] of checks) {
    await requireSameRows(target, table, columns, where, params, rows)
  }
  const backupCodes = mfaIds.length
    ? await readRows(target, 'mfa_backup_codes', COPY_TABLES.mfa_backup_codes, 'WHERE "mfaId" = ANY($1::text[])', [mfaIds])
    : []
  const grants = sourceIds.length
    ? await readRows(target, 'access_grants', COPY_TABLES.access_grants, 'WHERE "sourceId" = ANY($1::text[])', [sourceIds])
    : []
  if (JSON.stringify([...backupCodes].sort((a, b) => a.id.localeCompare(b.id))) !== JSON.stringify([...snapshot.backupCodes].sort((a, b) => a.id.localeCompare(b.id)))) reject('GS_EMPTY_AUTH_VERIFY_FAILED')
  if (JSON.stringify([...grants].sort((a, b) => a.id.localeCompare(b.id))) !== JSON.stringify([...snapshot.accessGrants].sort((a, b) => a.id.localeCompare(b.id)))) reject('GS_EMPTY_AUTH_VERIFY_FAILED')
  const counts = await target.query('SELECT (SELECT COUNT(*)::int FROM public."users") AS users, (SELECT COUNT(*)::int FROM public."products") AS products, (SELECT COUNT(*)::int FROM public."prices") AS prices')
  if (counts.rows[0]?.users !== 1 || counts.rows[0]?.products !== 0 || counts.rows[0]?.prices !== 0) reject('GS_EMPTY_FINAL_COUNTS_FAILED')
}

async function insertTaxonomy(target, taxonomy) {
  const timestamp = new Date()
  const roots = taxonomy.map((category, index) => ({
    id: category.id,
    name: category.name,
    description: null,
    slug: category.slug,
    parentId: null,
    sortOrder: index,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    iconUrl: null,
    imageUrl: null,
    isFeatured: false,
  }))
  await insertRows(target, 'categories', ['id', 'name', 'description', 'slug', 'parentId', 'sortOrder', 'isActive', 'createdAt', 'updatedAt', 'iconUrl', 'imageUrl', 'isFeatured'], roots)
  const children = []
  for (let categoryIndex = 0; categoryIndex < taxonomy.length; categoryIndex += 1) {
    const category = taxonomy[categoryIndex]
    for (let childIndex = 0; childIndex < category.subcategories.length; childIndex += 1) {
      const child = category.subcategories[childIndex]
      children.push({
        id: child.id,
        categoryId: category.id,
        name: child.name,
        slug: child.slug,
        sortOrder: childIndex,
        isActive: true,
        searchTerms: [],
        legacyCategoryId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }
  }
  await insertRows(target, 'subcategories', ['id', 'categoryId', 'name', 'slug', 'sortOrder', 'isActive', 'searchTerms', 'legacyCategoryId', 'createdAt', 'updatedAt'], children)
  return {
    roots,
    children,
    rootColumns: ['id', 'name', 'description', 'slug', 'parentId', 'sortOrder', 'isActive', 'createdAt', 'updatedAt', 'iconUrl', 'imageUrl', 'isFeatured'],
    childColumns: ['id', 'categoryId', 'name', 'slug', 'sortOrder', 'isActive', 'searchTerms', 'legacyCategoryId', 'createdAt', 'updatedAt'],
  }
}

async function verifyTaxonomy(target, inserted) {
  await requireSameRows(target, 'categories', inserted.rootColumns, '', [], inserted.roots)
  await requireSameRows(target, 'subcategories', inserted.childColumns, '', [], inserted.children)
  const roots = await target.query('SELECT COUNT(*)::int AS count FROM public."categories" WHERE "parentId" IS NULL')
  const children = await target.query('SELECT COUNT(*)::int AS count FROM public."subcategories"')
  if (roots.rows[0]?.count !== 9 || children.rows[0]?.count !== 66) reject('GS_EMPTY_TAXONOMY_VERIFY_FAILED')
  const products = await target.query('SELECT COUNT(*)::int AS count FROM public."products"')
  const prices = await target.query('SELECT COUNT(*)::int AS count FROM public."prices"')
  if (products.rows[0]?.count !== 0 || prices.rows[0]?.count !== 0) reject('GS_EMPTY_FINAL_COUNTS_FAILED')
}

async function prepareEmptyCatalog({ databaseUrl, targetName, apply, approvedTarget, clientFactory = (url) => new Client({ connectionString: url }) }) {
  if (apply !== true) reject('GS_EMPTY_APPLY_REQUIRED')
  if (typeof targetName !== 'string' || !TARGET_NAME_PATTERN.test(targetName)) reject('GS_EMPTY_TARGET_NAME')
  if (approvedTarget !== targetName) reject('GS_EMPTY_TARGET_APPROVAL')
  if (typeof databaseUrl !== 'string' || !databaseUrl) reject('GS_EMPTY_DATABASE_URL')
  const { sourceName, targetUrl } = deriveTargetUrl(databaseUrl, targetName)
  const source = clientFactory(databaseUrl)
  const target = clientFactory(targetUrl)
  let sourceConnected = false
  let targetConnected = false
  let sourceEventError = false
  let targetEventError = false
  let sourceTransaction = false
  let targetTransaction = false
  try {
    if (typeof source.on === 'function') source.on('error', () => { sourceEventError = true })
    if (typeof target.on === 'function') target.on('error', () => { targetEventError = true })
    await source.connect()
    sourceConnected = true
    await target.connect()
    targetConnected = true

    const sourceDatabase = await source.query('SELECT current_database() AS name')
    const targetDatabase = await target.query('SELECT current_database() AS name')
    if (sourceDatabase.rows[0]?.name !== sourceName || targetDatabase.rows[0]?.name !== targetName || sourceDatabase.rows[0]?.name === targetDatabase.rows[0]?.name) {
      reject('GS_EMPTY_DATABASE_IDENTITY')
    }

    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    sourceTransaction = true
    await setLocalTimeouts(source)
    await target.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
    targetTransaction = true
    await setLocalTimeouts(target)

    const taxonomy = readTaxonomy()
    await verifyMigratedTarget(target)
    const snapshot = await snapshotAuthorization(source)
    await copyAuthorization(target, snapshot)
    const insertedTaxonomy = await insertTaxonomy(target, taxonomy)
    await verifyAuthorization(target, snapshot)
    await verifyTaxonomy(target, insertedTaxonomy)

    if (sourceEventError || targetEventError) reject('GS_EMPTY_CONNECTION_ERROR')

    await source.query('ROLLBACK')
    sourceTransaction = false
    if (sourceEventError || targetEventError) reject('GS_EMPTY_CONNECTION_ERROR')
    await target.query('COMMIT')
    targetTransaction = false
    return { sourceName, targetName, superAdmins: 1, roles: snapshot.roles.length, categories: 9, subcategories: 66, products: 0, prices: 0 }
  } catch (error) {
    if (targetTransaction) {
      try { await target.query('ROLLBACK') } catch { /* Do not expose connection details. */ }
    }
    if (sourceTransaction) {
      try { await source.query('ROLLBACK') } catch { /* Do not expose connection details. */ }
    }
    if (error instanceof PreparationError) throw error
    reject('GS_EMPTY_PREPARATION_FAILED')
  } finally {
    if (targetConnected) {
      try { await target.end() } catch { /* Close errors must not expose connection details. */ }
    }
    if (sourceConnected) {
      try { await source.end() } catch { /* Close errors must not expose connection details. */ }
    }
  }
}

async function main(args, env = process.env) {
  const targetName = parseCli(args, env.GS_EMPTY_CATALOG_APPROVED)
  if (!env.DATABASE_URL) reject('GS_EMPTY_DATABASE_URL')
  const result = await prepareEmptyCatalog({
    databaseUrl: env.DATABASE_URL,
    targetName,
    apply: true,
    approvedTarget: env.GS_EMPTY_CATALOG_APPROVED,
  })
  process.stdout.write(`Preparación completada: destino ${result.targetName}; roles ${result.roles}; Super Admin ${result.superAdmins}; categorías ${result.categories}; subcategorías ${result.subcategories}; productos ${result.products}; precios ${result.prices}.\n`)
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    const code = error instanceof PreparationError ? error.code : 'GS_EMPTY_PREPARATION_FAILED'
    process.stderr.write(`Preparación detenida (${code}). No se muestran detalles de conexión ni filas.\n`)
    process.exitCode = 1
  })
}

module.exports = { PreparationError, REQUIRED_MIGRATIONS, SEEDED_BANNER_IDS, TARGET_NAME_PATTERN, deriveTargetUrl, parseCli, prepareEmptyCatalog }
