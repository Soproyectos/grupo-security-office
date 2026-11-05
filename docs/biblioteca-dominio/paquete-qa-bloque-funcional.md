# Importador de Biblioteca — procedimiento QA vigente (30/10/2026)

**El candidato corregido e43aa5b892eb fue autorizado para copia y construcción Linux aislada. Ambas imágenes aprobaron npm ci real y build sin caché, secuencialmente. El despliegue sigue sin autorización y requiere resolver los riesgos aplicables descritos abajo.** Este es el único procedimiento vigente. El bloque histórico al final conserva evidencia anterior: sus pasos, comandos y hashes no autorizan operaciones ni deben ejecutarse. Esta continuidad no desplegó, migró ni limpió QA.

## Candidato exacto y próxima aprobación

Paquete: [qa-importer-candidate-e43aa5b892eb.tar.gz](./evidencia/cierre-importador-20261030/qa-importer-candidate-e43aa5b892eb.tar.gz), 6.951.062 bytes. SHA-256: `ef3267f052354a00832ba8fda6f67bd297a0206ca8f41317e63ec69e6cd8876a`.

[Manifiesto de fuentes y lockfiles](./evidencia/cierre-importador-20261030/candidate-source-manifest-e43aa5b892eb.json): digest `e43aa5b892eb9c5e6e81a67e4ccecb350c916d0dbe220dc9c1b47b2fc60c775c`, 1.227 entradas de build permitidas. Contiene el candidato sucio existente de `Esnaider/validacion-biblioteca`, no solo archivos de HEAD. Excluye credenciales, archivos de usuarios, respaldos, node_modules, dist y clientes generados; incluye únicamente la configuración pública versionada `.env.production` del frontend. El próximo build usará los lockfiles congelados de este paquete sin regenerarlos; la corrección local previa del lockfile frontend está documentada abajo.

**Alcance autorizado y ejecutado:** copia al directorio `/home/dev/gs-candidate-importer-e43aa5b892eb/` y construcción secuencial de las imágenes `gs-test-importer-api:candidate-e43aa5b892eb` y `gs-test-importer-web:candidate-e43aa5b892eb`. Sin arrancar aplicaciones ni conectar bases. El SHA y las 1.227 entradas se verificaron antes de extraer; solo difieren Dockerfile y lockfile frontend respecto al paquete anterior. No se modificó el candidato remoto.

## Procedimiento único para llegar al despliegue

1. **Build aislado, tras su aprobación específica.** Verificar el SHA del paquete antes de extraerlo y contrastar todas las entradas con el manifiesto. Construir con los Dockerfile incluidos y `npm ci` de sus lockfiles; no copiar dependencias Windows. El backend incluye `scripts/copy-library-client.cjs` antes de ejecutar su postbuild; el frontend incluye su `.env.production` pública para usar la misma configuración Vite de producción comprobada. Las construcciones previstas son:

   ```bash
   docker build -f src/backend/Dockerfile -t gs-test-importer-api:candidate-e43aa5b892eb src/backend
   docker build -f src/frontend/Dockerfile -t gs-test-importer-web:candidate-e43aa5b892eb src/frontend
   ```

   La construcción autorizada usa además `--no-cache` para verificar npm ci real en ambas imágenes, sin --force ni omitir comprobaciones. No cambiar Node del host, lockfiles ni fuentes. Los recibos y registros del ensayo están en `evidencia/cierre-importador-20261030/linux-e43aa5b892eb/`. El build por sí solo no habilita el despliegue: primero resolver o aceptar expresamente los riesgos aplicables de dependencias.

2. **Preflight de QA, solo lectura y dentro del alcance aprobado.** Identificar por nombre y etiquetas los recursos `gs-test-demo-api`, `gs-test-demo-web` y `gs-test-demo-ops-db`, la base `gs_api_copy` y el esquema `public`; confirmar `LIBRARY_DATABASE_MODE=legacy`. No utilizar el Compose productivo del repositorio, que apunta a `gs-api`. Leer únicamente los campos necesarios, sin volcar secretos. Contrastar configuración actual, salud, imágenes, comando de arranque, red y volúmenes con el plan de reemplazo acotado.

3. **Comprobar esquema, sin aplicar migraciones.** El [recibo existente de QA](./evidencia/cierre-importador-20261030/qa-schema-receipt.json) identifica el destino QA y registra `…150300` y `…150400` aplicadas, 61 migraciones y ambas relaciones de clasificación anulables. Esta continuidad no añade migraciones. Antes de desplegar, revalidar con SELECT `_prisma_migrations`, sus checksums y las columnas de las cinco migraciones `20261029150000` a `20261029150400`. No reejecutar ninguna. Si falta o difiere una, detener el despliegue e identificar nombre, hash, destino y efecto para **otra aprobación específica**; una aprobación de despliegue no la incluye.

4. **Reemplazo de código, solo después del build verde y de otra aprobación explícita de despliegue.** Conservar las imágenes anteriores y la configuración existente para reversión. El plan debe nombrar únicamente API y frontend de QA, usando los IDs de imagen del paso 1 y el proyecto Compose real verificado en el paso 2. Mantener base, volúmenes, credenciales y modo legacy. El arranque es Node/Nginx: no ejecutar migraciones, semillas, backfill, publicación ni importaciones. No recrear dependencias, proxy compartido ni base de datos. Si la configuración real no permite ese reemplazo acotado, presentar el ajuste antes de actuar.

5. **Comprobación y reversión de código.** Verificar salud, arranque sin errores, ruta real `/commercial/library/update/import`, pestaña asignada y denegación con cuenta no autorizada. No importar/publicar datos para comprobar un despliegue de código. Un recorrido que escriba fixtures en QA necesita su propio alcance aprobado. Si falla el candidato, volver a las imágenes/configuración anteriores de esos dos servicios; no restaurar ni limpiar bases para revertir código. No eliminar respaldos ni imágenes anteriores.

