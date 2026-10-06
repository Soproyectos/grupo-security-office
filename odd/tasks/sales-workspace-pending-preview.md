# Vista de prueba: flyer y pendientes del vendedor

Usuario pidió ver la propuesta con datos ficticios. Ruta de desarrollo: /sales?preview=pendientes. Solo se habilita con import.meta.env.DEV; /sales normal conserva su comportamiento.

Tres columnas de escritorio: flyer de campaña ficticia (SVG nuevo de ejemplo, no oferta real), indicadores centrales y Mis pendientes a la derecha. En móvil se apilan. Sin repetir acciones rápidas ni meta en laterales.
Ejemplos: factura vencida, factura abierta pendiente de pago, cotización por vencer, cotización sin seguimiento y cliente por contactar. Saldo/cliente/fecha/número de documento son ficticios.
Filtros Todos/Facturas/Seguimientos, detalles con próxima acción, Marcar atendido de simulación que retira el ejemplo hasta recargar, flyer ampliable solo imagen y equis.
No se insertaron registros en PostgreSQL ni se simularon pagos sobre facturas reales. Integración con fuentes reales de facturación/pagos y seguimiento sigue pendiente de diseño y validación de campos.

SalesHomePage separa la vista real SalesHomeContent de SalesWorkspacePreview según flag explícito de desarrollo. Archivo nuevo SalesWorkspacePreview.tsx y public/sales-promotion-preview.svg. SalesLayout recibe corrección de posicionamiento relative del enlace catálogo: el texto sr-only estaba fuera del área desplazable en móvil.
ESLint aprobado; build Vite real con mocks aprobado. Typecheck general conserva seis errores previos en Header y Auditoría, ninguno nuevo en la vista. Navegador demuestra filtros, detalle de factura y retiro local de pendiente. Screenshot en viewport del usuario 1430x721; revisar responsive móvil antes del cierre.
Sin commits/push/deploy producción/credenciales ni migraciones. Código servido por Vite del entorno de desarrollo en servidor soporte. Manifiestos de originales /tmp/seller-pending-preview-change.json y /tmp/seller-pending-mobile-fix.json. Preview separado con fixtures se compiló explícitamente DEV=true para inspección; no es bundle de producción.

Validación final: vista de escritorio revisada; móvil de 390 px sin desbordamiento horizontal. Captura de la propuesta guardada.

Simulación de cotización COT-PRUEBA-001: tres productos ficticios, cantidades y descuentos editables, IVA 19% y total inicial COP 1.904.000. Adaptador aislado en memoria en la vista previa 8768; sin escrituras en base de datos ni envío al cliente.
