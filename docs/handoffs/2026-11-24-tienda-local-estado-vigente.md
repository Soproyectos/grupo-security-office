# Tienda local y atributos técnicos: estado vigente al 24/11/2026

**La tienda funciona en http://127.0.0.1:5181/tienda.** Se recuperó el frontend en blanco y se cargaron, con autorización del usuario, los atributos técnicos en estado de trabajo. Las 850 fichas publicadas conservaron su contenido. Esta guía es el punto de entrada para continuar esta entrega; los documentos del 23/11 enlazados al final conservan su contexto histórico.

## 1. Dónde continuar

| Elemento | Estado comprobado |
|---|---|
| Worktree de los cambios y procesos | C:/Users/sopor/grupo-security-office/.claude/worktrees/sad-golick-8a6b22 |
| Rama | Esnaider/sad-golick-8a6b22 |
| Workspace del chat Codex | C:/Users/sopor/.codex/worktrees/5c79/grupo-security-office; no es la carpeta donde se aplicó esta entrega |
| Web | 127.0.0.1:5181; entrada comercial /tienda |
| API general y catálogo | 127.0.0.1:3010 |
| API auxiliar del portal | 127.0.0.1:4314 |
| Retorno OAuth auxiliar | 4173; conservar su configuración existente |
| Túnel PostgreSQL | 127.0.0.1:55432 hacia la base grupo_security de producción |
| Base usada | Producción real; el frontend local no implica una base de pruebas |
| Estado de Git | Trabajo guardado en el worktree; no se hizo commit, push ni despliegue en esta entrega |

Las menciones anteriores al portal en 4312 y al catálogo en 4314 describen otra etapa. El último arranque de Vite dirige API/catálogo a 3010 y portal a 4314. La prueba final comprobó la tienda y su catálogo; no volvió a completar el inicio de sesión personal de Google.

No editar otro checkout por coincidencia del nombre del repositorio. Antes de continuar, verificar la carpeta y revisar git status; existen cambios anteriores del usuario que no deben revertirse.

## 2. Cambios de la tienda

| Área | Resultado y ubicación |
|---|---|
| Vitrinas | Tarjetas compactas y carrusel con flechas; hasta doce referencias por categoría y acceso a Ver todo. Selección editorial de 36 referencias entre Cámaras, Alarmas y Control de acceso. |
| Selección de productos | SKUs exactos del catálogo publicado, combinados con categoría y visibilidad. Se omiten referencias ausentes y filas vacías. La selección usa señales de mercado y utilidad, no acredita ventas propias ni un ranking automático de los más vendidos. |
| Explora por categoría | Se conservó la navegación por categorías solicitada por el usuario; no se sustituyó por las vitrinas. |
| Requisitos técnicos | Casillas en el lateral de filtros por familia; en móvil se accede mediante el control correspondiente. Zonas y protocolos se muestran como opciones individuales. |
| Marcas | Casillas con una marca activa por consulta; su aspecto no implica selección múltiple en la API. |
| Desplazamiento | Cabecera y una zona desplazable de opciones, overscroll contenido y límites respecto al área del listado; véase la nota de evidencia al final. |
| Conteos | Productos distintos por opción; contexto de búsqueda, marca, especificaciones y demás requisitos. Una selección sin coincidencias sigue siendo desmarcable. |

La referencia visual inicial fue el tamaño y recorrido de las tarjetas de SYSCOM. No se trasladó su identidad visual completa. Los detalles de selección y las fuentes consultadas están en [vitrinas destacadas](2026-11-23-vitrinas-destacadas.md).

## 3. Cómo funcionan los atributos

Se reutilizó el modelo ya existente. No se creó otro catálogo ni se ejecutó una migración.

| Tabla/modelo | Responsabilidad |
|---|---|
| SpecDefinition / spec_definitions | Significado del atributo, tipo y unidad canónica; se comparte entre familias que usan el mismo concepto. |
| SpecOption / spec_options | Opciones controladas, por ejemplo TCP o HTTPS. |
| SubcategorySpec / subcategory_specs | Plantilla de atributos para un ID real de subcategoría. |
| ProductSpecValue / product_spec_values | Respuesta del producto, tipo, estado y etapa WORKING/PUBLISHED. |
| ProductSpecValueOption / product_spec_value_options | Opciones elegidas para una respuesta multivalor. |

