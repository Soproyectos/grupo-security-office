# BASE-02 — Cerrar contratos de paquetes, acciones y alcances (paso: contrato)

**Fecha:** 2026-10-15 · **Checkout:** `/home/soporte/office_ai/grupo-security-office` (S3) · **Alcance:** solo documentación. Este paso escribe únicamente `docs/ejecucion-paneles/contratos/BASE-02.md`; no modifica código, base de datos ni servicios activos, no ejecuta commits y **no edita `estado.json` ni `tareas.json`**.

**Modalidad — tanda continua (PROP):** conforme a `docs/ejecucion-paneles/TANDA-COMPLETA.md`, este contrato se propone para la auditoría final única del coordinador. **No es una decisión aprobada.** Todo lo marcado **PROP** es propuesta de esta entrega; los permisos reales de la plataforma y las reglas de seguridad siguen vigentes.

## Cómo leer este documento

| Marca | Significado |
|---|---|
| **OBS** | Hecho observado: verificado con `rg`/lectura directa en este checkout o en el worktree UA indicado (comandos en §13). |
| **IP** | Informe o diseño previo: lo afirma un documento anterior; no se re-ejecutó aquí. |
| **PROP** | Propuesta de esta entrega; no es una decisión aceptada. |
| **DESC** | Desconocido o no verificable desde este checkout. |

## 1. Meta, dependencias y reglas de la ficha

- **Meta (ficha `BASE-02 contrato`, textual):** «Concretar acciones y alcances por usuario; hijos Vendedor/Supervisor/Gestión y Catálogo. Fijar campos, rutas, acciones, alcance, errores y pruebas antes de implementar.»
- **dependsOn (ficha):** `BASE-01`. Este documento **no verifica la aceptación** de BASE-01: ese estado vive en `estado.json`, que este paso no edita.
- **Reglas de la ficha (literales):** (1) «Diseñar concesiones independientes: editar propios y leer equipo no equivale a editar equipo.» (2) «Precisar dependencias y migración; no crear permisos nuevos ni modificar usuarios en este paso.» (3) «La selección de paquete muestra acciones concretas/versionadas. Mi resumen/Agenda permanecen personales.»
- **Referencia de la ficha:** `docs/PANELES-Y-PERMISOS.md`, sección «acciones y alcances por usuario; hijos Vendedor/Supervisor/Gestión y Catálogo» (acuerdo de producto del 8 de octubre de 2026, **IP**: «todavía no certifica que esté implementado»).
- **Criterios de aceptación del paso:** §12 (textuales de la ficha).

## 2. Alcance de este contrato: qué fija y qué queda fuera

| Dimensión | Se fija aquí (PROP) | Queda fuera de este paso |
|---|---|---|
| Campos | Campos de una concesión: usuario destino, paquete y versión, acción, alcance, procedencia, motivo, actor y momento (§5, §7) | Esquema SQL, tablas y migraciones (BASE-04 `backend`) |
| Rutas | Mapa apartado → acciones → ruta/endpoint actual y su estado (§3, §7) | Crear, mover o renombrar endpoints |
| Acciones | Catálogo concreto por apartado, sin casilla genérica «Escritura» (§3) | Habilitar acciones en guards o catálogo (BASE-04, COM-01) |
| Alcance | Alcance por concesión, no global-sumado (§5, §7) | Resolución efectiva del alcance por acción (BASE-04) |
| Errores | Semántica HTTP por denegación (401/403/404/409) (§7) | Implementar respuestas o mensajes nuevos |
| Pruebas | Matriz de pruebas positivas/negativas previstas (§7) | Ejecutar suites (solo se listan comandos en §13) |

**Prohibiciones de la ficha (§1, regla 2) que este paso cumple:** no se crean permisos nuevos, no se modifican usuarios, no se aplica ninguna migración. **DESC:** no se consultó la base de datos.

## 3. Catálogo de acciones concretas por apartado (PROP)

**Reglas de denominación (IP `docs/PANELES-Y-PERMISOS.md:35-39`):** cada apartado tiene «solamente las acciones que realmente existen»; se evita una casilla genérica «Escritura»; pueden existir Aprobar/Exportar/Importar cuando el trabajo lo requiera; ver una cifra del dashboard no modifica datos.

**Ancla de formato en S3 (OBS):** `@Permissions(...)` ya usa IDs con dos puntos en controllers reales: `products:publish` (`products.controller.ts:259,276,292,305`), `listas:create|duplicate|archive|delete|publish` (`listas.controller.ts:111-166`, `products.controller.ts:329-349`), `assignments:manage` (`assignments.controller.ts:59-81`), `users:read` (`dashboard.controller.ts:66`). **PROP:** conservar ese formato (`apartado:acción`) para las acciones de este contrato.

### 3.1 Comercial — hijo Vendedor (PROP)

