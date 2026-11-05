# Infraestructura e integración de la biblioteca

**Estado:** objetivo de producción propuesto; T03 validada y T04/T05 implementados localmente en desarrollo bajo el mandato de continuidad. Ningún servicio productivo modificado. Estado y autorización vigentes: [README](./README.md). Decisiones: [ADR-20261022](../adr/ADR-20261022-biblioteca-postgresql-dedicado.md). Datos: [modelo-de-datos.md](./modelo-de-datos.md).
**Fuentes:** `docker-compose.prod.yml`, `deploy/vps/*` (según auditoría, sin releer todo aquí), `src/backend/package.json` y `package-lock.json`, `src/backend/src/prisma/prisma.service.ts`, diagnóstico de solo lectura de la VPS del 22/10 (hilo SSH) y un escaneo estático de los módulos (sección 3).

## Desarrollo T04/T05 implementado

- Configuración independiente: `deploy/dev/docker-compose.biblioteca-test.yml`, ejemplo sin credenciales `biblioteca-test.env.example`. PG18, red interna gs-test-*, sin puertos ni volúmenes persistentes; tmpfs 512 MiB, 1 GiB/1 CPU/pids 200 y capacidades de arranque acordadas. No combinar con Compose productivo. YAML/límites estáticos comprobados y docker compose config --quiet pasó en el ensayo aislado.
- `BibliotecaPrismaModule`/`BibliotecaPrismaService` registrados en NestJS; modo `LIBRARY_DATABASE_MODE=legacy` por defecto reutiliza el cliente actual y no posee su lifecycle. Consumidores todavía sin adaptar. En modo `dedicated` se requiere explícitamente NODE_ENV development/test, URL independiente a gs-test-*, gs_it, base gs_test_biblioteca_*, sin parámetros URL, TLS desactivado solo en este aislamiento y DB/IP/cluster/versión/ruta de datos reales coincidentes antes de exponer el cliente. No hay fallback ante fallo. El modo dedicado productivo permanece rechazado hasta preparar y autorizar su TLS/corte.
- Se mantienen PrismaService, CA/TLS operativo, esquema operativo, CI y lockfile. El build genera también el cliente candidato separado; `db:generate:library` permite generación local sin bases. No se carga ni registra otra API.
- **Probado localmente:** 35 casos en dos specs (sin BD), tsc, nest build, lint sin errores. El parser YAML instalado comprobó nombres/límites/red/ausencia de puertos y volúmenes. Windows no tiene Docker CLI accesible; no se instala.
- **Ensayo ejecutado y aprobado:** dos PostgreSQL tmpfs y un ejecutor Node no privilegiado, imágenes ya presentes y red interna gs-test-*. Máximo agregado 3 CPU/3 GiB; guardas por ID/nombre/etiqueta/imagen/red/puertos/montajes/recursos y verificación SQL. Generar cliente en Linux sin instalaciones/descargas, probar selección legacy/dedicado, separación de datos, rechazo de identidad incorrecta y lifecycle; comprobar tablas vacías y limpiar IDs propios. El servidor de compatibilidad contiene solo las 23 tablas para esta prueba, no una migración del dominio operativo. [Manifiesto y hashes](./evidencia/t04-t05-conexiones-preparada.json). **Salida 0**: Node v20.20.2/Linux y Prisma6.19.3, clientes separados, identidad incorrecta rechazada, lifecycle legacy conservado y tablas vacías en ambos servidores. Tres contenedores/red/env propios eliminados y ausencia verificada. [Resultados/logs](./evidencia/t04-t05-conexiones-intento-1/resultado-ejecucion.json). No se construyó ni desplegó imagen nueva; se usó la imagen ya presente solo como ejecutor Node, sin iniciar su API.

