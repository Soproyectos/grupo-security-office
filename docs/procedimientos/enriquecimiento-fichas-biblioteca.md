# Enriquecimiento de fichas desde las 39 listas

Ejecutar los comandos desde `scraper-fichas/`. El inventario, la cola SQLite, los resultados y las decisiones se guardan en `data/`, excluido de Git.

## Preparar y buscar

```powershell
python -m scraper_fichas.enrichment `
  --lists-dir 'D:/Empresa/web-gruposecurity/listas/LISTA_DE_PRECIOS_EXCEL' `
  --library ../biblioteca-import-web.json --public-snapshot `
  --data data/piloto-hikvision-ciles

python -m scraper_fichas resume --data data/piloto-hikvision-ciles
```

Para cruzar con toda la Biblioteca usar `--complete-snapshot` y un JSON local autorizado con `products[]`, `sku`, `brand` o `brand.name`, `catalogBrand`, `catalogModel` y `lifecycleStatus`. Con el snapshot público histórico, los SKU que no aparecen quedan `sin_confirmar`. Si se encontraron contradicciones de marca, pasar `--identity-conflicts` con un JSON de registros `sku`, `marca_lista`, `marca_identificada`, `url` y `fecha`, y preparar en una carpeta nueva. La cola conserva la referencia interna y usa el modelo de fabricante del snapshot cuando existe.

El inventario conserva cada aparición de las listas y aparta Dahua, Imou y las identidades sin resolver. Revisar `resumen.json` y `piloto.json` antes de ejecutar. El recolector prioriza adaptadores de fabricante. Para Hikvision, usar HiTools con una sesión autorizada siguiendo las instrucciones del recolector. Las fuentes secundarias se pueden configurar en `sites.json` con `official: false` o consultar manualmente. Un resultado `completo` del recolector sigue siendo un candidato que Compras debe revisar. [Guía del recolector](../../scraper-fichas/README.md)

## Revisar y exportar

1. Copiar la evidencia pertinente de los resultados del recolector o de la búsqueda manual a `decisiones.json`. Guardar un registro por ficha con `sku`, `marca`, `categoria`, `subcategoria` si corresponde, `revisor`, `decision`, `especificaciones_esenciales` como pares `[seccion, campo]` y `evidencia[]`. Para datos desconocidos o que no aplican, conservar la decisión correspondiente en ese archivo.
2. Marcar `decision: aceptado` en los datos revisados y `decision: aprobada` en la ficha aprobada. Los campos `modelo`, `marca` y `nombre` requieren evidencia. Para las especificaciones usar `tipo_campo: especificacion`. Indicar `editor_independiente` en las fuentes secundarias usadas para corroborar cada atributo esencial. Marcar `principal: true` en una sola imagen y `reutilizacion_confirmada: true` en cada recurso autorizado.
3. Usar el editor de Biblioteca para el piloto. Para los lotes siguientes, generar un libro desde la plantilla vigente de Biblioteca y revisar sus cambios en la vista previa antes de aplicar.

```powershell
python -m scraper_fichas.review_export `
  --template data/piloto-hikvision-ciles/plantilla-catalogo.xlsx `
  --inventory data/piloto-hikvision-ciles/inventario-interno.json `
  --decisions data/piloto-hikvision-ciles/decisiones.json `
  --output data/piloto-hikvision-ciles/fichas-aprobadas.xlsx
```

Usar el editor para los archivos autorizados que se alojen en Biblioteca y para las propuestas sobre fichas protegidas. La tarifa se carga por el flujo interno y el panel comprueba que esté vigente antes de publicar. [Contrato de la plantilla](../biblioteca-dominio/plantilla-catalogo-columnas.md)
