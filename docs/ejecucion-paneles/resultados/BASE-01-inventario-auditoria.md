# Auditoría BASE-01/inventario — S3

Veredicto: **ACEPTADA como inventario documental**, con las precisiones de este informe. No acepta una base consolidada de implementación ni acredita funciones en ejecución.

## Versión revisada

Auditoría del coordinador, 14 de octubre de 2026, en `/home/soporte/office_ai/grupo-security-office`. Rama observada `feat/storefront-public-pricing`, HEAD `f6311b5c4cca31274b622bfd76628e0f406bb9c5`.

Archivos de entrega revisados, SHA-256:

- `contratos/BASE-01.md`: `a4d8fa12ab1ee3678e87b1316bc9c0bf4b297078f5c81b99a74a9277851f6fc7`.
- `resultados/BASE-01-inventario-entrega.md`: `49770eb06833c162ff72a6df515e2a6902500fb8521ae56bad47d036f66be2f4`.

Código contrastado por lectura: App.tsx, app.module.ts, schema.prisma, PermissionsGuard, AssignmentsController, ListasPublicationController e ImportService. Hashes de referencia:

- `src/frontend/src/App.tsx`: `a772b5e039cf72639b26ff09acbac15b2cab5d347aa8a74ea52c2a688592d50e`.
- `src/backend/src/app.module.ts`: `634a3d9c5089b18009657595123a7fa7a642bbc16c9fb234ad7f1fa2b37ddff8`.
- `src/backend/prisma/schema.prisma`: `8455384236ba08bf0f04ce660d6f68ef24a47668ab4448a41cb9235b312d25a5`.

## Criterios y evidencia

- El inventario distingue pantallas/API/modelos/permisos/pruebas y hechos observados de informes/propuestas. Se contrastaron muestras de las rutas y controles; no se certificó cada endpoint en ejecución.
- El preview temporal y aplicar precios están separados. Se confirmó que `modules/prices/import`, `features/price-import` y `access-catalog.ts` están ausentes de S3. El importador general de productos presente es otro flujo.
- Agenda, promociones y ficha técnica tienen controladores presentes en S3. Eso no acredita datos, auditoría ni funcionamiento integral; el inventario conserva ese límite.
- La propuesta conserva IDs, medios y funciones públicas, evita reemplazos de versiones y registra D1–D9 como pendientes. Esa propuesta permanece sin aprobación para implementar en el checkout activo.
- Se reprodujeron 45 modelos, 64 archivos de pruebas backend y 35 frontend, rama/HEAD y las 28 entradas de status declaradas.

## Precisiones del auditor que deben acompañar el inventario

1. **Integridad anterior no acreditada por `git status`.** La firma observada coincide con `59b2c613b28429ea497aa1e6fb244c7fc76596018518e4fdc5fbc6b4452c57b9`, pero un archivo ya modificado o un directorio sin rastrear puede cambiar de contenido conservando ese mismo status. No se certifica retrospectivamente que todos los bytes ajenos quedaron intactos. Para entregas de código se requieren hashes/diff inicial y final acotados al trabajo. Esto no invalida el inventario observado.
2. **Errata de §5:** `AssignmentsController` usa `assignments:manage` en create/update/remove (líneas 59, 72 y 80); no `listas:create`. Cualquier contrato de acceso posterior debe usar los decoradores reales. Esta precisión corrige el ejemplo sin presentar una prueba de autorización dinámica.
3. **D9 no demuestra conflicto de rutas.** La clase de products.controller.ts:321 es `ListasPublicationController`, con sufijos `:id/publication/*`. Compartir prefijo con otro controlador no prueba colisión. Registro y comportamiento runtime siguen pendientes; no retirar un controlador por esa observación.
4. **El contexto depende de la versión:** las frases heredadas sobre piezas ausentes se referían a L. En S3 los tres controladores señalados sí están presentes. Mantener el nombre de versión junto a cada conclusión y consultar OBS por encima de referencias históricas.

No se solicita rehacer el inventario. Las precisiones anteriores forman parte de su aceptación y deben leerse en el siguiente contrato.

## Comprobaciones del coordinador

Ejecutadas en S3, sin arrancar aplicación, Docker ni base de datos:

```bash
node docs/ejecucion-paneles/preparar-tarea.mjs --check
node --test docs/ejecucion-paneles/preparar-tarea.test.mjs
git rev-parse HEAD
git branch --show-current
git status --porcelain
```

Resultado: plan válido, **13/13 pruebas del organizador**, rama/HEAD/status contrastados. Lectura acotada y hashes con Python. No se ejecutaron Jest/Vitest, PostgreSQL ni navegador porque esta entrega es documental. La afirmación de 47 rutas verificadas es del implementador; el coordinador hizo contraste selectivo, no repitió una lista de 47 que no quedó adjunta como manifiesto.

## Continuidad

Registrar únicamente `BASE-01/inventario` como aceptada en el estado **de S3**, enlazando este informe en `resultados/BASE-01-inventario-auditoria.md`. Mantener decisiones y demás pasos pendientes. Esta copia local del informe no cambia el estado del worktree L.

Siguiente encargo recomendado: **BASE-02/contrato**, todavía documental. Debe usar este inventario y sus precisiones, definir concesiones/alcances y la integración de los controles de L con las rutas de S3. Las skills y fuentes de L faltantes deben suministrarse o identificarse antes de declarar cerrado ese contrato; no sustituirlas con supuestos.

D1: reutilizar el preview ya implementado es la dirección del plan; no encargar otra implementación del mismo parser. La adaptación y traslado requieren su entrega propia en una copia aislada. D2–D9 conservan sus límites y responsables. No se habilita trabajo de aplicación en la carpeta que sirve la web activa, migraciones de usuarios, commits, pushes ni despliegue por esta aceptación.