| Apartado | Acciones (ID propuesto) | Estado de la base |
|---|---|---|
| Mis clientes y prospectos | `customers:read`, `customers:create`, `customers:edit` | **IP** DISENO-COMERCIAL:178 las lista como existentes en el catálogo local (UA); servicios S3 de clientes **OBS** (`commercial/customers/`) |
| Mis cotizaciones | `quotes:read`, `quotes:create`, `quotes:edit`, `quotes:status` | **IP** DISENO-COMERCIAL:179; **OBS** módulo `commercial/quotes/` en S3 |
| Mis ventas y facturas | `erpSales:read`, `targets:read` | **PROP nuevo** (DISENO-COMERCIAL:190); consulta ERP **bloqueada** (§11 B1) |
| Mis pedidos por falta de stock | `stockRequests:read`, `stockRequests:create`, `stockRequests:edit`, `stockRequests:cancel` | **PROP nuevo** (DISENO-COMERCIAL:191); módulo no existe en S3 (**OBS** §10) |
| Agenda (herramienta personal) | `activities:read`, `activities:create`, `activities:complete` sobre lo propio | **PROP nuevo** (DISENO-COMERCIAL:186); S3 hoy decide por **rol** (`workflow.controller.ts:14-18`, **OBS**) |
| Promociones internas | `commercialPromotions:read` | **PROP** (DISENO-COMERCIAL:187); S3 hoy depende del rol (**IP** COMPARACION:65) |
| Mi resumen / Agenda y tareas | fuera de paquetes: herramientas personales, sin datos administrativos sin asignaciones | **IP** PANELES:24 y DISENO-COMERCIAL:21 |

### 3.2 Comercial — hijo Supervisor comercial (PROP)

| Apartado | Acciones (ID propuesto) | Nota |
|---|---|---|
| Resumen/consulta del equipo | `teamInsights:read`, `customers:read` con alcance `team` | **IP** DISENO-COMERCIAL:177; no concede edición |
| Seguimiento de cotizaciones/ventas/pedidos | `quotes:read`, `erpSales:read`, `stockRequests:read` con alcance `team` | **IP** DISENO-COMERCIAL:118-120 |
| Agenda del equipo y asignación | `activities:read`, `activities:assign` (+ `activities:complete` ajena **solo** con acción específica) | **IP** DISENO-COMERCIAL:120,186 |
| Seguimiento de metas | `targets:read` con alcance `team` | **IP** DISENO-COMERCIAL:121 |

### 3.3 Comercial — hijo Gestión comercial (PROP)

| Apartado | Acciones (ID propuesto) | Nota |
|---|---|---|
| Cartera | `customers:reassign` (con `customers:read`) | **IP** DISENO-COMERCIAL:188; «cambiar responsable no puede enviarse bajo una edición de contacto» |
| Metas | `targets:edit` | **IP** DISENO-COMERCIAL:181 |
| Avisos internos | `commercialPromotions:create|edit|publish|withdraw` | **IP** DISENO-COMERCIAL:131,187; «el módulo actual publica al crear» |
| Excel «Pedidos» | `stockRequests:import`, `stockRequests:export` | **IP** DISENO-COMERCIAL:192; «no reutilizar `products:import`»; **bloqueado** por formato del Excel (§11 B2) |
| Parámetros comerciales | `commercialSettings:read`, `commercialSettings:edit` | **IP** DISENO-COMERCIAL:193 |

### 3.4 Catálogo y precios — hijos (PROP, IP DISENO-CATALOGO §9)

| Hijo | Acciones seleccionables (resumen del árbol del diseño) |
|---|---|
| Gestor de listas | Consultar/Crear/Editar/Duplicar listas; Vincular/Retirar productos; Consultar/Editar precios; Previsualizar/Aplicar importaciones; Aplicar actualización pública de precios; Exportar/Consultar historial; Archivar/Restaurar/Eliminar |
| Gestor de Biblioteca | Consultar/Crear/Editar productos; Gestionar imágenes/documentos/firmware; Leer/Editar/Exportar notas; Administrar marcas/categorías; Rellenar/Administrar atributos; Validar/Consultar informes; Importar/Exportar; Archivar/Restaurar/Eliminar |
| Publicador de catálogo | Consultar borradores y vista previa; Validar/Publicar revisiones; Retirar publicación; Programar/Cancelar publicación |
| Supervisor de catálogo y precios | Consultar trabajo del equipo, incidencias/publicaciones, historial y resultados (solo lectura) |

**IP** DISENO-CATALOGO:308: los IDs actuales `products:*`, `listas:*`, `prices:*` «se conservan donde representen exactamente la misma acción»; las acciones nuevas (validación, exportación completa, historial limitado, aplicación de precios) requieren «IDs estables y matriz de migración antes de habilitarse», sin alias que concedan edición global.

### 3.5 Fuente de catálogo disponible con IDs distintos (OBS — worktree UA, no aplicado en S3)

`.claude/worktrees/user-action-access/src/backend/src/common/security/access-catalog.ts` (226 líneas, commit `1aff701`) define acciones con IDs con punto (`commercial.customers.view`, `catalog.products.publish`, `imports.products.preview`, etc.), dependencias, `allowedScopes` (`own|team|list|product|global`), `reserved` y eventos; **todas las entradas están con `enabled: false`** (línea 63: `enabled: false`). El informe de ese worktree declara **IP-UA** «94 acciones con IDs estables» (`docs/access/implementation-progress.md:8`). **No existe en S3** (**OBS** §10). **PROP:** mapear esas entradas al formato `apartado:acción` de §3 antes de habilitarlas; el mapeo no se materializa aquí (dueño: BASE-04/COM-01, §11 D2).

