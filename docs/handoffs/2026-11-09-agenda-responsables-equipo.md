# Traspaso: agenda para responsables de equipo

- Fecha: 2026-11-09
- Pantalla: /agenda, calendario y tareas
- Estado: respondido

## 1. Lo que pide el diseño
El usuario solicita quitar el título visible y validar la agenda de todos los usuarios. Instrucción explícita: si una persona tiene usuarios a cargo, debe poder agendarles tareas.

Las personas internas conservan lectura, creación y completado propios. Un responsable con subordinados actuales puede leer y asignar actividades dentro de su jerarquía existente (directos e indirectos). Esta regla no concede completar tareas ajenas ni acceso a otros dominios. El servidor comprueba jerarquía y usuario activo en cada operación. Sin migraciones, cambios de datos, servicios ni permisos persistidos. Los permisos derivados deben llegar también a la interfaz mediante el contrato de acceso vigente.

## 2. Respuesta de funcionalidad
El servidor añade permisos derivados y efímeros `activities:read` y `activities:assign` con alcance `team` únicamente a usuarios con rol interno y subordinados internos activos en la jerarquía actual. La rama consultada se limita a la jerarquía existente y se valida en cada petición; al cambiar el jefe o desactivar/retirar el rol del subordinado, el permiso derivado deja de aplicar. No se concede `activities:complete` sobre tareas ajenas. `GET /api/users/:id/access` incluye `derivedGrants` solo para la propia sesión; `grants` refleja además esos derivados únicamente en esa respuesta propia. Paquetes, `sources` y concesiones persistidas no cambian. Ejemplo propio: `{"derivedGrants":[{"sourceId":"derived:team-hierarchy","actionId":"activities:read","scope":"team"},{"sourceId":"derived:team-hierarchy","actionId":"activities:assign","scope":"team"}]}`. Estado de respuesta: backend implementado; integración frontend en sección 3.

## 3. Integración
Título visible retirado conservando h1 accesible. Validación inicial: 158 pruebas frontend de agenda y servicio pasan; TypeScript y ESLint de agenda pasan.

### Validación e integración local (cierre de código)
- Frontend: 193 pruebas / 9 archivos pasan, TypeScript sin errores y ESLint de agenda + UserAccessAssignments pasa. Matriz de roles internos con concesiones derivadas; solo se ofrecen acciones que la API autoriza. Fuente derivada se muestra como «por personas a cargo», sin convertirse en asignación manual.
- Backend: 122 pruebas / 7 suites focalizadas pasan; otras 10 pruebas de agenda-hierarchy.spec.ts pasan. ESLint de los cuatro archivos de producción modificados pasa.
- Recorrido visual: fixture aislada en 5173, título visual retirado (h1 accesible conservado), crear tarea para otra persona y cambio a agenda del equipo confirmados. No se crearon tareas reales ni se suplantaron cuentas.
- Regresión ampliada: workflow-links/convert suman 29 pruebas aprobadas y 8 fallidas. Siete dependen de PostgreSQL de pruebas en localhost:54331, no disponible. Un fallo de revelación de vínculo (`revealed` false frente a true) se reprodujo igualmente con WorkflowService original de HEAD en una copia temporal: no lo introduce este cambio; copia temporal eliminada.
- Typecheck global backend no pasa: cliente Prisma de biblioteca generado ausente/desalineado y errores de tipos en otros módulos/adaptadores. No se ha declarado compilación de backend aprobada ni se ha corregido biblioteca dentro de esta tarea.
- Usuario confirmó API de pruebas (QA). Activación QA pendiente: no se desplegó ni reinició ningún servicio. AGENTS.md exige aprobación explícita por cada despliegue/reinicio. La validación con cuentas reales y datos de QA queda pendiente de activar un backend compilado y autorizado.
- Captura: C:/Users/sopor/.codex/visualizations/2026/11/07/01a1b68b-aa50-73a2-bea7-b7a0a010ffd4/agenda-sin-titulo-tareas.jpg
