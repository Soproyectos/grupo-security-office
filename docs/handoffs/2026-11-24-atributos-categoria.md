# Atributos técnicos por categoría — propuesta y contrato

[Guía de continuidad y arranque de la tienda](2026-11-24-tienda-local-estado-vigente.md) · [Resumen durable de la carga](evidencia/2026-11-24-carga-atributos.json).

Estado: **carga autorizada y confirmada en PostgreSQL; valores WORKING y plantillas PROPOSED; fichas publicadas preservadas**.
Fecha: 2026-11-24. Frontend: http://127.0.0.1:5181. API: http://127.0.0.1:3010.

## Hallazgo comprobado en la base

Consulta de solo lectura sobre 850 productos y 11 categorías. 849 productos tienen grupos técnicos publicados no vacíos; uno tiene una instantánea publicada explícitamente vacía. Se conserva la autoridad de la revisión publicada.

En la auditoría inicial, las tablas existentes de atributos tipados estaban vacías: spec_definitions, spec_options, subcategory_specs, product_spec_values y product_spec_value_options. Los datos técnicos están en los grupos de las fichas publicadas. No se creó un modelo paralelo ni se modificó el esquema.

Un mismo producto puede tener varios atributos simultáneamente. En DS-QAZ1A500G1-VB2 se comprobaron entrada de 100–240 VAC, potencia nominal de salida de 500 W y TCP. Antes, algunas etiquetas de protocolos no se reconocían y la tensión aparecía como potencia.

## Estructura que reutiliza el modelo existente

- SpecDefinition: significado único, tipo y unidad canónica. Una definición compartida entre las categorías que la usan.
- SpecOption: opciones controladas para protocolos; cada protocolo es una opción independiente.
- SubcategorySpec: plantilla por ID real de subcategoría, con estado PROPOSED e isRequired=false. Ser filtrable no convierte un atributo en obligatorio.
- ProductSpecValue: respuesta del producto y etapa WORKING/PUBLISHED; conserva NUMBER, TEXT o MULTI_OPTION según el significado.
- ProductSpecValueOption: protocolos seleccionados por producto.
- Falta de dato, UNKNOWN y NOT_APPLICABLE son estados diferentes. No se infiere desde SKU, nombre o marca.
- Tensión de entrada, tensión de salida, potencia de salida, consumo y presupuesto PoE son conceptos separados. Un intervalo eléctrico compuesto se conserva como texto con AC/DC, unidades y condiciones; no se transforma en dos números que pierdan esa información.
- Los números inequívocos de potencia, impedancia, zonas y capacidades se proponen como NUMBER. Valores compuestos o conflictivos quedan pendientes.
- La carga futura a WORKING no publica fichas ni cambia automáticamente las reglas de publicación.

## Cobertura observada y propuestas

| Categoría | Productos | Valores propuestos | Pendientes | Ejemplos de atributos |
|---|---:|---:|---:|---|
| Alarmas | 94 | 144 | 0 | Zonas, protocolos, detección, transmisión, batería |
| Audio y perifoneo | 18 | 69 | 7 | Potencia de salida, tensión de entrada, impedancia, protocolos |
| Cableado | 47 | 84 | 0 | Categoría, conductor, material, longitud |
| Cámaras | 378 | 1075 | 1 | Resolución, lente, distancia focal, IR, compresión |
| Control de acceso | 143 | 178 | 99 | Rostros, tarjetas, huellas, usuarios, eventos, puertas |
| Energía y electricidad | 18 | 50 | 0 | Entrada, salida, potencia, capacidad UPS, batería |
| Monitores y pantallas | 49 | 161 | 0 | Tamaño, resolución, brillo, refresco, alimentación |
| Parqueaderos | 28 | 51 | 0 | Brazo, distancia de lectura, frecuencia, protección |
| Redes y Wi-Fi | 75 | 223 | 0 | Puertos, PoE, presupuesto y potencia por puerto, conmutación |
| Casa inteligente | 0 | 0 | 0 | Pendiente: sin productos observados |
| Cerrajería y herrajes | 0 | 0 | 0 | Pendiente: sin productos observados |

Total: **55 definiciones compartidas y 2.035 valores propuestos**. Los 107 pendientes corresponden a 96 números compuestos/no inequívocos, 10 atributos con múltiples valores que requieren revisión y un atributo de un producto sin subcategoría. Las plantillas cubren 47 IDs de subcategoría observados. No significan que todos los productos tengan todos los campos completos.

## Contrato de filtros implementado

GET /api/public/catalog/requirements recibe categoría, subcategoría y el mismo contexto q/brand/keySpec/requirement del listado. Es público, validado, limitado por throttling y no-store. No devuelve datos de borradores.

Cada opción cuenta productos distintos. Atributos distintos se combinan con AND; alternativas de zonas o capacidades de un mismo atributo, con OR. Para protocolos se exige cada capacidad seleccionada: HTTP + HTTPS busca equipos con ambos.

Los conteos respetan búsqueda, marca, especificaciones y selecciones de los demás atributos. En protocolos también conservan las capacidades ya seleccionadas. Una opción incompatible tiene conteo cero; una selección con cero permanece disponible para poder desmarcarla.

React Query incorpora todos esos filtros en la clave de caché y los envía al endpoint. Consumidores: PublicCatalogKeySpecFacetsController, fetchPublicRequirements y SubcategoryProducts/ParameterRequirements.

## Artefactos reproducibles

