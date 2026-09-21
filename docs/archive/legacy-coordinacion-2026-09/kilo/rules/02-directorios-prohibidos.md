---
title: Directorios prohibidos por defecto
---
# 3. Directorios prohibidos por defecto

Salvo inclusión literal en el alcance de la tarea, bloquear lectura, búsqueda, indexación y edición de:

```
src/backend/
src/frontend/
api/
client/
config/
data/
docs/
vault/
memory/
skills/
tools/
legacy_python/
scripts/
nginx/
.github/
.opencode/
.claude/
.obsidian/
docker-compose.yml
docker-compose.prod.yml
.env
.env.example
package-lock.json
```

La prohibición no impide editar un archivo de esos directorios si Perplexity lo incorpora explícitamente con `@ruta` en la tarea.