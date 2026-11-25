# 2026-11-24 — atributos de categoría y conteos contextuales

Estado final: carga productiva WORKING confirmada y tienda 5181 recuperada. [Guía vigente](../handoffs/2026-11-24-tienda-local-estado-vigente.md). Las secciones siguientes distinguen las etapas; las afirmaciones iniciales de ausencia de escritura no describen el estado posterior a la carga.

## Etapa inicial: consulta y propuestas, antes de la autorización

Se consultó la base por transacción de solo lectura. Inventario: 850 productos; 849 grupos publicados no vacíos; 11 categorías; cinco tablas tipadas sin registros. Se delegó la auditoría de etiquetas, el modelo y el contrato de facetas a tres agentes. El principal completó el generador cuando el agente del modelo agotó su cuota.

Cambios: normalización y selección de atributos por familia en public-requirements.ts; conteos con contexto en PublicCatalogService y su controller; contexto en petición/caché de SubcategoryProducts; selección con cero desmarcable en ParameterRequirements; generador local y ocho pruebas; propuestas de diccionario/plantillas/valores. [Contrato, cobertura y evidencia](../handoffs/2026-11-24-atributos-categoria.md).

Comprobado: 55 definiciones, 2.035 valores propuestos, 107 pendientes. Sin DB write, migraciones, publicación, despliegue, commit ni push. API local actualizada con autorización anterior del usuario. Salud conectada y frontend 5181 responde.

Pruebas ejecutadas: node --test scripts/proponer_atributos_biblioteca.test.cjs (8/8); Jest public-requirements.spec.ts, public-catalog.requirement-context.spec.ts y public-catalog-key-spec.spec.ts (15/15); tsc backend y lint dirigido correctos; servicio frontend 25/25. Cruce real TCP + entrada 100–240 VAC + salida 500 W: un amplificador coincidente. No se hizo nueva validación visual completa. No se considera limpio el typecheck global frontend ni la prueba heredada de subcategorías.

Al cerrar esta etapa estaban pendientes la revisión de 107 casos, la clasificación de una cámara y la autorización de carga; esta última se resolvió y ejecutó en la sección siguiente. Las categorías vacías no se rellenaron con ejemplos.

Reversión: retirar los cambios de normalización/conteos y usar las copias previas de los módulos compilados de la API local conservadas en el directorio temporal de ejecución. En esta etapa las propuestas todavía eran solo archivos locales; la carga posterior sí escribió en PostgreSQL y tiene su procedimiento de reversión específico. No hacer git reset ni revertir otros cambios del worktree.


## Carga posteriormente autorizada y ejecutada

El usuario autorizó explícitamente cargar las 55 definiciones, 206 asociaciones y 2.035 valores en producción, como datos de trabajo y sin publicación. Cargador nuevo: scripts/aplicar_atributos_biblioteca.cjs; pruebas en scripts/aplicar_atributos_biblioteca.test.cjs (8/8). Revisión independiente del agente facet_contract: sin bloqueo confirmado. Preflight real: fuentes coincidentes, cinco tablas vacías.

COMMIT confirmado 2026-11-24T20:06:03Z; lote 57f4726f-c1b2-4696-843d-1be7ccbdfc43. Insertados 55 defs, 68 opciones, 206 plantillas, 2035 valores WORKING y 4496 selecciones; 705 ProductChange para 705 productos. Publicación antes/después con igual huella e482c47dfd06e1fbc7c9aafe2e561f4c y 850 productos; no se crearon valores PUBLISHED. Informe local data/atributos-biblioteca-20261124/apply-1795550750915.json.

Las pruebas del cargador cubren idempotencia, rechazar diferencias existentes, invalidar opciones/etapas fuera del alcance, abortar si cambió la fuente, rollback ante error y commit verificado. El generador conservó sus 8 pruebas aprobadas. No se ejecutaron migraciones, reinicios ni despliegues en esta carga. Los artefactos propuestos originales se conservaron sin modificar sus hashes. Para revertir, usar exclusivamente las filas del lote con comprobación de estado y autorización nueva; nunca usar migration.down. Los 107 casos pendientes siguen sin cargar.

