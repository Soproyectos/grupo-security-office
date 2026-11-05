# Biblioteca: publicar desde el editor (sin pestaña Publicación)

Estado: implementado, pendiente de revisión · Ruta: delegated direct (writer único) · TDD: no resuelto (ordinary functional checks) · Sin commit (AGENTS.md)

## Objetivo
Quitar la pestaña «Publicación» de Biblioteca. Publicar/programar/despublicar se hace en la sección «Dónde se muestra» del editor de ficha. «Publicar en tienda» es un permiso complementario: solo se puede asignar a quien ya puede editar (Actualización, `products:write`).

## Decisiones del usuario (2026-10-28)
- Quitar la pestaña Publicación.
- El permiso de publicar se asigna a quien edita (complemento de Actualización).

## Alcance
- T1 Frontend: quitar pestaña `Publicación` de `CATALOG_TABS` y de `CommercialLayout`; quitar rutas `/catalog-management/publication` y `publication/products/:id` (redirigir a `/commercial/library/update/products`); editor: `canPublish` depende solo del grant `products:publish`, no de la pestaña.
- T2 Backend catálogo: `products:publish` depende de `products:write` (además de `products:read`); paquete `biblioteca-publicacion` pasa a llamarse «Publicar en tienda» (complemento); subir `ACCESS_CATALOG_VERSION`; textos «pestaña Publicación» → «Publicar en tienda».
- T3 Pantalla de asignación: mostrar «Publicar en tienda» como complemento bajo Actualización (no como panel aparte); specs frontend con versión vieja actualizados.
- T4 Editor: estado de publicación visible en el encabezado (Publicado / Borrador).
- T5 Docs: mapa de permisos y este documento.

## Fuera de alcance
- Borrar componentes huérfanos (`PublicationBoardPanel`, `LibraryProductPublicationPage`): requiere aprobación; solo se desconectan.
- Commits, push, migraciones, despliegue.

## Verificación
`tsc` frontend y backend, `eslint` de lo tocado, vitest frontend (users, layout, pages, App), jest de `common/security` y `users`. Falla conocida ajena: `App.spec` «usuario sin asignaciones» (/agenda).

## Progreso (2026-10-28, sin commit)
- [x] T1 Frontend: pestaña y hint de Publicación fuera de `CATALOG_TABS` y `CommercialLayout`; rutas `publication` y `publication/products/:id` redirigen a `/commercial/library/update/products`; `canPublish` del editor depende solo de `products:publish`; se quitó el enlace «Abrir publicación». `isCatalogPath` sigue cubriendo `/catalog-management/*`.
- [x] T2 Backend: `products:publish` depende de `products:read` y `products:write`; paquete `biblioteca-publicacion` renombrado «Publicar en tienda» (complemento; nuevo campo `externalDependencies: ['products:write']` en el paquete para que el autochequeo de carga acepte que `write` venga de Actualización); textos «pestaña Publicación» actualizados; `ACCESS_CATALOG_VERSION` = `panels-20261028-1` (espejo en `services/users.service.ts`).
- [x] T3 `UserAccessAssignments`: «Publicar en tienda» se muestra anidado bajo Actualización (deshabilitado si Actualización no está aplicada); specs frontend actualizados.
- [x] T4 Encabezado del editor con insignia «Publicado» / «Borrador» (`data-testid="editor-status-badge"`) y pruebas.
- [x] T5 Docs: `docs/biblioteca-dominio/mapa-de-permisos-biblioteca.md` y este documento.

## Evidencia de verificación
Ver informe del writer (comandos y salidas reales). Falla conocida ajena: `App.spec` «usuario sin asignaciones» (/agenda).

## Huérfanos (sin borrar, requieren aprobación)
`features/catalog-publication/PublicationBoardPanel.tsx`, `pages/LibraryProductPublicationPage.tsx` (+ sus specs y CSS). `ProductDetailPage.tsx` aún enlaza a `/catalog-management/publication` (ahora redirige).

## Siguiente paso
Revisión del usuario; decidir borrado de huérfanos y commit.
