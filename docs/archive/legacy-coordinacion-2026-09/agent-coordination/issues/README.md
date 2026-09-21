# Tablero de issues entre agentes

Directorio canónico para registrar tareas delegadas entre agentes (OpenCode, Kilo) y el coordinador (usuario + Claude Code).

## Convención de issues

Cada issue es un archivo markdown `.md` con el nombre de su `TASK_ID` en minúsculas y kebab-case:
- `<task_id>.md` — p. ej., `COORD-RECONCILE-001.md`, `excel-import-001.md`

### Campos obligatorios

```yaml
---
id: COORD-RECONCILE-001
title: Reconciliar identidad de coordinación Grupo Security Office
status: pending | in_progress | completed | blocked
assigned_tool: claude | opencode | kilo
assigned_agent: [opcional, ej. backend-engineer, excel-import-implementer]
created_by: usuario@email.com
created_at: 2026-09-09T00:00:00Z
---

## Scope (Contrato de delegación)

### Objetivo único
Una frase: qué se va a hacer y por qué.

### Archivos permitidos
Paths exactos o glob patterns que el agente puede modificar.

### Archivos prohibidos
Paths que el agente NO debe tocar.

### Entradas disponibles
Documentación, especificaciones, esquemas, código existente.

### Salida esperada
Archivos nuevos/modificados, tests, documentación.

### Criterios de aceptación
Lista verificable de cosas que must be true.

### Comandos de validación
Exactos comandos para ejecutar y verificar.

### Riesgos conocidos
Técnicos, de dependencia, de alcance.

## Resultado (al completar)

completed_at: 2026-09-09T15:30:00Z

### result_summary
Qué se hizo, archivos modificados, resultados de validación.
```

## Ciclo de vida del issue

| Estado | Quién | Acción |
|--------|-------|--------|
| **pending** | Coordinador crea | Issue registrado con scope explícito, esperando ejecución |
| **in_progress** | Ejecutor (agente) | Agente abierto en worktree, trabajando según scope |
| **completed** | Ejecutor + coordinador | Validación pasó, issue cerrado con `result_summary`, `graphify update .` ejecutado |
| **blocked** | Cualquiera | Falta contexto o decisión del coordinador; requiere acción antes de proceder |

## Integración con procedimiento operativo

Ver `docs/agent-coordination/worktree-issue-pr-procedure.md` para el procedimiento técnico completo:

1. **Creación del issue**: coordinador crea archivo en este directorio con `status: pending`
2. **Descubrimiento**: Orca (orquestador técnico) descubre issues `pending` periódicamente
3. **Asignación**: Orca abre worktree (`agent/<executor>/<TASK_ID>-<slug>`) e invoca el agente correspondiente
4. **Ejecución**: El agente trabaja según el `scope` del issue
5. **Cierre**: Agente valida, prueba, actualiza `status: completed` + `result_summary`, corre `graphify update .`
6. **PR y merge**: Orca abre PR si validación pasa; merge a `main` requiere orden explícita del coordinador (usuario + Claude Code) + aprobación del usuario

## Ejemplo de issue (estructura mínima)

```markdown
---
id: EXCEL-IMPORT-001
title: Importar nuevos productos desde archivo Excel
status: pending
assigned_tool: kilo
assigned_agent: excel-import-implementer
created_by: usuario@email.com
created_at: 2026-09-09T10:00:00Z
---

## Scope

### Objetivo único
Integrar y validar importación de 150 nuevos productos desde `data/products-sep-2026.xlsx` sin duplicados ni invariantes rotas.

### Archivos permitidos
- `src/backend/src/modules/products/` (importador, validación)
- `data/products-sep-2026.xlsx` (entrada)
- Tests en `src/backend/src/modules/products/**/*.spec.ts`

### Archivos prohibidos
- `schema.prisma`
- `src/frontend/**`
- `.env`, credenciales

### Criterios de aceptación
- [ ] Importación sin errores
- [ ] Tests: 100% pass, cobertura >= 80%
- [ ] BD contiene 150 productos nuevos sin duplicados
- [ ] Invariante `Price.listaId == Product.listaId` verificada

### Comandos de validación
\`\`\`bash
npm run build
npm test src/backend/src/modules/products
npx prisma db seed
\`\`\`

### Riesgos conocidos
- ERP Yéminus aún no confirmado; importación no incluye precios del ERP
- Base datos grande; precaución con transacciones
```

## Comunicación e interconexión

- **Qué saben los agentes**: todos los agentes (OpenCode, Kilo, coordinador) saben que existen issues en este directorio
- **Orca (orquestador técnico)**: es quien monitorea y ejecuta el ciclo de vida
- **Coordinador**: crea issues con scope explícito, resuelve conflictos, aprueba merge a `main`
- **Agentes**: descubren sus issues, siguen el `scope`, cierran con evidencia

---

Referencia cruzada: AGENTS.md "Tablero de issues entre agentes" para política completa.
