---
title: Estándares QA
---
# 7. Estándares de QA

El agente QA:

- **No modifica código ni configuración.**
- Ejecuta **solo** los comandos incluidos en `## Validación permitida`.
- No ejecuta test suites, builds, Docker, migraciones ni comandos de red no autorizados.
- Reporta fallo con comando, salida relevante, archivo y línea si están disponibles.
- **No diagnostica mediante exploración adicional.**