Generador: scripts/proponer_atributos_biblioteca.cjs.
Pruebas: scripts/proponer_atributos_biblioteca.test.cjs.

    node --test scripts/proponer_atributos_biblioteca.test.cjs
    node scripts/proponer_atributos_biblioteca.cjs --input <inventario-de-solo-lectura.json> --out-dir <directorio>

Salida local en data/atributos-biblioteca-20261124/:
- dictionary.json: definiciones y plantillas propuestas.
- proposal.json: valores WORKING propuestos y casos pendientes.
- summary.json: cobertura y conteos.

El inventario completo permanece en una ubicación temporal local; no se copia una conexión ni secretos al repositorio. Cada propuesta conserva hash del inventario, hash de sus datos fuente publicados, ID de producto y valores normalizados. El generador reutiliza las reglas de extracción del catálogo, sin mantener otra tabla independiente de equivalencias.

## Validación y límites

- 8/8 pruebas del generador.
- 15/15 pruebas backend de requisitos, contexto de facetas y especificaciones clave.
- Typecheck y lint backend dirigidos correctos; pruebas del servicio frontend 25/25 y lint dirigido correctos.
- GET real del listado, con entrada 100–240 VAC + TCP + salida 500 W: HTTP 200, total 1, SKU DS-QAZ1A500G1-VB2.
- GET real de requisitos con tensión + TCP: HTTP 200 y conteos compatibles.
- Salud local: database connected; frontend 5181 HTTP 200.
- No se ejecutó una prueba visual completa nueva de todas las categorías.
- Typecheck global frontend conserva seis errores previos ajenos a esta entrega. Una prueba previa de PublicCatalogService sobre subcategorías también sigue pendiente; no declarar todas las suites globales correctas.

## Carga autorizada y confirmada (24/11/2026, 15:06 Colombia)

El usuario respondió afirmativamente a la carga de las 55 definiciones, 206 asociaciones y 2.035 valores de trabajo en producción, sin publicar. Se ejecutó scripts/aplicar_atributos_biblioteca.cjs --apply mediante el túnel ya existente y sin exponer credenciales.

- Lote: 57f4726f-c1b2-4696-843d-1be7ccbdfc43; COMMIT confirmado a las 20:06:03 UTC.
- Inserciones: 55 definiciones y 68 opciones inactivas; 206 plantillas PROPOSED no requeridas; 2.035 valores WORKING/KNOWN y 4.496 selecciones de opciones.
- 705 productos recibieron datos y sus 705 registros de ProductChange, source=SYSTEM, field=keySpecs:WORKING, con batchId y hash de fuente. No se inventó una identidad de usuario.
- Huella de publicación antes/después: e482c47dfd06e1fbc7c9aafe2e561f4c; 850 productos. Ningún valor tipado PUBLISHED creado ni ficha publicada modificada.
- Informe local: data/atributos-biblioteca-20261124/apply-1795550750915.json, con IDs/filas creadas, conteos, hashes y confirmación.
- El cargador comprueba las fichas y clasificaciones actuales contra el inventario, bloquea escrituras concurrentes de las fuentes durante la carga, rechaza diferencias en registros existentes y valida CHECK/FK antes del COMMIT.
- 8/8 pruebas específicas del cargador: idempotencia, rechazo de conflictos/publicación, referencias, rollback, commit y repetición sin inserciones. Se conserva el preflight de solo lectura como modo predeterminado.

D5 sobre atributos esenciales sigue abierta: no se impusieron campos obligatorios ni se activaron plantillas aprobadas. Los 107 casos pendientes permanecen en el artefacto para revisión. Los filtros de la tienda continúan usando las fichas publicadas; estos datos de trabajo no sustituyen su publicación.

Una reversión futura debe usar únicamente las filas identificadas en el informe del lote: verificar que siguen intactas y sin uso PUBLISHED; retirar selecciones/valores, plantillas, opciones y definiciones en ese orden dentro de una transacción, conservando el historial de auditoría y registrando la reversión. No usar migration.down, que destruiría las tablas. No se ejecutó una reversión productiva.

## Comprobación posterior al COMMIT

Preflight real de solo lectura: todos los registros coinciden con el lote y cero inserciones pendientes en las cinco tablas; repetición idempotente comprobada sin ejecutar otra carga. API health HTTP 200 con database=connected; frontend 5181/tienda HTTP 200. Listado con tensión 100–240 VAC + TCP + salida 500 W: HTTP 200, total 1, amplificador DS-QAZ1A500G1-VB2. La huella de publicación se mantiene.

## Fuentes profesionales consultadas

- [Algolia: faceting](https://www.algolia.com/doc/guides/managing-results/refine-results/faceting): conteos y filtrado por facetas.
- [Elastic: filter search results](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/filter-search-results): separar filtros de resultados y agregaciones.
- [Schema.org: QuantitativeValue](https://schema.org/QuantitativeValue): valor, intervalo y unidad son componentes diferentes.
- [PostgreSQL 18: JSON types](https://www.postgresql.org/docs/18/datatype-json.html): JSONB sirve para evidencia flexible, sin sustituir los tipos/relaciones ya existentes.
- [Ficha oficial Hikvision del amplificador](https://assets.hikvision.com/prd/public/all/doc/m000140600/DS-QAZ1A500G1-VB2_Datasheet_20250624.pdf): entrada eléctrica, salida nominal y red independientes.

La elección de reutilizar las tablas existentes y mantener la propuesta sin publicar es una decisión de integración de este proyecto, basada también en su esquema y reglas.

