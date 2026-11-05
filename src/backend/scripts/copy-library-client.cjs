// Runtime imports of prisma/biblioteca/generated/client remain relative after Nest compilation.
// Copy the already generated client into dist; no database connection or migration occurs here.
const { cpSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const backend = resolve(__dirname, '..');
const source = resolve(backend, 'prisma/biblioteca/generated/client');
if (!existsSync(resolve(source, 'index.js'))) throw new Error('Generate the library Prisma client before packaging the backend.');
cpSync(source, resolve(backend, 'dist/prisma/biblioteca/generated/client'), { recursive: true });