## 4. Paquetes que muestran sus acciones (PROP)

| Regla (fuente) | Qué fija este contrato |
|---|---|
| Asignar un apartado **no concede todas sus acciones** (IP PANELES:15) | El selector de paquete despliega las acciones de §3/§4 con casilla individual |
| «Los paquetes o plantillas, si se usan, deben mostrar las acciones concretas que asignan» (IP PANELES:32) | Cada paquete declara su lista de acciones y su versión antes de guardar |
| Ejemplo Ana/Luis: publicar no concede editar ni eliminar (IP PANELES:17) | Acciones de publicación siempre separadas de edición/eliminación en ambos paneles |
| Mi resumen y Agenda y tareas quedan **fuera** de los paquetes (ficha regla 3; IP DISENO-COMERCIAL:21) | Los hijos listan esas herramientas como entrada de información, no como pestaña duplicada |
| Dos personas con el mismo cargo con selecciones distintas (IP PANELES:3) | Caso de prueba §6.1 |

**Paquetes que este contrato declara mostrar (PROP):** Comercial → `Vendedor`, `Supervisor comercial`, `Gestión comercial` (IP DISENO-COMERCIAL:23-61); Catálogo y precios → `Gestor de listas`, `Gestor de Biblioteca`, `Publicador de catálogo`, `Supervisor de catálogo y precios` (IP DISENO-CATALOGO:273-302). «Mostrar una función en este diseño no la hace asignable antes de implementarla y verificarla» (IP DISENO-COMERCIAL:19).

## 5. Concesiones independientes (PROP)

1. **Editar propios ≠ editar equipo.** Caso del diseño: Ana con Vendedor (editar sus clientes) y Supervisor (leer equipo) **puede leer el equipo pero solo editar sus propios clientes**, salvo edición de equipo concedida aparte (IP DISENO-COMERCIAL:138). El alcance se asocia «a cada concesión/herramienta y acción, no sumar primero todas las acciones y después aplicar un alcance global más amplio» (IP DISENO-COMERCIAL:140).
2. **Dos asignaciones del mismo permiso.** «Si dos asignaciones conceden el mismo permiso, retirar una conserva el permiso mientras la otra siga vigente» (IP PANELES:31). **OBS — hoy no sostenible en S3:** `UserPermission` tiene `@@unique([userId, permission])` (`schema.prisma:462`) y `UserPermissionsService.replaceForUser` borra todas las concesiones y las recrea en bloque (`user-permissions.service.ts:99-111`); no existe procedencia de varias fuentes. Registrarlo como deuda (§11 D4), no como implementado.
3. **Sin dependencias globales silenciosas.** «Si editar requiere ver, la pantalla lo explica. Nunca se agregan permisos amplios de forma silenciosa» (IP PANELES:29): las dependencias (`edit` → `view`) se declaran visibles en el selector y se comprueban en servidor.
4. **Concesiones de alcance restringidas hoy (OBS).** `user-permissions.service.ts:21` solo admite `GRANTABLE_PREFIXES = ['dashboard:pack:', 'dashboard:block:']` («reparte visibilidad, no capacidades»). Las acciones de §3 **no** son concedibles por esa vía en S3: se requiere la superficie nueva de BASE-04/COM-01.
5. **Herramientas personales.** Mi resumen y Agenda y tareas: sin asignaciones no muestran datos administrativos y no habilitan administrar cuentas ajenas (IP PANELES:24).

## 6. Casos de paquete de la ficha (obligatorios)

| # | Caso (ficha, textual) | Contrato previsto (PROP) | Estado observado |
|---|---|---|---|
| 6.1 | «Mismo cargo con dos asignaciones distintas.» | Dos usuarios con el mismo rol reciben selecciones de acciones distintas; el selector guarda paquete+versión+acción+alcance por persona | **OBS:** `auth.service.ts:67-91` une permisos de roles + concesiones al hacer login; no existe selector de acciones en S3 (**IP** COMPARACION:117-119) |
| 6.2 | «Retirar una concesión conserva otra vigente del mismo permiso.» | Retiro por fuente: solo se elimina la fila de esa fuente; el permiso persiste mientras otra fuente lo conceda, con su alcance | **OBS:** restricción única por usuario/permiso y `replaceForUser` global (§5.2) — **gap**, no implementado |
| 6.3 | «Revocación con JWT anterior y usuario sin paneles; ninguna dependencia global silenciosa.» | Tras revocar, la siguiente petición con el JWT anterior queda denegada; un usuario sin paneles ve «Sin paneles asignados»; ninguna ruta hereda permiso amplio sin declaración | **OBS:** el JWT porta `roles`/`permissions` congelados en login (`jwt.strategy.ts:65-71`, `auth.service.ts:91`); las sesiones se pueden revocar por `jti` (`session.service.ts:55-68`) y `revokeAllForUser` existe (`session.service.ts:89`), pero **solo** se invoca ante cambio de contraseña/roles/desactivación (`users.service.ts:208-215`) o cierre desde auth; un cambio de concesiones **no** corta sesiones hoy |

