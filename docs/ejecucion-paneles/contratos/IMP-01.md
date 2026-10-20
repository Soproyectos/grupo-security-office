# IMP-01 — Concretar verificación real del preview local y sus límites (paso: contrato)

**Fecha:** 2026-10-15 · **Checkout:** `/home/soporte/office_ai/grupo-security-office` (S3) · **Alcance:** solo documentación. Este paso escribe únicamente `docs/ejecucion-paneles/contratos/IMP-01.md`; no modifica código, base de datos ni servicios activos, no ejecuta commits y **no edita `estado.json` ni `tareas.json`**.

**Modalidad — tanda continua (PROP):** conforme a `docs/ejecucion-paneles/TANDA-COMPLETA.md`, este contrato se propone para la auditoría final única del coordinador. **No es una decisión aprobada.** Todo lo marcado **PROP** es propuesta de esta entrega; los permisos reales de la plataforma y las reglas de seguridad del producto siguen vigentes.

## Cómo leer este documento

| Marca | Significado |
|---|---|
| **OBS** | Hecho observado: verificado con `rg`/`find`/`git log`/HTTP en este checkout o en la copia de revisión. |
| **IP** | Informe previo: lo afirma un documento anterior; no se re-ejecutó aquí. |
| **PROP** | Propuesta de esta entrega; no es una decisión aceptada. |
| **DESC** | Desconocido o no verificable desde este checkout. |

## 1. Meta, dependencias y reglas de la ficha

- **Meta (ficha `IMP-01 contrato`, textual):** «Concretar verificación real del preview local y sus límites. Fijar campos, rutas, acciones, alcance, errores y pruebas antes de implementar.»
- **dependsOn (ficha):** `BASE-01` (**OBS** aceptado en `estado.json`). Este contrato no verifica aceptaciones; ese estado vive en `estado.json`, que este paso no edita.
- **Reglas de la ficha (textuales):** (1) «No rehacer parser, contenedor, ACL ni interfaz que ya funcionan en pruebas simuladas.» (2) «La base debe ser desechable con fixtures ficticios y URL explícita de pruebas, nunca la de operación.» (3) «Si falta el entorno, documentar ese límite; no declarar el paso aceptado por ejecutar solo mocks.»
- **Referencia de la ficha:** `docs/DISENO-IMPORTACION-PRECIOS-2026-10-14.md`, sección «verificación real del preview local y sus límites».
- **Aceptación del paso `contrato` (textual):** «Contrato consistente con dependencias y decisiones pendientes explícitas.» + «Todos los incrementos están registrados con objetivo, archivos y aceptación propios antes de delegar código.»

## 2. Veredicto del entorno: la fuente del preview NO existe en este servidor

**OBS (readPaths de la ficha):**

| ReadPath de la ficha | Estado en S3 |
|---|---|
| `src/backend/src/modules/prices/import/` | **FALTA** — `ls src/backend/src/modules/prices/` → solo `dto/`, `prices.controller.ts`, `prices.module.ts`, `prices.service.ts`, `prices.service.spec.ts` |
| `src/backend/src/common/security/admin-access.postgres.spec.ts` | **FALTA** (tampoco en el worktree UA local) |
| `docs/IMPLEMENTACION-REVISION-PRECIOS-2026-10-14.md` | **OK** (documento de estado de la entrega-L) |
| `docs/DISENO-IMPORTACION-PRECIOS-2026-10-14.md` | **OK** (diseño) |

**OBS (búsqueda exhaustiva en el checkout):**