## 1. Servicio PostgreSQL de biblioteca (propuesta para producción, no aplicada)
| Aspecto | Propuesta | Estado |
|---|---|---|
| Imagen | Oficial `postgres:18-alpine`, igual versión mayor que `gs-db` (`docker-compose.prod.yml`). Fijar la etiqueta menor o el *digest* al preparar el ensayo | Misma imagen de `gs-db` [COMPROBADO]; digest por fijar |
| Contenedor | Nombre `gs-biblioteca-db`, `restart: always`, sin puertos publicados (`expose: 5432`) | Propuesta |
| Datos | Volumen con nombre `biblioteca_pgdata` montado como `gs-db` (`/var/lib/postgresql`) | Propuesta |
| Red | Red propia `biblioteca_net`. La base solo está en esa red; el backend se une a la red por defecto y a `biblioteca_net`. Sin puertos hacia el host | Propuesta |
| Secretos | Usuario, clave y nombre de base en variables de la VPS (`BIBLIOTECA_POSTGRES_*`), obligatorias con `${VAR:?}` como las actuales; nunca en Git | Propuesta |
| Roles | Dos roles: aplicación (lectura/escritura de datos) y migraciones (DDL). El respaldo usa un rol de solo lectura | Propuesta |
| Healthcheck | `pg_isready` como en `gs-db`; además el backend debe incluir ambas bases en `/api/health` (hoy responde 200 aunque la base esté caída, según la auditoría) | Propuesta |
| Extensiones | `pg_trgm` (búsqueda difusa e índices GIN existentes) | [NO VERIFICADO] que la imagen la traiga en la VPS; se comprueba en el ensayo |
| Recursos | Límites de memoria y CPU por definir con mediciones. Referencia del diagnóstico: `gs-db` usa ~104 MiB; la VPS tiene 8 CPU, 22 GiB de RAM y 170 GB libres | No se promete rendimiento |
| Archivos | Volumen `biblioteca_files` para binarios del dominio (originales de listas, documentos), montado en el backend y **dentro del respaldo** | [PENDIENTE D7] |

Boceto ilustrativo (no aplicado; el nombre de variables y la sintaxis definitiva se fijan en la tarea T04):
```yaml
services:
  biblioteca-db:
    image: postgres:18-alpine
    container_name: gs-biblioteca-db
    restart: always
    expose: ["5432"]
    environment:
      POSTGRES_USER: ${BIBLIOTECA_POSTGRES_USER:?requerida}
      POSTGRES_PASSWORD: ${BIBLIOTECA_POSTGRES_PASSWORD:?requerida}
      POSTGRES_DB: ${BIBLIOTECA_POSTGRES_DB:-grupo_security_biblioteca}
    volumes: [biblioteca_pgdata:/var/lib/postgresql]
    networks: [biblioteca_net]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${BIBLIOTECA_POSTGRES_USER} -d ${BIBLIOTECA_POSTGRES_DB:-grupo_security_biblioteca}"]
```

## 2. Conexiones Prisma separadas
- **Versión real del proyecto [COMPROBADO]:** `prisma`, `@prisma/client`, `@prisma/adapter-pg` y `@prisma/adapter-neon` en **6.19.3** (`package-lock.json`); NestJS ^11. `AGENTS.md` decía «Prisma 5.x»; se corrige en este mismo cambio documental.
- **Estado actual:** un solo `schema.prisma` y un `PrismaService` que elige el adaptador por variables (`DATABASE_DRIVER`, URL `neon.tech`), leyendo `DATABASE_URL`.
- **Propuesta:** un segundo esquema `prisma/biblioteca/schema.prisma` con su propia carpeta `migrations` y su cliente generado en una ruta distinta; variable `BIBLIOTECA_DATABASE_URL`; un `BibliotecaPrismaService` con la misma lógica de adaptador; scripts `db:generate`/`db:migrate` para cada esquema. Mientras dure la transición el esquema operativo **conserva** los 23 modelos de biblioteca; se retiran en la tarea T15, no antes.
- **[COMPROBADO en T02, local y sin base de datos, solo con modelos de juguete]:** con Prisma 6.19.3 dos esquemas validan y generan dos clientes en rutas distintas, y un archivo los importa y compila sin romper la comprobación de tipos del proyecto ([resultado](./poc-t02-dos-clientes.md)).
- **[NO VERIFICADO]:** el adaptador `pg` en ejecución con dos clientes; Linux/Alpine y `binaryTargets` (cada cliente copia el motor); que `Dockerfile` y `deploy.sh` (que hoy ejecuta una sola vez `prisma migrate deploy`) puedan generar y migrar ambos. Se prueban en T04/T12.
- La unión entre dominios se hace en NestJS: un módulo de biblioteca expone una **interfaz de servicio** (existe producto, listas permitidas, precio vigente, etc.); los demás módulos la inyectan en vez de consultar tablas.

