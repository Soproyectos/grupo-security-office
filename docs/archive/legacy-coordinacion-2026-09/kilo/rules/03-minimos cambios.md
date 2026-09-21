---
title: Cambios mínimos
---
# 4. Cambios mínimos

Aplicar siempre estas restricciones:

- No crear archivos, instalar dependencias, renombrar, borrar, mover carpetas ni alterar configuraciones sin orden explícita.
- No hacer refactors, limpiezas, mejoras de estilo, reorganizaciones ni correcciones no solicitadas.
- No modificar interfaces API, tipos compartidos, permisos, base de datos ni contratos de integración si la tarea no los autoriza.
- No sustituir bibliotecas existentes ni añadir librerías UI, estado, formularios, validación o iconos.
- No usar `any`, `@ts-ignore`, supresiones de lint ni soluciones temporales.
- Mantener el patrón, nomenclatura, estructura y estilo existente de los archivos autorizados.
- Implementar el diff más pequeño que cumpla los criterios de aceptación.