<!--
Plantilla compartida por `gs-disenador-web` y `gs-funcionalidad-web`.
Copiar a `docs/handoffs/AAAA-MM-DD-<tema>.md` y completar. Cada skill escribe solo sus secciones.
Estados: pendiente -> en-curso -> respondido -> integrado (o rechazado).
-->

# Traspaso: <tema>

- **Tema:**
- **Fecha:** AAAA-MM-DD
- **Pantalla / ruta:**
- **Estado:** `pendiente` | `en-curso` | `respondido` | `integrado` | `rechazado`
- **Sesión que lo pide:**

## 1. Lo que pide el diseño
<!-- Lo completa gs-disenador-web. -->

**Qué verá y hará la persona** (lenguaje simple):

**Datos que necesita la pantalla:**

| Campo | Tipo | Ejemplo |
|---|---|---|
| | | |

**Acciones y quién puede hacerlas** (lenguaje simple y, si se conoce, nombre técnico del permiso):

| Acción | Quién puede | Permiso técnico |
|---|---|---|
| | | |

**Estados y mensajes de error esperados** (texto exacto en español):

- Cargando:
- Vacío:
- Error:
- Sin permiso:

**Restricciones** (sin migración, solo lectura, etc.):

**Captura o ruta de referencia:**

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
