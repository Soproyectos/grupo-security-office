<!-- Plantilla: .claude/skills/gs-disenador-web/assets/reporte-traspaso.md -->

# Traspaso: notas internas como lista de notas

- **Tema:** Notas internas del producto como varias notas, cada una con autor y fecha
- **Fecha:** 2026-10-28
- **Pantalla / ruta:** `/commercial/library/update/products/:productId#seccion-notas-internas` (`ProductInternalNotes.tsx`)
- **Estado:** `respondido` (contrato implementado y probado con simulaciones; la migración SQL NO se ha aplicado a ninguna base ni probado en PostgreSQL real, ver «Lo que no se pudo hacer»)
- **Sesión que lo pide:** Biblioteca de productos restructuración (feedback del usuario vía Agentation)

## 1. Lo que pide el diseño

**Qué verá y hará la persona** (decidido por el usuario el 2026-10-28):

- Ve todas las notas del producto, escritas por cualquier usuario con acceso a las notas, la más reciente arriba.
- Cada nota va en su propio cuadro, claramente separado del fondo, con el nombre de quien la escribió y la fecha.
- Un botón «Escribir nota» (primario, con verbo y objeto, tamaño táctil de 44px, en un lugar fijo y visible) abre un campo para redactar. Al guardar, la nota aparece al inicio de la lista.
- Solo quien escribió una nota puede editarla; las demás personas la ven sin botón de edición.
- Las notas son privadas: nunca se ven en la tienda ni en el portal de clientes.

**Hoy:** el producto guarda un solo texto (`internalNotes` dentro de la ficha). La pantalla ya muestra ese texto primero y un botón «Editar notas»/«Escribir nota». Con una lista real se reemplazaría ese texto único.

**Datos que necesita la pantalla:**

| Campo | Tipo | Ejemplo |
|---|---|---|
| id | texto | `n-123` |
| text | texto (límite actual de `LIMITS.internalNotes`) | `Proveedor confirmó stock para noviembre` |
| authorName | texto | `Laura Pérez` |
| createdAt | fecha ISO | `2026-10-28T14:11:00Z` |
| updatedAt | fecha ISO o nulo | `null` |
| canEdit | booleano (verdadero solo para el autor; el servidor lo calcula) | `true` |

**Acciones y quién puede hacerlas:**

| Acción | Quién puede | Permiso técnico |
|---|---|---|
| Ver la lista de notas | Quien edita fichas y tiene notas | `products:write` + `products:notes` (igual que hoy) |
| Escribir una nota | Igual | `products:write` + `products:notes` |
| Editar una nota | Solo quien la escribió (ni siquiera un administrador) | `products:notes` + ser el autor; lo impone el servidor |

**Estados y mensajes de error esperados** (texto exacto en español):

- Cargando: «Cargando notas internas…»
- Vacío: «Aún no hay notas para este producto.»
- Error: «No se pudieron cargar las notas internas.» / «No se pudo guardar la nota.»
- Sin permiso: «No tienes acceso a las notas internas.»

**Restricciones:**

- Conservar el texto actual: migrar `internalNotes` a una primera nota (autor «Sistema», fecha de la última edición de la ficha) sin perder información. La migración requiere aprobación del usuario.
- Mantener el control de versión de la ficha (409 por conflicto) o definir uno propio por nota.
- Cada alta o edición queda en el historial (`product-audit`).
- Borrar notas no se pidió: queda fuera hasta que el usuario lo decida.

**Captura o ruta de referencia:** `src/frontend/src/features/products/sheet/ProductInternalNotes.tsx`

## 2. Respuesta de funcionalidad
<!-- Lo completa gs-funcionalidad-web. -->

**Resumen:** las notas pasan de un texto único dentro de la ficha a una lista propia por producto. La ficha (`GET/PUT /api/products/:id/sheet`) **deja de aceptar y de devolver `internalNotes`** (mandarlo en el PUT ahora da 400, porque el servidor rechaza campos desconocidos). Tres rutas nuevas sirven la lista. Todas exigen **las dos** concesiones globales de panel `products:write` **y** `products:notes` (igual que hoy para ver/guardar notas y que el historial del producto). Ningún cargo concede nada; Super Admin conserva su excepción de ver y escribir, pero **no** puede editar la nota de otra persona.