## 7. Errores, alcance y pruebas que se fijan antes de implementar (PROP)

**Semántica de error propuesta:**

| Código | Cuándo | Base |
|---|---|---|
| 401 | Sin JWT, token de MFA o sesión revocada | **OBS** `jwt.strategy.ts:62,68` |
| 403 | Acción no concedida o fuera del alcance, con recurso existente | **OBS** patrón `acl.service.ts:207-208` (nivel insuficiente) |
| 404 | Recurso ajeno/no autorizado cuando su existencia no debe revelarse | **OBS** `acl.service.ts:203-205` («se oculta la existencia») |
| 409 | Conflicto de versión/concurrencia y reintento que no duplica | **OBS** patrón UA `access-assignment.service.ts:56,80,93` (`access-version-conflict`, `idempotency-conflict`) — worktree UA, no aplicado en S3 |
| 400 | Entrada inválida (campos, dependencias de acción) | **PROP** |

**Alcance (PROP):** `own`, `team`, `list`, `product`, `global` (nombres tomados del catálogo UA, **OBS** `access-catalog.ts:1`); en S3 hoy el alcance por Lista se resuelve con niveles `view → view_prices → edit_prices → edit_products → manage → manage_access` (**OBS** `acl.service.ts:19-33`) y el equipo con `HierarchyService.getSubordinateIds` (**OBS** `workflow.service.ts:14`). El contrato exige alcance **por concesión** (§5.1), no un alcance global tras sumar acciones.

**Pruebas previstas (no ejecutadas en este paso):**

- API permitida/denegada por acción y alcance (matriz acción × usuario × alcance).
- Dos usuarios del mismo rol con acciones distintas (§6.1).
- Retiro por fuente conserva la otra fuente (§6.2); revocación con JWT anterior y sin relogin (§6.3).
- Usuario sin asignaciones: sin datos por menú, URL directa, API, descarga ni dashboard (IP PANELES:63).
- Publicar/ editar/ eliminar comprobados por separado (IP PANELES:67).
- Auditoría de concesión/retiro con actor, momento y motivo (IP PANELES:45).
- Comandos de paquete: `npm test` (backend, jest) y `npm run test` (frontend, vitest), **no ejecutados aquí**.

## 8. Dependencias y migración explícitas (PROP)

| Elemento | Dependencia | Migración prevista |
|---|---|---|
| Catálogo de acciones (§3) | BASE-04 `backend` (escribe `access-catalog.ts` y spec según ficha) | Mapeo de IDs UA `área.sección.acción` → `apartado:acción` con matriz de migración (**IP** DISENO-CATALOGO:308); sin alias heredados |
| Concesiones con procedencia (§5.2) | BASE-04 `backend` (esquema: `schema.prisma`, `migrations/**`) | **OBS:** S3 **no** tiene modelos `AccessState/AccessSource/AccessGrant/AccessOperation` (`rg -c "^model Access"` → 0); el worktree UA sí (`schema.prisma:450-495`) con migración `20261008000100_add_user_action_access` **ausente en S3**. Reconciliar versiones antes de migrar (IP BASE-01 §9.1) |
| Revocación efectiva con JWT anterior (§6.3) | BASE-04 `backend` (`jwt.strategy.ts`, `user-permissions.service.ts`) | Definir si el cambio de concesiones revoca sesiones (`revokeAllForUser`) o revalida permisos por petición; hoy ninguna de las dos rutas se activa al conceder/retirar (**OBS** §6.3) |
| Paquetes con versión | COM-01 (`access-assignments.service.ts`, `schema.prisma`) | Guardar paquete, versión, acciones, alcance y ajustes personales (**IP** DISENO-COMERCIAL:142) |
| Vendedor/Supervisor/Gestión y Catálogo | COM-01 y paquetes CAT/COM posteriores (§9) | Navegación según acciones individuales; el rol deja de conceder acceso operativo (**IP** PANELES:25) |

**Sin migración en este paso:** la ficha prohíbe crear permisos nuevos o modificar usuarios (§1, regla 2). Las migraciones anteriores son **previstas**, no aplicadas.

## 9. Incrementos de implementación posteriores (registrados antes de delegar código)

Todos los datos de la tabla provienen de las fichas (`node docs/ejecucion-paneles/preparar-tanda.mjs <ID> contrato|<paso>`). **Aceptación de todos los pasos `contrato` (textual, idéntica):** «Contrato consistente con dependencias y decisiones pendientes explícitas.» + «Todos los incrementos están registrados con objetivo, archivos y aceptación propios antes de delegar código.» La columna «Aceptación (paso de implementación)» reproduce la ficha del primer paso de implementación de cada paquete. `QA-01` no aparece: el preparador lo reserva al coordinador (**OBS**: `preparar-tanda.mjs QA-01` → «La auditoría final está reservada al coordinador.»).

