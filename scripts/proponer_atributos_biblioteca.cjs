'use strict';

// Read-only proposal builder. Reuses the storefront's curated extraction rules.
// Requires the project's existing backend TypeScript dependency; never connects to a DB.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const Module = require('node:module');

function loadRequirements() {
  const backend = path.resolve(__dirname, '../src/backend');
  const ts = require(require.resolve('typescript', { paths: [backend] }));
  const filename = path.join(backend, 'src/modules/products/public-requirements.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const mod = new Module(filename, module);
  mod._compile(compiled.outputText, filename);
  return mod.exports;
}

const { buildPublicRequirementFacets } = loadRequirements();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const optionKey = value => 'v_' + hash(value).slice(0, 24);
const NUMERIC = {
  zonas: { unit: null, expression: /^(\d+)$/ },
  zonas_cableadas: { unit: null, expression: /^(\d+)$/ },
  zonas_inalambricas: { unit: null, expression: /^(\d+)$/ },
  potencia_salida: { unit: 'W', expression: /^(\d+(?:[.,]\d+)?)\s*W$/i },
  impedancia: { unit: 'Ω', expression: /^(\d+(?:[.,]\d+)?)\s*Ω$/ },
  capacidad_rostros: { unit: null, expression: /^(\d+)$/ },
  capacidad_tarjetas: { unit: null, expression: /^(\d+)$/ },
  capacidad_huellas: { unit: null, expression: /^(\d+)$/ },
  capacidad_eventos: { unit: null, expression: /^(\d+)$/ },
  capacidad_usuarios: { unit: null, expression: /^(\d+)$/ },
  puertas: { unit: null, expression: /^(\d+)$/ },
};

function buildArtifacts(inventory, sourceSha256 = 'test') {
  if (!Array.isArray(inventory.categories) || !Array.isArray(inventory.products)) {
    throw Error('El inventario requiere categories y products.');
  }
  const categoriesById = new Map(inventory.categories.map(c => [c.id, c]));
  const categoriesBySlug = new Map(inventory.categories.map(c => [c.slug, c]));
  const definitions = new Map();
  const values = [];
  const pending = [];
  const stats = new Map(inventory.categories.map(c => [c.slug, {
    categoryId: c.id, categorySlug: c.slug, categoryName: c.name,
    products: 0, productsWithPublishedGroups: 0, proposedValues: 0,
    missingClassification: 0, pendingValues: 0, subcategories: new Map(),
  }]));

  for (const product of inventory.products) {
    const category = product.publishedCategoryId
      ? categoriesById.get(product.publishedCategoryId)
      : categoriesBySlug.get(product.category);
    if (!category) {
      pending.push({ productId: product.id, reason: 'unresolved_published_category' });
      continue;
    }
    const stat = stats.get(category.slug);
    stat.products++;
    // An explicit empty published snapshot remains empty.
    const groups = Array.isArray(product.publishedCatalogSpecGroups)
      ? product.publishedCatalogSpecGroups : [];
    if (groups.length) stat.productsWithPublishedGroups++;
    const subcategoryId = product.subcategoryId || null;
    if (!subcategoryId) stat.missingClassification++;
    const projection = {
      id: product.id, categorySlug: category.slug,
      catalogSpecGroups: groups,
      technicalSpecs: product.publishedTechnicalSpecs,
    };
    const facets = buildPublicRequirementFacets(category.slug, [projection]);
    for (const facet of facets) {
      let definition = definitions.get(facet.specKey);
      if (!definition) {
        definition = {
          key: facet.specKey, label: facet.label,
          dataType: facet.specKey.startsWith('protocolo') ? 'MULTI_OPTION'
            : NUMERIC[facet.specKey] ? 'NUMBER' : 'TEXT',
          unit: NUMERIC[facet.specKey]?.unit ?? null, options: new Map(),
        };
        definitions.set(facet.specKey, definition);
      }
      const base = {
        productId: product.id, sku: product.sku, categorySlug: category.slug,
        subcategoryId, specKey: facet.specKey, dataType: definition.dataType,
        stage: 'WORKING', state: 'KNOWN',
        evidence: {
          source: 'publishedCatalogSpecGroups/publishedTechnicalSpecs',
          sourceSha256, normalizedValues: facet.values.map(v => v.value),
          // Per-product source digest permits verifying evidence without copying the full DB.
          productSourceSha256: hash(JSON.stringify({
            groups, technicalSpecs: product.publishedTechnicalSpecs ?? null,
          })),
        },
      };
      if (!subcategoryId) {
        pending.push({ ...base, reason: 'missing_subcategory_template' });
        stat.pendingValues++;
        continue;
      }
      let sub = stat.subcategories.get(subcategoryId);
      if (!sub) {
        sub = { subcategoryId, keys: new Set() };
        stat.subcategories.set(subcategoryId, sub);
      }
      sub.keys.add(facet.specKey);
      if (definition.dataType === 'MULTI_OPTION') {
        const optionKeys = facet.values.map(v => {
          const key = optionKey(v.value);
          definition.options.set(key, { key, label: v.label });
          return key;
        });
        values.push({ ...base, optionKeys });
      } else if (facet.values.length !== 1) {
        pending.push({ ...base, reason: 'multiple_values_require_review' });
        stat.pendingValues++;
        continue;
      } else if (definition.dataType === 'NUMBER') {
        const match = NUMERIC[facet.specKey].expression.exec(facet.values[0].value);
        if (!match) {
          pending.push({ ...base, reason: 'compound_or_ambiguous_numeric_value' });
          stat.pendingValues++;
          continue;
        }
        values.push({ ...base, valueNumber: Number(match[1].replace(',', '.')) });
      } else {
        // Preserve composite electrical ranges as text; do not lose AC/DC, conditions or units.
        values.push({ ...base, valueText: facet.values[0].value });
      }
      stat.proposedValues++;
    }
  }

  const definitionRows = [...definitions.values()].map(d => ({
    ...d, isActive: false,
    options: [...d.options.values()].sort((a, b) => a.key.localeCompare(b.key)),
  })).sort((a, b) => a.key.localeCompare(b.key));
  const categoryRows = [...stats.values()].map(stat => ({
    ...stat, status: stat.products ? 'PROPOSED' : 'PENDING_NO_PRODUCTS',
    subcategories: [...stat.subcategories.values()].map(sub => ({
      subcategoryId: sub.subcategoryId,
      specs: [...sub.keys].sort().map((key, index) => ({
        specKey: key, status: 'PROPOSED', isRequired: false,
        requiredReason: null, isFilterable: true, sortOrder: index * 10,
      })),
    })),
  }));
  const meta = { schemaVersion: 2, status: 'PROPOSED', sourceSha256, databaseWrite: false };
  return {
    dictionary: { ...meta, definitions: definitionRows, categoryTemplates: categoryRows },
    proposal: { ...meta, values, pending },
    summary: {
      ...meta, sourceQueriedAt: inventory.queriedAt ?? null,
      products: inventory.products.length, definitions: definitionRows.length,
      proposedValues: values.length, pendingValues: pending.length,
      typedDictionaryCounts: inventory.counts ?? null,
      categories: categoryRows,
      policy: 'Draft only. Published evidence; no inference from name/SKU. Missing is not NOT_APPLICABLE. Existing schema only.',
    },
  };
}

function main(argv = process.argv.slice(2)) {
  let input = path.join(os.tmpdir(), 'gs-attributes-db-20261124.json');
  let out = path.resolve(__dirname, '../data/atributos-biblioteca-20261124');
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--input') input = path.resolve(argv[++index]);
    else if (argv[index] === '--out-dir') out = path.resolve(argv[++index]);
    else throw Error('Argumento desconocido: ' + argv[index]);
  }
  const bytes = fs.readFileSync(input);
  const artifacts = buildArtifacts(JSON.parse(bytes), hash(bytes));
  fs.mkdirSync(out, { recursive: true });
  for (const [name, artifact] of Object.entries(artifacts)) {
    fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(artifact, null, 2) + '\n');
  }
  console.log(JSON.stringify({
    products: artifacts.summary.products, definitions: artifacts.summary.definitions,
    proposedValues: artifacts.summary.proposedValues,
    pendingValues: artifacts.summary.pendingValues, databaseWrite: false,
  }));
}
if (require.main === module) main();
module.exports = { buildArtifacts, optionKey };