### Rutas

Todas con `Authorization: Bearer <JWT>`. Las respuestas exitosas vienen en el sobre `{ "data": ... }`. Los errores traen `statusCode`, `message` (español, listo para mostrar) y, cuando lo define el servicio, `code` (estable).

| Método y ruta | Para qué | Request | Respuesta |
|---|---|---|---|
| `GET /api/products/:id/internal-notes` | Ver todas las notas del producto, la más reciente primero | — | 200, arreglo de notas |
| `POST /api/products/:id/internal-notes` | Escribir una nota | `{ "text": "..." }` | 201, la nota creada |
| `PATCH /api/products/:id/internal-notes/:noteId` | Editar una nota (solo su autor) | `{ "text": "...", "expectedVersion": 0 }` (`expectedVersion` opcional) | 200, la nota editada |

No hay ruta para borrar (no se pidió). El cuerpo solo admite los campos de la tabla; cualquier otro (por ejemplo `authorId`) da 400. La autoría sale siempre de la sesión.

**Reglas del texto:** se recorta (espacios al inicio y al final); no puede quedar vacío; máximo **4000 caracteres** (el límite que ya tenía `internalNotes`).

### Respuesta de ejemplo

`GET /api/products/69ba44ee-7081-475b-8f00-b3220364bee5/internal-notes`

```json
{
  "data": [
    {
      "id": "0b0f6d7e-4d52-4c1e-9d6b-3f3f9d1c7a10",
      "text": "Proveedor confirmó stock para noviembre",
      "authorName": "Laura Pérez",
      "createdAt": "2026-10-28T14:11:00.000Z",
      "updatedAt": null,
      "canEdit": true,
      "version": 0
    },
    {
      "id": "sistema-69ba44ee-7081-475b-8f00-b3220364bee5",
      "text": "Texto que tenía la ficha antes del cambio",
      "authorName": "Sistema",
      "createdAt": "2026-10-02T12:00:00.000Z",
      "updatedAt": null,
      "canEdit": false,
      "version": 0
    }
  ]
}
```

- `updatedAt` es `null` mientras la nota no se haya editado; después trae la fecha de la última edición.
- `canEdit` lo calcula el servidor: verdadero solo si la persona que consulta es la autora. Las notas «Sistema» (migradas) nunca son editables.
- `version` empieza en 0 y sube 1 por edición. Se manda como `expectedVersion` al editar.
- No se devuelve el id interno del autor, solo su nombre.

### Permisos que exige el servidor

| Acción | Servidor |
|---|---|
| Ver / escribir | Concesiones globales `products:write` **y** `products:notes` (guardia de ruta `@RequireGrant` + segunda comprobación en el servicio) |
| Editar | Lo anterior **y** ser el autor de esa nota (comparación por id de usuario) |

**Diferencia con la interfaz:** coincide con lo que la UI usa (`products:write` + `products:notes`, y `canSeeInternalNotes`). Un detalle: la guardia de ruta, cuando falta una concesión, responde 403 con el texto genérico del proyecto («Sin permiso products:write»), sin `code`. El mensaje en español simple y el código `INTERNAL_NOTES_FORBIDDEN` solo salen cuando la comprobación la hace el servicio (p. ej. concesión retirada a mitad de petición). La pantalla debe mostrar su propio texto «No tienes acceso a las notas internas.» ante cualquier 403 de GET/POST. `canSeeInternalNotes` en la ficha se conserva y sigue siendo verdadero solo con `products:notes`.

### Errores

