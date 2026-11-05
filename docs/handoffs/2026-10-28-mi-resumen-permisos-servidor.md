# Traspaso: Mi resumen - permisos en el servidor

<!-- biblioteca-vigente-20261103 -->
**Referencia operativa vigente.** Para la estructura de cinco pestañas y los pasos actuales de asignación de Biblioteca y estadísticas, consulta la [guía vigente del panel](../biblioteca-dominio/mapa-de-permisos-biblioteca.md#guía-vigente-del-panel-biblioteca). Este traspaso conserva el estado de la entrega original.


- **Tema:** Que el servidor deje de entregar datos comerciales a quien no tiene el permiso.
- **Fecha:** 2026-10-28
- **Pantalla / ruta:** Inicio (`AssignedHome`, rutas `/`, `/home`, `/sales`), `AssignedReportsPage` (`/reports`)
- **Estado:** `respondido`
- **Sesión que lo pide:** coordinador (autorización decidida por el usuario)

## 1. Lo que pide el diseño

**Qué verá y hará la persona** (lenguaje simple):

- Quien solo tiene pestañas de Biblioteca (por ejemplo Compras) ya no recibe meta, cotizaciones ni actividad del servidor.
- Facturado y Meta solo con "Consultar metas"; Cotizaciones solo con "Consultar cotizaciones"; Equipo solo con "Consultar equipo".
- "Actividad reciente" solo con alguna acción comercial (clientes, cotizaciones, metas, equipo, avisos).

**Acciones y quién puede hacerlas:**

| Acción | Quién puede | Permiso técnico |
|---|---|---|
| Ver meta y facturado | Quien tenga permiso de metas | `targets:read` |
| Ver resumen (KPIs, actividad) | Quien tenga alguna acción comercial | una de: `customers:read`, `quotes:read`, `targets:read`, `teamInsights:read`, `commercialPromotions:read`, `commercialPromotions:create` |
| Ver cotizaciones/cartera dentro del resumen | Quien tenga permiso de cotizaciones | `quotes:read` |
| Ver equipo dentro del resumen | Quien tenga permiso de equipo | `teamInsights:read` (sin cambios) |

**Estados y mensajes de error esperados:**

- Sin permiso (meta): "No tienes permiso para ver la meta de ventas."
- Sin permiso (resumen): "No tienes permiso para ver tu resumen comercial."

**Restricciones:** sin migración, solo lectura; la interfaz (`AssignedHome.tsx`) ya está hecha.

## 2. Respuesta de funcionalidad

**Contrato:**

- `GET /api/dashboard/sales-goal`: exige `targets:read` (cualquier alcance; Super Admin es excepción explícita). Respuesta 200 sin cambios. Sin permiso: 403.
- `GET /api/dashboard/me?take=`: exige al menos una de las seis acciones comerciales. 200 con `scope`, `kpis`, `listas`, `recentActivity` siempre; `commercial` solo con `quotes:read` (y scope ASSIGNED, como antes); `team` solo con `teamInsights:read` y subordinados (sin cambios). Sin ninguna acción: 403.
- Sin concesiones el rol ya no abre nada (modelo estricto, `concessionCanAction`).

403 de ejemplo:

```json
{
  "statusCode": 403,
  "timestamp": "2026-10-28T15:00:00.000Z",
  "path": "/api/dashboard/me",
  "message": "No tienes permiso para ver tu resumen comercial.",
  "code": "DASHBOARD_WORKSPACE_FORBIDDEN"
}
```

`me` sin `commercial` (usuario solo con `targets:read`; la clave se omite):

```json
{
  "scope": "ASSIGNED",
  "kpis": { "listas": 1, "products": 0, "pendingPublication": 0, "recentActivity": 2 },
  "listas": [],
  "recentActivity": []
}
```

**Permisos que aplica el servidor:** `targets:read` en `sales-goal`; una de las seis acciones en `me`; `quotes:read` para `commercial`; `teamInsights:read` para `team`. Coinciden con los que usa `AssignedHome.tsx`. Diferencia: `RequireGrant` solo acepta alcance global, por eso se usó `concessionCanAction` (cualquier alcance), igual que la interfaz.

**Errores:**

| Código | Mensaje |
|---|---|
| `DASHBOARD_SALES_GOAL_FORBIDDEN` | No tienes permiso para ver la meta de ventas. |
| `DASHBOARD_WORKSPACE_FORBIDDEN` | No tienes permiso para ver tu resumen comercial. |

**Consumidores afectados:**

| Consumidor | Endpoint | ¿Se rompe? |
|---|---|---|
| `pages/AssignedHome.tsx` | ambos | No: ya condiciona las llamadas por permiso. |
| `pages/AssignedReportsPage.tsx` (`/reports`) | `me` | No: la ruta exige `teamInsights:read`, que basta para `me`. |
| `features/dashboard/blocks/*` (`useWorkspace`, KPIs/Gobierno/Catálogo) vía `pages/Dashboard.tsx` | `me` | Sin efecto hoy: `pages/Dashboard.tsx` no está enrutada en `App.tsx` (código sin uso). Si se vuelve a enrutar, usuarios de solo Biblioteca recibirían 403 en esos bloques (pierden también `kpis.listas`, `products`). |
| `features/sales/SalesGoalCard.tsx` (`SalesHomePage`) | `sales-goal` | Sin efecto hoy: `SalesHomePage` no está enrutada. |
| `services/dashboard-insights.service.ts` y `dashboard.service.ts` (`fetchMyWorkspace` duplicado) | `me` | Solo definiciones; el tipo `commercial?` ya es opcional, no hace falta cambiar el frontend. |
| Backend | | No hay otro consumidor interno. `GET /dashboard/team/:userId` no se tocó. |

**Cambios de datos:** ninguno (sin migración).

**Pruebas ejecutadas** (en `src/backend`):

- `npx jest src/modules/dashboard`: 5 suites, 67 tests, todo pasa.
- `npx tsc --noEmit`: 17 errores, todos en `price-import.service.spec.ts`, `price-template-download.spec.ts`, `price-template.spec.ts`, `products.service.spec.ts` (otra sesión); ninguno en archivos del dashboard.

**Cambios en pruebas existentes:** `dashboard.service.spec.ts` y `dashboard-fuente-alcance.spec.ts` ahora inyectan concesiones (antes asumían rol sin concesiones). La prueba "legado SIN grants conserva el bloque de equipo" pasó a esperar 403 en `me`, porque el modelo estricto ya no reactiva el rol. Pruebas nuevas en `dashboard-permisos.spec.ts`.

**Lo que NO se pudo hacer y por qué:** no se ejecutó contra una base real ni por HTTP (la BD local no está disponible); los permisos se probaron con el motor real de concesiones y Prisma simulado. Usuarios existentes sin ninguna concesión (solo rol) ahora reciben 403 en ambos endpoints; conviene confirmar que Supervisor/Vendedor tienen sus concesiones en producción antes de desplegar.

**Aprobaciones pendientes del usuario:** commit, push y despliegue (no hechos).

## 3. Integración
<!-- Lo completa gs-disenador-web. -->

**Qué se conectó:**

**Validación hecha:**

**Pendientes:**
