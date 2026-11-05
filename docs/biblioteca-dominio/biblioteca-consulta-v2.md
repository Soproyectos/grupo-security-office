# Consulta de producto en Biblioteca V2

Solicitud: rediseñar la consulta interna `/commercial/products/:productId` para hacerla más bonita y amigable, siguiendo Biblioteca V2. La ficha pública del cliente conserva su implementación. La consulta sigue siendo solo lectura aun cuando el usuario tenga permisos administrativos.

## Direction contract

THESIS: una ficha de consulta permite reconocer el producto y encontrar información, precios y archivos con una navegación breve; sustituye la antigua ficha administrativa de consulta reducida.

OWN-WORLD: hereda Biblioteca V2: tinta #183247, fondo #eef3f7, blanco, rojo institucional y Roboto existente. Galería contenida, datos bien agrupados, bordes discretos y controles familiares.

STORY: reconocer la referencia por su imagen, nombre y SKU; revisar sus características; consultar todas las tarifas autorizadas; abrir los recursos técnicos mediante los controles existentes.

FIRST VIEWPORT: regreso a Productos, galería a la izquierda, identificación y destacados a la derecha. Debajo, tres destinos claros: Información, Precios (si está autorizado) y Archivos. Una columna en móvil; los precios de consulta se presentan en filas adaptadas con tarifa, importe y vigencia visibles. Se verifica también el ancho indicado por el usuario, 1906×961.

FORM: extensión de Biblioteca V2, sin cambio de mundo ni nueva ronda de dirección; seed heredado:46988c3f56945ea6. Firma: identificar el producto y saltar directamente a la información comercial buscada sin entrar al editor.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Contrato funcional

- Mantener el guard de Consulta asignada explícitamente y `products:read`; no cambiar asignaciones ni el backend.
- Leer la ficha estructurada existente con `/products/:id/sheet`; mostrar solo sus campos comerciales, nunca notas internas, validación administrativa ni controles de publicación/edición.
- Precios con `prices:read`, siempre `mode=readOnly`; al retirar el permiso no debe quedar montada una pestaña de precios seleccionada anteriormente.
- Reutilizar ProductResources para documentos y firmware, preservando la confirmación de licencia.
- Diferenciar carga, fallo del producto y fallo de ficha complementaria. Conservar la información básica si falla la ficha estructurada y ofrecer reintento.
- Conservar las URLs y la navegación del catálogo. No borrar ni refactorizar la ficha legacy contextual.

Respaldo previo: `biblioteca-antes-consulta-v2.tar.gz`, 3.252 archivos verificados, SHA-256 `75dbf2ab89bf4dd0df81402cf880c7190e325d083a9f841e1d7469f95433deb6`, fuera del repositorio en los artefactos de esta conversación.
