# `docs/handoffs/` — Traspasos

Esta carpeta guarda dos tipos de documentos:

- **Handoff de sesión:** estado del proyecto y pendientes entre sesiones (`HANDOFF_ACTUAL.md`).
- **Reportes de traspaso diseño ↔ funcionalidad:** piden y responden los cambios de backend que necesita una pantalla.

## Reportes de traspaso

- **Nombre:** `AAAA-MM-DD-<tema>.md`, a partir de la plantilla [`reporte-traspaso.md`](../../.claude/skills/gs-disenador-web/assets/reporte-traspaso.md).
- **Estados:** `pendiente → en-curso → respondido → integrado`, o `rechazado` si el servidor no puede cumplir el pedido con seguridad.
- **Quién escribe cada sección:**
  1. «Lo que pide el diseño»: `gs-disenador-web`.
  2. «Respuesta de funcionalidad»: `gs-funcionalidad-web`.
  3. «Integración»: `gs-disenador-web`, cuando el estado pasa a `respondido`.
- Un reporte no autoriza commits, migraciones ni despliegues; rige `AGENTS.md`.

Ver [README del proyecto](../README.md).
