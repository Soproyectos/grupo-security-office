import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePlan } from './preparar-tarea.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
export function selectBatchStep(plan, id, stepId) {
  validatePlan(plan);
  const task = plan.tasks.find((t) => t.id === id);
  if (!task) throw new Error('Tarea desconocida. Usa --list.');
  if (task.actor === 'coordinador') throw new Error('La auditoría final está reservada al coordinador.');
  const step = task.steps.find((s) => s.id === stepId);
  if (!step) throw new Error(`Paso desconocido. Opciones: ${task.steps.map((s) => s.id).join(', ')}`);
  return {
    ...step, modalidad: 'tanda continua, implementación sin auditar', id: task.id, paso: step.id, title: task.title,
    references: task.references, readPaths: task.readPaths, rules: task.rules,
    packageCases: task.cases, dependsOn: [...new Set([...task.dependsOn, ...(step.requiresPackages ?? [])])],
    contrato: `docs/ejecucion-paneles/contratos/${task.id}.md`,
    advertencia: 'Consultar TANDA-COMPLETA.md. Respetar dependencias técnicas y decisiones externas; no modificar aceptaciones de estado.json.',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const plan = validatePlan(JSON.parse(readFileSync(resolve(directory, 'tareas.json'), 'utf8')));
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--list') {
      for (const t of plan.tasks) console.log(`${t.id}: ${t.title} | ${t.steps.map((s) => s.id).join(', ')}${t.actor === 'coordinador' ? ' | AUDITOR FINAL' : ''}`);
    } else if (args.length === 2) console.log(JSON.stringify(selectBatchStep(plan, args[0], args[1]), null, 2));
    else throw new Error('Uso: preparar-tanda.mjs --list | ID paso');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
