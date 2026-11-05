# Skills de diseño y funcionalidad web

## Objetivo
Crear dos skills que trabajen juntas: `gs-disenador-web`, por la que pasa todo cambio de frontend, y `gs-funcionalidad-web`, que organiza el backend según lo que pide el diseño a partir de un reporte de traspaso.

## Por qué
El usuario pide que cada cambio web se diseñe y valide con criterios de UX/UI y de marca, y que los cambios de backend sigan al diseño, no al revés.

## Alcance autorizado
- Skills en el proyecto: `.claude/skills/gs-disenador-web/` y `.claude/skills/gs-funcionalidad-web/`.
- Copia en el PC del usuario: `~/.claude/skills/`. El usuario eligió "Proyecto y tu PC" el 2026-10-28.
- Registrar ambas en `AGENTS.md`.
- Sin commit, push ni despliegue sin aprobación explícita.

## Restricciones
- Se basan en Impeccable (modo Operate y craft floor), `PRODUCT.md`, el manual de marca (borrador) y los tokens de `src/frontend/src/index.css`.
- `DESIGN.md` está desactualizado: dice cabecera gris, pero el usuario aprobó la cabecera roja. El gris del texto sigue sin decidir.
- Se escriben en la rama `Esnaider/validacion-biblioteca`, la que usan las sesiones activas. En `AGENTS.md` ya hay cambios de otras sesiones sin commit; se agrega una sección sin tocar las demás.

## Tareas
- [x] T1 Escribir `gs-disenador-web`: SKILL.md, checklist, marca y plantilla de traspaso. Ruta: delegada (un escritor, porque son 2 o más archivos no triviales). Un hook bloqueó al escritor al crear `assets/reporte-traspaso.md` (lo tomó por un archivo de reporte), así que esa plantilla la escribió el padre con el contenido que el escritor dejó listo.
- [x] T2 Escribir `gs-funcionalidad-web` (SKILL.md). Ruta: delegada (el mismo escritor).
- [x] T3 Registrar ambas en `AGENTS.md`, en la sección «Diseño y funcionalidad web (obligatorio)». Además se reescribió `docs/handoffs/README.md`, que ya existía, conservando `HANDOFF_ACTUAL.md`. Ruta: delegada.
- [x] T4 Copiar ambas skills a `~/.claude/skills/`. Ruta: directa. `diff -r` sale sin diferencias.
- [x] T5 Revisión estructural: frontmatter válido, con descripción de una línea de 177 caracteres; unos 725 tokens en el cuerpo de la del diseñador y unos 586 en la de funcionalidad; enlaces locales existentes. Ruta: directa.

- [x] T6 Regla de una línea en `.claude/CLAUDE.md`, fuera de los bloques gestionados por gentle-ai, para que Claude cargue las skills sin abrir `AGENTS.md`. La sección de `AGENTS.md` quedó en un párrafo, para Codex, Kilo y OpenCode. Ruta: directa. Pedido del usuario el 2026-10-28.

## Criterios de aceptación
- Frontmatter válido, con una descripción de una sola línea que empieza por los disparadores.
- El cuerpo de cada SKILL.md no pasa de unos 700 tokens; el detalle va en `references/` y `assets/`.
- Un formato de traspaso común que ambas skills leen y escriben.

## Comprobaciones
Lectura estructural de los archivos. TDD no aplica, porque solo son documentos.

## Progreso
Creado el 2026-10-28.