Comprobaciones posteriores al COMMIT: preflight READ ONLY con los conteos cargados y cero inserciones pendientes en las cinco tablas; fuentes y huella publicadas iguales. Salud API 200/database connected, web 5181/tienda 200, cruce tensión100–240VAC+TCP+salida500W con una coincidencia DS-QAZ1A500G1-VB2. Sin necesidad de reiniciar servicios.

## Recuperación del frontend en blanco (24/11/2026)

El usuario solicitó lanzar de nuevo la web de 5181. El HTML respondía 200, pero /src/main.tsx devolvía 500 (spawn EPERM). El arranque alternativo start-dev.cjs no entregaba una aplicación funcional. Se recuperó Vite desde un proceso local con permisos de ejecución normales, conservando proxy API/catálogo3010 y portal4314.

Se corrigió únicamente la codificación de vite.config.ts de UTF-16 LE a UTF-8 (mismo contenido), con copia previa en el directorio temporal. Se restauraron enlaces de dependencias ya presentes en la caché pnpm; no se descargaron paquetes ni cambiaron versiones. Un intento pnpm install offline pidió confirmación y no realizó la reinstalación. El lanzador temporal gs-local-5181-20261124/vite-5181-recovered.mjs excluye temporales del editor .tmpdir y configura optimizeDeps.esbuildOptions.target=esnext para evitar el fallo del optimizador con su conjunto de targets antiguos. Frontend PID al verificar:16944.

Comprobación real en navegador: tienda visible con categorías y vitrinas de cámaras, alarmas y control de acceso, productos y flechas. Menú /api/public/categories/menu HTTP200; listado público HTTP200; main/App/CSS HTTP200; API database connected. La carga inicial del catálogo tardó; no se debe declarar éxito solo por HTML200. Sin escrituras nuevas de BD, migraciones o despliegues durante la recuperación. Advertencia ajena al bloqueo: Agentation usa almacenamiento local porque su servidor auxiliar no responde.

Arranque recuperado: desde src/frontend ejecutar node sobre el lanzador temporal mencionado con VITE_API_TARGET=http://127.0.0.1:3010, VITE_CATALOG_API_TARGET=http://127.0.0.1:3010 y VITE_PORTAL_API_TARGET=http://127.0.0.1:4314. Solo desarrollo local; no se cambió el target de producción.

## Consolidación documental solicitada por el usuario

Se creó docs/handoffs/2026-11-24-tienda-local-estado-vigente.md como punto de continuidad de toda la entrega: UX y vitrinas, filtros/conteos y BD, carga, entorno actual, arranque y recuperación, límites, archivos, pruebas, reversión y pendientes. Se enlazó desde docs/README.md, docs/handoffs/README.md y el índice de Biblioteca. Las notas históricas de selector, vitrinas y consolidación ahora apuntan al estado vigente; se conservaron sus resultados históricos y se distinguió la etapa inicial sin escrituras de la carga posterior.

Se agregó docs/handoffs/evidencia/2026-11-24-carga-atributos.json con lote, hashes, conteos y confirmación de publicación conservada. Este resumen es apto para versionar; no incluye credenciales ni datos personales y no sustituye el informe completo local ignorado por Git. Se documentó explícitamente que las fuentes y lanzadores temporales no están garantizados después de una limpieza y que no se entregó un gestor persistente de todo el entorno.

Validación documental: diez enlaces relativos de las dos guías comprobados, rutas de código comprobadas, evidencia comparada con el informe de COMMIT y git diff --check sin errores de whitespace en los documentos versionados revisados. Agente Explore documentation_inventory revisó historial y guía final: sin defectos materiales. La prueba visual específica de llegar al footer sigue pendiente; solo se describe como implementado su límite según código, no como aceptación visual cerrada. No se ejecutaron pruebas de aplicación nuevas, reinicios, escrituras de BD, commits o push para documentar.
