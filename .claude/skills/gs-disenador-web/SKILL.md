---
name: gs-disenador-web
description: "Trigger: cambio de frontend, pantalla, componente, CSS, estilo, diseño, UX/UI, texto de interfaz o anotación en la web de Grupo Security. Diseña y valida antes de entregar."
license: Apache-2.0
metadata:
  author: "zatairo"
  version: "1.0"
---

## Activation Contract

Cargar ante cualquier cambio bajo `src/frontend/` (páginas, componentes, layouts, CSS, textos de interfaz), pantallas nuevas, anotaciones de Agentation, comentarios visuales o revisión de pantallas. Es la puerta de diseño obligatoria.

Modo Operate (panel interno de trabajo): familiaridad, lectura rápida, densidad sin espacio desperdiciado y componentes consistentes; la herramienta desaparece dentro de la tarea.

Orden de autoridad: (1) decisión explícita del usuario; (2) manual de marca (borrador) en `references/marca.md`; (3) tokens de `src/frontend/src/index.css`; (4) `PRODUCT.md` y `DESIGN.md`. Si `DESIGN.md` contradice una decisión reciente del usuario, seguir al usuario e informar la desviación; no seguir en silencio un documento obsoleto.

## Hard Rules

- Color solo con tokens o variables CSS existentes. Sin hex nuevos fuera de la paleta ni tintes azules.
- Conservar todo campo y acción existente al simplificar; quitar una función exige aprobación del usuario.
- Texto de interfaz en español simple, sin jerga ("ACL", "scopes", "@Roles"): describir lo que la persona ve o puede hacer. Los controles nombran su acción; los errores, el problema y cómo recuperarse; sin títulos ni ayudas duplicados.
- Ocultar un control nunca es autorización: el backend la impone.
- Todo elemento interactivo tiene estados reposo, hover, focus-visible, disabled, loading y error. Estados vacíos que guían; skeletons en lugar de spinners centrados.
- Contraste de texto ≥4.5:1; objetivos táctiles ≥44px en móvil; sin scroll horizontal de página a 375px (tablas anchas con scroll propio).
- Movimiento de 150–250 ms solo para comunicar estado; respetar `prefers-reduced-motion`.
- Prohibido: etiqueta superior (eyebrow/kicker) sobre títulos, tarjetas anidadas, texto con degradado, borde lateral de color >1px como acento, modal como primera opción, emoji o unicode como iconos, rejillas de tarjetas icono+título+texto como estructura de página.
- Rige `AGENTS.md`: ningún commit, push, despliegue, migración ni cambio de contenedores sin aprobación explícita del usuario.

## Decision Gates

| Situación | Acción |
|---|---|
| Solo visual, layout o texto | Diseñar y validar aquí. |
| Requiere datos, endpoint, campo, permiso, validación o cambio de comportamiento del backend | Escribir un traspaso en `docs/handoffs/` con `assets/reporte-traspaso.md` y pasarlo a `gs-funcionalidad-web`. Construir contra el contrato actual o marcar lo dependiente como pendiente; nunca simular datos. |
| No está claro qué debe ver o hacer la persona | Hacer UNA pregunta en lenguaje simple y detenerse. |
| Existe `.agents/skills/impeccable/` | Usar su critique, audit o polish para más profundidad; si no, apoyarse en el checklist. |

## Execution Steps

1. Leer `PRODUCT.md`, `DESIGN.md`, `references/marca.md`, la pantalla y sus componentes.
2. Escribir una línea: quién usa la pantalla y qué tarea completa.
3. En cambios de layout no triviales, describir antes de programar qué se mueve y qué verá la persona.
4. Construir reutilizando componentes y tokens, con el cambio mínimo.
5. Validar con `references/checklist-ux.md`, `npx tsc --noEmit` y los vitest pertinentes de `src/frontend`; revisar el render a ~1440px y 375px cuando la app pueda ejecutarse.
6. Si hace falta backend, crear o actualizar el traspaso.
7. Cuando el traspaso vuelva `respondido`, conectar la interfaz al contrato devuelto, validar de nuevo y marcarlo `integrado`.

## Output Contract

Devolver: qué verá la persona (lenguaje simple); resultado del checklist con ítems fallidos u omitidos; comprobaciones ejecutadas y su resultado; pendientes; ruta del traspaso si existe.

## References

- `references/checklist-ux.md`
- `references/marca.md`
- `assets/reporte-traspaso.md`
- `../gs-funcionalidad-web/SKILL.md`
- Opcional, desde la raíz del repo: `.agents/skills/impeccable/SKILL.md` (más `reference/craft-floor.md`, `operate.md`, `audit.md`, `clarify.md`)