Se separaron tensión de entrada, tensión de salida, potencia de salida, consumo y presupuesto PoE. Voltios, vatios y amperios no representan la misma magnitud. Los números inequívocos se almacenan como NUMBER con su unidad; los intervalos/condiciones compuestos conservan texto cuando descomponerlos perdería información.

Un producto puede tener simultáneamente tensión de entrada, potencia y TCP. Se comprobó con DS-QAZ1A500G1-VB2: entrada de 100–240 VAC, salida de 500 W y TCP.

Los grupos diferentes se combinan con AND. Alternativas de un mismo atributo, como 48 o 64 zonas, usan OR. En protocolos se exige cada capacidad seleccionada: TCP + HTTPS significa que el equipo soporta ambos. Los conteos de alternativas excluyen la propia selección de su grupo; en protocolos conservan las capacidades ya seleccionadas.

El endpoint GET /api/public/catalog/requirements recibe category, subcategory, q, brand, keySpec y requirement. La petición y la clave de React Query incluyen el mismo contexto. Requisitos y listado leen la ficha publicada: una instantánea explícitamente vacía no se rellena con el borrador. Una ausencia de dato no significa UNKNOWN ni NOT_APPLICABLE.

## 4. Carga aplicada y estado editorial

La auditoría inicial consultó 850 productos en 11 categorías: 849 tenían grupos técnicos publicados no vacíos y uno tenía un grupo publicado explícitamente vacío. Las cinco tablas tipadas estaban vacías antes de la carga.

El usuario autorizó expresamente cargar las propuestas en producción sin publicarlas.

| Registro creado | Cantidad | Estado |
|---|---:|---|
| Definiciones | 55 | Inactivas |
| Opciones del diccionario | 68 | Inactivas |
| Asociaciones con subcategorías | 206 | PROPOSED; no requeridas |
| Valores de producto | 2.035 | WORKING / KNOWN |
| Selecciones de opciones | 4.496 | WORKING / KNOWN |
| Productos con datos cargados | 705 | Con un registro de auditoría por producto |

Lote: 57f4726f-c1b2-4696-843d-1be7ccbdfc43. COMMIT: 24/11/2026 a las 15:06:03 de Colombia (20:06:03 UTC). Se registraron 705 ProductChange con source=SYSTEM y field=keySpecs:WORKING, sin inventar una identidad de usuario.

La huella de las 850 fichas publicadas fue e482c47dfd06e1fbc7c9aafe2e561f4c antes y después. No se crearon valores tipados PUBLISHED, no se aprobaron plantillas ni se impusieron nuevos campos obligatorios.

**Los filtros actuales siguen usando las fichas publicadas.** La carga WORKING prepara datos estructurados para revisión; su publicación es otra operación, no autorizada ni realizada en esta entrega.

Quedaron 107 casos sin cargar: 96 numéricos compuestos/no inequívocos, 10 con múltiples valores que requieren revisión y uno sin plantilla por falta de subcategoría. Casa inteligente y Cerrajería no tenían productos; no se inventaron atributos observados para ellas. [Cobertura por categoría y contrato](2026-11-24-atributos-categoria.md).

## 5. Archivos y evidencia

