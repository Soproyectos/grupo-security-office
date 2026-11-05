# 2026-10-27 — Biblioteca V2 alineada con el manual de marca

## Contexto

El usuario ordenó organizar lo modificado con Impeccable para ajustarlo al manual de marca anclado en `D:\Empresa\web-gruposecurity\MANUAL DE MARCA` (borrador): solo colores y tipografía, sin tocar layout, navegación ni UX. Una sesión previa (Codex) ya había re-tematizado el CSS del código; esta sesión verificó ese estado, cerró los restos y puso la documentación en línea con la realidad.

Valores confirmados por el usuario con lectura directa del manual:

- Rojo institucional: HEX `#CE0203`, RGB 206, 2, 3.
- Gris institucional: HEX `#484748`, RGB 72, 71, 72.
- Tipografía: el manual no define fuente oficial; se mantiene la familia vigente (Roboto, con títulos en Roboto Condensed).

Decisión del usuario: la paleta azul que Impeccable introdujo en Biblioteca V2 (azul tinta `#183247`, azul de interacción `#24577a`, fondos azulados) se reemplaza por la identidad de marca; el rojo queda para acciones, enlaces y foco, y los fondos pasan a neutros cálidos derivados del gris.

## Estado verificado

- El CSS de las superficies de Biblioteca ya usaba la identidad institucional antes de esta sesión: `library-workspace.css` define `--library-ink: var(--color-secondary, #484748)` y `--library-action: var(--color-primary, #ce0203)`, con lienzo `#f5f5f5`, papel blanco, líneas `#e5e5e5`/`#d4d4d4` y títulos `h1`–`h4` en Roboto Condensed. `library-publication.css`, `LibraryProductEditorPage.css` y `LibraryProductConsultationPage.css` derivan de esas variables; las sombras usan `rgb(72 71 72 / …)`.
- Búsqueda de restos de la paleta azul (`#183247`, `#24577a`, `#eef3f7`, `#dfebf4`, `#8c2632`, `#cdd8e1`, `#e3ebf1`, `#dce6ed`, `#eaf0f4`, `#344f60`, `#506779`, `#b5c4cf`, `#d3dee6`, `#c5d5e0`): **cero coincidencias** en CSS/TSX/TS del frontend.
- Único resto azul en superficies de Biblioteca: el enlace «Consultar fuente» de `LibraryReviewSection.tsx` usaba `text-blue-700`.

## Cambios

1. `src/frontend/src/features/library-review/LibraryReviewSection.tsx`: enlace «Consultar fuente» pasa de `text-blue-700` a `text-security-500` (el token `security-500` = `#CE0203` ya usado en el resto de la app, p. ej. `AccountMenu.tsx`). Ninguna otra clase azul/sky/slate quedó en las superficies de Biblioteca; los `text-sky-*` de `AuditPage`, `ProductDetailPage`, `ListaDetailPage`, agenda y auditoría de productos son colores funcionales preexistentes fuera del alcance de Impeccable y se conservan.
2. `DESIGN.md`: reescrito para describir la identidad real — cabecera y tinta en gris institucional `#484748`, lienzo `#f5f5f5`, papel blanco, rojo `#CE0203` en acciones/enlaces/foco, títulos Roboto Condensed y cuerpo Roboto. La «Local Identity Rule» pasa a ser «The Brand Identity Rule»: los colores de Biblioteca son los del manual y no se proyectan a la vitrina pública.
3. `.impeccable/design.json`: tokens, sombras, componentes y narrativa actualizados a los valores institucionales (antes documentaban `#183247` y focos `#8c2632`).
4. `docs/biblioteca-dominio/biblioteca-v2-diseno.md`: anexada la sección «Actualización 2026-10-27: ajuste a la identidad del manual de marca» con los valores confirmados y la decisión; la dirección original no se reescribió.
5. Esta bitácora.

## Validación

- ESLint: 0 errores, 5 advertencias preexistentes (react-refresh y exhaustive-deps, ajenas a este cambio).
- Vitest: **1010 pruebas aprobadas en 106 archivos**, sin cambios de specs. `library-review.test.tsx` solo afirma el texto «Consultar fuente», no la clase.
- `npm run build` (TypeScript + Vite): aprobado, 534 módulos. En Windows fue necesario el mismo ajuste local de transferencia inline de esbuild ya documentado en la bitácora de 2026-10-26 (`esbuild-inline-transfer.cjs` fuera del repositorio, en `C:\Users\sopor\AppData\Local\Temp\kilo`, activado vía `NODE_OPTIONS --require` con el envoltorio `build-biblioteca.ps1`); el bloqueo es del entorno al borrar el temporal de esbuild en `%TEMP%`, no de la aplicación. Se conserva el aviso habitual de bundle mayor a 500 kB.

## Límites

- El manual es un **borrador** y su README marca paleta y fuentes como pendientes de verificación oficial; solo `#CE0203` y `#484748` están autorizados por el usuario. Si Marketing entrega la versión final con valores distintos, se reabre el ajuste con este mismo procedimiento.
- No se tocó la ficha/vitrina pública del cliente, el resto de la aplicación, backend, base ni contratos de API. Los colores funcionales de estado (success, warning, error, info) se conservan como semántica de la app.
- No se editaron las bitácoras históricas ni `.impeccable/surfaces/` (evidencia de la dirección azul original).
- Sin commits ni push: pendientes de aprobación explícita del usuario.
- Revisión visual en navegador (seis superficies de Biblioteca en escritorio y móvil) queda pendiente; los tokens verificados en código ya corresponden a la identidad de marca.
