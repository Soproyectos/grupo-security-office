# Traspaso: fotos del producto por enlace (URL) y varias a la vez

- **Tema:** agregar fotos de producto pegando un enlace, y enviar el tipo al subir.
- **Fecha:** 2026-10-28
- **Pantalla / ruta:** Biblioteca > Actualización > Fichas > producto > sección «Imágenes» (`/commercial/library/update/products/:id`)
- **Estado:** `pendiente`
- **Sesión que lo pide:** validacion-biblioteca (diseño)

## 1. Lo que pide el diseño

**Qué verá y hará la persona** (lenguaje simple):

- En «Imágenes» podrá pegar el enlace de una foto (de la web del fabricante, por ejemplo) y la foto se agregará al producto igual que una subida desde el PC. Podrá agregar varias seguidas.
- Al agregar una foto elegirá su tipo (Portada, Logo, Principal, Complementaria, Extra) y quedará guardado de una vez.
- Si el enlace no sirve (no abre, no es una imagen, pesa demasiado), verá un mensaje que dice qué pasó y cómo seguir.

**Datos que necesita la pantalla:**

| Campo | Tipo | Ejemplo |
|---|---|---|
| url | texto (http/https) | `https://fabricante.example/img/dvr.jpg` |
| type | PORTADA, LOGO, PRINCIPAL, COMPLEMENTARIA o EXTRA | `COMPLEMENTARIA` |
| isPrimary | booleano | `false` |

**Acciones y quién puede hacerlas:**

| Acción | Quién puede | Permiso técnico |
|---|---|---|
| Agregar foto por enlace | Quien ya puede subir fotos al producto | el mismo permiso de `POST /products/:id/images` |

**Estados y mensajes de error esperados** (texto exacto en español):

- Cargando: «Descargando la foto…»
- Vacío: «Aún no hay fotos. Sube la primera para poder publicar el producto.»
- Error: «No se pudo traer la foto de ese enlace. Revisa que abra una imagen y vuelve a intentarlo.»
- Sin permiso: el servidor responde 403; la pantalla no ofrece la acción sin permiso.

**Restricciones:**

- Sin migración si es posible. Decisión de funcionalidad: o el servidor descarga la imagen y la guarda como archivo propio (recomendado: así el requisito «archivos propios existentes» se cumple), o guarda el enlace externo (entonces la validación de publicación avisa «URL externa»).
- Seguridad: si el servidor descarga, debe protegerse contra SSRF (solo http/https, bloquear IPs privadas/locales y redirecciones a ellas, límite de tamaño, tiempo máximo, verificar tipo real de imagen por firma).
- Hallazgo aparte: `POST /products/:id/images` hoy **ignora** el campo `type` (crea siempre PRINCIPAL por defecto); el frontend lo corrige con un segundo `PATCH`. Pedimos que el POST acepte `type` y lo guarde.

**Captura o ruta de referencia:** `src/frontend/src/features/products/sheet/ProductPhotosSection.tsx`

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