| Ruta desde la raíz del worktree | Contenido |
|---|---|
| src/frontend/src/features/storefront/constants/home-catalog.ts | Selección editorial de las vitrinas |
| src/frontend/src/features/storefront/components/ProductShelf.tsx | Carrusel de productos |
| src/frontend/src/components/filters/SearchFilterBar.tsx | Panel lateral, límite del main y scroll independiente |
| src/frontend/src/features/storefront/components/ParameterRequirements.tsx | Casillas de requisitos y opciones con cero |
| src/frontend/src/features/storefront/components/SubcategoryProducts.tsx | Contexto del listado y de los requisitos |
| src/frontend/src/services/public-catalog.service.ts | Peticiones del catálogo |
| src/backend/src/modules/products/public-requirements.ts | Selección, alias y normalización por familia |
| src/backend/src/modules/products/public-catalog.service.ts | Listado publicado y conteos contextuales |
| src/backend/src/modules/products/public-catalog-key-spec-facets.controller.ts | Endpoint público validado |
| scripts/proponer_atributos_biblioteca.cjs | Generador de propuestas sin conexión a BD |
| scripts/aplicar_atributos_biblioteca.cjs | Cargador transaccional; preflight de solo lectura por defecto |
| scripts/*atributos_biblioteca.test.cjs | Pruebas de generación y carga |
| docs/handoffs/evidencia/2026-11-24-carga-atributos.json | Resumen durable de la confirmación: conteos, hashes y lote; sin secretos |
| docs/bitacora/2026-11-24-atributos-categoria.md | Historial de consulta, carga y recuperación |

Los artefactos completos están localmente en data/atributos-biblioteca-20261124/: dictionary.json, proposal.json, summary.json y apply-1795550750915.json. La carpeta data está ignorada por Git. El informe apply contiene las filas/IDs creados y debe conservarse para una posible reversión.

El inventario fuente gs-attributes-db-20261124.json y los lanzadores/compilaciones están en TEMP. **No viajan por Git ni se garantiza que sobrevivan a una limpieza del equipo.** El resumen de evidencia conserva los hashes; no reemplaza el inventario ni las filas del informe completo.

## 6. Arranque del frontend recuperado

Antes de iniciar otro proceso, comprobar si 5181 ya funciona. Reiniciar servicios requiere la autorización que corresponda en la sesión; esta guía documental no la sustituye.

El último arranque verificado usa el lanzador TEMP/gs-local-5181-20261124/vite-5181-recovered.mjs. Desde PowerShell:

~~~powershell
Set-Location 'C:\Users\sopor\grupo-security-office\.claude\worktrees\sad-golick-8a6b22\src\frontend'
$env:VITE_API_TARGET = 'http://127.0.0.1:3010'
$env:VITE_CATALOG_API_TARGET = 'http://127.0.0.1:3010'
$env:VITE_PORTAL_API_TARGET = 'http://127.0.0.1:4314'
node "$env:TEMP\gs-local-5181-20261124\vite-5181-recovered.mjs"
~~~

Si ese archivo temporal ya no existe, su contenido equivalente, con resolución relativa a la carpeta frontend, es:

~~~javascript
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd(); // Ejecutar desde src/frontend.
const viteUrl = pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js'));
const { createServer } = await import(viteUrl.href);
const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  optimizeDeps: { esbuildOptions: { target: 'esnext' }, force: true },
  server: {
    host: '127.0.0.1',
    port: 5181,
    strictPort: true,
    watch: { ignored: ['**/*.tmpdir/**', '**/*.tmp'] },
  },
});
await server.listen();
server.printUrls();
~~~

Guardar ese contenido como .mjs y ejecutar con las variables anteriores. Es una configuración de desarrollo local para el navegador actual; no modifica el target de producción.

API 3010: el último proceso usa TEMP/gs-local-5181-20261124/api-3010.cjs y la compilación TEMP/gs-api-3010-build-f802af14. Sus módulos de requisitos/catálogo fueron actualizados desde la compilación candidata del 24/11. Su entorno incluye la conexión al túnel y configuración privada en memoria. No basta con arrancar ese archivo en una terminal sin su entorno.

**Después de un reinicio completo no hay un gestor persistente de todo el entorno entregado.** Si faltan API, túnel o configuración privada, reconstruirlos con la configuración autorizada y los mecanismos existentes; no inventar credenciales, copiar secretos al repo, ni conectar una base vacía para aparentar funcionamiento. La guía anterior de consolidación sirve como contexto, con los puertos históricos señalados.

## 7. Diagnóstico de pantalla en blanco

| Síntoma observado | Causa encontrada | Corrección aplicada |
|---|---|---|
| HTML 200, main.tsx 500 | spawn EPERM en el proceso de Vite | Arranque local con permisos normales; se retiró el proceso alternativo fallido |
| Vite no interpreta su configuración | vite.config.ts en UTF-16 LE | Conversión a UTF-8 conservando el contenido; copia previa local |
| Faltan react-refresh, Babel o Tailwind | Enlaces ausentes hacia paquetes ya presentes en caché pnpm | Restauración de enlaces existentes, sin descargar paquetes ni cambiar versiones |
| Errores del router al preparar dependencias | Optimizador fallaba con el conjunto de targets antiguos | Target esnext solo en el lanzador local y reconstrucción de caché |
| Cierre por EBUSY en temporales del editor | Vite observaba archivos .tmpdir/.tmp | Exclusión en watch del lanzador |
| Hero visible, categorías aún pendientes | Catálogo todavía cargando | Esperar respuesta real y comprobar productos; HTML 200 no demuestra catálogo funcional |
| Aviso de Agentation | Servidor auxiliar de anotaciones no disponible | Usa almacenamiento local; no bloqueó el catálogo |

