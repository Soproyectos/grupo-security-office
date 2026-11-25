# Vitrinas destacadas de la tienda

> La selección y sus verificaciones se conservan aquí. El entorno de ejecución y la recuperación del frontend se describen en la [guía vigente del 24/11](2026-11-24-tienda-local-estado-vigente.md).

- Fecha 2026-11-23
- Ruta `/tienda`
- Estado `integrado` en el worktree local

## Diseño y evidencia

El visitante puede recorrer hasta doce equipos destacados de cada categoría y abrir el listado completo con «Ver todo». El orden editorial combina señales de demanda pública, utilidad y variedad de instalación. Se confirmó cada SKU en el catálogo público de Grupo Security, con fotografía y ficha comercial. La consulta del 23 de noviembre devolvió 378 cámaras, 94 alarmas, 143 equipos de acceso y cero productos en Casa inteligente. Los 36 seleccionados pertenecen a las tres categorías con productos y son Hikvision.

- **Cámaras.** Abren con cámara robotizada Wi-Fi de interior, PT de exterior, bala IP y torreta Turbo HD; se incluyen opciones con luz híbrida, visión panorámica y kit con cámaras. El liderazgo de las PT Wi-Fi es una señal del marketplace colombiano. Se eligieron los modelos Hikvision equivalentes disponibles en el catálogo propio. [Mercado Libre, cámaras de seguridad](https://listado.mercadolibre.com.co/hogar-muebles/seguridad-hogar/sistemas-monitoreo/camaras-seguridad/?filter=RESOLUTION_QUALITY), [oferta colombiana de cámaras Wi-Fi Hikvision](https://sumitelco.com/collections/camaras-y-sistemas-hikvision/wifi).
- **Alarmas.** Abren los kits AX Home, AX PRO e híbrido. Siguen sensores de apertura y movimiento, sirenas y control remoto. Se usaron referencias exactas para distinguir familias y variantes. [Catálogo de alarmas Hikvision](https://email1.hikvision.com/hubfs/PDFS/Cat%C3%A1logo%20Alarmas_Hubspot.pdf), [kit AX PRO en Colombia](https://www.syscomcolombia.com/producto/DS-PWA64KIT-WB-HIKVISION-207732.html).
- **Control de acceso.** Abren soluciones de videoportería y terminales faciales o de huella para una puerta. La fila incluye también control de dos puertas, lector y electroimán. La oferta local confirma la presencia de las familias; su posición refleja casos de uso para hogar, comercio e instaladores. [Oferta de Hikvision en Colombia](https://www.falabella.com.co/falabella-co/category/CATG27844/Seguridad?f.product.brandName=hikvision).

El catálogo público confirma publicación. Las cifras del marketplace describen señales de su canal. La selección editorial está en `src/frontend/src/features/storefront/constants/home-catalog.ts`. Casa inteligente se muestra cuando haya referencias seleccionadas y productos públicos.

## Contrato

El listado público existente acepta hasta doce parámetros `sku` repetidos. La comparación es exacta contra el SKU público de la revisión, con el campo vivo como respaldo. El filtro se combina con categoría y las reglas de visibilidad y precio ya aplicadas por el listado. La respuesta conserva `{data, meta}` y el orden propio del listado. El frontend aplica el orden de la selección y omite fichas informativas o referencias que dejaron de estar publicadas. La categoría se oculta al quedar vacía.

Ejemplo `GET /api/public/products?category=alarmas&sku=DS-PA201P-Kit-16WB&sku=DS-PWA64-KIT-WB&limit=2`.

El cambio es de lectura, sin cambios de esquema ni migración. La integración usa una petición por vitrina. Los consumidores que omiten `sku` siguen usando el mismo listado y filtros.

## Validación del 24 de noviembre de 2026

- Catálogo público. Se reconfirmaron las 36 referencias exactas, todas con ficha comercial y foto. Persisten 378 cámaras, 94 alarmas, 143 equipos de acceso y cero productos en Casa inteligente.
- Navegador local a 1430 y 375 px con la captura del catálogo publicado. Aparecen doce productos por vitrina en el orden seleccionado. Una referencia ausente, una ficha informativa y un artículo ajeno a la selección se omiten. Se verificó el parámetro repetido `sku` y una petición por categoría.
- Vitest de portada, vitrinas, tarjetas, búsqueda y servicio público. Pasaron 77 pruebas.
- Jest del servicio y controlador del catálogo público. Pasaron 61 de 62 pruebas, incluida la coincidencia exacta contra la revisión publicada. La prueba previa de subcategorías espera que se evite una consulta fuera de Cámaras. La implementación existente consulta y devuelve una lista vacía.
- ESLint de los archivos editados y TypeScript del backend completados. El chequeo global de TypeScript del frontend sigue marcando seis errores en precios asignados, comparación y autenticación.
