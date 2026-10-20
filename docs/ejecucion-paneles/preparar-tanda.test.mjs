import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectBatchStep } from './preparar-tanda.mjs';
const plan = JSON.parse(readFileSync(new URL('./tareas.json', import.meta.url), 'utf8'));
test('batch emits one step without requiring intermediate audit approval', () => {
  const before = JSON.stringify(plan);
  const selected = selectBatchStep(plan, 'IMP-05', 'backend-transaccion');
  assert.equal(selected.id, 'IMP-05');
  assert.ok(selected.dependsOn.includes('IMP-04'));
  assert.ok(selected.acceptance.length);
  assert.equal(JSON.stringify(plan), before);
});
test('batch preserves external decisions and does not invent their confirmation', () => {
  const selected = selectBatchStep(plan, 'COM-07', 'backend-sincronizacion');
  assert.ok(selected.requiredDecisions.includes('api-yeminus'));
  assert.equal(selected.decisions, undefined);
});
test('implementer cannot obtain the final coordinator audit as their own task', () => {
  assert.throws(() => selectBatchStep(plan, 'QA-01', 'auditoria'), /coordinador/);
});
test('unknown tasks and steps fail clearly', () => {
  assert.throws(() => selectBatchStep(plan, 'UNKNOWN', 'backend'), /desconocida/);
  assert.throws(() => selectBatchStep(plan, 'BASE-02', 'unknown'), /desconocido/);
});