- `find . -name '*price-import*'` (sin node_modules) → **0 resultados** (ni backend ni frontend ni specs).
- `git log --all --diff-filter=A -- 'src/backend/src/modules/prices/import/*'` → **vacío**: la ruta nunca existió en la historia de este repositorio.
- `rg "prices:preview|price-import" src/backend/src/common/security/access-catalog.ts` → **0**: la acción asignable `prices:preview` descrita en IMPLEMENTACION:«La API nueva es POST /api/prices/import/preview… Solo admite la acción prices:preview» tampoco está en el catálogo de S3.
- `rg "Revisar precios|price-import" src/frontend/src` → **0**: ni `features/price-import/`, ni `services/price-import.service.ts`, ni la pestaña en `ListaDetailPage.tsx`.

**OBS (runtime, ejecutado el 2026-10-15 en la copia de revisión `gs-tanda-01`, API 3001):**

```
POST http://localhost:3001/api/prices/import/preview → HTTP 404
  {"statusCode":404,...,"message":"Cannot POST /api/prices/import/preview"}
```

(Reproducido dos veces: durante T-01 y al cerrar T-07.)

**IP (fuente documental del estado):** `docs/IMPLEMENTACION-REVISION-PRECIOS-2026-10-14.md:3` — «**Estado al 14 de octubre de 2026: revisión implementada en el worktree local.**» Ese worktree **L** es `C:/Users/sopor/.codex/worktrees/25d1/grupo-security-office` (OBS BASE-01 §1) y **no es accesible desde este servidor**. La entrega L describe exactamente las piezas que faltan: `src/backend/src/modules/prices/import/` (contenedor XLSX, estructura XML, contrato de plantilla, comparador, endpoint, 332 pruebas en 10 suites), `src/frontend/src/features/price-import/`, `services/price-import.service.ts`, la acción `prices:preview` en `access-catalog.ts` y el spec `admin-access.postgres.spec.ts`.

**DESC:** no se verificó si existe algún backup/rama adicional de L fuera de este checkout (no hay credenciales ni rutas de acceso remoto autorizadas en esta tanda).

### 2.1 Por qué el paso `backend` queda bloqueado (no reimplementado)

El paso `backend` de la ficha tiene por writePaths `src/backend/src/modules/prices/import/price-import.postgres.spec.ts` y `src/backend/scripts/verify-price-preview.cjs` — es decir, **pruebas de verificación del preview contra PostgreSQL real**. Sin el módulo `price-import` no hay código que verificar: cualquier implementación propia sería exactamente «rehacer parser, contenedor, ACL ni interfaz», prohibido por la regla 1 de la ficha, y «un prototipo que parezca terminado», prohibido por TANDA-COMPLETA §26. **PROP:** el paso `backend` queda `bloqueado` con motivo «fuente L ausente» en `TANDA-01-avance.json`; la condición de desbloqueo es recibir de L los archivos listados en §2 (mínimo: `modules/prices/import/**` y `features/price-import/**`), verificándose entonces con base desechable y URL inline (regla 2).

## 3. Alcance que SÍ queda fijado por este contrato (PROP)

Aunque el preview no existe aquí, este contrato fija lo verificable hoy para que la verificación futura sea posible sin rehacer decisiones:

| Dimensión | Se fija aquí | Fuente |
|---|---|---|
| Campos/endpoint objetivo | `POST /api/prices/import/preview` con `listaId` + `file` (multipart), respuesta de filas con precio anterior/recibido/redondeado/diferencia/problemas | **IP** IMPLEMENTACION (§«Cómo se utiliza», §«Qué protege») |
| Acción/alcance | `prices:preview` con dependencias `prices:read` + `listas:read` + alcance de la lista; JWT revalidado por petición | **IP** IMPLEMENTACION; **OBS** el catálogo de S3 no la contiene aún |
| Errores | 400 (estructura/valores), 403 (lista ajena o restricción), 404 (lista inexistente), 413/ límites 5 MB y 5000 filas | **IP** IMPLEMENTACION |
| Límites del contenedor | 25 MB descomprimidos, 10 MB/parte, 128 partes; sin macros ni enlaces externos; XML estricto con `sax` 1.6.1 | **IP** IMPLEMENTACION |
| Pruebas previstas del paso `backend` | Precios anteriores desde consultas Prisma reales sin escrituras de negocio; lista ajena/restricción PRODUCT y revocación rechazan datos; tarifas exactas/relaciones/decimales producen el mismo comparador (textuales de la ficha) | ficha |