El intento pnpm install --offline --frozen-lockfile --ignore-scripts pidió confirmación y no reinstaló node_modules. La recuperación efectiva restauró enlaces desde la caché ya existente; no documentar esa reinstalación como ejecutada.

No usar el start-dev.cjs alternativo fallido como referencia del arranque comprobado. No borrar node_modules/cachés ni instalar dependencias a ciegas. Verificar el módulo que falla y conservar las versiones del proyecto.

## 8. Verificación y límites

Última comprobación en navegador: portada con Explora por categoría, vitrinas de Cámaras/Alarmas/Control de acceso, productos y flechas. La web se dejó abierta. API health: HTTP 200 y database=connected. Menú y listado público: HTTP 200. main.tsx, App.tsx y CSS: HTTP 200.

Ejemplo funcional verificado: listado con tension_entrada:100 a 240 VAC + protocolo:TCP + potencia_salida:500 W devuelve un amplificador DS-QAZ1A500G1-VB2. El preflight posterior a COMMIT encontró todas las filas coincidentes y cero inserciones pendientes en las cinco tablas.

| Comprobación registrada | Resultado |
|---|---|
| Generador de propuestas | 8/8 |
| Cargador, conflictos, idempotencia, rollback y commit | 8/8 |
| Backend requisitos/contexto/especificaciones clave | 15/15 |
| Servicio público frontend, etapa de conteos | 25/25 |
| Vitrinas/portada/tarjetas/búsqueda, etapa anterior | 77 pruebas frontend; ver su handoff |
| Backend de vitrinas, etapa anterior | 61/62; falla previa de subcategorías |
| Lint dirigido y TypeScript backend | Correctos en las etapas descritas |
| TypeScript global frontend | Seis errores previos en precios asignados, comparación y autenticación |

No sumar suites de etapas distintas como si fueran una única ejecución final. No se repitió toda la batería tras recuperar dependencias; se comprobó la aplicación real y sus módulos. No se cerró una prueba nueva de todas las categorías, OAuth personal ni todos los extremos de scroll en esta recuperación.

### Evidencia del scroll y del footer

La implementación en src/frontend/src/components/filters/SearchFilterBar.tsx mide el ancla y fija el panel al alcanzar 16 px del borde superior. Limita su altura al menor entre ventana y final del main, con márgenes; si quedan menos de 140 px, lo oculta. Recalcula con scroll, resize y ResizeObserver. El interior usa overflow-y-auto y overscroll-contain.

El handoff anterior acredita desplazamiento interno de 0 a 3.454 px conservando el scroll de página y límites entre 16 y 705 px en una ventana 1430×721. Esa evidencia no acredita específicamente la llegada al footer. La recuperación actual verificó portada y vitrinas; falta registrar una aceptación visual específica al final del catálogo. No convertir la lectura del código en una prueba visual aprobada.

## 9. Continuidad y reversión

Pendientes reales: revisar 107 casos, clasificar el producto sin subcategoría, revisar plantillas antes de aprobar/publicar, resolver errores globales heredados y conservar los artefactos temporales necesarios para reproducir la carga. D5 sobre atributos esenciales y requisitos de publicación no quedó cerrada.

El generador acepta --input y --out-dir. El cargador de este lote está acotado a 55 definiciones, 206 asociaciones y 2.035 valores: no es un importador general para nuevas tandas. Una nueva extracción genera otro hash; no reutilizar la aprobación de este lote para datos diferentes.

Una futura reversión de la carga requiere autorización y el informe del lote. Verificar que las filas no hayan sido modificadas/aprobadas/publicadas; retirar solo las selecciones/valores, plantillas, opciones y definiciones identificadas, respetando dependencias y transacción. Conservar la auditoría y registrar la reversión. No ejecutar migration.down: destruiría las tablas. No hacer git reset para revertir esta entrega.

No se ejecutaron migraciones ni despliegues productivos en la carga o recuperación. La carga de datos productivos sí ocurrió y está identificada por lote; no confundirla con un despliegue de código.

## 10. Lectura relacionada

