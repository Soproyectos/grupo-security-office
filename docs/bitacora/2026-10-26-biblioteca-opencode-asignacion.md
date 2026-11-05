# Biblioteca: delegación supervisada de asignación de accesos

Fecha: 26/10/2026. Coordinación: Codex. Rama: `Esnaider/validacion-biblioteca`.

## Alcance autorizado

El usuario pidió ejecutar OpenCode desde terminal y propuso DeepSeek. Se preparó un primer bloque acotado: mostrar los paquetes existentes `biblioteca-consulta`, `biblioteca-actualizacion` y `biblioteca-publicacion` en la pantalla de asignación, preservando accesos anteriores retirables. No se autorizan commits, push, cambios de credenciales, instalación, migraciones, datos, servicios ni despliegues.

## Preparación y resultado

- Lanzador instalado: `%APPDATA%/npm/opencode.cmd`; `--version` devuelve `opencode v2.1.4`.
- `opencode models` lista `opencode/deepseek-v4.1-flash-free`. Se seleccionó ese identificador explícito; no se usó un modelo de pago como alternativa.
- Encargo preparado para editar solo `src/frontend/src/features/users/components/UserAccessAssignments.tsx` y su `.spec.tsx`. Configuración efímera: shell, subagentes y acceso externo denegados; sin actualización automática ni descarga de LSP; snapshots de OpenCode desactivados. Codex conserva copias previas locales para comparar el bloque.
- Intento: `opencode run --standalone --model opencode/deepseek-v4.1-flash-free --agent build` con el encargo adjunto como mensaje.
- Resultado real: salida 1 antes de implementación. OpenCode informa que su API key está vencida y requiere crear otra en Console y reemplazarla en el cliente; iniciar sesión de nuevo no la renueva.
- No se leyó ni mostró el contenido de credenciales. No se cambió ninguna credencial.

## Verificación y pendientes

El agente no implementó el bloque. No se atribuyen pruebas ni cambios funcionales a este intento. Los dos archivos objetivo se comparan con sus copias previas mediante SHA-256. No se ejecutan nuevas pruebas de comportamiento para un bloque todavía no implementado.

Siguiente paso: el usuario renueva la clave de OpenCode en su interfaz habitual y avisa, o cambia expresamente el plan de implementación. Después se reintenta este mismo bloque y Codex revisa el diff, lint, tipos y pruebas pertinentes. No asumir que toda Biblioteca está delegada o ejecutándose en segundo plano.

## Reversión del intento inicial

Solo se añadió esta bitácora y una fila de estado en `docs/biblioteca-dominio/README.md`. No hay cambio funcional que revertir. Retirar únicamente esos registros revierte la documentación de este intento sin tocar el trabajo previo.

## Reintento tras actualización de clave comunicada por el usuario

El usuario informó que colocó una API nueva y pidió reintentar. La comparación SHA-256 previa confirmó que ambos archivos objetivo seguían intactos. Se ejecutó el mismo encargo, con idéntico modelo gratuito y restricciones: salida 1 y el mismo error de API key vencida, sin implementación.

`opencode auth list --format json` y su variante `--standalone` muestran las mismas conexiones registradas para OpenCode Console, Go, NVIDIA, Copilot y OpenRouter. Estos metadatos no exponen la clave y no permiten determinar si se reemplazó su valor. Entre los nombres de variables de autenticación consultados solo aparece `OPENROUTER_API_KEY`; no se imprimió su valor. Queda pendiente identificar en cuál proveedor/interfaz se registró la nueva clave. No se cambió de proveedor ni se usó una alternativa de pago.

## Ejecución aceptada y cierre del bloque frontend

Después de que el usuario actualizó la conexión mediante `auth login opencode`, el encargo arrancó con DeepSeek gratuito. El agente modificó únicamente sus dos archivos autorizados. La primera entrega omitía el grupo Biblioteca independiente, la supresión de secciones vacías y cobertura precisa del paquete anterior aplicado; Codex la revisó y solicitó correcciones. El lanzador `.cmd` no transmitió íntegra la revisión multilínea: el agente informó que no la había recibido. Se corrigió la transmisión usando el ejecutable de la instalación y `--file` con el encargo de revisión, sin cambiar credenciales ni instalar herramientas.

Resultado revisado:

- `UserAccessAssignments.tsx`: grupos Comercial, Biblioteca (Productos, Actualización, Publicación) y Accesos anteriores; nombres/selecciones del servidor; secciones sin paquetes omitidas. No se alteraron las mutaciones ni se reasignaron usuarios.
- `UserAccessAssignments.spec.tsx`: cuatro casos nuevos cubren pertenencia de paquetes a grupos, ausencia de duplicados para el catálogo válido, casilla habilitada/marcada y fuente del paquete anterior concreto, catálogo antiguo y catálogo sin paquetes. Las afirmaciones son SSR, no clicks reales.
- `src/frontend/src/features/users/access.spec.ts`: Codex corrigió el test adyacente tras un fallo real. El fixture simulaba catálogo antiguo, pero el helper se invocaba sin esa versión y enviaba la constante actual. Ahora el test pasa explícitamente `initialAccess.catalogVersion` y verifica que se conserva junto con el refresco de caché. No se cambió código de permisos ni el catálogo para forzar el resultado.

### Verificación ejecutada por Codex

En `src/frontend`:

- `node_modules/.bin/vitest.cmd run src/features/users/components/UserAccessAssignments.spec.tsx src/features/users/access.spec.ts src/App.spec.tsx`: primera ejecución 38/39 (fallo de versión descrito); tras la corrección, **39/39, 3 archivos, salida 0**.
- `node_modules/.bin/eslint.cmd src/features/users/components/UserAccessAssignments.tsx src/features/users/components/UserAccessAssignments.spec.tsx src/features/users/access.spec.ts`: **salida 0**.
- `node_modules/.bin/tsc.cmd -b --pretty false`: **salida 0** después de la corrección.

No se ejecutó navegador ni API/base real. El runtime de esta entrega es el render SSR sembrado y los helpers con API simulada; no se afirma haber verificado la revocación efectiva contra el servidor. La transición de escalafones, permisos restantes, historial global y despliegue siguen abiertos. No queda OpenCode ejecutándose tras esta entrega.

### Reversión del bloque implementado

Revertir únicamente el grupo nuevo, la separación de anteriores y la omisión de grupos vacíos de `UserAccessAssignments.tsx`, los casos/fixtures agregados de su spec y el ajuste de versión en el test de `access.spec.ts`. Las copias locales anteriores permiten comparar exactamente el delta de esta sesión. No restaurar archivos completos desde HEAD: contienen trabajo anterior de Claude. El estado y esta bitácora deben reflejar cualquier reversión. Sin commit ni push.