## 3. Inventario concreto de módulos y consultas a adaptar
Obtenido con un escaneo estático (`herramientas/inventario-modulos.js`, regenerable): busca llamadas `.<modelo>.<operación>(` en los `.ts` de `src/backend/src` que no son pruebas, y las agrupa por módulo según la clasificación del ADR. **Límites:** no ve accesos indirectos (helpers que reciben el cliente), no incluye `prisma/*.ts` (semillas, `import-biblioteca.ts`) ni `src/backend/scripts/`, y no analiza el SQL de las consultas crudas. Hay que completarlo en la tarea T06.

| Módulo | Tipo | Modelos de biblioteca que toca | Modelos operativos / pendientes | Consultas crudas | Adaptación propuesta |
|---|---|---|---|---|---|
| `brands`, `categories` | Biblioteca | Brand; Product, Category | — | 0 | Pasan al cliente de biblioteca |
| `library-packages` | Biblioteca | Product, Price, CatalogJob, CatalogJobUnit, ExportBundle | — | 1 | Código sin uso (no se importa en `app.module.ts`, según auditoría); decidir completar o retirar |
| `modules/products` | **Cruza** | 14 modelos (Product, Category, Brand, Price, ImportMapping, ImportSession, Lista, PriceList, ProductChange, ProductCatalogResource, ProductRevision, ProductImage, PublicationEvent, ProductCatalogSpecGroup) | Assignment, AuditLog; Stock, UploadedFile | **16** | Núcleo de la migración: cliente de biblioteca; ACL por interfaz; auditoría a biblioteca; revisar las 16 consultas crudas (incluye la parcheada de `findAll`) |
| `modules/prices` | **Cruza** | Price, PriceList, Lista, Product, Brand, Category, PriceImportRevision(+Row, +Price), ProviderProfile, ProviderEquivalence | Assignment | 2 | Todo al cliente de biblioteca; `Assignment` por interfaz; la transacción Serializable de aplicación queda en una sola base |
| `modules/catalog-jobs` | **Cruza** | Product, ProductRevision, CatalogJob, CatalogJobUnit | User | 1 | Cola en biblioteca; actor como referencia |
| `modules/files` | **Cruza** | ProductCatalogResource, ProductImage | User; UploadedFile (pendiente) | 2 | SQL sobre `products.documents` y archivos: depende de D1/D7 |
| `modules/listas` | **Cruza** | Lista, Product, Price | User, Assignment, AuditLog, Quote | 0 | Lista a biblioteca; `Quote`, asignaciones y usuarios por interfaz |
| `modules/assignments` | **Cruza** | Lista, Product, Category, PriceList | User, Assignment, Role, UserRole, AuditLog | 0 | Asignaciones quedan en operativo; validan ids de lista contra biblioteca |
| `common/acl` | **Cruza** | Lista, Product, Price | Assignment, AccessGrant | 0 | El ACL resuelve las listas permitidas en operativo y consulta biblioteca con esos ids |
| `modules/commercial` (cotizaciones, pedidos, clientes) | **Cruza** | Product, Price | User, Customer, Quote, SalesOrder, QuoteItem, SalesTarget | 0 | Leer producto y precio por interfaz; la línea conserva su copia |
| `modules/customer-portal` | **Cruza** | Product, PriceList, Price | Customer, PortalAccount, PortalSession, PortalPriceListMapping, PortalTier | 0 | Consulta por interfaz con la tarifa del cliente |
| `modules/storefront` | **Cruza** | Product, PriceList, Price | AuditLog, Customer, CustomerAccount, CustomerSession, CustomerAccessToken; StorefrontInquiry, StorefrontSettings | 0 | Lectura de catálogo por interfaz; **no muestra precios a visitantes** (no se rediseña) |
| `modules/dashboard` | **Cruza** | Product, Category, Lista | User, Role, Customer, SalesOrder, QuoteItem, Assignment, AuditLog, Quote, SalesTarget | 0 | Componer indicadores a partir de servicios de cada dominio |
| `modules/team-workflow` | **Cruza** | Lista, Product, PriceList, ImportSession | User, TeamActivity(+Link, +Event), TeamRequest | 0 | Referencias por id; lecturas por interfaz |
| `modules/health` | Transversal | — | — | 1 | Verificar ambas bases |
| `modules/audit`, `auth`, `users`, `roles`, `notifications`, `promotions`, `common/security`, `common/hierarchy` | Operativo | — | (ver código) | 5 en total | Sin cambio funcional |
| `scripts/import-product-media.logic.ts` | Biblioteca | Product, ProductImage | — | 0 | Al cliente de biblioteca |