| Incremento | Depende de | Objetivo (ficha) | Archivos (ficha, paso de implementación) | Aceptación (paso de implementación) |
|---|---|---|---|---|
| BASE-04 `backend` | BASE-02 | Cerrar concesiones/esquema/contexto por acción, compatibilidad y migración local | `security/data-scope.ts`, `security/access-assignments.service.ts`, `security/live-admin-identity.service.ts`, `security/user-permissions.service.ts`, `security/access-catalog.ts`, `acl/acl.service.ts`, `auth/jwt.strategy.ts`, `users/dto/assign-access.dto.ts` + specs, `schema.prisma`, `migrations/**` | Resolver devuelve lectura de equipo y edición propia para acciones distintas; denegación HTTP al editar compañero se acredita después en COM-02/COM-03 · retiro conserva otra concesión y el retiro total afecta JWT anterior · scope del navegador no sustituye concesiones del servidor |
| BASE-03 (6 pasos) | BASE-01, BASE-02 | Recuperar contrato de agenda S3 y separar funciones propias/de equipo | `modules/team-workflow/**`, `schema.prisma`, `migrations/**`, `app.module.ts`, `access-catalog.ts`; frontend `features/agenda/**`, `services/agenda.service.ts`, `App.tsx`, `AdminLayout.tsx` | Ver §9.1 |
| IMP-01 | BASE-01 | Verificación real del preview local y sus límites con PostgreSQL desechable | `modules/prices/import/price-import.postgres.spec.ts`, `scripts/verify-price-preview.cjs` | Precios anteriores desde Prisma real sin escrituras de negocio · lista ajena/restricción/revocación rechazan datos · tarifas y decimales reales producen el mismo comparador |
| IMP-02 | BASE-02, IMP-01 | Descarga de plantilla vacía o con referencias autorizadas; selección de tarifas | `modules/prices/import/**`, `access-catalog.ts` + spec | XLSX descargado aceptado por el preview sin modificar hojas · sin referencias/precios de otra lista · `ORO_IVA` no se sustituye |
| IMP-03 | BASE-02, IMP-01 | Unificar límite numérico, redondeo y validación de COP | `modules/prices/**`, `products/dto/price-input.dto.ts` + spec, `common/money/**` | Mismo valor aceptado/redondeado igual por API manual y plantilla · 0,49/0,50/negativos/límite · históricos conservan importes |
| IMP-04 | IMP-03 | Modelo de revisión de precios recuperable (archivo, filas, versiones) | `schema.prisma`, `migrations/**`, `modules/prices/import/**`, `access-catalog.ts` + spec | Índices/relaciones/retención auditados; migrar/revertir preserva `Price` e identidad |
| IMP-05 | IMP-04, CAT-01 | Transacción, concurrencia, idempotencia y permiso separado de aplicar | `modules/prices/import/**`, `schema.prisma`, `migrations/**`, `access-catalog.ts` + spec | Cambio concurrente/otra lista/fallo intermedio no deja escritura parcial |
| IMP-06 | IMP-05, IMP-02 | Comparador persistido, confirmación y resultado por fila en pantalla | `modules/prices/import/**`, `access-catalog.ts` + spec | Recorrido de navegador completo · doble clic no duplica · usuario de listas opera sin Biblioteca |
| IMP-07 | IMP-06 | Perfiles de proveedor completos sin volver al mapeo obligatorio | `modules/prices/import/**`, `schema.prisma`, `migrations/**`, `access-catalog.ts` + spec | Proveedor repetido no pide mapear · encabezado cambiado no carga · exportar solo datos autorizados |
| CAT-01 | BASE-02 | Duplicar/archivar/desvincular/eliminar sin perder fichas | `modules/listas/**`, `products/import/pipeline/batch-executor.service.ts` + spec, `schema.prisma`, `migrations/**`, `access-catalog.ts` + spec | Conserva identidad/medios/históricos · carga a otra lista no mueve producto · concurrencia preserva unicidad |
| CAT-02 | CAT-01 | Snapshot de borrador/versión pública y lectura pública compatible | `schema.prisma`, `migrations/**`, `modules/products/**`, `storefront/storefront.service.ts` + spec | Backfill preserva IDs/datos/medios con recuperación probada |
| CAT-03 | CAT-02 | Apartados de la ficha (Información general, Identidad, Destacados, Características, Especificaciones, Notas, Atributos) | `modules/products/**` | Notas privadas, campos sin duplicar, edición no publica |
| CAT-04 | CAT-02 | Activos por revisión: imágenes, documentos y firmware | `modules/files/**`, `modules/products/**`, `schema.prisma`, `migrations/**` | Medio privado inaccesible; no elimina bytes referenciados por otras revisiones |
| CAT-05 | CAT-03, CAT-04 | Reglas por categoría y validación individual/selección | `products/validation/**`, `products.service.ts` + spec, `schema.prisma`, `migrations/**`, `access-catalog.ts` + spec, `products.module/controller` + specs | PDF ausente solo aviso; campos/precio/imagen según contrato |
| CAT-06 | CAT-05 | Bandeja Pendientes/Con problemas/Publicados/Historial y scheduler | `modules/products/**`, `schema.prisma`, `migrations/**`, `access-catalog.ts` + spec | Programación publica la revisión programada · cambio previo obliga a recomprobar · fallo no deja mezcla; editor sin publicar no publica |
| CAT-07 | IMP-04, CAT-05 | Trabajador PostgreSQL, checkpoints, reintentos y estadísticas | `schema.prisma`, `migrations/**`, `modules/catalog-jobs/**`, `app.module.ts` + spec, `access-catalog.ts` + spec | Reinicio recupera checkpoint sin duplicar · revocación impide ejecución · filtro cubre todo el alcance |
| CAT-08 | CAT-04, CAT-07 | Paquete ZIP con selección de productos/apartados y manifiesto | `modules/library-packages/**`, `schema.prisma`, `migrations/**`, `app.module.ts` + spec, `access-catalog.ts` + spec | Medios y hash correctos · medio faltante = resultado parcial · ZIP/descarga expirable/alcance impiden datos ajenos |
| CAT-09 | CAT-08 | Reimportación del mismo formato conservando apartados omitidos | `modules/library-packages/**` | Ida y vuelta en base desechable · rutas peligrosas/ZIP excesivo/hash malo no aplican · conflicto o revocación trazables |
| COM-01 | BASE-04 | Paquetes/versiones y navegación según acciones individuales | `security/access-assignments.service.ts` + spec, `access-catalog.ts` + spec, `schema.prisma`, `migrations/**` | Dos vendedores mismo rol con acciones distintas · sin paquetes no hay datos internos · revocar actualiza navegación y API sin cerrar sesión |
| COM-02 | COM-01 | Contactos/notas, responsable, estado y alcances propios/equipo | `commercial/customers/**`, `access-catalog.ts` + spec | Petición con `ownerId` no reasigna · lectura equipo no concede editar equipo · responsable/actor/antes-después trazados |
| COM-03 | COM-01 | Líneas, cantidades, estados y regla de descuentos | `commercial/quotes/**`, `access-catalog.ts` + spec | Editar cantidad no introduce descuento no autorizado · producto/tarifa ajeno rechazado · ganada conserva pedido idempotente |
| COM-04 | COM-01 | Metas por integrante/periodo con responsables de cambios | `commercial/sales-targets/**` | Lector no escribe; editor no cambia ajenos · sin duplicar objetivo ni auditoría · recargar conserva cambios |
| COM-05 | COM-01, COM-04 | Resumen e indicadores con fuente visible | `modules/dashboard/**` | Ganada sin factura no sube facturación real · sin mezclar datos ajenos · sin fuente no aparece un cero simulado |
| COM-06 | COM-01 | Solicitudes propias/equipo, estados y contrato Excel saneado | `commercial/stock-requests/**`, `schema.prisma`, `migrations/**`, `app.module.ts` + spec, `access-catalog.ts` + spec | Sin venta/factura/reserva; alta/actualización/cancelación autorizadas |
| COM-07 | COM-01 | Adaptador ERP: vendedores, facturas, anulaciones y sincronización | `commercial/erp-sales/**`, `schema.prisma`, `migrations/**`, `app.module.ts` + spec, `access-catalog.ts` + spec, `dashboard/**`, `sales-targets/**` | Reintentos/anulaciones no duplican; error no inventa venta |
| COM-08 | BASE-01, BASE-02, COM-01 | Recuperar promociones S3 y separar preparar/publicar/audiencia | `modules/promotions/**`, `schema.prisma`, `migrations/**`, `app.module.ts` + spec, `access-catalog.ts` + spec | Aviso vencido/de otro equipo no aparece · editor sin publicar no activa · aviso interno no cambia slider ni precios |
| COM-09 | COM-03, IMP-03 | Límites, condiciones, acciones y auditoría de descuentos | `commercial/quotes/**`, `access-catalog.ts` + spec | Sin permiso no acepta descuento por API · fuera de límite se rechaza · gestionar límites no concede cartera global |

