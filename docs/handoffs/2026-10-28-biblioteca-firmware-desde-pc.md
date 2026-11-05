# Traspaso: subir firmware desde el PC

- **Tema:** permitir subir archivos de firmware (y notas de versión) desde el computador en «Recursos».
- **Fecha:** 2026-10-28
- **Pantalla / ruta:** Biblioteca > Actualización > Fichas > producto > sección «Recursos» (`/commercial/library/update/products/:id`)
- **Estado:** `pendiente`
- **Sesión que lo pide:** validacion-biblioteca (diseño)

## 1. Lo que pide el diseño

**Qué verá y hará la persona** (lenguaje simple):

- En «Recursos > Firmware» podrá elegir un archivo de su computador (igual que hoy puede hacerlo con los documentos) y quedará disponible para descarga en la tienda. Hoy solo puede pegar un enlace.
- Verá el nombre y el tamaño del archivo subido y podrá reemplazarlo o quitarlo.
- Si el archivo no es de un tipo permitido o pesa demasiado, verá qué tipos y qué tamaño se aceptan.

**Datos que necesita la pantalla:**

| Campo | Tipo | Ejemplo |
|---|---|---|
| file | archivo (multipart) | `firmware_V4.75.011_240620.zip` |
| kind | FIRMWARE | `FIRMWARE` |
| version | texto | `V4.75.011` |
| region | texto | `Europa` |

**Acciones y quién puede hacerlas:**

| Acción | Quién puede | Permiso técnico |
|---|---|---|
| Subir, reemplazar o quitar firmware | Quien puede editar la ficha del producto | el mismo permiso de `POST /products/:id/assets` |

**Estados y mensajes de error esperados** (texto exacto en español):

- Cargando: «Subiendo el archivo…»
- Vacío: «Aún no hay firmware. Sube un archivo o pega un enlace.»
- Error: «No se pudo subir el firmware. Revisa el tipo y el tamaño del archivo e inténtalo de nuevo.»
- Sin permiso: el servidor responde 403; la pantalla no ofrece la acción sin permiso.

**Restricciones:**

- Hallazgo: el servidor rechaza hoy `kind=FIRMWARE` a propósito (`firmware-upload-deferred`, `products.service.ts` ~:1962) y la subida de `DOCUMENT` valida MIME + firma mágica (16 MB; un `.bin` genérico daría tipo UNKNOWN y se rechazaría). Se necesita decidir: formatos permitidos de firmware (por ejemplo `.zip`, `.bin`, `.dav`, `.pdf` de notas de versión), tamaño máximo, cómo validar archivos sin firma mágica (lista de extensiones + tamaño + antivirus si existe) y que la descarga siga siendo autorizada.
- Sin migración si es posible. Si hace falta almacenamiento distinto, pedir aprobación.

**Captura o ruta de referencia:** `src/frontend/src/features/products/sheet/blocks/ResourcesBlock.tsx` (texto «inventario de formatos» en `document-assets.ts:18`).

## 2. Respuesta de funcionalidad
<!-- Lo completa gs-funcionalidad-web. -->

**Contrato:**

- Método y ruta:
- Request:
- Response (ejemplo JSON):

```json
{}
```

**Permisos que aplica el servidor:**

**Errores** (código estable + mensaje en español):

| Código | Mensaje |
|---|---|
| | |

**Cambios de datos** (¿migración? Requiere aprobación del usuario):

**Pruebas ejecutadas** (comando: resultado):

**Lo que NO se pudo hacer y por qué:**

**Aprobaciones pendientes del usuario:**

## 3. Integración
<!-- Lo completa gs-disenador-web. -->

**Qué se conectó:**

**Validación hecha** (checklist, `npx tsc --noEmit`, vitest, render a 375px y ~1440px):

**Pendientes:**