- [Contrato, cobertura y aplicación de atributos](2026-11-24-atributos-categoria.md).
- [Vitrinas y selección editorial](2026-11-23-vitrinas-destacadas.md).
- [Selector, casillas y scroll: historial](2026-11-23-selector-requisitos.md).
- [Consolidación local: historial](2026-11-23-consolidacion-web-local.md).
- [Bitácora de esta entrega](../bitacora/2026-11-24-atributos-categoria.md).
- [Índice de Biblioteca y decisiones pendientes](../biblioteca-dominio/README.md).


## 11. Pruebas y robustez de filtros (24/11/2026)

Hecho por dos agentes económicos (Haiku) con instrucciones cerradas; cada entrega fue verificada después por quien coordina. Sin commit ni push. Alcance: solo los archivos del filtro de requisitos y sus pruebas.

### Fallos silenciosos corregidos

| Antes | Ahora | Dónde |
|---|---|---|
| Una clave o categoría de `requirement` no permitida devolvía lista vacía | Responde 400 con mensaje claro (`La categoría «x» no tiene requisitos técnicos`, `El requisito «y» no está disponible para esta categoría`) en el listado y en `GET /api/public/catalog/requirements` | `public-requirements.ts` (`validateRequirementFilters`), `public-catalog.service.ts` (`search()` y `requirements()`) |
| Se cortaban a 20 facetas sin avisar | La respuesta trae `truncated: boolean`; la pantalla muestra «Hay más requisitos de los que podemos mostrar. Elige una subcategoría o usa la búsqueda para afinar.» Los conteos contextuales ya no se recortan (evita ceros falsos) | `buildPublicRequirementFacetsResult`, `MAX_REQUIREMENT_FACETS = 20`; `ParameterRequirements.tsx` |
| `as unknown as` en las lecturas de facetas | Guardas de tipo `isKeySpecFacets` e `isRequirementsPayload`; tipo `PublicRequirementsResult` | `services/public-catalog.service.ts` |
| Error de la consulta de requisitos | El panel nunca se oculta: «No pudimos cargar los requisitos técnicos.» + «Reintentar»; con 400 y requisitos marcados: «Alguno de los filtros ya no está disponible.» + «Quitar requisitos» + «Reintentar» | `SubcategoryProducts.tsx` (`RequirementsPanelContent`) |

La lógica AND entre grupos / OR dentro del grupo / protocolos exigen todos no cambió. El diseño del panel tampoco.

### Pruebas añadidas

- Backend (`public-requirements.spec.ts`, `public-catalog.requirement-context.spec.ts`): validación de filtros, truncado, regresión de clave inválida, `requirements()` con 400 y `truncated`, y `search()` con `requirement` (AND/OR, protocolos, clave/familia inválida, sin categoría).
- Frontend: `ParameterRequirements.spec.tsx` (6 visibles + «Ver las N opciones», oculta ceros no marcados, estado marcado/deshabilitado, aviso de límite, truncado, función pura `visibleFacetOptions`), `SubcategoryProducts.spec.tsx` (función pura `toggleRequirementParams` con límite de 10, mismas consultas del listado y de requisitos, recorte de URL, panel de carga/error/400/truncado), y `public-catalog.service.spec.ts` (parámetros de `fetchPublicRequirements`, desenvuelto, `truncated`, formas inválidas, error HTTP).
- Cada acción «marcar/desmarcar» se prueba por el estado `checked` y por la función pura, porque no hay entorno de navegador (sin jsdom).

### Resultados observados

| Comprobación | Resultado |
|---|---|
| Backend `tsc --noEmit` | Sin errores |
| Backend `jest src/modules/products/public` | 12 suites: 11 pasan, 1 falla; 168 pruebas: 167 pasan, 1 falla. La falla es la de subcategorías de Cámaras que ya constaba (`public-catalog.service.spec.ts:421`, «no combina una subcategoría de Cámaras con otra categoría»); no se tocó ese bloque |
| Frontend `tsc --noEmit` | Solo los 6 errores previos (precios asignados, comparación, `portal-auth.spec.ts`); ninguno nuevo |
| Frontend ESLint (6 archivos) | 0 errores, 2 avisos `react-refresh/only-export-components` por exportar funciones puras desde componentes |
| Frontend vitest `src/features/storefront` + `src/services` (copia con dependencias sanas) | 596 pasan, 3 fallan: todas en `src/services/portal-auth.spec.ts` (acceso de clientes; fuera de este alcance) |