### 9.1 BASE-03 (detalle de sus seis incrementos, ficha)

| Paso | Objetivo (ficha) | Aceptación (ficha) |
|---|---|---|
| `backend-propias` | Integrar actividades propias e historial del contrato S3 reconciliado | Leer/crear/completar propias; ID ajeno denegado; reintento no duplica |
| `frontend-propias` | Conectar una Agenda personal única e historial | Crear/completar/recargar conserva actividades sin entradas duplicadas por panel |
| `backend-equipo` | Añadir consulta/asignación de equipo con concesiones distintas | Fuera del equipo se rechaza; asignar no concede completar ajenas |
| `frontend-equipo` | Conectar consulta/asignación de equipo según permiso | Solo Agenda propia no muestra equipo; botones y API concuerdan |
| `backend-vinculos` | Proteger recursos enlazados y conversión explícita de incidencias en tareas | Revocación oculta detalles; conversión explícita deduplica producto+regla+revisión |
| `frontend-vinculos` | Mostrar enlaces/tareas relacionadas con acceso vigente | Un enlace no revela recurso ajeno ni concede permisos |

**OBS (fichas):** los seis pasos de implementación de BASE-03 (no el paso `contrato`) declaran `requiredDecisions: ["agenda-base"]`; `estado.json.decisions` está vacío (**OBS** lectura: `{}`), por lo que esa decisión sigue **pendiente** (§11 D7). Ningún paquete declara `dependsOn: BASE-03` (**OBS** recorrido de las 30 fichas).

## 10. Fuentes leídas con estado

### 10.1 readPaths de la ficha

