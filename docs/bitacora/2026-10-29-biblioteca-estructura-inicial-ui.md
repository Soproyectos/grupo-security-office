# Bitácora: categorías, subcategorías y carga inicial

Fecha: 29/10/2026. Rama Esnaider/validacion-biblioteca.

## Resultado

Interfaz local actualizada: importador general retirado del flujo, URL antigua redirigida a Productos; edición y precios conservados. Configuración distingue principales y subcategorías, muestra el árbol y permite definir padre. La ficha selecciona ambos niveles y guarda solo categoryId hoja. Al limpiar la hija se conserva la principal y se bloquea guardar mientras falte una hoja exigida.

Filtro comercial corregido: categoryIds OR, hijas directas incluidas y filtro antes de paginar en búsqueda SQL y Prisma. categoryId legado mantiene igualdad exacta. Árbol aprobado de dos niveles: nueve familias y 66 subcategorías, más raíz técnica Sin categoría. Sin cambios de permisos ni schema/migraciones.

## Archivos

App.tsx y App.spec.tsx; components/layout/CommercialLayout.tsx; features/products/sheet/ProductGeneralInfoSection.tsx; pages/CommercialSettingsPage.tsx; pages/LibraryProductQueuePage.tsx y spec; pages/category-tree.ts y spec; services/settings.service.ts y spec. Filtros: features/products/hooks/useProducts.ts y spec; backend modules/products/dto/product-query.dto.ts, products.controller.ts, products.service.ts y spec.

## Validación

- Estructura frontend: cinco archivos Vitest, 49/49 pruebas.
- Filtros frontend: 6/6; servicio de productos backend: 135/135.
- Ejecutor de reconstrucción: 10/10 node tests y node --check.
- TypeScript frontend y backend de producción, ESLint focal y git diff --check aprobados.
- Build backend: npm run build, Prisma generate + Nest build; sin migración.
- React/Playwright sintéticos: árbol visible, crear/editar, selección hija, principal conservada al limpiar, guardado de hoja y sin overflow global a 375 px. Capturas en _control/ui-categorias-20261029 del worktree. No aceptación autenticada real en navegador.

## Aplicación

Datos QA reconstruidos y postcheck completo aprobado: 1.538 borradores+demo = 1.539; ningún nuevo producto sin marca/hoja. Precios/quotes/stocks0. Demo y 445 UploadedFiles conservados. Maestro de 5.056 conciliado; 3.517 registros excluidos en Excel. Los tres JS de filtros se compararon contra baseline live y solo agregan categoryIds; desplegados únicamente en gs-test-demo-api, health 200/development y productos 401 sin token. Hubo una reversión automática inicial del parche por lectura incorrecta del sobre de health; se corrigió el parser y se repitió con éxito.

No frontend productivo, otros contenedores, migraciones, commit ni push. El importador de precios ya admite SKU DRAFT/inactivos y no publica productos.

## Evidencia y reversión

Contrato final: ../handoffs/2026-10-29-biblioteca-carga-inicial.md. Respaldo y recibos de datos: 2026-10-29-biblioteca-rebuild-qa.md. Recibo del parche API en D:/Empresa/web-gruposecurity/listas/LISTA_DE_PRECIOS_EXCEL/_control/revision_despliegue_filtros_qa/receipt.json.

Revertir solo diffs propios: existen cambios previos ajenos en los mismos archivos. Para datos, utilizar el respaldo QA concreto documentado, nunca una eliminación general ni un deploy con migraciones.
