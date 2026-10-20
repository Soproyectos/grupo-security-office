import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const folder = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(folder, '../..');
const accepted = (review) => review?.verdict === 'aceptada' && review?.reviewer === 'coordinador' && typeof review.report === 'string' && review.report.length > 0;
const safePath = (path) => typeof path === 'string' && path.length > 0 && !path.startsWith('/') && !/[\\:\0]/.test(path) && !path.split('/').some((p) => p === '..' || p === '.' || p === '.git' || p.startsWith('.env'));

export function validatePlan(plan) {
  if (plan?.version !== 1 || !Array.isArray(plan.tasks) || !plan.tasks.length) throw new Error('Plan inválido.');
  const ids = new Set();
  for (const task of plan.tasks) {
    if (!/^[A-Z]+-\d{2}$/.test(task.id) || ids.has(task.id)) throw new Error('ID de tarea inválido o repetido.');
    ids.add(task.id);
    if (!task.title || !Array.isArray(task.dependsOn) || new Set(task.dependsOn).size !== task.dependsOn.length || !task.steps?.length) throw new Error(`Ficha incompleta: ${task.id}`);
    const steps = new Set();
    for (const step of task.steps) {
      if (!/^[a-z][a-z-]*$/.test(step.id) || steps.has(step.id)) throw new Error(`Paso inválido/repetido: ${task.id}`);
      steps.add(step.id);
      if (!step.goal || !step.writePaths?.length || !step.writePaths.every(safePath) || !Array.isArray(step.requiredDecisions) || !step.acceptance?.length || (step.requiresPackages && !Array.isArray(step.requiresPackages))) throw new Error(`Alcance inválido: ${task.id}/${step.id}`);
    }
    if (!task.references?.length || !task.references.every((r) => safePath(r.path)) || !task.readPaths?.every(safePath) || !task.rules?.length || !task.cases?.length) throw new Error(`Referencias/reglas inválidas: ${task.id}`);
  }
  if (!ids.has(plan.firstTask)) throw new Error('La primera tarea no existe.');
  const byId = new Map(plan.tasks.map((t) => [t.id, t]));
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (!ids.has(id)) throw new Error(`Dependencia desconocida: ${id}`);
    if (visiting.has(id)) throw new Error(`Dependencia circular: ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    [...byId.get(id).dependsOn, ...byId.get(id).steps.flatMap((s) => s.requiresPackages ?? [])].forEach(visit);
    visiting.delete(id);
    visited.add(id);
  }
  plan.tasks.forEach((t) => visit(t.id));
  return plan;
}

export function validateState(plan, state) {
  if (state?.version !== 1 || !state.reviews || !state.decisions || Array.isArray(state.reviews) || Array.isArray(state.decisions)) throw new Error('Estado inválido.');
  const keys = new Set(plan.tasks.flatMap((t) => t.steps.map((s) => `${t.id}/${s.id}`)));
  for (const [key, review] of Object.entries(state.reviews)) {
    if (!keys.has(key) || !['aceptada', 'requiere_cambios', 'parcial', 'necesita_decision'].includes(review?.verdict)) throw new Error(`Revisión inválida: ${key}`);
    if (review.verdict === 'aceptada' && (!accepted(review) || !safePath(review.report) || !review.report.startsWith('docs/ejecucion-paneles/resultados/'))) throw new Error(`Aceptación sin auditoría del coordinador: ${key}`);
  }
  return state;
}

export function blockers(plan, state, task, step) {
  const result = [];
  for (const dependency of new Set([...task.dependsOn, ...(step.requiresPackages ?? [])])) {
    const parent = plan.tasks.find((t) => t.id === dependency);
    if (!parent.steps.every((s) => accepted(state.reviews[`${parent.id}/${s.id}`]))) result.push(`Falta auditoría aceptada de ${dependency}.`);
  }
  const index = task.steps.findIndex((s) => s.id === step.id);
  for (const previous of task.steps.slice(0, index)) {
    if (!accepted(state.reviews[`${task.id}/${previous.id}`])) result.push(`Falta auditoría aceptada de ${task.id}/${previous.id}.`);
  }
  for (const decision of step.requiredDecisions) {
    const record = state.decisions[decision];
    if (record?.status !== 'confirmada' || typeof record.evidence !== 'string' || !record.evidence.trim()) result.push(`Decisión pendiente: ${decision}.`);
  }
  return result;
}

export function validateEvidenceFiles(plan, state, exists) {
  for (const [key, review] of Object.entries(state.reviews)) {
    if (!accepted(review)) continue;
    if (!exists(review.report)) throw new Error(`No existe el informe de auditoría: ${review.report}`);
    const [id, step] = key.split('/');
    if (['contrato', 'inventario'].includes(step)) {
      const contract = `docs/ejecucion-paneles/contratos/${id}.md`;
      if (!exists(contract)) throw new Error(`Falta el contrato aceptado: ${contract}`);
    }
  }
  return true;
}

function read(path) { return readFileSync(path, 'utf8'); }
function local(path) {
  if (!safePath(path)) throw new Error('Ruta fuera del paquete permitido.');
  const absolute = resolve(workspace, path);
  const rel = relative(workspace, absolute);
  if (isAbsolute(rel) || rel.startsWith('..')) throw new Error('Ruta fuera del workspace.');
  return absolute;
}

function main(args) {
  const plan = validatePlan(JSON.parse(read(resolve(folder, 'tareas.json'))));
  const state = validateState(plan, JSON.parse(read(resolve(folder, 'estado.json'))));
  for (const task of plan.tasks) for (const ref of task.references) {
    if (!existsSync(local(ref.path))) throw new Error(`No existe la referencia ${ref.path}`);
  }
  validateEvidenceFiles(plan, state, (path) => existsSync(local(path)));
  if (args.length === 1 && args[0] === '--check') {
    console.log(`Plan válido: ${plan.tasks.length} paquetes, ${plan.tasks.reduce((n, t) => n + t.steps.length, 0)} pasos; referencias y dependencias comprobadas.`);
    return;
  }
  if (args.length === 1 && args[0] === '--list') {
    for (const task of plan.tasks) {
      const step = task.steps.find((s) => !accepted(state.reviews[`${task.id}/${s.id}`]));
      const reasons = step ? blockers(plan, state, task, step) : [];
      console.log(`${task.id} | ${step ? reasons.length ? 'PENDIENTE' : 'PREPARABLE' : 'ACEPTADA'} | ${task.title}${step ? ` | ${step.id}` : ''}`);
    }
    return;
  }
  const task = plan.tasks.find((t) => t.id === args[0]);
  if (!task) throw new Error('Uso: preparar-tarea.mjs --check | --list | ID [--paso nombre] [--vista]');
  let name;
  let preview = false;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--vista' && !preview) preview = true;
    else if (args[i] === '--paso' && !name && args[i + 1]) name = args[++i];
    else throw new Error('Argumento desconocido o repetido.');
  }
  const step = name ? task.steps.find((s) => s.id === name) : task.steps.find((s) => !accepted(state.reviews[`${task.id}/${s.id}`]));
  if (!step) throw new Error('El paso no existe o todos los pasos ya fueron aceptados.');
  if (!preview && accepted(state.reviews[`${task.id}/${step.id}`])) throw new Error('Este paso ya está aceptado; el coordinador debe definir una corrección nueva.');
  const reasons = blockers(plan, state, task, step);
  if (reasons.length && !preview) throw new Error(reasons.join('\n'));
  console.log(preview ? 'VISTA DE CONSULTA. No iniciar implementación de este encargo.\n' : 'ENCARGO DE UN SOLO PASO. Entregar para auditoría al terminar.\n');
  if (preview && reasons.length) console.log(reasons.join('\n') + '\n');
  console.log(read(resolve(folder, task.actor === 'coordinador' ? 'AUDITOR.md' : 'IMPLEMENTADOR.md')));
  console.log('\n' + read(resolve(folder, 'CONTEXTO.md')));
  const dependencies = [...new Set([...task.dependsOn, ...(step.requiresPackages ?? [])])];
  const priorContracts = dependencies.map((id) => ({
    tarea: id, contrato: `docs/ejecucion-paneles/contratos/${id}.md`,
    auditorias: plan.tasks.find((t) => t.id === id).steps.map((s) => ({ paso: s.id, informe: state.reviews[`${id}/${s.id}`]?.report ?? null })),
  }));
  const selected = { id: task.id, title: task.title, paso: step.id, objetivo: step.goal, actor: task.actor ?? 'implementador',
    lecturas: task.references, codigo_a_consultar_segun_necesidad: task.readPaths, reglas: task.rules, casos_obligatorios: task.cases,
    criterios_del_paso: step.acceptance, dependencias: dependencies, contratos_y_auditorias_previos: priorContracts,
    decisiones_requeridas: step.requiredDecisions.map((key) => ({ clave: key, registro: state.decisions[key] ?? null })),
    auditorias_del_mismo_paquete: task.steps.slice(0, task.steps.indexOf(step)).map((s) => ({ paso: s.id, informe: state.reviews[`${task.id}/${s.id}`]?.report ?? null })),
    archivos_permitidos: [...step.writePaths, `docs/ejecucion-paneles/resultados/${task.id}-${step.id}-entrega.md`],
    contrato_aceptado: /^(backend|frontend)(-|$)/.test(step.id) ? `docs/ejecucion-paneles/contratos/${task.id}.md` : null,
    entrega: `docs/ejecucion-paneles/resultados/${task.id}-${step.id}-entrega.md` };
  console.log('\n# Ficha seleccionada\n' + JSON.stringify(selected, null, 2));
  console.log('\nEl prompt y contexto ya están incluidos: no vuelvas a leerlos ni abras todas las fichas. Consulta el contrato aceptado cuando corresponda. Las rutas futuras se crean solo tras sus dependencias.');
  console.log(task.actor === 'coordinador' ? 'Solo el coordinador registra el veredicto y las evidencias en estado.json.' : 'No editar tareas.json, estado.json ni el preparador desde una tarea de aplicación.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
