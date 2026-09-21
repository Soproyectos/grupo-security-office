---
title: Estándares backend comercial
---
# 6. Estándares backend comercial

Para el agente backend, fijar:

- **NestJS + TypeScript + Prisma.**
- **DTOs validados y tipos estrictos.**
- **Mantener RBAC, auditoría y convenciones de módulos existentes.**
- No crear ni ejecutar migraciones Prisma sin que Perplexity autorice expresamente el archivo schema y la migración.
- No cambiar datos de seed, secretos, autenticación o permisos de rol sin autorización expresa.