### Entorno: las pruebas de render fallan en esta carpeta

En `.claude/worktrees/sad-golick-8a6b22/src/frontend` las pruebas que usan `react-dom/server` (incluidas las que pasaban el 23/11, como `PublicProductCard.spec.tsx` y `mega-menu`) fallaban con `Cannot read properties of null (reading 'useState')`.

**Causa:** tras la recuperación de dependencias del 24/11, 891 enlaces (junctions) de `node_modules` tenían el destino escrito como `Global\C:\...`. Windows los abre, pero `fs.realpathSync` de Node no los resuelve: `react` se veía como `node_modules/react` desde la aplicación y como `.pnpm/react-dom.../node_modules/react` desde `react-dom`, es decir, dos instancias de React dentro de Vitest.

**Reparación hecha (con autorización del usuario):** se recrearon esos 891 enlaces con el mismo destino pero con la ruta normal (`New-Item -ItemType Junction`), sin descargar, borrar ni cambiar versiones de paquetes y sin tocar la configuración de Vitest. Resultado: 891 de 891 recreados, 0 fallos; `fs.realpathSync` ahora resuelve `react` y `react-dom` a su carpeta real en `.pnpm`. Tras eso, `vitest run src/features/storefront src/services` da 599 pruebas: 594 pasan y 5 fallan (3 de `portal-auth.spec.ts`, previas y fuera de este alcance, y 2 de `storefront-home.spec.tsx` porque `StorefrontHome.tsx` se editó el 24/11 a las 16:19 por otra sesión de diseño y su prueba aún espera las imágenes anteriores). La web de 5181 siguió respondiendo 200 (`/tienda` y `main.tsx`); si el navegador muestra algo raro tras la reparación, recargar con Ctrl+F5.

### Pendiente (no hecho)

- Con un 400 el listado de productos sigue pidiéndose y puede mostrar su propio error junto al del panel (el listado solo espera mientras los requisitos cargan).
- 2 avisos de lint: mover `toggleRequirementParams`/`visibleFacetOptions` a un archivo aparte si se quiere cero avisos.
- No se vio la pantalla en navegador a 1440 y 375 px tras estos cambios.
- `SearchResultsPage` sigue sin enviar `requirement`; los dos sistemas de filtros (`keySpec` y `requirement`) conviven.

## 12. Menú con todas las subcategorías y reinicio de la API 3010 (24/11/2026)

- **Causa:** `GET /api/public/categories/menu` solo adjuntaba subcategorías a Cámaras y solo tres de una lista fija. La taxonomía tiene 9 familias y 66 subcategorías (`prisma/seed-data/library-taxonomy-9-66.json`).
- **Cambio:** el menú adjunta las subcategorías activas de cada raíz, con su conteo de productos publicados, y solo las que tienen productos (misma regla que las raíces). Con los datos reales salen 58 en 9 raíces con productos (Alarmas 10, Audio 2, Cableado 6, Control de acceso 12, Cámaras 8, Energía 2, Parqueaderos 6, Redes 7, Monitores 5); Casa inteligente y Cerrajería siguen en 0. El panel del menú las muestra en fila (botones con el número de productos) en `CategoryDetailPanel.tsx`.
- **Pruebas:** backend `tsc` sin errores; `jest categories + products/public` 208 de 209 (la única falla es la previa de subcategorías de Cámaras); frontend `mega-menu` 40 de 40.
- **Reinicio:** la API de 3010 (antes el lanzador de Codex `TEMP/gs-local-5181-20261124/api-3010.cjs`, PID 26112) se detuvo y se arrancó desde una compilación nueva (`tsc -p tsconfig.build.json --outDir <scratchpad>/api-build`) con un lanzador propio que carga el entorno desde un archivo temporal y mantiene desactivados los trabajos programados (`ScheduleModule`: cron, intervalos y timeouts), como el de Codex. Entorno: `DATABASE_URL` de producción por el túnel 55432; secretos locales aleatorios (el personal con MFA no podrá entrar al panel). El `.env` de `src/backend` quedó como la plantilla de ejemplo (no sirve para arrancar). Tras un reinicio completo hay que repetir este arranque.
- **Verificado en el navegador:** menú de Alarmas con 10 subcategorías; clic en «Detectores y sensores» abre `/catalogo/categoria/alarmas?tipo=detectores-y-sensores` con 33 productos y los requisitos técnicos.
