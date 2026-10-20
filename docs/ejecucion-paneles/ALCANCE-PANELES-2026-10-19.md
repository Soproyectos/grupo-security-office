# Alcance vigente: paneles Comercial y Catálogo y precios

Decisión del usuario, 19 de octubre de 2026. Sustituye para esta continuación los pasos de la tanda anterior que pedían construir la exportación o reimportación completa de la Biblioteca, la conexión con Yéminus y la integración del Excel «Pedidos».

## Resultado esperado

Super Admin asigna trabajo por persona en **Usuarios → Paneles**. Un usuario nuevo sin acciones asignadas ve «Sin paneles asignados» y no puede acceder a rutas administrativas por URL directa. El cargo no concede acciones ni amplía el alcance. Cada acción tiene un alcance propio; al retirarla, la siguiente petición con la misma sesión pierde acceso.

Los dos paneles navegables son:

- **Comercial**: Vendedor, Supervisor comercial y Gestión comercial. Se conectan clientes, cotizaciones, metas, agenda y avisos internos que ya tienen datos reales. «Mi resumen» y «Agenda y tareas» son herramientas personales únicas. Las facturas de Yéminus y los pedidos de stock se muestran como pendientes de conexión, sin cifras inventadas ni simulaciones.
- **Catálogo y precios**: Gestión de listas y precios, Biblioteca de productos y Publicación del catálogo. Son los tres paquetes que hoy aparecen en el selector. Las acciones de Biblioteca se preparan para asignarlas en el futuro; todavía no habilitan exportación, reimportación ni cambios de fichas o medios. Las tareas de supervisión se asignan mediante acciones y alcances de estos paquetes, sin un cuarto paquete de supervisor.

## Comprobación de cada hijo

Una entrada está lista solo cuando enlaza pantalla, API, acción, alcance, datos autorizados y auditoría donde se modifica información. Comprobar usuario sin asignaciones, concesión, retirada con la misma sesión, recurso propio/ajeno y URL directa. Lo que dependa de reglas o fuentes aún no disponibles queda claramente pendiente en la pantalla y en el informe; no se hace pasar por funcionamiento completo.

La implementación continúa en la copia aislada `gs-tanda-01`; la web activa y los datos de producción requieren autorización separada para cualquier despliegue o migración.