**Contratos de la web:** las rutas HTTP, los DTO y las respuestas existentes se conservan siempre que sea posible; los cambios son internos. Si una respuesta debe cambiar, se documenta y se prueba antes. **Autenticación y autorización siguen en el backend** (JWT, guards, permisos, ACL); biblioteca no los implementa.

## 4. Archivos
Hoy: imágenes en `UploadedFile` (bytes en PostgreSQL, servidas por `GET /api/files/:id`), originales de listas de precios en disco (`uploads/price-import-private`), carpeta estática `uploads/`. Ningún script respalda los volúmenes `uploads` ni `data/imports`. Propuesta [PENDIENTE D1/D7]: `library_files` como índice único con huella SHA-256, binarios grandes en `biblioteca_files`, copia diaria del volumen junto con la base, y lectura siempre por el backend (con permisos).

## 5. Respaldos y recuperación
- **Hoy [COMPROBADO por la auditoría]:** `pg_dump -Fc` diario de `gs-db` con retención de 14 días y volcados previos al despliegue y a la importación de biblioteca.
- **Propuesta:** un respaldo conjunto en una sola ejecución: `pg_dump` de la base operativa, `pg_dump` de la base de biblioteca y copia del volumen de archivos, con un **manifiesto** (hora común, tamaños, huellas, última fila de `product_changes` y de `library_audit_events`). Retención igual a la actual. Volcado previo de ambas bases antes de cada despliegue o migración.
- **Restauración a un punto compatible:** se restauran las dos bases y los archivos de la **misma ejecución**; después se corre el informe de conciliación entre dominios. Si se restaura solo una base, el informe lista los ids huérfanos y se decide caso por caso. Cualquier restauración se ensaya primero en un entorno aislado.
- **[NO VERIFICADO]:** tiempos de restauración, espacio necesario y que los scripts actuales (`deploy/vps/gs-db-backup.sh`, `deploy.sh`) admitan la ampliación sin cambios mayores.

## 6. Seguridad operativa
Sin puertos publicados para la nueva base; secretos fuera de Git; roles con mínimo privilegio; ninguna credencial en logs, bitácoras ni ejemplos; avisar al equipo de seguridad (Netdata) antes de crear recursos en la VPS; la VPS es producción: nada se crea, instala, migra ni despliega sin aprobación explícita del usuario en cada ocasión.

### Corte T07 / T06 categorías / T14 parcial (22/10/2026)

Esquema activo de desarrollo en `src/backend/prisma/biblioteca/`: copia inicial byte idéntica a T03 más migración nueva de `library_audit_events` (9 columnas, actor externo sin FK, dos índices). El candidato original T03 queda congelado. CategoriesService usa BibliotecaPrismaService; escrituras y evento comparten transacción, con actor recibido del JWT existente. Rutas/DTO/roles sin cambio. La fábrica de visibilidad pública recibe JsonNull de cada cliente para conservar el mismo predicado y evitar la incompatibilidad nominal entre SDK generados.

Validación local: 5 suites/69 casos, tipos, build Nest y lint dirigidos pasan. Ensayo Linux Node20.20.2/Prisma6.19.3/PostgreSQL18.6: separación de servidores, identidad equivocada rechazada, CRUD categorías y conteos públicos (2 dedicado / 1 legacy), actor, rollback conjunto y ante fallo de auditoría, rechazo 503 con congelación y lecturas disponibles, lifecycle legacy y 24/23 tablas vacías pasan. [Resultados](./evidencia/t07-categorias-intento-2/resultado-ejecucion.json).