## Resultado del ensayo Linux autorizado y corrección local

El paquete aprobado `qa-importer-candidate-0461b8d0917a.tar.gz`, SHA `f7204788d8e5e69592a56eeea8e1bd192de13cf5ebe149725c1120b9e5b454ed`, fue verificado y extraído sin sobrescrituras en su directorio autorizado. [Recibo](./evidencia/cierre-importador-20261030/linux-0461b8d0917a/linux-build-receipt.json).

- API: build Linux salida 0; imagen `gs-test-importer-api:candidate-0461b8d0917a`, ID `sha256:e45b377ac2a5f6187d7efc0c0068f28ce8bb87b5f7e08cd8b4ccf22c48286550`, 205.164.459 bytes. No arrancó la aplicación.
- Frontend: salida 1 en npm ci; faltaban nueve entradas del lockfile. Además, Vitest 5.0.3 declara Node >=22.12 y el Dockerfile usaba Node 20.20.2. No se creó la imagen frontend. Se detuvo el trabajo remoto sin ajustar el candidato allí.
- Los 1.227 archivos remotos, los contenedores existentes y todas las etiquetas de imagen anteriores permanecieron sin cambios. Sin migraciones, semillas, conexiones a bases, importaciones, despliegue o reinicios. Queda conservado el contenedor detenido del build fallido; no hubo prune ni eliminación de respaldos.
- Incremento observado de disco durante el ensayo: 1.271.861.248 bytes, incluyendo imágenes/capas y restos de build; quedan 170.621.960.192 bytes libres. Directorio del candidato: 20.836.195 bytes. Las cifras reflejan el intervalo observado, no una atribución exclusiva de todo el disco al candidato.
- Advertencias: constructor legacy de Docker (buildx ausente, sin instalarlo); npm del backend reportó 24 vulnerabilidades (8 bajas, 5 moderadas, 9 altas y 2 críticas). No se aplicó npm audit fix ni se declara revisado el riesgo de esas dependencias. Evaluarlo antes de un eventual despliegue.

La corrección de desarrollo modifica únicamente `src/frontend/Dockerfile` (Node 24 en las dos fases de compilación) y `src/frontend/package-lock.json` (nueve entradas faltantes y consolidación de ocho entradas anidadas). No cambia package.json ni código del importador. `npm install --package-lock-only --ignore-scripts --no-audit --no-fund --legacy-peer-deps=false` no instaló dependencias; `npm ci --dry-run` pasó. El build minificado local pasó (586 módulos, 21,56 s) con node_modules ya existente; no sustituye la prueba pendiente de instalación limpia y construcción Linux del nuevo paquete. [Detalle de corrección](./evidencia/cierre-importador-20261030/linux-0461b8d0917a/development-correction-result.json).

El paquete original y su manifiesto se conservan. El paquete nuevo identificado al comienzo de este documento recibió autorización independiente y se construyó sin modificarlo en el VPS. V no se repitió: el backend y sus cinco fuentes verificadas no cambiaron.

## Resultado Linux del candidato corregido e43aa5b892eb

Ambas instalaciones npm ci reales y builds terminaron con salida 0, sin --force, sin regenerar lockfiles y sin modificar Node del servidor. Backend: 828 paquetes instalados; Prisma generate, Nest y postbuild aprobados; duración total 4 min 54 s. Frontend: 316 paquetes instalados; TypeScript y Vite de producción aprobados, 586 módulos y minificación activa; Vite 21,64 s, build Docker total 1 min 57 s. Continúan las advertencias de constructor Docker legacy y chunk JS de 1.225,59 kB.

- API `gs-test-importer-api:candidate-e43aa5b892eb`: `sha256:dc1088134506adca65e66e5d7fc22700b5752ecc78bcfac7e7334da4d26eff51`, 205.166.903 bytes.
- Web `gs-test-importer-web:candidate-e43aa5b892eb`: `sha256:2d1680c052d05608a8f37bf0b3ccef33610b4ceb7c43c394f2d97d1a768be04a`, 26.260.498 bytes.

[Recibo final](./evidencia/cierre-importador-20261030/linux-e43aa5b892eb/linux-build-receipt.json), [API](./evidencia/cierre-importador-20261030/linux-e43aa5b892eb/api-build-result.json), [web](./evidencia/cierre-importador-20261030/linux-e43aa5b892eb/web-build-result.json). Las 1.227 fuentes y ambos lockfiles permanecen idénticos. Etiquetas anteriores intactas; los 12 contenedores existentes conservan ID, imagen, arranque y contador de reinicios. No se ejecutaron aplicaciones, migraciones, semillas o conexiones a bases.

Espacio observado: incremento de 3.230.871.552 bytes (3,01 GiB), incluyendo capas, caché y contexto; libres 167.368.843.264 bytes (155,87 GiB). No es una atribución exclusiva de toda variación de disco al candidato. Preflight: 8 CPU, aproximadamente 21 GB RAM disponibles, sin swap. Sin prune, borrado de imágenes ni respaldos. La revisión de nombres de variables de imagen no detectó claves de secretos; la selección de fuentes excluye credenciales y conserva solo configuración pública frontend.

## Revisión acotada de dependencias del candidato e43aa5b892eb

Auditoría npm sobre copias aisladas de los package.json y lockfiles del paquete aprobado, sin instalar ni actualizar dependencias. JSON completo y con `--omit=dev` conservado en `evidencia/cierre-importador-20261030/linux-e43aa5b892eb/audit-*.json`. Son paquetes afectados, no CVE únicos; no sumar los conteos completos y de producción. No incluye escaneo de paquetes del sistema operativo ni pruebas de explotación. No se ejecutó npm audit fix.

