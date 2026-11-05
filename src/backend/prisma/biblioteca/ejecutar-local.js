// Offline-only Prisma 6.19.3 entry point. No .env files or database operations.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const backend = path.resolve(__dirname, '../..');
const oldSchema = path.resolve(__dirname, '../biblioteca-candidata/schema.prisma');
const commands = {
  validate: ['validate', '--schema', path.join(__dirname, 'schema.prisma')],
  generate: ['generate', '--schema', path.join(__dirname, 'schema.prisma')],
  'sql-audit': ['migrate', 'diff', '--from-schema-datamodel', oldSchema, '--to-schema-datamodel', path.join(__dirname, 'snapshots/t07.prisma'), '--script'],
  'sql-tracking': ['migrate', 'diff', '--from-schema-datamodel', path.join(__dirname, 'snapshots/t07.prisma'), '--to-schema-datamodel', path.join(__dirname, 'snapshots/t13.prisma'), '--script'],
  'sql-files': ['migrate', 'diff', '--from-schema-datamodel', path.join(__dirname, 'snapshots/t13.prisma'), '--to-schema-datamodel', path.join(__dirname, 'schema.prisma'), '--script'],
};
const command = process.argv[2];
if (process.argv.length !== 3 || !Object.hasOwn(commands, command)) throw new Error('Use validate|generate|sql-audit|sql-tracking|sql-files; no database commands');
if (require(path.join(backend, 'node_modules/prisma/package.json')).version !== '6.19.3') throw new Error('Prisma 6.19.3 required');
for (const folder of [__dirname, path.dirname(oldSchema)]) if (fs.existsSync(path.join(folder, '.env'))) throw new Error('Unexpected .env beside library schema');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-library-offline-'));
const tempPackage = path.join(scratch, 'package.json');
fs.writeFileSync(tempPackage, '{"private":true}\n');
try {
  const result = spawnSync(process.execPath, [path.join(backend, 'node_modules/prisma/build/index.js'), ...commands[command]], {
    cwd: scratch, encoding: 'utf8',
    env: { ...process.env,
      LIBRARY_DATABASE_URL: 'postgresql://candidate:candidate@biblioteca.invalid:5432/candidate',
      BIBLIOTECA_CANDIDATA_URL: 'postgresql://candidate:candidate@biblioteca.invalid:5432/candidate',
      CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1', PRISMA_GENERATE_SKIP_AUTOINSTALL: '1',
      HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', ALL_PROXY: 'http://127.0.0.1:9', NO_PROXY: '',
    },
  });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.status !== 0) throw new Error(`Offline Prisma failed: ${result.status}`);
  if (command.startsWith('sql-')) {
    let sql = result.stdout.replace(/\r\n/g, '\n');
    const tracking = command === 'sql-tracking';
    const files = command === 'sql-files';
    if (!tracking && !files && (!/CREATE TABLE "library_audit_events"/.test(sql) || /\b(ALTER|DROP)\b/.test(sql))) throw new Error('Unexpected audit delta');
    if (tracking) {
      const statements = sql.replace(/^--[^\n]*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
      if (statements.length !== 10 || !statements.every((s) => /^(CREATE TABLE "(?:product_gaps|field_evidence|supplier_costs)"|CREATE (?:UNIQUE )?INDEX "(?:product_gaps|field_evidence|supplier_costs)_[^"]+" ON "(?:product_gaps|field_evidence|supplier_costs)"|ALTER TABLE "(?:product_gaps|field_evidence|supplier_costs)" ADD CONSTRAINT "[^"]+" FOREIGN KEY)/.test(s))) throw new Error('Unexpected tracking delta');
      sql += '\n' + fs.readFileSync(path.join(__dirname, 'tracking-constraints.sql'), 'utf8').replace(/\r\n/g, '\n');
    }
    if (files) {
      const statements = sql.replace(/^--[^\n]*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
      if (statements.length !== 3 || !statements.every(s => /^(CREATE TABLE "uploaded_files"|CREATE INDEX "uploaded_files_(?:ownerProductId|visibility)_idx" ON "uploaded_files")/.test(s))) throw new Error('Unexpected file delta');
    }
    const folder = path.join(__dirname, files ? 'migrations/20261023010000_t06_uploaded_file_transport' : tracking ? 'migrations/20261022020000_t13_tracking_contracts' : 'migrations/20261022010000_t07_library_audit_events');
    fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, 'migration.sql');
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') !== sql) throw new Error('Never overwrite an existing migration with different SQL');
    if (!fs.existsSync(file)) fs.writeFileSync(file, sql, { flag: 'wx' });
    console.log(`${files ? 'Files' : tracking ? 'Tracking' : 'Audit'} delta prepared, not executed`);
  } else process.stdout.write(result.stdout);
} finally {
  fs.unlinkSync(tempPackage);
  try { fs.rmdirSync(scratch); } catch (error) { if (error.code !== 'ENOTEMPTY') throw error; }
}
