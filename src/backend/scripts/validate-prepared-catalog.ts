/** Offline contract check for prepared XLSX files. No application or database is started. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCatalogTemplate } from '../src/modules/products/catalog-import/template/catalog-template.parser';
import { buildCatalogPlan } from '../src/modules/products/catalog-import/template/catalog-template.plan';
import type { TemplateDictionary, TemplateIssue } from '../src/modules/products/catalog-import/template/catalog-template.types';

export function validatePreparedCatalog(filePath: string, dictionary: TemplateDictionary) {
  const parsed = parseCatalogTemplate(readFileSync(filePath));
  if (!parsed.ok) return { file: resolve(filePath), ok: false, products: 0, errors: parsed.fatal, warnings: 0 };
  const { catalog } = parsed;
  // Empty products is deliberate: check creation against the frozen dictionary, never query a database.
  const plan = buildCatalogPlan(catalog, { dictionary, products: new Map() });
  const issues = [...plan.unassigned, ...plan.rows.flatMap((row) => row.issues)];
  const errors: TemplateIssue[] = issues.filter((issue) => issue.severity === 'error');
  for (const product of catalog.products) {
    if (!product.brand || !product.subcategory || !product.category) {
      errors.push({ severity: 'error', code: 'PREPARATION_CLASSIFICATION_REQUIRED', sheet: 'Productos', row: product.row,
        reference: product.reference, message: 'La carga inicial preparada requiere marca, categoría y subcategoría resueltas.' });
    }
  }
  if (!catalog.products.length) {
    errors.push({ severity: 'error', code: 'PREPARATION_EMPTY', sheet: 'Productos', message: 'No hay productos preparados para cargar.' });
  }
  return { file: resolve(filePath), ok: errors.length === 0, products: catalog.products.length,
    errors, warnings: issues.filter((issue) => issue.severity === 'warning').length, plan: plan.summary,
    mastersToCreate: plan.mastersToCreate };
}

if (require.main === module) {
  const [dictionaryPath, ...files] = process.argv.slice(2);
  if (!dictionaryPath || !files.length) {
    console.error('Uso: ts-node scripts/validate-prepared-catalog.ts <diccionario.json> <archivo.xlsx> [archivo2.xlsx]');
    process.exitCode = 2;
  } else {
    try {
      const dictionary: TemplateDictionary = JSON.parse(readFileSync(dictionaryPath, 'utf8'));
      const results = files.map((file) => {
        try { return validatePreparedCatalog(file, dictionary); }
        catch (error) { return { file: resolve(file), ok: false, error: error instanceof Error ? error.message : String(error) }; }
      });
      console.log(JSON.stringify(results, null, 2));
      if (results.some((result) => !result.ok)) process.exitCode = 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
