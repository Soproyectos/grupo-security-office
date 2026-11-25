# Selector técnico del catálogo

> Registro histórico. La nota inicial de ausencia de validación visual no describe las verificaciones registradas posteriormente. Consultar la [guía vigente del 24/11](../handoffs/2026-11-24-tienda-local-estado-vigente.md).

Se implementó el selector por requisitos solicitado por el usuario. El trabajo está en la rama local `Esnaider/sad-golick-8a6b22`. El contrato y la cobertura observada están en `docs/handoffs/2026-11-23-selector-requisitos.md`.

El backend incorpora un helper de parámetros por familia, una consulta pública de facetas y un filtro exacto aplicado antes de paginar. Usa la misma revisión publicada y regla de visibilidad del catálogo. El frontend comparte el listado paginado entre categorías y subcategorías, presenta requisitos en filas y conserva la selección en la URL. Vite enruta las consultas nuevas a la API local actualizada.

## Comprobaciones

- Backend `node ./node_modules/typescript/bin/tsc -p tsconfig.build.json --incremental false --outDir <temporal>` pasó.
- Backend `node ./node_modules/jest/bin/jest.js --runInBand --testPathPatterns=public-requirements.spec.ts` pasó con seis casos.
- Frontend `node ./node_modules/vitest/vitest.mjs run src/services/public-catalog.service.spec.ts src/features/storefront/hooks/usePublicProductPage.spec.ts` pasó con 26 casos.
- ESLint de los archivos modificados pasó.
- TypeScript del frontend no pasó por seis errores en archivos de comparación/precios y pruebas de sesión ajenos a este selector.
- La consulta real de lente fijo en cámaras analógicas informó tres coincidencias y devolvió total tres con una página de un producto. Una categoría con tipo array fue rechazada con HTTP 400.
- Render visual no comprobado. El navegador de Codex agotó el tiempo de conexión.

## Operación y reversión

La web usa `5181`, el catálogo actualizado usa `4314`, y el portal conserva su API en `4312`. Todos son procesos locales y las APIs auxiliares escuchan en loopback. Se conserva la base existente. La actualización no necesita migración ni escritura de datos de productos.

Para revertir la activación local, retirar `VITE_CATALOG_API_TARGET` del arranque de Vite y reiniciar el frontend con la configuración anterior. El selector depende del endpoint nuevo, por lo que la reversión completa de interfaz debe hacerse mediante un diff acotado de este cambio, preservando las modificaciones previas del usuario. Los procesos originales de catálogo y portal siguen disponibles.
