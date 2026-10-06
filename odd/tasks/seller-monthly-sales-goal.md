# KPI personal de meta de ventas mensual

Fecha: 2026-10-05. Código en srv-soporte, /home/soporte/office_ai/grupo-security-office.
Estado: implementado y validado con pruebas y vista previa de fixtures; sin despliegue, commits ni push.

El usuario confirmó meta mensual asignada por Supervisor o Super Admin. SalesHomePage muestra meta, facturado del mes, faltante y porcentaje. El vendedor consulta, sin controles de edición. La meta pendiente se muestra como "Sin meta asignada"; no se inventan montos.

GET /api/dashboard/sales-goal toma la identidad autenticada, sin userId suministrado por el cliente. Solo consulta SalesTarget y SalesOrder del propio usuario. Cuenta pedidos con número y fecha de factura del mes calendario de America/Bogota, usando el mismo instante para meta y rango. No cuenta cotizaciones abiertas. Usa Prisma.Decimal en cálculos. El faltante nunca es negativo; porcentaje superior a 100% se conserva en texto y la barra se limita a 100.

No se suman monedas distintas. Si hay facturas de otra moneda, se muestran solo los montos en la moneda de la meta (COP sin meta) con aviso y se omiten porcentaje/faltante hasta una conversión autorizada. Meta cero no produce división por cero.

SalesTargetsController y Service limitan escritura a Super Admin o Supervisor ancestro. Supervisor no fija su propia meta ni metas ajenas a su equipo. Vendedor y Admin Comercial no asignan metas, aunque tengan subordinados. Vendedor tampoco puede consultar metas de otros por el endpoint de metas. Se reutiliza la tabla SalesTarget existente, sin migraciones ni cambios en datos reales. La interfaz de asignación para roles de gestión no se añadió en esta tarea del KPI personal; el endpoint de asignación existente conserva el contrato.

Validación:
- Backend Jest: dashboard.service.spec.ts y sales-targets.service.spec.ts, 2 suites, 45 pruebas aprobadas.
- Frontend Vitest: SalesGoalCard.spec.tsx, 5 pruebas aprobadas.
- ESLint de todos los archivos modificados: aprobado.
- Backend tsc --noEmit --incremental false -p tsconfig.build.json: aprobado.
- Frontend tsc --noEmit --incremental false --types vite/client: los mismos 6 errores previos en Header y Auditoría, sin errores nuevos de KPI.
- Vite bundle de App real en /tmp/codex-seller-goal-preview-01a10d04: aprobado (517 módulos). Prueba de navegador muestra meta ficticia COP 10 millones, facturado 6 millones, faltante 4 millones y 60%, sin Comercial; consola sin errores.
- Preview: http://127.0.0.1:8768/sales, adaptador API enteramente en memoria y datos ficticios. No valida usuarios/base de datos real. Captura vendedor-meta-mensual.jpg.
- Comando harness: node /tmp/build-seller-goal-preview.mjs desde src/frontend.

Reversión: sales-goal-final.json guarda originales y contenido final de los 10 archivos. Verificar contenido final antes de restaurar originales y quitar únicamente los tres archivos nuevos de KPI. No revertir SalesHomePage a Git HEAD: contiene el espacio del vendedor de la tarea anterior. Conservar todos los cambios ajenos al manifiesto.

Archivos:
- src/backend/src/modules/dashboard/dashboard.service.ts
- src/backend/src/modules/dashboard/dashboard.controller.ts
- src/backend/src/modules/commercial/sales-targets/sales-targets.service.ts
- src/backend/src/modules/commercial/sales-targets/sales-targets.controller.ts
- src/backend/src/modules/commercial/sales-targets/sales-targets.service.spec.ts
- src/backend/src/modules/dashboard/dashboard.service.spec.ts
- src/frontend/src/features/sales/sales-goal.service.ts
- src/frontend/src/features/sales/SalesGoalCard.tsx
- src/frontend/src/features/sales/SalesHomePage.tsx
- src/frontend/src/features/sales/SalesGoalCard.spec.tsx

Próximos pasos: completar la selección de tarifa de cotización, bloqueo previo ya documentado. Configurar montos reales de metas mediante el flujo de gestión autorizado. No se solicitó monto real ni se asignó una meta ficticia en el backend.

