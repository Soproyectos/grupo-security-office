# T03 — Revisión local, sin alterar candidatos ni probar PostgreSQL

**22/10/2026 · Codex · `Esnaider/nifty-robinson-8a8974` · HEAD `cb230aa6fa206f142d4cdf8caf7a6a11fe3ebf00`.**

Autorización: revisión local del esquema/SQL y evidencia. Sin T04 ni conexiones; preparar ensayo solamente si no hay bloqueos. Se contrastó el estado de Git con la entrega anterior; no hubo cambios ajenos inesperados. Explore leyó las migraciones, historia local y puntos específicos de importación; no se repitió auditoría general.

## Resultado

Tres asuntos impiden cerrar/preparar ejecución: falta el NOT NULL histórico de `catalogManufacturerRefs`; los GIN retirados de la historia final fueron reincorporados sin decisión técnica; el SQL dirigido a public no incorpora la guarda de destino aislado/vacío ni atomicidad del ejecutor. No se modificó el esquema, complemento, SQL generado ni comprobadores; las correcciones SQL se proponen en la [tabla única de hallazgos](../biblioteca-dominio/t03-revision-local.md).

Alta incompleta: DRAFT no levanta los NOT NULL heredados de nombre/marca/categoría. La ruta de transición es mantener fila en preparación con datos reales, sin crear Product ni usar rellenos. El flujo de precios ya guarda PENDING_PRODUCT/productId NULL; no es un nuevo staging general de productos. El importador legado sí usa rellenos y no se autoriza como solución de ese requisito.

Se corrigieron solo documentos: README, plan T03, modelo (enums nativos, nombre sin relleno y preparación), transición (GIN no vigentes) e informe T03 (límites de la comparación anterior). Se añadieron tabla de revisión, JSON de evidencia y esta bitácora. Tareas de proveedores/referencias, costos, faltantes, evidencia, archivos y eventos siguen explícitas, sin implementación nueva.

## Comprobaciones

`node src/backend/prisma/biblioteca-candidata/comprobar-candidato.js` → código 0, mismos 23 modelos/280 escalares/19 FK, cinco enums y huellas. **Ese éxito compara el contrato Prisma y no detectaba por sí solo NOT NULL de arrays impuestos por SQL histórico.** La revisión física encontró la diferencia en `20261017150000:10` frente al SQL candidato:89; no se presentó una aserción fallida como prueba pasada.

Inspección estática del SQL: 23 PK, 19 FK internas, 19 índices únicos (incluido normalizado), 45 ordinarios (incluidos los tres GIN), dos CHECK. Enums antes de uso, tablas antes de FK/ALTER, pg_trgm antes de GIN. Sin DML, DROP/TRUNCATE ni CREATE/ALTER/DROP DATABASE. CREATE SCHEMA public IF NOT EXISTS no verifica destino vacío. IDs UUID y @updatedAt siguen siendo comportamiento del cliente, no defaults SQL.

Se revisaron estado final y origen de extensión, CHECK, SKU normalizado, GIN y comentario Price/Lista; se constató ausencia de motivo documentado para DROP de GIN. `git diff --check` y enlaces locales se comprobaron antes de entregar. No se repitieron lint/typecheck de código intacto: sus resultados anteriores siguen documentados, sin presentarlos como nuevos ensayos.

La [evidencia JSON](../biblioteca-dominio/evidencia/t03-revision-local.json) registra huellas recibidas y finales, objetos históricos, comprobaciones y bloqueos. Los JSON de la entrega inicial se conservan como evidencia de esa entrega, no se sobrescriben para ocultar el hallazgo posterior. Engram sigue sin herramientas expuestas; no se configuró ni instaló nada.

## No ejecutado y siguiente acción

Ningún SQL, base, contenedor, SSH, VPS, instalación, commit/push o despliegue. No se preparó ejecutor por los bloqueos encontrados; el entorno aislado de referencia sigue siendo el procedimiento gs-test-* existente, no se inventó otro. Siguiente: revisar las correcciones propuestas y cerrar la decisión sobre GIN; después preparar ensayo mínimo y solicitar autorización separada antes de ejecutar. T04 no iniciada.

Reversión documental: retirar únicamente estos tres archivos nuevos y los párrafos de revisión añadidos a los cinco documentos, preservando toda la entrega T03 y cambios previos. No hay estado de BD que revertir.
