/**
 * Writes the synthetic example of the catalog template to docs/biblioteca-dominio/plantilla-catalogo-ejemplo.xlsx.
 *   npx ts-node scripts/generate-catalog-template-example.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildExample } from '../src/modules/products/catalog-import/template';

const target = resolve(__dirname, '../../../docs/biblioteca-dominio/plantilla-catalogo-ejemplo.xlsx');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, buildExample({ generatedAt: new Date('2026-10-30T00:00:00Z') }));
console.log('written', target);
