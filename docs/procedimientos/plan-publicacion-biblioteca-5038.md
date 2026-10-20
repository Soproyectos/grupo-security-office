# Publicar la biblioteca oficial de 5.038 SKU en la web

Objetivo: que cada SKU de los 39 Excel oficiales se encuentre en la web pública con una categoría, sin inventar precio, imagen, stock ni nombre comercial. Un SKU pendiente puede mostrar su referencia como título provisional; debe quedar identificado como ficha informativa pendiente de enriquecimiento, no como artículo listo para comprar.

**Estado al iniciar (2026-10-20):** el endpoint público del VPS devolvía 497 productos. El manifiesto oficial contiene 5.038 SKU únicos, de los cuales 479 coinciden con esos 497; los otros 18 publicados no pertenecen a las 39 listas y se deben conservar. Publicar en GitHub el JSON no equivale a cargar la base ni a hacerlo visible en la web.

**Estado final (2026-10-20): publicado y conciliado.** El endpoint público devuelve 5.056 productos: los 5.038 SKU oficiales más los 18 SKU externos preservados. La comprobación completa encontró 5.038/5.038 oficiales visibles, ninguno sin nombre o categoría, ningún SKU público duplicado y los 497 productos de la línea base todavía presentes. La evidencia reproducible está en `biblioteca-publicacion-verificacion.json`.

La aplicación de producción quedó registrada en [GitHub Actions, ejecución 39485627374](https://github.com/Soproyectos/grupo-security-office/actions/runs/39485627374). El paso de importación protegida terminó correctamente; la conciliación externa de esa ejecución fue limitada por HTTP 429 al superar 60 solicitudes por minuto. El verificador se ajustó a 1,2 segundos entre páginas y la conciliación posterior terminó con `status: ok`. El flujo también admite el modo `verify`, que repite únicamente la comprobación pública y no escribe en la base.

## Ruta de entrega

1. Revisar y fusionar la cadena de PRs de SKU-only, contrato JSON, importador, generador/auditoría, nombres y exposición informativa. La rama integradora se fusiona a `main` solo cuando toda la cadena está verificada.
2. Confirmar que CI y CD desplegaron el mismo commit en el VPS. Un job verde sin despliegue efectivo no es suficiente.
3. Tomar un respaldo restaurable de la base destino, ejecutar el dry-run del manifiesto y comprobar que el plan no borra ni publica automáticamente los 18 SKU externos.
4. Aplicar el lote oficial una vez que el reporte sea aceptable. Conservar el reporte, el respaldo y el commit usado; nunca incluir credenciales o dumps en Git.
5. Habilitar la exposición informativa únicamente para las fichas del lote oficial, sin cambiar las reglas de publicación comercial que exigen precio, imagen y lista activa.
6. Verificar desde el endpoint público del VPS que los 5.038 SKU oficiales se encuentran una sola vez, cada uno con categoría. Comprobar además que los 18 SKU externos siguen presentes.

## Criterios de aceptación

- [x] La fuente sigue siendo exactamente los 39 Excel auditados: 5.367 filas de producto, 5.038 SKU únicos y 329 apariciones duplicadas.
- [x] Cada SKU oficial figura en la base destino una sola vez, con categoría resuelta. Los 198 renglones sin referencia siguen fuera hasta que se les asigne SKU.
- [x] Los registros pendientes muestran el SKU como nombre provisional y no anuncian precio, inventario o imagen inexistente.
- [x] La visibilidad informativa no altera `PUBLISHED` ni sortea el checklist de venta. La publicación comercial sigue siendo una acción separada.
- [x] La búsqueda y las páginas de categoría públicas muestran los 5.038 SKU oficiales; el detalle público no revela campos internos ni costos.
- [x] Los 18 SKU públicos ajenos a las 39 listas no se eliminan ni se ocultan.
- [ ] La lectura paginada del endpoint público concilia el conjunto exacto de SKU y categorías con el manifiesto, después del despliegue y de la carga.

## Fuentes y siguientes pasos

- [Auditoría y conteo por archivo](./auditoria-biblioteca-39-listas.md).
- [Contrato y carga del manifiesto](./importacion-masiva-biblioteca-vitrina.md).
- [Propuestas de nombres y aprobación posterior](./enriquecimiento-nombres-biblioteca.md).
- [Despliegue del VPS y respaldos](./deploy-vps.md).

No declarar «todos visibles» hasta guardar una verificación posterior a la carga contra el VPS. Si falla un SKU o una categoría, informar el faltante exacto y dejar el lote en estado de corrección.
