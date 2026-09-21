---
title: Regla de Contexto Cerrado
---
# 2. Regla de contexto cerrado

Toda tarea de implementación debe incluir `## Alcance estricto` con archivos escritos mediante `@ruta`.

Kilo debe:
- Abrir únicamente los archivos enumerados en `## Alcance estricto`.
- Leer solo los rangos de líneas o secciones solicitados, cuando estén indicados.
- Usar exclusivamente los archivos abiertos como evidencia de implementación.
- **No ejecutar búsquedas globales.**
- **No usar indexación de workspace.**
- **No recorrer directorios.**
- **No descubrir imports, usos, referencias, rutas o componentes fuera de la lista autorizada.**
- **No abrir automáticamente archivos relacionados.**
- **No inspeccionar historial Git, commits, pull requests, documentación, agentes heredados ni configuraciones no autorizadas.**

Si falta cualquier archivo, símbolo, tipo, contrato API, componente, ruta, variable de entorno, script, dependencia o decisión técnica, debe terminar sin editar con este formato exacto:

```
ESTADO: BLOQUEADO
MOTIVO: Falta contexto autorizado para completar la implementación.
DATO FALTANTE: [descripción técnica precisa]
ARCHIVO O INFORMACIÓN REQUERIDA: @[ruta exacta] o [pregunta concreta para Perplexity]
NO SE MODIFICÓ NINGÚN ARCHIVO.
```