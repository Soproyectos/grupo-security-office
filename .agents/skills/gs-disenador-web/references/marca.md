# Marca — estado actual

Resumen factual para decidir estilo. Si un cambio depende de una decisión abierta, preguntar al usuario; no decidirla.

## Manual de marca
- Es un BORRADOR en `D:\Empresa\web-gruposecurity\MANUAL DE MARCA`. Sus campos CMYK, RGB y Pantone están vacíos.
- Muestra un rojo y un gris claro `#AEABAB`.
- Colores muestreados del logo: rojo ≈ `#C80000`–`#D01010`; gris del texto del logo ≈ `#404040`.

## Tokens implementados
- Acción: `--color-primary: #CE0203`; hover `--color-primary-hover: #AD0102` (en `src/frontend/src/index.css`).
- Espacio de trabajo de Biblioteca: tokens `--library-*` en `src/frontend/src/components/layout/library-workspace.css` (tinta, fondo, papel, bordes, selección, acción, cabecera).
- `--library-header` usa `--color-primary`: la cabecera de Biblioteca es roja.
- `index.css` conserva tokens globales heredados con matiz azulado (`--color-text-primary: #0F172A`, `--color-bg-surface: #F8FAFC`). No se cambian sin decisión del usuario ni se usan como modelo en pantallas nuevas de Biblioteca.

## Decisiones del usuario
- La cabecera de Biblioteca usa el rojo de marca (`--color-primary`). Aprobado por el usuario en octubre de 2026.
- Cabecera compacta de una sola fila, con subrayado rojo en el destino activo y sin espacio vertical desperdiciado.
- `DESIGN.md` todavía dice cabecera gris `#484748` y «rojo solo para acciones»: esa parte está desactualizada. Seguir la decisión del usuario e informar la desviación.

## Decisiones abiertas (no decidir)
- Gris del texto: `#404040` (sugerido por el logo) frente a `#484748` (actual).
- Códigos oficiales de color del manual final.

## Tipografía
- Roboto para cuerpo y controles; Roboto Condensed para títulos.
- No se añaden fuentes nuevas.

## Alcance
- No extender el estilo interno de Biblioteca a la ficha pública del producto que ve el cliente: ya está aprobada y queda fuera de alcance.
