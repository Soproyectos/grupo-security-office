import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePlan, validateState, validateEvidenceFiles, blockers } from './preparar-tarea.mjs';

const original = JSON.parse(readFileSync(new URL('./tareas.json', import.meta.url), 'utf8'));
const fresh = () => ({ version: 1, reviews: {}, decisions: {} });
const review = { verdict: 'aceptada', reviewer: 'coordinador', report: 'docs/ejecucion-paneles/resultados/fixture-auditoria.md' };

test('the real plan is acyclic, complete, and starts with a documentation-only inventory', () => {
  const plan = validatePlan(structuredClone(original));
  const first = plan.tasks.find((t) => t.id === plan.firstTask);
  assert.equal(first.id, 'BASE-01');
  assert.deepEqual(blockers(plan, fresh(), first, first.steps[0]), []);
  assert.ok(first.steps[0].writePaths.every((p) => p.startsWith('docs/')));
});

test('a dependency must have every step accepted, not only its contract', () => {
  const task = original.tasks.find((t) => t.id === 'IMP-02');
  const state = fresh();
  state.reviews['BASE-02/contrato'] = review;
  state.reviews['IMP-01/contrato'] = review;
  assert.ok(blockers(original, state, task, task.steps[0]).some((r) => r.includes('IMP-01')));
  state.reviews['IMP-01/backend'] = review;
  assert.deepEqual(blockers(original, state, task, task.steps[0]), []);
});

test('an implementer cannot accept their own step in the organiser state', () => {
  const state = fresh();
  state.reviews['BASE-01/inventario'] = { ...review, reviewer: 'implementador' };
  assert.throws(() => validateState(original, state), /coordinador/);
});

test('partial or changes-required reports do not unblock implementation', () => {
  const task = original.tasks.find((t) => t.id === 'BASE-02');
  for (const verdict of ['parcial', 'requiere_cambios', 'necesita_decision']) {
    const state = fresh();
    state.reviews['BASE-01/inventario'] = { ...review, verdict };
    assert.ok(blockers(original, state, task, task.steps[0]).length);
  }
});

test('backend requires its own contract audit even when all package dependencies passed', () => {
  const task = original.tasks.find((t) => t.id === 'IMP-01');
  const state = fresh();
  state.reviews['BASE-01/inventario'] = review;
  assert.ok(blockers(original, state, task, task.steps[1]).some((r) => r.includes('IMP-01/contrato')));
});

test('ERP code remains pending until a real decision and evidence are recorded', () => {
  const task = original.tasks.find((t) => t.id === 'COM-07');
  const state = fresh();
  for (const dependency of task.dependsOn) for (const step of original.tasks.find((t) => t.id === dependency).steps) state.reviews[`${dependency}/${step.id}`] = review;
  state.reviews['COM-07/contrato'] = review;
  assert.ok(blockers(original, state, task, task.steps[1]).some((r) => r.includes('api-yeminus')));
  state.decisions['api-yeminus'] = { status: 'confirmada', evidence: '' };
  assert.ok(blockers(original, state, task, task.steps[1]).length);
  state.decisions['api-yeminus'].evidence = 'Contrato oficial saneado revisado por coordinador';
  assert.deepEqual(blockers(original, state, task, task.steps[1]), []);
});

test('rejects duplicate tasks, unknown dependencies and cycles', () => {
  const duplicate = structuredClone(original);
  duplicate.tasks.push(duplicate.tasks[0]);
  assert.throws(() => validatePlan(duplicate), /repetido/);
  const unknown = structuredClone(original);
  unknown.tasks[0].dependsOn = ['NO-99'];
  assert.throws(() => validatePlan(unknown), /desconocida/);
  const cycle = structuredClone(original);
  cycle.tasks[0].dependsOn = ['BASE-02'];
  assert.throws(() => validatePlan(cycle), /circular/);
});

test('rejects edit scope escaping the workspace or targeting secrets', () => {
  for (const path of ['../outside.md', 'C:/outside.md', '/etc/file', '.git/config', 'src/backend/.env']) {
    const plan = structuredClone(original);
    plan.tasks[0].steps[0].writePaths = [path];
    assert.throws(() => validatePlan(plan), /Alcance/);
  }
});

test('acceptance requires an in-package report and a known step', () => {
  for (const [key, report] of [['BASE-01/inventario', ''], ['BASE-01/inventario', '../outside.md'], ['BASE-01/unknown', review.report]]) {
    const state = fresh();
    state.reviews[key] = { ...review, report };
    assert.throws(() => validateState(original, state));
  }
});

test('a missing accepted contract prevents emission even if the audit report exists', () => {
  const state = fresh();
  state.reviews['IMP-01/contrato'] = review;
  assert.throws(() => validateEvidenceFiles(original, state, (path) => path === review.report), /Falta el contrato aceptado/);
  assert.equal(validateEvidenceFiles(original, state, (path) => [review.report, 'docs/ejecucion-paneles/contratos/IMP-01.md'].includes(path)), true);
});

test('a missing audit report never counts as available evidence', () => {
  const state = fresh();
  state.reviews['BASE-01/inventario'] = review;
  assert.throws(() => validateEvidenceFiles(original, state, () => false), /informe de auditoría/);
});

test('ERP integration contract is independent; only the indicator step waits for reports', () => {
  const task = original.tasks.find((t) => t.id === 'COM-07');
  assert.ok(!task.dependsOn.includes('COM-05'));
  const step = task.steps.find((s) => s.id === 'backend-indicadores');
  assert.ok(step.requiresPackages.includes('COM-05'));
  assert.ok(blockers(original, fresh(), task, step).some((r) => r.includes('COM-05')));
});

test('discount limits no longer block ordinary quote work', () => {
  const task = original.tasks.find((t) => t.id === 'COM-03');
  assert.ok(!task.dependsOn.includes('IMP-03'));
  assert.ok(task.steps.every((s) => !s.requiredDecisions.includes('regla-descuentos')));
  const discounts = original.tasks.find((t) => t.id === 'COM-09');
  assert.ok(discounts.steps.find((s) => s.id === 'backend').requiredDecisions.includes('regla-descuentos'));
});