Intento 1: inspector esperaba una sola fila en pg_constraint; PG18 registra también NOT NULL (`contype=n`). [Fuente oficial](https://www.postgresql.org/docs/18/catalog-pg-constraint.html). Se corrigió únicamente la expectativa para exigir PK y seis NOT NULL validados/enforced, sin cambiar DDL. Intento 2 confirmó físicamente las siete filas y pasó. Paquete SHA-256 `5a513091570537c7942e65cba5a0d972c7d3991631f4b81e6bd6e32c4820e5f8`; ejecutor sin cambio `11a8b2cbd144a76740a455275493c09759432449dde35475a804305ed65dbb02`. Ambos intentos, manifiestos y hashes se conservan; tres contenedores, red y credenciales propios ausentes por IDs tras cada uno. No se inspeccionaron datos productivos ni se certifica integridad total de producción.

T07/T14 siguen parciales: solo categorías genera eventos nuevos y usa la congelación. El servidor de compatibilidad tiene el contrato de 23 tablas, sin usuarios/ACL ni API completa. Marcas y paquetes aún dependen de resolver UploadedFile (D1); su almacenamiento/retención final sigue D7. No se activó el módulo de paquetes ni se alteró su default de secciones.

### Corte T06 marcas/archivos — 23/10/2026

D1 se implementó mediante migración nueva de UploadedFile equivalente al contrato vigente (diez columnas, PK, dos índices; sin FK/CHECK nuevos), preservando bytes en PostgreSQL y las URL. BrandsService usa el cliente elegido y evento con actor; en dedicado el logo y su archivo/auditoría son atómicos. FilesService conserva referencias de marcas/imagen de catálogo además de las históricas, propaga errores inesperados y solo interpreta P2025 como ausencia en dedicado. Guarda de pertenencia/vida de transacción en BibliotecaPrismaService; una tx operativa o expirada se rechaza antes de escribir.

70 pruebas locales, tipos/lint/build y ensayo PG18 aislado pasan; el primer fallo de fixture (id/status de ProductRevision sin default) quedó corregido sin tocar modelo/DDL/ejecutor. [Resultados](./evidencia/t06-marcas-archivos-intento-2/resultado-ejecucion.json), 28/24 tablas vacías y limpieza por IDs verificada. El servidor operativo es un contrato de compatibilidad sintético, no usuarios/ACL/auth completos. ProductsService/Sheet/Validation/paquetes y script de medios siguen pendientes de transporte; sus tx no registradas no escriben como fallback en operativo. D7 no se resolvió: no se añadió almacenamiento en disco/retención/GC nueva ni se movieron originales.

### Corte T06 de colaboradores de productos — 23/10/2026

Revisiones, ficha, historial y validación seleccionan biblioteca; Stock se lee por separado en el cliente operativo. Concurrencia con bloqueo de Product y control de versión, medios del servidor, archivos/ficha/revisión/evento atómicos y congelación probados en PostgreSQL18.6 aislado. Ficha conserva comparación anterior/posterior en el evento dedicado, name interno y revisión publicada; permisos de campos precio permanecen. 98 pruebas locales, tipos/lint/build conformes; [ensayo completo](./evidencia/t06-productos-intento-2/resultado-ejecucion.json). Se conserva intento previo fallido solo en limpieza RESTRICT, corregido en el fixture. Stock y ACL/grants son dobles explícitos en este ensayo: no acredita SQL operativo ni JWT/API completo. ProductsService/T00 permanece íntegro en este corte; su transporte y lectores públicos siguen pendientes.

### Corte T06 de lectores/Storefront — 23/10/2026

Productos, precios, detalle público, tablero y consultas de catálogo de Storefront usan biblioteca; cuenta/sesión/configuración/solicitudes permanecen operativas. Las tres rutas públicas y el catálogo de clientes ocultan precios sin sesión vigente/verificada/no suspendida, incluso fallback legado; tarifa profesional solo APPROVED. Ficha detallada usa filtro de cliente y caché privada. El catálogo de clientes aplica el snapshot público y deja precios vivos. 112 pruebas locales y [ensayo PG18 en ambos modos](./evidencia/t06-lectores-intento-2/resultado-ejecucion.json) conformes, con 28/24 tablas vacías y limpieza verificada. Sesión/configuración/ACL son dobles explícitos. CustomerAccount conserva FK histórica a price_lists operativo: asignar una tarifa recién creada solo en biblioteca queda pendiente de conciliación del esquema operativo, sin cambiar dicha FK en este corte.

### Corte T06 de escritor core — 23/10/2026

ProductsService usa delegados biblioteca limitados y seis lecturas operativas explícitas. Creación/edición/medios/borrador válido y sus precios/cambios/revisiones/eventos probados atómicamente en [PG18 aislado](./evidencia/t06-escritor-intento-1/resultado-ejecucion.json); 150 pruebas locales, tipos/lint/build conformes. La revalidación bajo bloqueo rechaza cambios durante la petición; no sustituye una versión explícita enviada por el editor. FindAll conserva SQL/parámetros/lógica y solo cambia Assignment al cliente operativo. Publicación/programación/borrado/importación dedicada aún responden LIBRARY_WRITER_PENDING, sin escrituras parciales; siguientes cortes T06. Stock/ACL/grants/AuditLog legacy son dobles explícitos, no prueba de esquema operativo completo ni JWT.
