# Traspaso: Biblioteca con tres pestañas independientes

- **Tema:** Productos, Fichas y Precios se asignan por separado o juntas
- **Fecha:** 2026-10-28
- **Pantalla / ruta:** `/commercial/products`, `/commercial/library/update/products(/:productId)`, `/commercial/library/update`, pantalla de usuarios (`/users/access`)
- **Estado:** `respondido`
- **Sesión que lo pide:** decisión del usuario 2026-10-28

## 1. Lo que pide el diseño

**Qué verá y hará la persona:** solo las pestañas que tenga asignadas. Si entra por URL a una que no tiene, pasa a una que sí tenga; si no tiene ninguna, ve «Sin paneles asignados».

**Acciones y quién puede hacerlas:**

| Acción | Quién puede | Permiso técnico |
|---|---|---|
| Ver Productos | Paquete Productos | `products:read` |
| Editar fichas, borrar, validar, notas | Paquete Fichas | `products:write` (+ delete, validate, notes) |
| Revisar archivo de precios | Paquete Precios | `prices:preview` |
| Continuar/guardar revisión | Paquete Precios | `prices:save` |
| Aplicar revisión | Paquete Precios | `prices:apply` |
| Perfiles de proveedor | Paquete Precios | `providers:read` / `providers:write` |
| Editar precios en la ficha | Fichas y Precios | `products:write` + `prices:apply` |
| Publicar en tienda | Complemento de Fichas | `products:publish` |

**Restricciones:** sin migración ni cambio de esquema.

## 2. Respuesta de funcionalidad

**Contrato de paquetes** (`access-catalog.ts`, versión `panels-20261028-2`):

- `biblioteca-consulta` "Productos": products:read, prices:read.
- `biblioteca-fichas` "Fichas": products:read/write/delete/validate/notes, prices:read.
- `biblioteca-precios` "Precios": products:read, prices:read/preview/save/apply, providers:read/write.
- `biblioteca-publicacion` "Publicar en tienda": complemento; exige `products:write` de otra fuente.
- `biblioteca-actualizacion` "Actualización (anterior)": `assignable=false`; solo se retira. Fichas ∪ Precios = este paquete.

**Consumidores afectados:** menú y rutas (`App.tsx`, `CommercialLayout`, `Header`), `features/users/access.ts`, pantalla de usuarios, editor de ficha, página de publicación, `features/price-import` (ya sin respaldo por cargo), Mi resumen (`libraryStats:update` ahora "Estadísticas de Fichas", misma clave).

**Permisos que aplica el servidor (sin cambios):** preview = prices:preview+prices:read; revisiones = prices:save+prices:preview+prices:read; apply = prices:apply+prices:read. Crear productos desde la resolución de importación exige `products:write` y `prices:apply` (Fichas y Precios).

**Purga/compatibilidad:** `biblioteca-actualizacion` se mantiene en el conjunto de paquetes vigentes del servicio: aplicar Productos/Fichas/Precios/Publicar no le quita permisos; retirarlo usa el retiro de paquete vigente (una transacción). Las asignaciones manuales y los otros paquetes anteriores siguen purgándose de permisos de Biblioteca al aplicar un paquete vigente; esos permisos ya no cuentan para la dependencia de Publicar (evita permisos huérfanos).

**Pruebas ejecutadas:** ver informe de la sesión (jest y vitest).

**Lo que NO se hizo:** T11 (casillas finas por permiso dentro de cada pestaña en la pantalla de usuarios; sin diseñar); `access-assignments.service.spec.ts` (usa base real, actualizado pero no ejecutado); mirror Engram de la tarea ODD.

## 3. Integración
Frontend integrado contra este contrato; pendiente aceptación visual a 375px y 1440px.