| readPath (ficha) | Estado | Pieza disponible que lo respalda |
|---|---|---|
| `src/backend/src/common/security/access-catalog.ts` | **DESC en S3 / OBS en worktree UA** — no existe en S3; existe en `.claude/worktrees/user-action-access/` (226 líneas, commit `1aff701`, «worktree UA, no aplicado en S3») | Lectura completa de esa copia: IDs, scopes, dependencias, `enabled:false` |
| `src/backend/src/common/security/access-assignments.service.ts` | **DESC** — no existe ni en S3 ni en UA (nombre en plural) | Sustituto **parcial**: UA `access-assignment.service.ts` (singular, 118 líneas): `replaceSource` transaccional con OCC, fuentes y auditoría |
| `src/backend/src/common/security/data-scope.ts` | **DESC** — ausente en S3 y en UA | **Sin sustituto equivalente.** Piezas que cubren partes: S3 `acl/acl.service.ts` (alcance por Lista) y UA `access-policy.service.ts` (cálculo puro de acción y alcance) |
| `src/backend/src/modules/users/dto/assign-access.dto.ts` | **DESC** — ausente en S3 y en UA | Sustituto **parcial**: UA `access-assignment.contract.ts` y `access-assignment.validation.ts` (`normalizeAssignmentInput`, `validateAssignmentSelection`) |
| `src/frontend/src/features/users/components/UserAccessAssignments.tsx` | **DESC** — ausente en S3 y en UA | Sustituto **parcial**: S3 `features/users/components/DashboardGrants.tsx` (selector paquetes/bloques de dashboard, visibilidad) |

### 10.2 Otras fuentes leídas

| Fuente | Marca | Aporte |
|---|---|---|
| `docs/PANELES-Y-PERMISOS.md` (70 líneas) | **IP** (acuerdo de producto 2026-10-08) | Reglas acordadas, nombres de acciones, auditoría, verificación prevista |
| `docs/DISENO-PANEL-COMERCIAL-2026-10-13.md` (231) | **IP** | Árbol de hijos, acciones existentes/nuevas, ejemplo de alcance, checklist |
| `docs/DISENO-PANEL-CATALOGO-Y-PRECIOS-2026-10-14.md` (427) | **IP** | Paquetes de Catálogo y precios (§9), reglas de IDs y migración (:308) |
| `docs/COMPARACION-10-PANELES-2026-10-13.md` (164) | **IP** | Estado de usuarios/accesos en S3/L (:115-125) |
| `docs/ejecucion-paneles/contratos/BASE-01.md` (171) | **OBS/IP** | Inventario base, deudas D1-D9 (§8-9) |
| `src/backend/src/common/guards/permissions.guard.ts` (68) | **OBS** | Sin metadatos → permite; exime Super Admin (:60); alias legacy `publish:manage` (:21) |
| `src/backend/src/common/security/user-permissions.service.ts` (142) | **OBS** | Concesiones limitadas a `dashboard:*`; `replaceForUser` global; auditoría `grant-dashboard-permissions` |
| `src/backend/prisma/schema.prisma:451-465` | **OBS** | `UserPermission` único por usuario/permiso; sin procedencia |
| `src/backend/src/modules/auth/auth.service.ts:67-91`, `jwt.strategy.ts:65-71` | **OBS** | Permisos congelados en el JWT al iniciar sesión |
| `src/backend/src/common/security/session.service.ts:55-105`, `users/users.service.ts:208-215` | **OBS** | Revocación por `jti`; `revokeAllForUser` solo en contraseña/roles/desactivación |
| `src/backend/src/common/acl/acl.service.ts` (407) | **OBS** | Niveles por Lista, Super Admin/Admin Comercial, 404 para ocultar existencia |
| UA `docs/access/implementation-progress.md`, `openspec/.../tasks.md` | **IP-UA** | «6 de 35 tareas» en el informe (2026-10-08); commit `1aff701` declara «8/35»; núcleo sin provider ni guards |
| `docs/ejecucion-paneles/TANDA-COMPLETA.md`, `README.md`, `IMPLEMENTADOR.md` | **OBS** | Modalidad, límites del paso de contrato y prohibición de editar `estado.json` |

### 10.3 Fuentes faltantes documentadas (bloqueo, no licencia para reimplementar)

Los cinco readPaths de la ficha (§10.1) **no están completos en S3 ni en el worktree UA**: tres son ausentes en ambos (`data-scope.ts`, `assign-access.dto.ts`, `UserAccessAssignments.tsx`), uno existe solo en UA (`access-catalog.ts`) y uno existe en UA con otro nombre (`access-assignment.service.ts` singular). **Este contrato no reimplementa su contenido**: registra qué pieza disponible lo respalda y deja la incorporación a BASE-04/COM-01 con decisión del coordinador (§11 D2).

## 11. Decisiones pendientes y bloqueos externos

