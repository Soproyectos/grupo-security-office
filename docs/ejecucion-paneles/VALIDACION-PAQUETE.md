# Comprobación del paquete de ejecución

**14 de octubre de 2026.** Se prepararon **30 paquetes y 99 pasos** para Comercial, Catálogo y precios e importación de precios. Solo BASE-01/inventario está preparable al inicio; no se han ejecutado ni aceptado tareas de aplicación desde este paquete.

Pasaron `preparar-tarea.mjs --check`, **13 pruebas Node del organizador** y la comprobación de enlaces locales. Se generó `PRIMER-ENCARGO.md` en UTF-8: contiene solo el prompt, contexto común y BASE-01/inventario. Los comandos están en el README.

Dos revisiones de solo lectura contrastaron las fichas con los diseños y archivos actuales. Sus correcciones incorporaron resolución de alcance por acción, subpasos explícitos, independencia de descuentos y contratos ERP, integración posterior de indicadores, atención parcial de solicitudes sin stock, archivos reales de catálogo y transmisión de decisiones/contratos al implementador.

La prueba del resolver en BASE-04 no se presenta como autorización HTTP ya integrada: los módulos consumidores se verifican en sus tareas. Una aceptación sin contrato o informe existente impide emitir implementación; una entrega parcial no habilita dependencias.

Esta comprobación certifica únicamente la estructura y el preparador dentro del alcance revisado. No acredita implementación de los dos paneles, conexión PostgreSQL, pruebas de navegador ni publicación. Se conservaron los trabajos previos; esta entrega añade documentación y herramientas de preparación, sin modificar la aplicación.
