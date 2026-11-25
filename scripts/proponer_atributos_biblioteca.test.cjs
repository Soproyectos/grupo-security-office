'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildArtifacts } = require('./proponer_atributos_biblioteca.cjs');
const categories = [
  { id: 'audio', slug: 'audio-y-perifoneo', name: 'Audio' },
  { id: 'alarm', slug: 'alarmas', name: 'Alarmas' },
  { id: 'empty', slug: 'casa-inteligente', name: 'Casa inteligente' },
];
const product = (items, rest = {}) => ({
  id: 'product', sku: 'FICTIONAL', category: 'audio-y-perifoneo',
  publishedCategoryId: 'audio', subcategoryId: 'existing-subcategory',
  publishedCatalogSpecGroups: [{ title: 'Technical', items }], ...rest,
});
const build = products => buildArtifacts({ products, categories }, 'digest');
test('voltage and power stay independent and protocols are multivalued', () => {
  const result = build([product([
    { label: 'Potencia', value: '100 a 240 VAC' },
    { label: 'Potencia nominal', value: '500 W' },
    { label: 'Protocolo: Protocolo de Red', value: 'TCP, HTTP, HTTPS' },
  ])]);
  const values = result.proposal.values;
  assert.equal(values.find(v => v.specKey === 'tension_entrada').valueText, '100 a 240 VAC');
  assert.equal(values.find(v => v.specKey === 'potencia_salida').valueNumber, 500);
  assert.equal(values.find(v => v.specKey === 'protocolo').optionKeys.length, 3);
});
test('templates use real subcategory IDs and remain proposed and optional', () => {
  const result = build([product([{ label: 'Impedancia', value: '8 Ω' }])]);
  const template = result.dictionary.categoryTemplates[0].subcategories[0];
  assert.equal(template.subcategoryId, 'existing-subcategory');
  assert.ok(template.specs.every(s => s.status === 'PROPOSED' && s.isRequired === false));
  assert.equal(result.proposal.values[0].stage, 'WORKING');
  assert.equal(result.dictionary.databaseWrite, false);
});
test('empty published groups do not fall back to working values or SKU', () => {
  const result = build([product([], {
    sku: '500W-TCP', catalogSpecGroups: [{ items: [{ label: 'Potencia', value: '500 W' }] }],
  })]);
  assert.equal(result.proposal.values.length, 0);
});
test('ambiguous numeric data is recorded instead of guessed', () => {
  const result = build([product([{ label: 'Potencia nominal', value: '6 W / 24 VDC' }])]);
  assert.equal(result.proposal.values.length, 0);
  assert.equal(result.proposal.pending[0].reason, 'compound_or_ambiguous_numeric_value');
});
test('multiple conflicting text values cannot create duplicate value rows', () => {
  const result = build([product([
    { label: 'Respuesta en frecuencia', value: '80 Hz a 20 kHz' },
    { label: 'Respuesta en frecuencia', value: '100 Hz a 20 kHz' },
  ])]);
  assert.equal(result.proposal.values.length, 0);
  assert.equal(result.proposal.pending[0].reason, 'multiple_values_require_review');
});
test('unclassified products have evidence but no fabricated template', () => {
  const result = build([product([{ label: 'Impedancia', value: '8 Ω' }], { subcategoryId: null })]);
  assert.equal(result.proposal.values.length, 0);
  assert.equal(result.proposal.pending[0].reason, 'missing_subcategory_template');
  assert.equal(result.dictionary.categoryTemplates[0].subcategories.length, 0);
});
test('empty categories are explicitly pending', () => {
  const empty = build([]).dictionary.categoryTemplates.find(c => c.categorySlug === 'casa-inteligente');
  assert.equal(empty.status, 'PENDING_NO_PRODUCTS');
  assert.deepEqual(empty.subcategories, []);
});
test('same definition is reused across category templates', () => {
  const result = build([
    product([{ label: 'Protocolo', value: 'TCP' }]),
    product([{ label: 'Protocolo', value: 'TCP' }], {
      id: 'alarm-product', category: 'alarmas', publishedCategoryId: 'alarm',
    }),
  ]);
  assert.equal(result.dictionary.definitions.filter(d => d.key === 'protocolo').length, 1);
  assert.ok(result.proposal.values.every(v => v.evidence.sourceSha256 === 'digest'));
});

