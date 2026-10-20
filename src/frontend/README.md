# `src/frontend/` — Frontend React

Interfaz de usuario de Grupo Security Office. Construida con React + Vite + TailwindCSS.

## Archivos clave

| Archivo | Descripción |
|---|---|
| `Dockerfile` | Imagen Docker del frontend. |
| `eslint.config.js` | Configuración de ESLint. |
| `index.html` | Template HTML raíz. |
| `nginx.conf` | Configuración de nginx para servir archivos estáticos. |
| `package.json` | Definición del paquete frontend con Vite y TailwindCSS. |
| `postcss.config.js` | Configuración de PostCSS. |
| `chrome-analyze.cjs` | Script de análisis de bundle de Chrome. |
| `grupo-security-frontend.zip` | Distribución empaquetada del frontend. |
| `dist/` | Build de producción (generado). |
| `node_modules/` | Dependencias (generado). |

## Subcarpetas

| Ruta | Descripción |
|---|---|
| `src/` | Código fuente: componentes, hooks, vistas, rutas, stores, utils. |

## Relación con otros directorios

- `src/backend/` — Backend NestJS que esta API consume.
- Ver [README del proyecto](../README.md) y [docs/00-INDEX.md](../docs/00-INDEX.md).