## 4. Impacto en la cadena IMP-02…IMP-07 (dependencias registradas)

**OBS (tareas.json):** `dependsOn` de cada contrato: IMP-02 `[BASE-02, IMP-01]`, IMP-03 `[BASE-02, IMP-01]`, IMP-04 `[IMP-03]`, IMP-05 `[IMP-04, CAT-01]`, IMP-06 `[IMP-05, IMP-02]`, IMP-07 `[IMP-06]`.

| Paso | Estado PROP tras este contrato | Motivo |
|---|---|---|
| IMP-01 `contrato` | implementado_sin_auditar (este documento) | Contrato escrito con fuentes y límites explícitos |
| IMP-01 `backend` | **bloqueado** | §2.1 — fuente L ausente |
| IMP-02…IMP-07 (`contrato` y `backend`) | **bloqueados en su implementación** | dependencia transitive de IMP-01+IMP-02/IMP-03; sus piezas de UI pertenecen a `features/price-import/` (L, ausente) y sus validaciones deben coincidir con el comparador-L para no divergir (regla 1) |

**PROP — «partes independientes» del paquete IMP:** ninguna etapa de implementación es aplicable de forma independiente sin la fuente L: descarga de plantilla (IMP-02) y reglas COP (IMP-03) existen **descritas** en `DISENO-IMPORTACION-PRECIOS` (con reglas textualmente citables: IVA incluido, HALF_UP al peso, tope $9.999.999.999) pero implementarlas ahora crearía un segundo flujo que divergiría del preview-L. **PROP:** conservar IMP bloqueado con esta evidencia y reanudar cuando llegue la fuente; en esta tanda, los paquetes aplicables son CAT-01…CAT-09 y COM-01…COM-09.

## 5. Decisiones pendientes y bloqueos externos heredados

| # | Decisión/bloqueo | Afecta | Estado |
|---|---|---|---|
| B-IMP | **Fuente L de precios** (`modules/prices/import/**`, `features/price-import/**`, `services/price-import.service.ts`, acción `prices:preview`, `admin-access.postgres.spec.ts`) | IMP-01…IMP-07 | **Bloqueado** — condición de desbloqueo §2.1 |
| D-IMP | Confirmar con el coordinador si, al recibir L, la integración es por copia de archivos o por merge de rama (afecta `package.json`: `sax` es dependencia de L) | IMP-01 `backend` | **Pendiente — coordinador** |
| B1-B4 | Heredados de BASE-02 §11 (Yéminus, Excel Pedidos, descuentos, preview) | idem | **Pendientes** (no cambian aquí) |

## 6. Evidencia reproducible

```bash
# Desde S3 (checkout autorizado)
ls src/backend/src/modules/prices/                 # sin import/
find . -name '*price-import*' -not -path '*/node_modules/*'   # vacío
git log --all --oneline --diff-filter=A -- 'src/backend/src/modules/prices/import/*'  # vacío
rg -c "prices:preview" src/backend/src/common/security/access-catalog.ts             # sin coincidencia

# En la copia de revisión (API 3001 activa)
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3001/api/prices/import/preview \
  -H 'Content-Type: application/json' -d '{}'                                          # 404
```

## 7. Criterios de aceptación del paso

1. ✅ Contrato consistente con dependencias (`BASE-01` aceptado; cadena IMP registrada §4) y decisiones pendientes explícitas (§5).
2. ✅ Incrementos registrados con objetivo, archivos y aceptación propios antes de delegar código (§2.1, §4 — tabla por paso con sus fichas).
3. Regla 3 de la ficha cumplida: el límite del entorno está **documentado**, no se declaró aceptado con mocks.