| HTTP | `code` | `message` | Cuándo |
|---|---|---|---|
| 400 | `INTERNAL_NOTE_EMPTY` | Escribe el texto de la nota. | Texto vacío o solo espacios |
| 400 | `INTERNAL_NOTE_TOO_LONG` | La nota no puede superar 4000 caracteres. | Texto recortado de más de 4000 caracteres |
| 400 | (sin `code`) | La nota debe ser un texto / La nota no puede superar 4000 caracteres / mensaje del validador | Falta `text`, no es texto, supera 4000 sin recortar, o el cuerpo trae campos no permitidos |
| 403 | (sin `code`, de la guardia) o `INTERNAL_NOTES_FORBIDDEN` | Sin permiso products:write / No tienes acceso a las notas internas. | Sin `products:write` + `products:notes` (ver nota de arriba) |
| 403 | `INTERNAL_NOTE_NOT_AUTHOR` | Solo quien escribió la nota puede editarla. | Edita alguien que no es el autor (cualquier cargo, Super Admin incluido) o una nota «Sistema» |
| 404 | `INTERNAL_NOTE_PRODUCT_NOT_FOUND` | Producto no encontrado. | El producto no existe |
| 404 | `INTERNAL_NOTE_NOT_FOUND` | La nota no existe. | La nota no existe o es de otro producto |
| 409 | `INTERNAL_NOTE_VERSION_CONFLICT` | La nota cambió mientras la editabas. Recarga las notas antes de volver a guardar. | `expectedVersion` ya no coincide, o dos ediciones simultáneas (el cuerpo trae también `currentVersion`) |

### Concurrencia (decisión)

Una nota tiene un solo autor, así que nadie pisa a otra persona; lo que sí puede pasar es que la misma persona edite en dos pestañas. Cada nota lleva un contador `version`. La escritura es atómica (`UPDATE ... WHERE id AND version = <leída>`): si otra edición ganó, no coincide ninguna fila y responde 409 sin escribir. `expectedVersion` es opcional; sin él, la comprobación atómica protege igual contra la carrera dentro de la petición. **No** se reutiliza `sheetVersion` de la ficha: escribir una nota ya no modifica la ficha, no cambia su versión ni marca la validación como pendiente.

### Cambios de datos

- **Tabla nueva** `product_internal_notes` (modelo `ProductInternalNote`): `id`, `productId` (FK a `products`, `ON DELETE CASCADE`, como las demás tablas de ficha), `authorId` (texto, **anulable, sin FK**), `authorName` (nombre congelado al escribir), `text`, `version`, `createdAt`, `updatedAt`. Índice `(productId, createdAt DESC)`.
- **Decisión sobre el autor:** la biblioteca dedicada no tiene tabla de usuarios (es otra base), y una FK a `users` rompería esa separación y la regla de «una autoridad por dato». Por eso el autor es un id sin FK más el nombre congelado. La migración de datos usa `authorId = NULL` y `authorName = 'Sistema'`, lo que además impide por construcción que nadie edite esas notas. Si un usuario se desactiva o cambia de nombre, la nota conserva el nombre con el que se escribió.
- **Migración de datos** (misma migración SQL): por cada producto con `catalogInternalNotes` no vacío se crea una primera nota «Sistema» con el texto recortado y fecha = `products.updatedAt` (última actualización conocida del producto; la ficha no guarda otra fecha propia). Idempotente: `CREATE TABLE/INDEX IF NOT EXISTS`, FK protegida, y las notas se insertan con id fijo `sistema-<productId>` y `ON CONFLICT DO NOTHING`: correrla otra vez no duplica ni toca notas posteriores.
- **Columna vieja** `products.catalogInternalNotes`: **no se borra**. Queda **obsoleta**: el servicio de la ficha ya no la lee ni la escribe (el PUT de la ficha tampoco la audita) y el paquete de exportación ya no la usa. Se retirará en un paso posterior aprobado. Mientras tanto, otros listados del producto (`GET /api/products`, detalle) aún pueden devolver el campo `catalogInternalNotes` con el texto viejo congelado (filtrado por `products:notes` como antes): la pantalla no debe usarlo.
- **Esquemas:** modelo agregado a `src/backend/prisma/schema.prisma` y a `src/backend/prisma/biblioteca/schema.prisma` (la biblioteca dedicada, hoy sin aprobar para implementar, necesita el mismo contrato de datos porque el código usa ese cliente). Migraciones: `src/backend/prisma/migrations/20261028120000_product_internal_notes` y `src/backend/prisma/biblioteca/migrations/20261028120000_product_internal_notes` (mismo SQL; cada una se aplica solo a su base). `prisma/biblioteca-candidata/` y los snapshots no se tocaron (son históricos del candidato T03).
- **Historial:** cada alta y cada edición escriben en la misma transacción una entrada en el historial del producto. Modo actual (una sola base): `audit_logs` con `entity='Product'`, `entityId=<productId>`, acciones `create_internal_note` / `update_internal_note`, y `newValues`/`oldValues` con `noteId` y `text`. Modo biblioteca dedicada: `library_audit_events` con `PRODUCT_INTERNAL_NOTE_CREATED` / `PRODUCT_INTERNAL_NOTE_UPDATED`. Esas entradas incluyen el texto de la nota, y el historial del producto ya exige `products:write` + `products:notes` (misma barrera). Guardar el mismo texto otra vez no genera cambio ni entrada.
- **Exportación** (`library-packages`, sección «notas»): `notas-privadas.json` pasa de `{ internalNotes, restricted }` a `{ notes: [{ id, text, authorName, createdAt, updatedAt }], restricted: true }`, más reciente primero. Mismo permiso de siempre.

