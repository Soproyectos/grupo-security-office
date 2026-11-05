---
name: gs-funcionalidad-web
description: "Trigger: cambio de backend, endpoint, API, permiso, validación, Prisma, NestJS o reporte de traspaso en la web de Grupo Security. Organiza la funcionalidad según el diseño."
license: Apache-2.0
metadata:
  author: "zatairo"
  version: "1.0"
---

## Activation Contract

Cargar ante cualquier cambio bajo `src/backend/` o `prisma/`, ante un traspaso en `docs/handoffs/` con Estado `pendiente`, o cuando un cambio de frontend necesita datos o permisos que la API no ofrece. Trabaja en pareja con `gs-disenador-web`.

Principio: el reporte de traspaso es el contrato de lo que la persona debe ver y hacer; el backend lo sirve con el cambio mínimo coherente y nunca cambia en silencio lo que muestra la interfaz. Si el diseño pide algo inseguro (seguridad, pérdida de datos, fuga de privilegios, doble fuente de verdad) o imposible sin migración, responder en el traspaso con el motivo y alternativas, poner Estado `rechazado` o preguntar al usuario. No doblar la seguridad al diseño.

## Hard Rules

- Todo endpoint se protege en el servidor. El permiso que exige el servidor debe coincidir con el que la interfaz usa para mostrar el control; reportar cualquier diferencia.
- Validar toda entrada.
- Errores en español simple que la interfaz pueda mostrar tal cual, más un código de error estable.
- Antes de tocar catálogo, precios, importaciones, archivos o respaldos, leer `docs/biblioteca-dominio/README.md` y `docs/biblioteca-dominio/INSTRUCCIONES-AGENTES.md`.
- Una autoridad por dato; sin doble escritura. No editar migraciones históricas.
- Rige `AGENTS.md`: commits, push, despliegues, migraciones, cambios de contenedores o servicios e instalaciones requieren aprobación explícita del usuario cada vez.
- Sin secretos en Git.

## Decision Gates

| Situación | Acción |
|---|---|
| Endpoint de solo lectura sin cambio de esquema | Implementar y probar. |
| Requiere esquema o migración | Detenerse, explicar en lenguaje simple y pedir aprobación. |
| Cambia una regla de permisos o roles | Hacer UNA pregunta en lenguaje simple (qué podrá ver o hacer la persona) y detenerse. |
| Cambia un contrato que usan otras pantallas | Listar los consumidores afectados en el traspaso. |
| Regla de producto ambigua | Devolverla al diseñador o al usuario; no adivinar. |

## Execution Steps

1. Leer el traspaso (poner Estado `en-curso`) y el módulo existente: controller, service, DTO, guards y pruebas.
2. Si el cambio no es trivial, proponer el contrato en la sección 2 del traspaso antes de programar.
3. Implementar el cambio mínimo.
4. Probar con los Jest pertinentes en `src/backend` y `npx tsc --noEmit`; informar los comandos exactos y sus resultados.
5. Completar la sección 2 del traspaso con el contrato final y un JSON de ejemplo; poner Estado `respondido`.
6. Avisar al usuario y remitir a `gs-disenador-web` para integrar (sección 3).

## Output Contract

Devolver: resumen del contrato; permisos aplicados; pruebas ejecutadas con su resultado; aprobaciones pendientes; ruta del traspaso y su Estado.

## References

- `../gs-disenador-web/assets/reporte-traspaso.md`
- `../gs-disenador-web/SKILL.md`
- Desde la raíz del repo: `docs/biblioteca-dominio/README.md`, `docs/biblioteca-dominio/INSTRUCCIONES-AGENTES.md`, `docs/biblioteca-dominio/mapa-de-permisos-biblioteca.md`, `AGENTS.md`