- Backend, fase deps/npm ci: 24 afectadas (8 bajas, 5 moderadas, 9 altas, 2 críticas). Clasificación omit-dev: 13 (4 moderadas, 8 altas, 1 crítica). La inspección estática mediante docker image save confirma las versiones siguientes en la imagen final: se copia node_modules completo, por lo que las herramientas dev también se distribuyen.
- Frontend, deps/npm ci: 3 afectadas (1 moderada, 2 altas), sin críticas. Omit-dev: xlsx como única alta. Vite solo se usa en construcción; la etapa final sirve archivos estáticos con Nginx, sin copiar node_modules. La inspección estática de la imagen web final encuentra cero archivos node_modules y un JS de 1.225.588 bytes sin marcadores `0.18.5`, `SheetNames` o `SheetJS`. Tampoco se localizaron imports xlsx en el código frontend comprobado. No se demostró inclusión ni ejecución de esa librería en el bundle; su clasificación omit-dev en el lockfile no prueba exposición del navegador.

**Críticas del backend.** `proxy-addr 2.0.7` es dependencia HTTP de Express; corregida en 2.0.8. La explotación depende de subredes IPv6 incorrectas en trust proxy: no se encontró esa configuración en main.ts (Express predetermina false); no se certificó configuración de despliegue. `handlebars 4.7.9`, cadena dev ts-jest, también está físicamente en la imagen final: corregida en 4.7.10. Sus RCE requieren AST no confiable o plantillas controladas con allowProtoMethodsByDefault; no se demostró ese uso en la aplicación. [Proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [Handlebars AST](https://github.com/advisories/GHSA-8r5x-fm3f-whwj), [Handlebars opciones](https://github.com/advisories/GHSA-p8wg-vrv2-v86f).

**Altas con exposición relevante del backend.** `body-parser 2.3.0`, usado por defecto por Nest/Express, puede terminar el proceso con una petición comprimida malformada antes de autenticación; parche 2.4.0. `multer 2.2.0`, vía `@nestjs/platform-express 11.2.3`, procesa el upload del importador: hay DoS multipart aplicables al parser; 2.5.0 cubre los avisos acumulados. Los avisos específicos de diskStorage/fileFilter asíncrono no se demostraron en el importador, que usa buffer y límite de tamaño. Permisos y límite de archivo no corrigen la dependencia. El adaptador Nest cuenta como paquete afectado por propagación de multer, no como otro fallo independiente. [Body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828), [Multer campos](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm), [Multer filtro](https://github.com/advisories/GHSA-q7qp-rjg7-q26m).

`xlsx 0.18.5` se usa en el servidor para leer Excel subido: son relevantes los avisos de contaminación de prototipo y ReDoS sobre archivos no confiables. Correcciones del fabricante: >=0.19.3 y >=0.20.2 respectivamente; la publicación npm xlsx no ofrece esa corrección. Requiere acordar el artefacto oficial o sustitución, sin instalarlo automáticamente. [Fabricante: prototipo](https://cdn.sheetjs.com/advisories/CVE-2023-30533), [Fabricante: ReDoS](https://cdn.sheetjs.com/advisories/CVE-2024-22363).

**Resto de altas.** `brace-expansion 2.1.4`: agotamiento de recursos con patrones controlados; >=2.1.6 corrige la alta y >=2.1.7 cubre también la moderada. `deepmerge-ts 7.1.5`, vía `@prisma/config/prisma 6.19.3`: agotamiento de pila con grafos cíclicos; corregida en 8.0.0. No se demostró entrada HTTP que controle esos usos de herramientas/configuración; JSON simple no expresa ciclos. npm propone Prisma 7.10.1, cambio mayor que requiere revisión, no una corrección automática. `fast-uri 3.1.6`, cadena dev Nest schematics/Ajv/webpack, físicamente retenida en API: confusión de autoridad URI/SSRF bajo uso específico; >=3.1.7 corrige altas, >=3.1.9 cubre los otros avisos. No se demostró ese camino en solicitudes de aplicación. [Brace](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [Deepmerge](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), [Fast-uri](https://github.com/advisories/GHSA-qw65-cvwx-89v3).

Frontend: `vite 6.4.3` tiene una alta del servidor de desarrollo/editor en Windows, corregida en 6.4.4; ese servidor no existe en la imagen final Nginx y la compilación fue Linux. No se atribuye esa exposición al servicio estático. xlsx mantiene el riesgo del servidor descrito arriba aunque su dependencia frontend no se ejecute. [Vite](https://github.com/advisories/GHSA-587h-7wmj-h5pm).

**Siguiente operación propuesta:** corrección focalizada en desarrollo de body-parser, multer/adaptador y xlsx, junto con los parches críticos y revisión de herramientas retenidas; validar compatibilidad y pruebas antes de congelar otro candidato. No desplegar este por haber compilado. Cualquier paquete modificado tendrá nueva identificación y necesitará aprobación independiente para otra ejecución remota. No se modificaron dependencias durante este ensayo.

## Decisión vigente de historial y limpieza — operación separada

QA sigue siendo un entorno de construcción y pruebas. **Puede proponerse retirar el historial de cambios e importaciones asociado a productos y lotes de prueba retirados**, incluidos registros huérfanos cuyo origen y alcance se identifiquen. No es necesario tratar esa evidencia como historial empresarial. Este permiso no se aplicará al historial cuando el sistema entre en uso operativo.

El [manifiesto vigente de solo lectura](./qa-limpieza-v2-manifiesto.sql) enumera productos, dependencias, historial por producto, sesiones por namespace y lotes explícitamente propuestos mediante `retired_batch_ids` (vacío por defecto). Identifica también historial de productos ya retirados. Un lote que incluya el demo se conserva entero; no se deduce que todas las sesiones o filas huérfanas sean descartables. Revisiones de precios mixtas y sus relaciones se revisan por ID antes de proponer su eliminación.

Se conservan el demo `iDS-E04HQHI-D` y sus relaciones necesarias; usuarios, roles, permisos y asignaciones de pestañas; maestros/configuración acordados; historial técnico de migraciones; respaldos existentes; auditoría de seguridad. La decisión nueva cambia el tratamiento del historial de pruebas, no autoriza purgar archivos: UploadedFiles y archivos físicos siguen conservados. Tampoco autoriza cambios de publicación de registros conservados, información de otros entornos, producción ni Biblioteca dedicada.

**Limpieza no incluida en los pasos de despliegue.** Antes de ejecutarla se necesita aprobar su alcance exacto: destino, IDs de productos/lotes, cantidades y huellas de filas de historial, relaciones protegidas del demo y recuperación. No habrá conteos remotos nuevos sin el alcance de lectura correspondiente. `qa-limpieza-catalogo.sql` y `qa-limpieza-v2.sql` quedaron marcados como históricos y con salida inmediata `\quit 3`, antes de cualquier SQL de limpieza: no corresponden al manifiesto actualizado. No reutilizarlos ni quitar esa guarda para ejecutar el alcance viejo. Las consultas del manifiesto se verificaron en PostgreSQL local en una transacción READ ONLY (sustituyendo únicamente la guarda del nombre de base para ese ensayo), salida 0; no se ejecutó en QA.

## Evidencia del candidato

**Antecedente: build frontend Windows aprobado antes del ensayo Linux.** `npm run build`: TypeScript y Vite de producción, 586 módulos, minificación esbuild activa, 21,66 s; JS principal 1.225,59 kB (gzip 351,09 kB). [Recibo y hashes de artefactos](./evidencia/cierre-importador-20261030/frontend-build.json). Se conserva la advertencia de chunk grande; no se convirtió en un supuesto umbral de aceptación.

El “Acceso denegado” se aisló con entradas sintéticas: a partir de 1 MiB, `lib/main.js:774` de esbuild 0.25.12 transmite la entrada por archivo temporal. Node PID 92328 creó el archivo en `C:/Users/sopor/AppData/Local/Temp/esbuild-*`; el servicio `@esbuild/win32-x64/esbuild.exe`, PID 39292, devolvió el error de `remove`, dejando el archivo presente. Las entradas de 1.048 y 1.048.524 bytes pasaron; las de 1.048.624 y 2.100.024 fallaron. La evidencia identifica proceso, ruta, operación y condición, sin atribuir la denegación a antivirus ni afirmar una causa Windows no demostrada: [diagnóstico](./evidencia/cierre-importador-20261030/esbuild-diagnostic.json).

El fallback nativo stdin/stdout pasó las cuatro entradas, incluida la de 2,1 MB: [evidencia](./evidencia/cierre-importador-20261030/esbuild-stdin-fallback.json). Para el build aprobado se ajustaron TEMP/TMP **solo en su proceso** a una ruta de trabajo deliberadamente inexistente; esbuild activa su alternativa estándar sin modificar dependencias, Vite, minificación, antivirus ni permisos. La ejecución Windows predeterminada con IPC temporal sigue teniendo la denegación. El recibo Windows corresponde al lockfile anterior. La corrección posterior valida el lockfile con npm ci --dry-run y pasa el build local con las dependencias ya presentes; no se presenta como una instalación limpia de las dependencias corregidas. El ensayo Linux del paquete nuevo documentado al comienzo sustituye esa comprobación pendiente.

**Los diez fallos quedaron resueltos, sin clasificarlos como ajenos.** [Resultado: 4 suites, 136/136](./evidencia/cierre-importador-20261030/regression-resolved.json). `npm run test:catalog:regression` utiliza la instancia local prevista 127.0.0.1:55433 con pgtest y copias de `mt_journey`, comprobando host, puerto y base antes de escribir. No ejecuta Docker, migraciones ni resets de otros recursos; conserva sus bases de ensayo. [Destinos verificados](./evidencia/cierre-importador-20261030/regression-destinations.json).

- Tres fallos de concurrencia de importación: competían contra un servidor ausente en 54331. En la instancia local comprobada pasan la unicidad ante cargas simultáneas, el bloqueo de mover un producto entre Listas y la ausencia de precios si la carga pierde la carrera. Afectaban garantías de importación/precios; ya no quedan sin verificar por infraestructura.
- Cuatro fallos de backfill/recuperación: dependían de un reset Docker ausente. Ahora ejercen la implementación real en su copia local, conservando identificadores, datos y medios del producto y comprobando la reversa. Esta prueba no autoriza ejecutar backfill ni recuperación en QA; solo despeja su fallo de infraestructura para el candidato.
- Tres fallos de permisos: esperaban publicación con `products:publish` sin su dependencia `products:write`. La regla vigente del catálogo exige lectura y edición. Las pruebas comprueban ahora la denegación del conjunto incompleto y la autorización del conjunto completo, incluida ARCHIVE cuando corresponde por edición. No se modificaron ni debilitaron permisos productivos. Se comprobaron por separado importación y acceso por pestaña en el shell.

Lint y tipos de las pruebas/guarda local: salida 0. La comparación antigua por nombres queda únicamente como evidencia histórica; no es la justificación de esta resolución.

**Alcance de navegador distinguido.** El [recorrido aislado previo](./evidencia/cierre-importador-20261030/browser-local.json) cubre el proceso de importación contra backend/PG reales, incluidos errores, mapeo, doble clic, progreso, salida/recuperación de 120 productos y propuestas protegidas. El [ensayo nuevo del shell completo](./evidencia/cierre-importador-20261030/shell-local.json) usa el bundle de producción y sus `main.tsx`, App, AdminLayout, CommercialLayout y ruta originales. El administrador marca Importaciones y guarda desde `/users/access`; el servidor guarda sus dependencias sin conceder publicación/precios. El usuario Consulta abre `/commercial/library/update/import` y su pestaña activa; solo consulta ve descargas/historial; al revocar, la pestaña desaparece, la URL directa vuelve a Productos y la misma sesión recibe 403 de la API. [Captura del shell](./evidencia/cierre-importador-20261030/shell-importer-1440.png).

El bundle conserva su origen API previsto; el arnés reenvía esas solicitudes al backend real **local** y bloquea el resto de orígenes externos. No contacta QA ni certifica CORS de despliegue. El canal SSE se excluyó del arnés; la revocación se comprobó al recargar. No se afirma haber probado todos los módulos de Biblioteca ni su funcionamiento remoto por probar esta ruta.

**V no se repitió:** las cinco huellas relevantes siguen idénticas a las de la evidencia recuperada, [comprobación](./evidencia/cierre-importador-20261030/v-source-recheck.json). Se mantiene el ensayo aprobado de 5.000 productos y sus tiempos. Las propuestas protegidas siguen sin aplicarse ni contabilizarse como completadas; no hay pantalla de aprobación/rechazo y esa limitación permanece explícita.

## Histórico — evidencia y procedimientos sustituidos

<details>
<summary>Histórico no ejecutable: instrucciones y resultados anteriores al procedimiento vigente</summary>

Todo lo siguiente describe estados o planes anteriores. No ejecutar sus comandos, no usar sus hashes como identidad del candidato actual y no considerar sus aprobaciones antiguas trasladadas a este cierre.

# Bloque funcional de la Biblioteca: paquete para limpiar, desplegar y verificar en QA

Estado: **preparado, NO autorizado y NO aplicado**. Nada de lo que sigue se ejecuta sin tu aprobación específica, paso por paso (ver sección 3). Producción (`gs-db`), la Biblioteca dedicada y el servidor no se tocaron. Sin commit ni push.

## 1. Qué contiene

| Pieza | Qué es | Toca datos |
|---|---|---|
| Limpieza `qa-limpieza-catalogo.sql` | Deja solo el demo `IDS-E04HQHI-D` y quita lo que cuelga de los demás productos | **Sí**, en `gs_api_copy` (alcance aprobado el 29/10) |
| Migración `20261029150300_library_spec_value_state` | Estado del valor (conocido / no aplica / desconocido) y guarda en la base | No (tablas vacías) |
| Migración `20261029150400_library_classification_optional` | `products.brandId` y `categoryId` dejan de ser obligatorios | No cambia filas; relaja restricciones |
| API (`gs-test-demo-api`) | Clasificación coherente, atributos, permiso de aprobar moldes, publicación con instantánea completa, importador de catálogo, búsqueda/filtros/facetas desde lo publicado | No por sí sola |
| Frontend | Editor con clasificación, Datos clave, faltantes, previsualización de borrador | No |
| Recorrido con la muestra (sección 6) | Importar 42 filas, precios, publicar, editar, reimportar | **Sí** (crea productos y precios en QA) |

No se aplica P4, no cambian estados públicos ni disponibilidad. Las migraciones del bloque 1 (…150000, …150100, …150200) no se reaplican. La compatibilidad con publicaciones antiguas y el traslado del catálogo de producción **no forman parte de este paquete**.

Sumas de verificación (archivo con fin de línea LF):

| Archivo | sha256 |
|---|---|
| `…150300/migration.sql` | `7ae8f50f6c7f1538ddcc9e5306d147a46986cafe8f53f34bf7fe2512c9d35b0c` |
| `…150300/migration.down.sql` | `25f81785529fe04a3c3c11556885d54699f61655d958efcf2ede7b85cc85afa7` |
| `…150400/migration.sql` | `d5c9339e91f0d77d5153c5da66c77f5d359e1e9f00cfba41b907bff502a1030e` |
| `…150400/migration.down.sql` | `a1e48b43254d0d4b53bdf701edc97682cdfc6e8e1348fec429044f7ce93cd6fe` |
| `qa-limpieza-catalogo.sql` | `bdd62bd27f3cfd2e38427d2b23c371d7faf74800842e9b8ea9eef6e6fa9ef94b` |

## 2. Destino y estado actual de QA (lectura, 29/10)

`dev@57.131.50.38` · `gs-test-demo-ops-db` · base `gs_api_copy` · esquema `public` · rol administrador del clúster · aplicación `gs-test-demo-api` en **modo `legacy`** (obligatorio).

1.539 productos (el demo más 1.538 borradores), 0 precios, 0 publicados, sin cotizaciones, pedidos ni clientes. El demo (`IDS-E04HQHI-D`, borrador) es dueño de las 2 imágenes, los 7 grupos de especificaciones y los 5 recursos. Los archivos están dentro de la base (`uploaded_files`: 445 filas, 13 MB); 443 pertenecen a los borradores que se quitan y **no se borran**: quedan sin dueño.

## 3. Pasos y aprobación que exige cada uno

| # | Paso | Escribe en | Aprobación específica |
|---|---|---|---|
| 1 | Respaldo completo (`pg_dump -Fc`, incluye las imágenes) | Archivo en `/home/dev/backups` | **A1** |
| 2 | Migraciones `…150300` y `…150400` | `gs_api_copy` | **A2** |
| 3 | Limpieza del catálogo | `gs_api_copy` | **A3** |
| 4 | Construir y reemplazar API y frontend (reinicia `gs-test-demo-api`) | Contenedores e imágenes | **A4** |
| 5 | Recorrido con la muestra (importar, precios, publicar, reimportar) | `gs_api_copy` | **A5** |
| 6 (opcional) | Ensayo de restauración en una base temporal que se borra al terminar | Base temporal | **A6** |

Orden obligatorio: 1 → 2 → 3 → 4 → 5. Las migraciones van antes de la API nueva, y **no se crean borradores sin marca ni categoría ni se importa con el flujo nuevo hasta que la API nueva esté al 100 %**: un cliente Prisma antiguo que lea filas con `brandId` o `categoryId` nulos puede fallar toda la consulta (supuesto de la revisión de riesgo, no comprobado con la versión instalada). Prohibido también: usar el modo `dedicated` con este bloque, y ejecutar la reversa de `…150400` si ya existen borradores sin marca (aborta a propósito).

## 4. Comandos

**1. Respaldo:**
```bash
ssh dev@57.131.50.38 'docker exec gs-test-demo-ops-db sh -c "pg_dump -Fc -U \"\$POSTGRES_USER\" -d gs_api_copy" > /home/dev/backups/gs_api_copy_pre_limpieza_20261029.dump && sha256sum /home/dev/backups/gs_api_copy_pre_limpieza_20261029.dump'
```

**2. Migraciones, en este orden** (cada una con su fila de `_prisma_migrations`; ensayado en local: aplicar, revertir en orden inverso, reaplicar, "Database schema is up to date"):
```bash
cd src/backend/prisma/migrations
for N in 20261029150300_library_spec_value_state 20261029150400_library_classification_optional; do
  H=$(tr -d '\r' < $N/migration.sql | sha256sum | cut -d' ' -f1)
  { tr -d '\r' < $N/migration.sql; printf "\nINSERT INTO \"_prisma_migrations\" (\"id\",\"checksum\",\"finished_at\",\"migration_name\",\"started_at\",\"applied_steps_count\") VALUES (gen_random_uuid()::text,'%s',now(),'%s',now(),1);\n" "$H" "$N"; } > /tmp/$N.apply.sql
  ssh dev@57.131.50.38 "docker exec -i gs-test-demo-ops-db sh -c 'psql -X -v ON_ERROR_STOP=1 --single-transaction -U \"\$POSTGRES_USER\" -d gs_api_copy'" < /tmp/$N.apply.sql
done
```

**3. Limpieza** (una transacción; aborta sin cambiar nada si el demo no aparece exactamente una vez o si cambia el conteo de cualquier tabla que se conserva):
```bash
ssh dev@57.131.50.38 "docker exec -i gs-test-demo-ops-db sh -c 'psql -X -v ON_ERROR_STOP=1 --single-transaction -U \"\$POSTGRES_USER\" -d gs_api_copy'" < docs/biblioteca-dominio/qa-limpieza-catalogo.sql
```
Se **quita**: todos los productos salvo el demo, y lo que cuelga de ellos (precios, imágenes, fuentes, historial de cambios, eventos de publicación, filas y precios de importaciones de precios en preparación; una revisión de importación solo si se quedó sin filas). Se **conserva**: el demo con todo lo suyo; categorías, subcategorías y marcas; usuarios, roles, permisos, concesiones, sesiones y MFA; las 7 tarifas y las `listas`; auditoría general; banners; historial de migraciones; **todos los archivos** (`uploaded_files`).

**4. API y frontend:** construir desde `src/backend` con el comando real del despliegue (`npm run build`: salida 0 y 0 errores) y desde `src/frontend`, en una carpeta de fuentes nueva (`/home/dev/gs-test-fuentes-funcional-20261029`), con las dos capas `:base` y `:local` del 28/10. Antes de reemplazar, etiquetar las imágenes actuales como `…:prev-20261029` y `…:base-prev-20261029`. Este paso no se ensayó en el VPS.

## 5. Verificación (solo lectura y llamadas a la API)

- Tras el paso 2: `_prisma_migrations` con 5 filas del bloque y las sumas esperadas; `product_spec_values.state` existe; `products.brandId` y `categoryId` admiten nulo.
- Tras el paso 3: 1 producto (el demo); 76 categorías, 66 subcategorías y 33 marcas sin cambio; 4 usuarios, 7 tarifas, 445 archivos sin cambio; el informe de la limpieza indica los archivos que quedaron sin dueño (443 esperados).
- Tras el paso 4: `GET /api/health` ok, contenedor `healthy`, sin errores en el registro.

## 6. Recorrido de aceptación en QA (paso 5)

Requiere un usuario de QA con los paneles de Biblioteca (consulta, fichas, precios, publicación) y `products:approveSpecs` para aprobar un molde. Los guiones locales (`journey\` en el scratchpad de la sesión; **no están en el repositorio**) son el modelo: la muestra `muestra-maestro.xlsx` (42 filas, cabecera en la fila 3) y `precios-muestra.xlsx` (33 filas, 3 referencias inexistentes).

| Paso | Resultado esperado (el mismo que en local) |
|---|---|
| 1. Importar | 42 leídas, 0 inválidas, 42 creadas; 30 clasificadas y 12 borradores; marcas, categorías y subcategorías sin cambio |
| 2. Identidad | Reimportar: 0 creadas, 42 sin cambios, 0 duplicados, 0 escrituras |
| 3. Incompleta | Los 12 sin subcategoría quedan `incomplete` con lo que falta |
| 4. Editar y recuperar | Guardar y releer 3 fichas: idéntico; versión vieja da 409 |
| 5. Precios | 30 aplicados y 3 desconocidas sin crear; reaplicar no agrega filas |
| 6. Publicar | Instantánea completa; ficha, búsqueda y filtros lo muestran |
| 7. Editar el borrador | Ficha, búsqueda, filtros y facetas públicos idénticos; la previsualización muestra el borrador |
| 8. Reimportar | Publicado y editados quedan como propuesta; borradores solo rellenan vacíos; segunda pasada sin escrituras |

## 7. Recuperación

| Caso | Acción |
|---|---|
| A. Migraciones | `…150400.down.sql` y luego `…150300.down.sql` (en ese orden, una transacción) y borrar sus filas de `_prisma_migrations`. La primera aborta si hay productos sin marca o categoría; la segunda, si hay valores "no aplica" o "desconocido" |
| B. Catálogo | Restaurar el respaldo del paso 1: total con `pg_restore --clean --if-exists` y la API detenida (aprobación aparte), o solo las tablas de catálogo con `pg_restore --data-only -t <tabla>` en orden de dependencias mientras el esquema no haya cambiado |
| C. Código | Re-etiquetar `gs-test-demo-api:prev-20261029` como `:local` y recrear el contenedor |

El respaldo incluye las imágenes (están en la base). Los archivos sin dueño se quedan en `uploaded_files` hasta que decidas qué hacer con ellos.

## 8. Pruebas ejecutadas

| Prueba | Resultado |
|---|---|
| Build real del backend (`npm run build`) | Salida 0, 0 errores |
| `tsc` con specs | 17 errores, idénticos a los de la base anterior reconstruida con sus dependencias; ninguno nuevo |
| Pruebas unitarias del backend (`src/modules` y `src/common`) | 160 fallidas, **las mismas que en la base** comparadas por nombre; 0 nuevas |
| Integración con PostgreSQL real | 8 suites aprobadas: clasificación, clasificación opcional, atributos, publicación, aislamiento publicado/borrador, identidad publicada, HTTP con guardas reales, importación |
| Arnés de migraciones (5 migraciones) | 163 aprobadas, 0 fallidas |
| Ensayo de la limpieza en una copia local | De 43 productos queda el demo con su contenido; archivos, taxonomía, usuarios y tarifas sin cambio; sin demo, aborta sin cambios; sin filas huérfanas |
| Frontend | `tsc` sin errores, 1.419 de 1.419 |
| Recorrido de ocho pasos en local (muestra de 42 filas) | Los ocho pasos pasan |

## 9. Lo que no está cubierto

- **Build del frontend en esta máquina:** `npm run build` falla en el paso de minificación (`esbuild` no puede borrar un archivo temporal grande en Windows: "Acceso denegado"; el chunk principal pesa 2,1 MB). Sin minificar, el bundle compila (572 módulos) y `tsc -b` pasa. No se pudo reproducir el build de Linux del VPS (sin Docker ni WSL): **no comprobado**. Si falla allí, el reemplazo del frontend se detiene sin afectar la API.
- **Importación desde la web:** `library/update/import` redirige a propósito a la cola de fichas y `LibraryCatalogImportPage` no está montada; hoy se importa por API.
- **Nombre bloqueado** (`nameLockedAt`): ningún endpoint lo fija; solo hay pruebas unitarias.
- **Reimportación:** nunca sobrescribe un nombre existente, solo lo propone. Los duplicados dentro del archivo invalidan ambas filas (como hoy).
- **Orden de la lista pública:** usa el nombre vivo; tras editar un nombre el orden puede cambiar.
- **Productos publicados antes del cambio:** sus revisiones no tienen el marcador de versión; hasta despublicar y volver a publicar siguen leyendo en vivo. Fuera de este paquete.
- **Modo `dedicated`:** no soportado con este bloque.
- **Permiso `products:approveSpecs`:** se concede por concesión global; no tiene casilla de panel (`library-selection.ts`, código de otro bloque) y `ACCESS_CATALOG_VERSION` no se subió.
- **Revisión Gentle AI:** no se ejecutó sobre este bloque; la de la parte 2 del bloque 1 sigue sin terminar (gentle-ai#5094). Ninguna revisión está declarada aprobada. La revisión de riesgo de Opus (permisos, migraciones, publicación) sí se hizo y sus hallazgos bloqueante y mayor se corrigieron.
- **Sin probar:** la reconstrucción de imágenes en el VPS, el comportamiento real de un cliente Prisma antiguo con filas nulas y las pruebas interactivas de componentes (el repositorio no tiene `testing-library` ni `jsdom`).

## 10. Continuidad del importador — 30/10/2026 (local, sin aplicar en QA)

Estado: flujo local integrado y pruebas focalizadas aprobadas; cierre de entrega pendiente del build frontend y de una línea base confiable para los diez fallos descritos abajo. Esta sección actualiza únicamente el importador; los pasos de limpieza/migración/despliegue anteriores no forman parte de la autorización de esta continuidad.

### Ubicación y recuperación de V

La sesión Claude `005c717e-1991-48f6-bbea-4698650d08e8` figura bajo `agitated-bassi-213e50`, pero su log registra el cambio de directorio a `validacion-biblioteca/src/backend` y asigna UI2 y V a ese worktree. Se continuó allí, rama `Esnaider/validacion-biblioteca`, conservando el árbol sucio. El trabajador V terminó por cuota a las 10:36; no había un proceso Jest suyo activo al retomar. No se crearon agentes.

V alcanzó una ejecución aprobada antes de agotar la cuota: 1 suite, 3 pruebas, a las 10:35:54 de Bogotá. Se reutiliza el resultado verificable del log, sin ejecutar migraciones ni repetir la carga. Evidencia con origen, huella del log, métricas y huellas actuales de sus fuentes: [v-reused.json](./evidencia/cierre-importador-20261030/v-reused.json).

- 5.000 productos sintéticos, 34.000 filas de hojas, Excel de 6,6 MB. Primera ejecución: 5.000 creados; estado COMPLETED, 100 %. La segunda pasada comprueba 5.000 UNCHANGED, cero altas/actualizaciones/fallos, misma huella de escrituras y cero duplicados. Maestros, tarifas y precios sin creación automática.
- Duraciones del proceso de prueba de V: parseo 1,099 s, preview 11,564 s, aplicación 219,369 s, reimportación sin cambios 46,527 s. Pico RSS en la reimportación: 2.225,8 MB; incluye el proceso Jest y sus herramientas, no es una medida aislada del servidor. No se fija un umbral de rendimiento.
- Interrupción simulada: 390 procesados al corte; el servicio nuevo marca FAILED por inactividad. Reimportar completa los faltantes sin duplicar productos, datos, recursos ni eventos. Otros 17 fallos transitorios simulados se reintentan sin filas fallidas ni conteos duplicados.
- El primer intento de escala había fallado en la reimportación por parámetros de PostgreSQL. V corrigió las lecturas relacionadas en bloques de 500 y luego pasó. Se conserva esa corrección; no se presenta el intento fallido como aprobado.

### Cambios mínimos de esta continuidad

- `template-import.polling.ts` concentra la consulta serial que usa BatchViewer; se prueban finalización, errores, límite de 900 consultas, cancelación y respuestas tardías. Salir detiene las consultas, no el lote.
- El asistente bloquea de inmediato una segunda confirmación mediante una referencia, además del estado busy y la idempotencia del servidor.
- Resultado/historial muestran el antes/después de las propuestas protegidas mediante la tabla existente. Se indica que están pendientes y que esta pantalla no permite aprobarlas/rechazarlas. No se creó otro subsistema de revisión.
- `scripts/copy-library-client.cjs`, llamado por postbuild, incluye el cliente Prisma ya generado en `dist/prisma/biblioteca/generated/client`. El build anterior compilaba pero no podía iniciar por MODULE_NOT_FOUND. No cambia esquema ni conecta una base.
- Arnés reproducible: `scripts/qa-importador-local.cjs` y `src/frontend/scripts/qa-importer-entry.tsx`. Usa AppModule compilado, JWT/sesiones/concesiones reales y una copia del fixture sintético `mt_journey` en PostgreSQL local 127.0.0.1:55433. No usa QA, no migra ni elimina bases. Las copias `mt_close_*` de los intentos se conservan por la prohibición de limpieza. No se instalaron herramientas.

### Validación ejecutada

- Backend: `npm run build` con postbuild, salida 0; lint de servicios del importador y snapshot, salida 0. Prueba de sintaxis de los dos scripts CJS, salida 0.
- Jest focal: 57/57 entre catálogo, plantilla y orquestación; `src/modules/biblioteca-endpoints.grants.spec.ts`, 81/81. Total 138 aprobadas.
- Frontend: `tsc -b`, salida 0; 6 archivos / 114 pruebas aprobadas, incluidas 13 nuevas de esta continuidad. Lint de UI2, polling, pruebas y entrada de navegador: 0 errores, 1 advertencia `react-refresh/only-export-components` en `TemplateImportViews.tsx:13`.
- Build frontend real `npm run build`: falla después de transformar 586 módulos al eliminar el temporal de esbuild (Acceso denegado). Repetir con TEMP/TMP en una carpeta local distinta reproduce el fallo. No se sustituyó por un build sin minificación ni se declara aprobado.
- Se ejecutaron las cuatro suites señaladas por Claude: 126 pruebas aprobadas y 10 fallidas. Los diez nombres coinciden con `base-fail.json`; no hay nombres nuevos en ese conjunto. [comparison.json](./evidencia/cierre-importador-20261030/comparison.json) conserva los nombres y la huella. La bitácora previa reconoce que parte de esa base se reconstruyó manualmente: no se certifica como línea base limpia ni se atribuyen esos fallos a trabajo ajeno. Esta continuidad no reconstruyó fuentes para justificarlos. Los fallos actuales incluyen infraestructura local ausente (54331 / gs-tanda-db) y expectativas de permisos; siguen pendientes de resolución/atribución fiable.

El permiso de consulta se comprobó en HTTP con JWT y sesión reales: 401 sin sesión, 403 sin concesiones, 200 para historial autorizado y 403 al intentar subir con solo consulta. El arnés ejercita la página existente, sus descargas y la API real, no respuestas sintéticas de importación. La expiración de las 900 consultas se cubre con reloj simulado; no se esperaron treinta minutos reales.

### Operación siguiente

No se aplicó este bloque en QA, producción ni Biblioteca dedicada. No hubo commit/push, migraciones, limpieza ni cambios de servicios/contenedores. Antes de pedir autorización para desplegar API y frontend en QA, falta obtener un build frontend aprobado y resolver o atribuir de forma confiable los diez fallos. Una aprobación futura de despliegue no incluye los pasos antiguos de limpieza o migración.

Recorrido final del 30/10 con el backend recién construido (sin copia correctiva del arnés): salida 0, [browser-local.json](./evidencia/cierre-importador-20261030/browser-local.json). Pasa descargar plantilla/ejemplo, mostrar error estructural y volver a seleccionar, subir/validar, resolver un texto contra marca existente, revisar/confirmar, bloquear doble clic, consultar progreso/resultado; salir mientras un lote de 120 productos sigue en curso, recuperar Ver avance y terminar con los 120; reimportación UNCHANGED e idempotencia de execute; UPDATED al rellenar un campo vacío; PROPOSED sin modificar el producto protegido ni contabilizarlo como aplicado; INVALID para dos referencias duplicadas; preview vencido 400 y lote inexistente 404; historial y permisos de consulta en pantalla/API. Maestros y precios conservan sus conteos. Verificado el ancho del documento frente a 375 px; capturas [1440 px](./evidencia/cierre-importador-20261030/importer-1440.png) y [375 px](./evidencia/cierre-importador-20261030/importer-375.png). Typecheck backend independiente `tsc --noEmit --incremental false -p tsconfig.build.json`, salida 0. No equivale a probar el shell completo ni una sesión de QA: monta la página real del importador dentro del proveedor QueryClient, con identidad sintética y cookies de sesión locales reales.

Para repetir el arnés: construir el backend con `npm run build`; desde la raíz establecer `IMPORT_QA_OUT` a una carpeta local de evidencia e `IMPORT_QA_PLAYWRIGHT` al paquete Playwright ya instalado y ejecutar `node scripts/qa-importador-local.cjs`. Requiere el fixture sintético existente `mt_journey` del servidor de pruebas local. Conserva la base clonada y no toca la fuente. No instalar Playwright automáticamente si falta. El candidato sigue sin estar aprobado para despliegue.

</details>
