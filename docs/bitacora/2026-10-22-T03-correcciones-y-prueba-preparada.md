# T03 — Correcciones locales y ensayo preparado, sin ejecución

**22/10/2026 · Codex · `Esnaider/nifty-robinson-8a8974` · `cb230aa6fa206f142d4cdf8caf7a6a11fe3ebf00`.**

El usuario aprobó recuperar NOT NULL/default de manufacturerRefs, excluir tres GIN, preparar guardas/prueba aislada y conservar Product sin ampliar funciones. Se explicó antes de escribir el ajuste y la reutilización de aislamiento T00 con payload/ejecutor psql independientes. No se tocaron los artefactos ni el parche T00.

## Cambios

Complemento y SQL concatenado: NOT NULL histórico recuperado; default ARRAY[] intacto; GIN excluidos; pg_trgm conservado. Comprobador estático actualizado; esquema Prisma intacto. Nuevos preparar.js, script aislado y seis SQL de identidad, vacío, estructura, datos, fallo y tablas vacías. Contrato físico/paquete determinista bajo generated/, ignorado por Git. Diff de cuatro archivos recibidos, evidencia JSON y comparación regenerados.

Documentos actualizados: índice/estado, plan T03, transición, informe T03 y nota de corte histórico en revisión anterior. Nuevo [informe/procedimiento](../biblioteca-dominio/t03-prueba-postgresql18.md), esta bitácora y evidencia de protección. Alta incompleta sigue en T11/T13 sin Product ni rellenos; T07/T08/T13 conservan eventos, archivos, proveedores, costos, faltantes y evidencia. T04 no iniciada.

## Comprobaciones locales

Prisma 6.19.3 migrate diff desde vacío y validate → 0; comparador corregido → 0. TypeScript del candidato con checkJs y backend sin emitir → 0. npm run lint → 0, cero errores/seis advertencias anteriores. node --check y bash -n → 0. Se enumeraron 114 comandos candidatos compatibles con la lista transaccional; sin concurrentes ni control de transacción/operaciones de BD. Paquete USTAR leído por tar instalado, nueve miembros con SHA coincidente, regeneración determinista → sí.

Durante preparación, el clasificador estático rechazó inicialmente un CHECK por un salto de línea después del nombre de constraint: se corrigió el patrón de espacios y la repetición pasó. Explore revisó los archivos nuevos sin ejecutar: detectó una comparación nullable de índice y cobertura de CHECK solo por nombre; se reforzaron IS DISTINCT FROM/indexprs y comparación de expresiones. Todos los SQL siguen sin parseo de servidor ni ejecución; estos ajustes no son evidencia de éxito en PostgreSQL.

El procedimiento prepara pruebas físicas de 280 columnas/PK/FK/índices/CHECK, rechazo de NULL real, datos válidos/erróneos, SKU normalizado, 19 FK y rollback de todo el DDL por ZX003. Contrasta IDs/etiquetas/red/tmpfs/imagen y luego identidad del servidor; public vacío antes del DDL, search_path explícito y psql -1/ON_ERROR_STOP. No invoca db push, migraciones de T00 ni suites globales.

Huellas completas y comandos de lanzamiento propuestos: [informe](../biblioteca-dominio/t03-prueba-postgresql18.md) y [manifiesto](../biblioteca-dominio/evidencia/t03-prueba-preparada.json). Estado exacto: **preparado para prueba, no validado en PostgreSQL**.

## No ejecutado / reversión

Sin SQL, Docker, SSH, conexión a bases, instalación, cambio de producción, commit/push o despliegue. No se inspeccionó producción para preparar la prueba. El script no se ejecutó; bash -n solo comprobó sintaxis. Motores/clientes Linux y comportamiento real de catálogos/guardas pendientes.

Reversión local: restaurar solo las cuatro correcciones del diff respecto a recepción y retirar los archivos nuevos de prueba/evidencia/documentación de esta tarea. Preservar T00/T02 y todo cambio previo; sin reset, stash ni limpieza global. No hay estado de BD que revertir. Engram continúa sin herramientas expuestas; continuidad registrada en el repositorio sin configurar nada.

Se espera autorización separada sobre hashes de script/paquete antes de transferir o ejecutar; no se avanza a otra tarea.