| # | Decisión o bloqueo | Afecta a | Estado |
|---|---|---|---|
| D1 | Trasladar el preview de precios desde L o reimplementarlo en S3 (BASE-01 §9 D1) | IMP-01…IMP-06 | **Pendiente — coordinador.** **OBS propio de esta tanda:** en la copia de revisión `gs-tanda-01` (API en `127.0.0.1:3001`, `GET /api/health` → 200), `POST /api/prices/import/preview` responde **404** (módulo de preview de precios ausente); como contraste, `POST /api/products/import/preview` devuelve **401** (ruta existente tras el guard) |
| D2 | Incorporar `access-catalog.ts`/catálogo UA (IDs con punto, `enabled:false`) vs. catálogo propio en formato `apartado:acción` de §3 | BASE-04, COM-01, este contrato | **Pendiente — coordinador** (BASE-01 §9 D2); las skills `gs-access-*` citadas por los encargos **no se hallaron** en este repo (BASE-01 §9 D8) |
| D3 | Procedencia de concesiones de varios paquetes: `UserPermission` no la conserva | §5.2, COM-01 | **Pendiente** (BASE-01 §9 D4) |
| B1 | **Yéminus:** sin contrato/API ni datos de integración reales | `erpSales:read`, COM-05, COM-07 | **Bloqueo externo** (TANDA-COMPLETA:32; DISENO-COMERCIAL:13) |
| B2 | **Excel «Pedidos»:** formato saneado pendiente | `stockRequests:import/export`, COM-06 | **Bloqueo externo** (TANDA-COMPLETA:32) |
| B3 | **Descuentos:** reglas comerciales (límite, condiciones) sin decidir; el código solo valida 0-100 | `quotes:discount`, COM-03, COM-09 | **Bloqueo externo** (DISENO-COMERCIAL:81) |
| B4 | **Preview de precios** (lo mismo que D1, como bloqueo de IMP) | IMP-01 | **Bloqueo documentado**, ver D1 |
| D5 | Segundo `@Controller('api/listas')` en `products.controller.ts:319` sin verificar en runtime (BASE-01 §9 D9) | Catálogo/rutas de Listas | **DESC** |
| D6 | Cómo hacer descriptivos a los roles sin romper `RolesGuard` en 14 controllers | todos los hijos | **Pendiente** (IP PANELES:25; **OBS** `@Roles` en `workflow.controller.ts` y demás) |

## 12. Criterios de aceptación del paso (ficha, textuales)

1. «Contrato consistente con dependencias y decisiones pendientes explícitas.»
2. «Todos los incrementos están registrados con objetivo, archivos y aceptación propios antes de delegar código.»

**Autoevaluación de esta entrega (PROP, no sustituye la auditoría):** §1 cubre dependencias; §9 registra los 27 incrementos posteriores con objetivo, archivos y aceptación; §11 enumera decisiones pendientes y bloqueos (D1-D6, B1-B4).

## 13. Límites, pruebas previstas y evidencia reproducible

- **Ejecutado aquí:** solo escritura documental y lecturas. No se modificó ninguna ruta fuera de `docs/ejecucion-paneles/contratos/`; la firma de `git status --porcelain` se reporta junto con la entrega.
- **No ejecutado (y no acreditado):** suites jest/vitest, levantamiento de la aplicación, llamadas HTTP con permisos, pruebas con PostgreSQL desechable, recorrido de navegador, consulta de usuarios/credenciales. La única llamada HTTP fue la comprobación de ausencia de rutas de §11 D1 (sin credenciales y sin efectos).
- **Pruebas previstas para pasos posteriores (no son evidencia todavía):** §7.

Comandos usados (solo lectura, desde la raíz del repo):

```bash
git status --porcelain; git rev-parse HEAD
node docs/ejecucion-paneles/preparar-tanda.mjs --list
node docs/ejecucion-paneles/preparar-tanda.mjs BASE-02 contrato
for id in BASE-03 BASE-04 IMP-01..IMP-07 CAT-01..CAT-09 COM-01..COM-09; do node docs/ejecucion-paneles/preparar-tanda.mjs $id contrato; done
node --test docs/ejecucion-paneles/preparar-tanda.test.mjs      # 4/4 pass
rg -n "@Permissions\(" src/backend/src
rg -n "model UserPermission \{" -A 14 src/backend/prisma/schema.prisma
rg -n "GRANTABLE_PREFIXES|replaceForUser" src/backend/src/common/security/user-permissions.service.ts
rg -n "revokeAllForUser" src/backend/src
rg -c "^model Access" src/backend/prisma/schema.prisma          # 0 en S3
test -f src/backend/src/common/security/access-catalog.ts || echo MISSING   # MISSING en S3
ls .claude/worktrees/user-action-access/src/backend/src/common/security/    # fuente UA
curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:3001/api/prices/import/preview   # 404
```

## 14. Riesgos de esta base

- Quedarse con el formato de IDs de un solo origen (S3 `:` o UA `.`) sin matriz de migración rompería concesiones ya guardadas o concedería de más por herencia de alias (IP DISENO-CATALOGO:308).
- Asumir que «retirar una concesión conserva otra» está cubierto por `replaceForUser` sería falso: hoy el reemplazo global y la unicidad lo impiden (§5.2).
- Publicar el selector de paquetes sin probar revocación con JWT anterior dejaría accesos abiertos hasta el próximo login (§6.3).
- Tratar las acciones de §3 como asignables hoy sería incorrecto: ninguna pasa por `PermissionsGuard` salvo las rutas ya decoradas en S3 (**OBS** §3).
