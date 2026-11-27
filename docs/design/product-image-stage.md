# Fondo de las fotos de producto («escenario de imagen»)

**Regla permanente** (decidida por el dueño del producto el 2026-11-27). Aplica a la tienda pública y al portal del cliente.

Toda foto de **producto** se muestra sobre un escenario gris claro con foco de luz. Las fotos de producto tienen fondo blanco; al mezclarlas con `multiply` sobre el gris, el blanco desaparece y el producto se ve integrado, sin recuadro blanco.

| Parte | Valor |
|---|---|
| Fondo del marco | `radial-gradient(ellipse at 50% 45%, #f6f5f5 0%, #d0cece 130%)` |
| Imagen | `mix-blend-mode: multiply` y `object-fit: contain` |
| Borde fino de la tarjeta | `#c4c2c2` |
| Franja del título | blanca, con borde superior `#e3e6ec` |
| Enlaces y flechas «›» junto a la tarjeta | `#b30000` (el rojo puro `#FF0000` queda para el logo y detalles grandes) |
| Proporción | la misma en todas las tarjetas de un grupo (4/3 por defecto) |

## Dónde vive el código

Un solo lugar: `src/frontend/src/features/storefront/components/ProductImageStage.tsx`.
Exporta el componente `ProductImageStage` y las constantes `PRODUCT_STAGE_BG`, `PRODUCT_STAGE_BLEND`, `PRODUCT_STAGE_BORDER`, `PRODUCT_STAGE_TITLE_BORDER` y `PRODUCT_STAGE_LINK`. **No escribas otro fondo para una foto de producto**: usa el componente o las constantes. Si el dueño pide otro tono, se cambia ahí y se actualiza esta nota.

El componente saca la foto del flujo (`absolute inset-0`), así que la proporción propia de cada archivo no puede estirar el marco: todas las tarjetas del mismo tamaño miden exactamente lo mismo.

## Dónde se aplica hoy

- Portada: «Explora por categoría» y «Novedades en el catálogo».
- Tarjeta de producto compartida (`PublicProductCard`): búsqueda, categorías, subcategorías y carruseles.
- Ficha del producto (`ProductHero`): imagen principal y miniaturas.
- Cotización del cliente: miniatura de cada producto (`PortalQuoteDraftPage`).

## Qué NO cubre

Banners y volantes de campaña, logos, fotos de categoría (círculos, mega menú, listas de categorías), fotos de soluciones, reels y los paneles internos del personal (Biblioteca, tablas de productos, cotizaciones del personal). Si algún día el dueño quiere extenderlo a los paneles internos, se decide aparte.

## Al agregar un lugar nuevo con foto de producto

1. Usa `ProductImageStage` (o las constantes) en lugar de un `<img>` suelto con fondo propio.
2. Mantén la franja del título en blanco con el borde superior indicado.
3. Verifica a 1588, 1440, 768 y 390 px que las tarjetas de un grupo midan lo mismo.