### Consumidores del contrato que cambia (para `gs-disenador-web`; NO editados)

- `src/frontend/src/features/products/sheet/ProductInternalNotes.tsx` (+ `.spec.tsx`): hoy pinta un texto único; pasar a lista con las rutas nuevas.
- `src/frontend/src/features/products/sheet/ProductSheetEditor.tsx` (+ `.spec.tsx`): deja de manejar `internalNotes` dentro del formulario de la ficha.
- `src/frontend/src/features/products/sheet/sheet-form.ts` (+ `.spec.ts`): quitar `internalNotes` del formulario y del cuerpo del PUT (mandarlo ahora da **400**).
- `src/frontend/src/features/products/sheet/sheet.service.ts` (+ `.spec.ts`): `saveInternalNotes` hoy hace PUT de toda la ficha; reemplazar por GET/POST/PATCH de `/internal-notes`; el tipo `ProductSheetApi` pierde `internalNotes` y conserva `canSeeInternalNotes`.
- `src/frontend/src/features/products/sheet/fixtures.ts`, `src/frontend/src/pages/LibraryProductConsultationPage.spec.tsx`, `src/frontend/src/pages/LibraryProductPublicationPage.spec.tsx`: fixtures con `internalNotes`.
- Exportación: quien lea `notas-privadas.json` del paquete de biblioteca (formato nuevo arriba).
- Historial del producto (pantalla de auditoría): aparecerán acciones nuevas `create_internal_note` / `update_internal_note`.

### Pruebas ejecutadas

Todas desde `src/backend`:

- `npx prisma generate` y `node prisma/biblioteca/ejecutar-local.js generate`: regeneran los clientes (local, sin tocar ninguna base). OK.
- `npx tsc --noEmit`: **17 errores, todos previos y ajenos** (en `price-import.service.spec.ts`, `price-template-download.spec.ts`, `price-template.spec.ts` y `products.service.spec.ts`); ninguno en archivos de este cambio. Antes de actualizar `product-sheet.spec.ts` había 5 errores míos (propiedad `internalNotes` retirada), ya corregidos.
- `npx jest src/modules/products/sheet/product-internal-notes`: 2 suites, **47 pruebas pasan** (servicio: permisos, lista ordenada con `canEdit`, texto vacío/largo, alta, el autor edita, otra persona y Super Admin reciben 403, notas «Sistema» no editables, 404, 409 por versión y por carrera, mismo texto sin cambios, modo dedicado; HTTP: guardias, sobre `{data}`, 400/403/404/409, campos no permitidos, sin ruta de borrado).
- `npx jest src/modules/products/sheet`: 2 suites, **75 pruebas pasan** (la ficha ya no devuelve ni escribe `internalNotes`; el DTO lo rechaza).
- `npx jest src/modules/products src/modules/audit src/common/security src/modules/biblioteca-endpoints`: 52 suites pasan (1004 pruebas); **7 suites fallan, todas con «Can't reach database server at localhost:54331»** (necesitan PostgreSQL real): `transition.service.spec`, `products.biblioteca-grants.spec`, `product-revisions.backfill.spec`, `import/pipeline/batch-executor.service.spec`, `data-scope.spec`, `catalog-resource-access.spec`, `access-assignments.service.spec`. No se pudieron ejecutar y no se declaran verdes.

### Lo que no se pudo hacer / no se probó

- La **migración SQL no se ejecutó en ninguna base** ni se probó su sintaxis contra PostgreSQL real; solo se revisó a mano. Es aditiva e idempotente, pero hay que correrla primero en local/QA.
- Ninguna prueba contra PostgreSQL real (SQL de la migración de datos, FK, índice, `updateMany` con `@updatedAt`, transacción con auditoría). Las pruebas usan simulaciones de Prisma.
- El módulo `library-packages` no tiene specs; el cambio a `notas-privadas.json` quedó verificado solo por compilación.
- No se probó el modo `dedicated` contra una base real (solo con simulaciones).
- No se editó el frontend ni se escribió bitácora en `docs/bitacora/`. No se hizo commit ni push.

### Aprobaciones pendientes del usuario

1. **Aplicar la migración `20261028120000_product_internal_notes` a cada base** (local, QA, producción; y a la biblioteca dedicada cuando se apruebe), en ese orden y con respaldo previo. Hasta entonces las tres rutas nuevas fallarán (la tabla no existe).
2. **Retirar después la columna vieja** `products.catalogInternalNotes` en una migración aparte, cuando se compruebe en producción que las notas migradas están completas y que ningún consumidor la lee.
3. Desplegar backend y frontend **juntos**: el backend nuevo rechaza (400) el PUT de la ficha si trae `internalNotes`, y el frontend actual lo manda.

## 3. Integración
<!-- Lo completa gs-disenador-web. -->

**Qué se conectó (2026-10-28):**

- `sheet.service.ts`: `fetchInternalNotes`, `createInternalNote`, `updateInternalNote` (GET/POST/PATCH `/products/:id/internal-notes`) con claves propias `internalNoteKeys.list(productId)`. Se eliminó `saveInternalNotes` (ya no se hace PUT de la ficha para las notas).
- Ficha pública: `internalNotes` salió de `ProductSheetApi`, `ProductSheetPayload`, `SheetForm`, `toForm`, `toPayload` y `validateForm`; el PUT ya no lo manda. El campo «Notas internas (privadas)» y su aviso de «sin permiso» salieron de `ProductSheetEditor.tsx`. `canSeeInternalNotes` se conserva en el tipo.
- `ProductInternalNotes.tsx` reescrito como lista: botón «Escribir nota» fijo arriba (44px), campo «Nueva nota» con contador de 4000 y enfoque automático, cada nota en su cuadro (borde + fondo blanco) con autor, fecha y «Editada», botón «Editar» solo si `canEdit`, edición en el propio cuadro, 409 con «Recargar nota conservando mi texto», 403/404/400 en español sin códigos. Estados: cargando (texto + skeleton), vacío, error con «Reintentar», sin acceso (cualquier 403 del GET). `onDirtyChange` y `blocked` se conservan. Tras crear o editar se invalida la lista y `['product-audit', productId]`.
- Permisos en pantalla: `products:write` + `products:notes`, igual que el servidor (sin diferencia). `LibraryProductEditorPage.tsx` no cambió.

**Validación hecha** (desde `src/frontend`):

- `npx tsc --noEmit`: 0 errores.
- `npx vitest run src/features/products src/pages src/features/catalog-publication`: 37 archivos, 321 pruebas, todas pasan.
- Sin hex nuevos en los archivos nuevos o reescritos.
- Las pruebas son de render en servidor con datos ficticios: lista con autor y fecha, «Escribir nota», «Editar» solo con `canEdit`, vacío, cargando, error, 403, bloqueado, sin permisos, modo edición y traducción de errores.

**Pendientes:**

- No se vio en navegador (no hay sesión): faltan la revisión visual a 375px, 768px y ~1440px y la prueba real de guardar/editar/409 (el flujo con clics no está cubierto por pruebas de render en servidor).
- Depende de aplicar la migración `20261028120000_product_internal_notes` (sin ella las rutas fallan) y de desplegar backend y frontend juntos.
- Estado se deja en `respondido`: falta la comprobación en navegador con backend real antes de marcarlo `integrado`.
