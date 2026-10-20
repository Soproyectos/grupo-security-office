# Catálogo y precios: preparar, validar y publicar sin perder el trabajo

**Estado: diseño actualizado con las correcciones del usuario, 14 de octubre de 2026.** Este documento desarrolla el segundo de los [diez paneles](PROPUESTA-ARBOL-PANELES-2026-10-13.md). Describe cómo construirlo; no certifica funciones implementadas ni modifica accesos. La revisión de código de hoy es estática y local. Las diferencias con el servidor se conservan en la [comparación del 13 de octubre](COMPARACION-10-PANELES-2026-10-13.md); no se volvió a verificar su ejecución.

## 1. Qué ya decidió el usuario

- El panel reúne las listas que se cargan para actualizar precios y la administración manual de sus productos. «Compras» en esta conversación se refería a ese trabajo, no a órdenes de compra a proveedores.
- Cada usuario tendrá **Mi resumen** y **Agenda y tareas** con historial como herramientas personales independientes de los paneles. No son paneles adicionales ni se duplican por cada trabajo.
- Listas permite crear, cargar/actualizar, descargar y consultar cargas y modificaciones desde la misma pestaña.
- Biblioteca permite filtrar, crear, editar y eliminar productos, incluyendo su marca y categoría; descargarla con sus imágenes, documentos y datos, y volver a cargar ese mismo formato.
- Debe poder revisarse un producto, una selección o toda la Biblioteca, mostrando qué tiene y qué le falta. Los cambios deben provocar una nueva comprobación.
- **Confirmación del 14 de octubre:** al editar un producto publicado se conserva la versión pública y se publican los cambios cuando estén revisados.
- **Confirmación del 14 de octubre, ampliada por el usuario:** la ficha técnica es un complemento opcional. Si falta, se muestra una pequeña alerta informativa que no impide publicar. No se exigirá PDF por categoría.
- La ficha tendrá los apartados Información general, Fotos e imágenes, Identidad, Destacados, Características, Modelos, Especificaciones, Documentos y firmware, Notas y Atributos, y la acción Publicar producto.
- Publicar Biblioteca y Exportar Biblioteca permiten elegir un producto, una selección o toda la Biblioteca autorizada. Al exportar también se seleccionan los apartados incluidos.
- Un problema detectado en una lista no da acceso a la Biblioteca. Consultarla o editarla exige su permiso específico, incluso si se llega mediante un enlace.
- **Aclaración posterior del usuario:** Destacados contiene los puntos fuertes del producto. Modelos identifica las referencias a las que aplican una ficha o un firmware; es opcional y de prioridad baja, sin convertirse en un sistema nuevo de variantes.
- Se mantiene el acuerdo de [acciones y alcance por usuario](PANELES-Y-PERMISOS.md). Compartir un cargo no da el mismo acceso automáticamente.

Los apartados siguientes definen el diseño. Las correcciones expresas del usuario prevalecen sobre la propuesta anterior; las decisiones técnicas pendientes se identifican antes de implementar. No se delegará implementación basándose solo en el árbol del menú.

## 2. Recorrido de trabajo

1. La persona importa, crea una lista o abre una ya creada y autorizada.
2. Al abrirla ve cada producto y sus precios, tanto si las filas llegaron desde Excel como si se añadieron manualmente.
3. Compara las referencias y sus precios con los productos de la Biblioteca. Si no hay problemas, guarda la actualización de precios. La lista no crea ni modifica la identidad de las fichas.
4. El sistema comprueba los datos y señala problemas con enlaces para corregirlos.
5. Una persona con permiso de publicación revisa la vista previa y publica la revisión concreta.
6. La tienda utiliza esa revisión; quedan registrados autor, cambios, resultado y fecha.

Una misma persona puede preparar y publicar si recibió ambas acciones. Revisar el catálogo no introduce aprobación de ventas ni cambia la facturación de Yéminus. Si solo cambiaron precios se aplica esa revisión comercial; si cambió la ficha, se publica su revisión de Biblioteca mediante la acción correspondiente.

## 3. Nombres y navegación de la web

```text
Catálogo y precios
├── Listas
│   ├── Crear lista
│   ├── Importar
│   └── Abrir una lista
│       ├── Productos con sus diferentes precios
│       ├── Precios
│       ├── Historial
│       ├── Configuración
│       └── Exportar lista
├── Biblioteca de productos
│   ├── Productos
│   ├── Crear productos
│   ├── Importar productos
│   ├── Abrir un producto
│   │   ├── Información general
│   │   ├── Fotos e imágenes
│   │   ├── Identidad
│   │   ├── Destacados
│   │   ├── Características
│   │   ├── Modelos
│   │   ├── Especificaciones
│   │   ├── Documentos y firmware
│   │   ├── Notas
│   │   ├── Publicar producto
│   │   └── Atributos
│   ├── Publicar Biblioteca
│   └── Exportar Biblioteca
│       ├── Alcance: producto / selección / toda la Biblioteca
│       └── Apartados: los mismos de la ficha, seleccionables
└── Publicación del catálogo
    ├── Pendientes de revisión
    ├── Con problemas
    ├── Publicados
    └── Historial de publicación
```

Las opciones de crear, editar, importar, exportar, validar, publicar, archivar o eliminar son botones y acciones de cada página. No se convierte cada botón en una pestaña del menú. «Productos» es la tabla de la Biblioteca. Un usuario solo puede entrar desde una lista si tiene acceso explícito a Biblioteca y al producto: leer la fila de una lista no concede ese acceso. La interfaz y el API deben comprobarlo.

«Historial» es el nombre visible elegido para la pestaña; sus registros provienen de auditoría, sin duplicar una segunda pestaña con el mismo contenido. «Productos con sus diferentes precios» muestra la ficha resumida junto con las tarifas; «Precios» ofrece la vista de edición de tarifas, monedas y vigencias. Ambas usan los mismos registros.

Fuera de este panel, la navegación personal contiene **Mi resumen**, **Agenda y tareas** y **Mi cuenta**. No se repite una agenda o resumen nuevos dentro de cada panel.

### Mi resumen: herramienta personal independiente

Reúne indicadores de los trabajos asignados a la persona. Para Catálogo y precios muestra solo listas y productos autorizados: trabajo pendiente propio, listas próximas a vencer, productos con problemas, borradores y cambios pendientes de publicar. Cada cifra lleva al filtro correspondiente únicamente si tiene el permiso de destino. Un usuario sin asignaciones no recibe datos administrativos; las cifras de otros paneles conservan sus permisos y significado, sin mezclar ventas con trabajo de catálogo.

### Agenda y tareas: herramienta personal independiente

- Acceso desde la navegación personal, independientemente de Catálogo y precios. Vistas Mi día, Calendario, Pendientes e Historial; tareas con título, responsable, fecha, prioridad, estado y comentarios.
- Estados: Pendiente, En curso, Completada y Cancelada. Cambiar una fecha o reabrir una tarea queda registrado.
- Una tarea puede enlazar una lista, producto, importación o revisión. El enlace no concede acceso al elemento.
- Permisos propios para consultar y gestionar tareas personales; permisos adicionales para consultar tareas del equipo o asignarlas a otros. Estar en un equipo no permite ver notas privadas de todos.
- Los problemas de validación se muestran como pendientes; convertirlos en tareas es explícito para evitar crear cientos de tareas repetidas. La clave producto + regla + revisión evita duplicados.
- Si se retira acceso al recurso enlazado, se ocultan los detalles internos de la tarea que lo revelen y se bloquea el enlace. Se conserva la trazabilidad con acceso autorizado.
- Reutilizar el módulo de agenda/solicitudes existente en S3 después de inventariar sus contratos. Su presencia fue documentada el 13 de octubre; no existe el mismo módulo en este worktree local.

## 4. Cómo se trabaja dentro de una lista

**Cabecera:** nombre, código, responsable, vigencia, estado de la lista y estado de sus cambios. Acciones: Exportar lista y menú Más acciones para duplicar, archivar y eliminar, según permiso.

**Productos con sus diferentes precios:** muestra las filas importadas o creadas manualmente; buscar por referencia/nombre y filtrar por marca, categoría, tarifa, cambios pendientes y problemas. Se muestran referencia, nombre, precio por tarifa autorizado, vigencia, coincidencia con Biblioteca y resultado de validación. La vista **Precios** permite trabajar sobre esas mismas tarifas sin duplicar datos ni permitir editar la ficha global.

- Añadir fila: seleccionar o introducir la referencia y sus tarifas, comprobar la coincidencia y vincularla a un producto existente; no crea una ficha de Biblioteca. La búsqueda muestra solo la información mínima autorizada para esa lista, no toda la Biblioteca.
- Referencia sin producto: queda como fila pendiente de correspondencia. Crear el producto se hace en Biblioteca con permiso específico; luego puede resolverse la fila de precios.
- Editar precio: cambia la oferta de esa lista y tarifa; no altera los precios de otra lista.
- Consultar/editar ficha: solo ofrece el acceso a Biblioteca cuando la persona tiene sus permisos y alcance. Si no los tiene, la lista explica el problema de la fila sin revelar datos privados de Biblioteca; puede solicitar corrección al responsable. Llegar por URL directa tampoco concede acceso.
- Quitar de la lista: desvincula el producto de esa lista; conserva la ficha, archivos y pertenencia a otras listas.
- Acciones masivas: la pantalla distingue «seleccionados de esta página» de «todos los resultados del filtro» y muestra cantidad y alcance antes de ejecutar.

**Importar:** elegir archivo y lista destino → relacionar columnas → mostrar todas sus filas → comparar referencias/precios con Biblioteca y ofertas existentes → resolver errores → confirmar aplicación. Se puede iniciar desde Listas para crear una lista o actualizar una existente; al abrirla están disponibles sus filas y cargas. Guardar el archivo y una sesión no equivale a aplicar sus cambios.

**Actualización posterior acordada con el usuario:** [carga rápida de precios y plantilla](DISENO-IMPORTACION-PRECIOS-2026-10-14.md). Compras prepara precios finales por tarifa **con IVA incluido** y COP se expresa en pesos enteros. No habrá opción de tarifas sin IVA en este flujo. La plantilla simplificada conserva la hoja PRECIOS editada por el usuario y solo añade INSTRUCCIONES; se retiran Ejemplo, Tarifas y Contrato. Se sube ese mismo Excel con sus dos hojas, sin convertirlo ni quitar la guía; la web procesa únicamente PRECIOS. Se conserva el encabezado `ORO_IVA`, con correspondencia explícita por configurar antes de habilitarlo. La plantilla reconocida elimina la elección manual de columnas: Subir → Revisar cambios/redondeos → Aplicar. Los perfiles de proveedor se preparan una vez y reutilizan el mismo motor. Relacionar columnas queda para configurar/corregir esos perfiles, no como paso obligatorio de cada carga. No se calculan márgenes, se suma nuevamente IVA ni se crean productos automáticamente.

- Las listas son actualizaciones de precios: solo cambian valores, moneda, vigencia y vínculos de referencia autorizados. No sobrescriben nombres, marcas, categorías, imágenes, documentos ni firmware. La importación de fichas pertenece a Importar productos en Biblioteca.
- Referencias desconocidas: quedan pendientes de correspondencia. No crean borradores de productos desde la carga de precios. Solo quien tenga permiso de Biblioteca puede entrar a ella y crear la ficha; los demás pueden solicitar su revisión sin recibir accesos nuevos.
- Si una referencia desaparece del archivo, se informa; no se elimina el producto ni se publica una baja automática.
- Duplicados/conflictos de referencia, moneda incompatible, precio inválido o lista archivada bloquean las filas afectadas. La previsualización no escribe cambios de catálogo.
- Antes de aplicar, todas las filas incluidas en esa actualización deben estar correctas. Excluir filas pendientes exige una elección explícita y muestra qué queda sin actualizar; no se descartan errores silenciosamente para mostrar «Todo OK». El borrador conserva el archivo y sus filas pendientes.
- Precios cero no se interpretan como gratis por accidente; requieren una regla comercial explícita. Cálculos con decimales exactos, no números binarios aproximados.
- Las actualizaciones comerciales preparadas en una lista pública requieren la acción «Aplicar actualización de precios»: es la publicación de esa revisión comercial, separada de editar el archivo. La persona puede recibir ambas acciones.
- Una actualización de precios no obliga a republicar una ficha que no cambió. No modifica precios ya guardados en cotizaciones/facturas históricas.

**Exportar lista:** exportación XLSX de productos y tarifas autorizadas, con referencia, moneda y vigencia; selector de lista completa o selección. «Descargar plantilla» permanece como acción distinta: una plantilla vacía no es una descarga de los datos actuales. Costos/márgenes no se incluyen por tener permiso de precios de venta. Deben autorizarse por separado si se incorporan.

**Historial:** una pestaña con filtros por Cargas, Precios, Productos vinculados, Datos de lista y Publicaciones. Cada entrada muestra autor, fecha, cambios anteriores/nuevos, resultado y vínculo al detalle; el historial limitado de esta lista no exige acceso a toda la auditoría de la empresa. La edición global de una ficha puede mostrarse como cambio relacionado, identificado como tal.

**Configuración:** nombre, código estable, responsable, moneda y vigencia. Acceso a cada lista se administra con su permiso específico: asignar lectura de una lista no concede acciones administrativas de producto.

## 5. Biblioteca de productos

La ficha es única y permanente. Las listas vinculan esa ficha y definen sus ofertas. El mismo producto puede pertenecer a varias listas sin duplicar imágenes ni descripción.

### Tabla y filtros

Buscar por referencia y nombre. Filtrar por marca, categoría, lista, publicación, estado de revisión, imagen faltante, descripción faltante, documentos disponibles y última modificación. «Sin ficha técnica» sirve como filtro de trabajo, sin marcar el producto como inválido.

Columnas principales: referencia, nombre, marca, categoría, imagen, revisión de datos, publicación y última modificación. Mostrar completitud resumida y desplegar el detalle; evitar meter todos los campos en la tabla.

Botones: Crear productos, Importar productos, Exportar Biblioteca, Validar Biblioteca y Publicar Biblioteca. Con selección activa se aplica el alcance de la selección; para toda la Biblioteca se pide una elección explícita y se muestra la cantidad autorizada. Publicar no omite errores ni entrega permisos adicionales. Los procesos grandes muestran progreso y se pueden consultar aunque se cierre la pestaña.

### Ficha del producto

Apartados visibles y contenido:

- **Información general:** nombre, descripción y resumen del estado de la ficha. Los datos se editan aquí una sola vez, aunque el encabezado los repita para orientar.
- **Fotos e imágenes:** imagen principal, galería, orden y texto alternativo.
- **Identidad:** referencia, marca, categoría e identificadores del fabricante. Cambiar una referencia requiere control de duplicados y de sus relaciones; no crea otro producto silenciosamente.
- **Destacados:** puntos fuertes y beneficios breves, por ejemplo visión nocturna o resistencia al agua. Confirmado por el usuario; no controla aparecer en el inicio de la tienda, función que pertenece a Configuración de la página y promociones.
- **Características:** descripción funcional organizada por temas, evitando repetir la tabla técnica.
- **Modelos:** referencias a las que aplican una ficha o un firmware, según la aclaración del usuario. Mantener compatibilidad con lo que existe, pendiente de inventariar en S3. Es opcional y de prioridad baja; no modelar variantes con stock/precio ni bloquear publicación por no completarlo.
- **Especificaciones:** tabla técnica con tipos, valores, unidades y grupos; usa las definiciones de Atributos, sin duplicar valores.
- **Documentos y firmware:** fichas y manuales opcionales; firmware con versión, fecha, origen y referencias compatibles cuando estén disponibles. No inferir que cualquier archivo sirve para todos los modelos.
- **Notas:** observaciones internas; no se publican en la tienda ni se incluyen en una exportación ordinaria. Leer, editar y exportar notas exige sus acciones correspondientes.
- **Atributos:** definición y asignación de campos adicionales; sus valores técnicos tienen una sola fuente en Especificaciones. Crear/alterar una definición global exige permiso distinto de rellenar un valor del producto.

**Publicar producto** es un botón, no un apartado para editar datos. Acciones adicionales: Guardar borrador, Validar producto, Vista previa, Retirar publicación, Archivar y Eliminar, según permiso y estado. La validación se muestra en un panel de incidencias y el historial de la ficha se abre desde su acción; no se pierden esas herramientas por cambiar los apartados.

Cada apartado vacío muestra qué información puede añadirse; nunca rellena información inventada. Si falta ficha técnica aparece «Ficha técnica no disponible · Opcional» en la administración, sin error bloqueante. Los documentos añadidos deben ser utilizables y seguros.

Marcas y categorías se administran en esta misma Biblioteca con acciones propias. Editar la marca de un producto y renombrar una marca compartida son operaciones diferentes. Cambiar un nombre compartido debe crear una revisión de los productos públicos afectados; no puede saltarse la conservación de la versión pública.

Archivar conserva historia y relaciones. Eliminar es una acción aparte, con comprobación de dependencias; una ficha con cotizaciones/pedidos históricos no se borra físicamente mediante el flujo ordinario. No se reutiliza una referencia borrada para identificar otra cosa.

## 6. Validación: un solo motor, varios puntos de entrada

**Completitud** responde «¿están llenos los datos necesarios?». **Validación** responde «¿son utilizables y coherentes?». **Publicación** responde «¿qué versión puede ver el cliente?». Una ficha al 100 % puede contener una imagen dañada; no basta ese porcentaje.

### Resultado que verá la persona

- **Sin revisar:** aún no se ha comprobado esta revisión.
- **Con problemas:** hay errores que impiden publicar; cada error explica el campo, motivo y cómo corregirlo.
- **Lista para publicar:** no hay errores bloqueantes. Puede haber recomendaciones adicionales visibles.
- **Revisión pendiente:** cambió un dato, archivo o regla desde la comprobación anterior; el resultado anterior no sirve para autorizar publicación.

Ejemplo: «Falta imagen principal» lleva al apartado de imágenes solo con permiso para abrir/editar la ficha; «El precio de la tarifa pública venció» lleva a la oferta concreta autorizada. Sin permiso de Biblioteca el problema queda visible en su alcance de lista, sin habilitar el enlace ni revelar datos internos. «Sin ficha técnica» genera una pequeña alerta informativa persistente en el informe y la ficha administrativa, nunca un bloqueo ni notificaciones repetitivas. Puede publicarse con esa alerta.

### Reglas propuestas

- Base de ficha: referencia única, nombre útil, descripción, marca y categoría válidas, sin valores provisionales como «Sin marca» tratados como datos finales.
- Multimedia: imagen principal disponible y decodificable, archivos existentes, formatos/tamaños permitidos y sin amenazas detectadas. Documentos opcionales, con alerta informativa si falta la ficha técnica. Firmware y Modelos también son opcionales; si se proporcionan, se comprueba lo permitido por su contrato. Una URL escrita no demuestra que exista el archivo.
- Categoría: atributos realmente necesarios según el tipo de producto, con unidad y valor coherentes. No pedir resolución a un cable. Los atributos obligatorios concretos se deben acordar por categoría.
- Oferta: lista activa/no archivada, tarifa correcta para el destinatario, moneda y precio válidos y vigencia aplicable. Un precio de una lista interna no satisface la revisión de la oferta pública.
- Stock: se muestra como disponibilidad comercial, separado de la calidad de la ficha. Propuesta: cero unidades puede mostrarse como «Agotado» sin ocultar el producto; permitir vender/pedir depende de la política de compra y del ERP, pendiente de confirmar.
- El motor no garantiza que una fotografía corresponda al modelo ni que la descripción sea verdadera. El revisor puede comprobarlo con la vista previa; no se promete una validación automática de verdad comercial.

### Cuándo se ejecuta

La misma implementación se usa al guardar, cambiar archivos, importar, modificar en masa, cambiar reglas, solicitar validación manual y publicar. Tras un cambio se marca la revisión como pendiente inmediatamente y se recalcula. La comprobación ligera puede ser inmediata; los archivos y lotes se procesan en segundo plano.

El botón de Biblioteca revisa todos los productos autorizados del alcance mostrado, con filtros opcionales; no solo la página visible. El resultado muestra examinados, válidos, con errores, advertencias, omitidos y fallidos, con paginación y descarga del informe. Un fallo de procesamiento no se cuenta como producto válido.

Cada informe conserva revisión del producto, versión de reglas, oferta/tarifa/canal y fecha. Antes de publicar el servidor comprueba de nuevo las condiciones vigentes, incluidas expiraciones, archivo disponible y permisos. Si la edición cambió, devuelve conflicto y obliga a revisar la versión nueva. Una validación antigua no autoriza otro contenido.

Cambiar una regla marca los resultados afectados como pendientes. No retira automáticamente publicaciones existentes; genera incidencias para revisión. Un archivo declarado inseguro se bloquea de inmediato, aunque se conserve el resto de la versión pública.

## 7. Publicación: estado y bandeja de trabajo

**Recomendación:** conservar Publicación del catálogo como bandeja para quien revisa muchas listas o productos. Añadir botones de la misma operación en la lista y en la ficha. No mantener tres sistemas de publicación.

- Estado de vida del producto: **Borrador, Publicado o Archivado**. No agregar «Completo» o «Con errores» al mismo estado.
- Estado de revisión: Sin revisar, Con problemas, Lista para publicar o Revisión pendiente.
- Producto publicado con una edición: **Publicado · Cambios pendientes**. La tienda mantiene su versión publicada.
- Estado de lista: Activa, Inactiva o Archivada, con vigencia independiente. «Lista activa» no publica todas sus fichas.
- Publicar una selección desde una lista identifica exactamente fichas/ofertas afectadas y las revisiones; no publica automáticamente productos añadidos después.
- **Publicar Biblioteca** permite un producto, varios seleccionados o toda la Biblioteca autorizada y muestra revisión, cantidad y errores antes de confirmar. Se valida cada producto y se informa cuáles se publicaron y cuáles quedaron pendientes. «Toda» no amplía permisos ni selecciona revisiones nuevas que aparezcan durante el proceso.
- Si un producto ya es público por otra lista, incluirlo en otra no crea una segunda ficha pública. El canal/destinatario determina qué oferta está autorizada.
- Archivar una lista retira las ofertas de esa lista; conserva las fichas y otras ofertas válidas. Si un producto queda sin oferta pública, se aplica la política acordada de ocultarlo o permitir consulta sin precio; pendiente de decisión.
- Restaurar una lista o producto no republica automáticamente. Se revisan las vigencias y los cambios.
- La programación ya tiene base en el API; se conserva mediante el mismo servicio y una revalidación al ejecutarse. No habilita a un usuario sin permiso ni publica revisiones posteriores a la programada.

### Qué se conserva de cada versión pública

La publicación apunta a una revisión inmutable de los campos públicos permitidos de Información general, Identidad, Destacados, Características, Modelos, Especificaciones, Atributos y archivos aprobados, incluyendo los nombres de marca/categoría y el orden de imágenes. Notas internas y metadatos privados quedan excluidos. Los archivos usados por una publicación no se sustituyen ni borran al editar el borrador; se crean versiones nuevas.

Las ofertas comerciales tienen sus propias revisiones. Aplicar precios nuevos exige su acción explícita, aunque la ficha continúe publicada. Los endpoints públicos leen la ficha publicada y la oferta autorizada vigente, nunca el borrador ni campos internos. Las correcciones del editor y el archivo importado no pueden cambiar la tienda saltándose esta regla.

## 8. Descargar y volver a cargar la Biblioteca completa

**Propuesta: paquete ZIP «Biblioteca Grupo Security v1»**, con datos estructurados y los archivos reales. El nombre es propio de este proyecto; no se presenta como un formato existente ni como un backup de toda la aplicación.

Contenido lógico:

```text
biblioteca-grupo-security.zip
├── manifest.json          Versión, alcance, revisión y archivos esperados
├── products.json          Apartados seleccionados y referencias de archivos
├── brands.json            Marcas y sus identificadores de intercambio
├── categories.json        Categorías, jerarquía y atributos
├── products.xlsx          Hoja de trabajo legible/editable
├── assets/                Imágenes, documentos y firmware seleccionados
└── checksums.sha256       Comprobación de integridad
```

La especificación JSON es la fuente estructurada para reimportar. XLSX es una vista editable de campos acordados: el asistente pregunta si debe usar los cambios de esa hoja, valida sus referencias y muestra diferencias. Si JSON y XLSX discrepan, no adivina qué versión aplicar. El manifiesto declara cada archivo y su función; el contrato técnico exacto debe versionarse y probarse antes de programar el importador.

### Alcance y datos incluidos

- Elegir Toda la Biblioteca autorizada, Resultados del filtro o Productos seleccionados, con cantidad y tamaño estimados. «Toda» no elude las restricciones de acceso.
- Elegir, con casillas independientes, **Información general, Fotos e imágenes, Identidad, Destacados, Características, Modelos, Especificaciones, Documentos y firmware, Notas y Atributos**. Se puede marcar todo lo autorizado o solo lo necesario. «Publicar producto» es una acción y no una sección exportable.
- Notas no viene marcada por defecto ni se incluye por seleccionar «todos los apartados ordinarios». Solo se habilita con lectura/exportación de notas internas y una elección explícita; lo mismo se comprueba en el servidor y al descargar. El permiso general para exportar productos no concede ese acceso.
- Conservar siempre un identificador de intercambio, la referencia, la versión de formato y el alcance exportado como metadatos mínimos. Si Identidad está desmarcada no se exportan sus otros campos. La pantalla explica que las claves mínimas son necesarias para reimportar y no son información comercial adicional.
- Incluir los datos seleccionados y los originales disponibles de sus archivos, junto con las definiciones/referencias mínimas de marca, categoría y atributos necesarias para interpretarlos. UUID de origen es informativo; el servidor resuelve identidades locales y conflictos. No exportar el resto del catálogo de marcas/categorías por haber elegido un solo producto.
- El manifiesto declara apartados incluidos/omitidos y si es **Biblioteca completa** o **Exportación parcial**. Una exportación parcial sirve para actualizar esos apartados, no para anunciar una recuperación de datos que nunca incluyó.
- Modo adicional «Incluir listas y precios» requiere permisos de lectura/exportación de cada lista/tarifa, genera datos comerciales separados y una previsualización de lo incluido. Costos/márgenes tienen permiso específico si existen.
- No incluir usuarios, contraseñas, permisos, sesiones, auditoría interna ni facturas. Las notas internas solo entran mediante la opción explícita y autorizada anterior. Stock del ERP no se restaura desde un archivo de Biblioteca.
- Una exportación ordinaria captura el borrador de trabajo en una revisión coherente y declara que no restaura el estado público. Puede ofrecer exportar la versión pública como modalidad explícita; no mezclar versiones silenciosamente.
- Si un recurso solo existe como enlace externo o está perdido, indicarlo. Para un paquete anunciado como completo deben incluirse sus bytes; si faltan, la descarga se identifica como incompleta con informe o se detiene según la elección visible. No anunciar «completo» si solo contiene URLs.

### Reimportación y conflictos

Subir → inspeccionar paquete → verificar integridad y formato → comparar → elegir Crear nuevos / Actualizar existentes autorizados → resolver conflictos → confirmar → guardar borradores → validar → informe. Importar no publica.

- La referencia es la clave comercial existente. Coincidencias ambiguas, SKU duplicado o un ID origen que contradice la referencia bloquean la operación afectada; no se cambia una referencia en masa implícitamente.
- Distinguir campo ausente («conservar»), valor nuevo («actualizar») y borrado explícito («quitar», si está permitido). Un documento no incluido no equivale a eliminar el documento existente.
- Respetar los apartados declarados en el manifiesto: importar solo Imágenes no vacía descripción, atributos o documentos. La carga de Notas requiere permiso de edición de notas, aunque el archivo lo generó otra persona con permiso de exportarlas. Las definiciones globales de atributos/marcas/categorías requieren sus propios permisos; se puede relacionar con definiciones existentes sin modificarlas.
- Crear una ficha desde un paquete parcial solo es posible si contiene los datos mínimos de creación; de lo contrario se ofrece actualizar productos existentes o se informa lo que falta. No completar campos con datos inventados para aceptar la carga.
- El paquete no concede accesos, asigna usuarios ni define reglas de validación del servidor. Un estado «Publicado» dentro del archivo no publica nada.
- Calcular SHA-256 comprueba que el contenido no cambió accidentalmente; no prueba autoría ni convierte el archivo en confiable.
- La combinación campos + archivos de un producto se confirma de forma coherente. Si falla un archivo obligatorio, no queda una ficha parcialmente aplicada. El informe puede marcar otros productos como aplicados, pero no muestra éxito total con errores.
- Reintentar la misma operación no duplica productos, archivos ni eventos de éxito. Si cambió el producto después de la comparación, se detiene esa actualización y pide resolver el conflicto.
- La descarga tiene fecha de expiración y permiso revisado al generarse y al descargarse. Las importaciones se autorizan al iniciar y al confirmar; las operaciones restantes se detienen si se revoca el acceso.

### Protección del archivo

El servidor limita tamaño comprimido/descomprimido, cantidad de archivos, tiempo y memoria; rechaza rutas que salgan de la carpeta temporal, enlaces simbólicos, archivos anidados no admitidos y formatos activos inesperados. Verifica el contenido real de imagen/PDF y mantiene los archivos nuevos fuera de publicación mientras se revisan. No descarga URLs arbitrarias aportadas por el paquete. Excepciones para fuentes externas requieren un flujo técnico separado, con destinos permitidos y protección de red.

Firmware es un activo opcional de descarga, nunca un programa que el servidor ejecute o instale. Deben inventariarse los formatos que ya usa la plataforma y definir una lista permitida, tamaño máximo, origen, compatibilidad y revisión de seguridad antes de aceptar su carga/exportación/importación. Descarga como adjunto autorizado, sin renderizarlo como HTML. No tratar cualquier binario/ZIP como un documento seguro ni descomprimir firmware automáticamente. El formato de paquete debe identificarlo como tipo de recurso separado, con hash y referencias de modelos cuando estén disponibles.

Valores iniciales propuestos para el piloto: imagen hasta 8 MB (coincide con el límite del endpoint local), documento hasta 25 MB, ZIP hasta 250 MB y 1 GB expandido, hasta 10 000 entradas. Son límites configurables que deben confirmarse con el inventario real y pruebas de carga; bibliotecas mayores se exportan por partes con un manifiesto del conjunto. Una exportación enorme no se carga completa en memoria.

## 9. Paquetes y acciones para Usuarios → Paneles

```text
Catálogo y precios
├── Gestor de listas
│   ├── Consultar listas autorizadas
│   ├── Crear / Editar / Duplicar listas
│   ├── Vincular / Retirar productos de listas
│   ├── Consultar / Editar precios preparados
│   ├── Previsualizar / Aplicar importaciones de precios
│   ├── Aplicar actualización pública de precios
│   ├── Exportar lista / Consultar historial de lista
│   └── Archivar / Restaurar / Eliminar listas
├── Gestor de Biblioteca
│   ├── Consultar / Crear / Editar productos
│   ├── Gestionar imágenes / Gestionar documentos / Gestionar firmware
│   ├── Leer / Editar / Exportar notas internas
│   ├── Administrar marcas / Administrar categorías
│   ├── Rellenar atributos / Administrar definiciones de atributos
│   ├── Validar productos / Consultar informes
│   ├── Importar productos / Exportar Biblioteca
│   └── Archivar / Restaurar / Eliminar productos
├── Publicador de catálogo
│   ├── Consultar borradores y vista previa autorizados
│   ├── Validar / Publicar revisiones
│   ├── Retirar publicación
│   └── Programar / Cancelar publicación
└── Supervisor de catálogo y precios
    ├── Consultar trabajo del equipo autorizado
    ├── Consultar incidencias y publicaciones
    └── Consultar historial y resultados
```

Las barras separan acciones seleccionables, no permisos indivisibles. El paquete es una selección inicial que Super Admin revisa y ajusta; no entrega todas las operaciones por marcar el título del panel. Mi resumen y Agenda y tareas están fuera de los paquetes de Catálogo: reúnen solo los indicadores y actividades autorizados. Gestionar tareas de equipo o acceder a los recursos vinculados conserva acciones y alcances independientes.

El alcance se elige por separado: listas concretas, productos autorizados y equipo cuando aplique. El usuario puede exportar solo datos que ya puede leer, además de tener la acción de exportar y las acciones adicionales de los apartados restringidos; abrir o editar una ficha compartida exige acceso explícito de Biblioteca. Gestionar una lista no autoriza consultar toda la Biblioteca ni editar la ficha global que aparece en otras listas.

Los identificadores actuales (`products:*`, `listas:*`, `prices:*`) se conservan donde representen exactamente la misma acción. Nuevas acciones como validación, exportación completa, historial limitado y aplicación de precios requieren IDs estables y matriz de migración antes de habilitarse. No crear aliases que concedan edición global por heredar un permiso viejo de lista.

## 10. Construcción técnica propuesta

### Datos y migraciones

Conservar NestJS, React y PostgreSQL/Prisma. No añadir otro servicio de datos ni un gestor de colas externo para este diseño inicial.

- `Product` conserva la identidad estable. Proponer `ProductRevision` para los datos editables y una referencia a la revisión pública aprobada; incluir versión para concurrencia. No duplicar toda la base por publicación.
- Sustituir gradualmente la dependencia exclusiva de `Product.listaId` por pertenencia producto/lista explícita (`ListaProduct`). Migrar relaciones actuales sin duplicar SKUs.
- La oferta distingue lista de origen, tarifa/destinatario y producto. La unicidad actual de `Price(productId, priceListId)` debe revisarse antes de permitir el mismo producto y tarifa con precios diferentes en dos listas. Proponer revisiones de ofertas y una regla determinista de selección; no usar «el último precio» como solución.
- Proponer registro de activos con ID, revisión/hash, tipo real, tamaño, uso público/privado y comprobación de seguridad. Distinguir imagen, documento y firmware; agregar versión/origen y referencias de compatibilidad cuando corresponda. Reutilizar `UploadedFile` para bytes en PostgreSQL inicialmente; no mover archivos a otro almacenamiento en esta etapa. Mantener asociaciones de versiones para que editar no rompa lo publicado.
- Mapear los apartados públicos a una sola revisión de datos sin duplicar nombre o valores técnicos; notas internas en un dominio protegido que nunca se serializa hacia la tienda. Registrar en el contrato la definición de Destacados confirmada por el usuario. Modelos/compatibilidad se documenta sin crear infraestructura de variantes y se planifica después de las funciones prioritarias.
- Proponer reglas versionadas por categoría, ejecuciones de validación e incidencias con campo/código/severidad/solución/revisión evaluada. El servidor mantiene las reglas; un archivo importado no las redefine.
- Proponer trabajos persistentes de importación/exportación/validación con creador, alcance, revisiones objetivo, estado, progreso, checkpoint y resumen. Estados: En cola, En proceso, Completado, Completado con errores, Fallido, Cancelado y Expirado para descargas.
- Integrar tareas con el módulo compartido de agenda del servidor tras comparar los esquemas. No crear una tabla de tareas diferente por panel.

La estructura SQL final, política de retención y selección de tarifas se cierran antes de escribir migraciones. Se hará prueba de copia/reimportación en una base desechable y ensayo de respaldo/restauración antes de tocar datos existentes.

### Servicios y API

Proponer cuatro responsabilidades: revisiones de producto, revisión/completitud, paquetes de Biblioteca y publicación. Los controladores de productos/listas existentes actúan como adaptadores durante la transición; rutas antiguas, importación legacy y scheduler deben pasar por los mismos servicios.

Contratos a especificar en OpenAPI antes de implementar:

- Producto: leer borrador o versión pública, guardar revisión con versión esperada, comparar y previsualizar.
- Validación: crear revisión individual/selección/filtro autorizado, consultar progreso/informe e incidencias paginadas.
- Biblioteca: crear exportación con selección de productos y apartados, descargar paquete autorizado, cargar y previsualizar importación respetando apartados omitidos, confirmar/cancelar y consultar resultado. Proyecciones distintas para datos públicos, administrativos y notas internas.
- Listas: vínculos de producto, edición de ofertas, previsualización y aplicación de revisión comercial, descarga e historial limitado.
- Publicación: publicar revisión exacta/selección, retirar, programar o cancelar con los mismos controles desde cualquier pantalla.

Cada contrato define permiso, alcance, entrada validada, respuesta, paginación, conflicto de versión, límite, clave de reintento y evento. No se enumeran URLs nuevas como si ya estuvieran disponibles.

### Procesos largos, auditoría y consistencia

Un trabajador consulta trabajos persistidos en PostgreSQL, reclama uno con bloqueo/arrendamiento y registra progreso por lotes. Reanuda desde checkpoint tras reinicio, con reintentos limitados; una misma unidad no se procesa dos veces. El cliente consulta progreso sin tener que dejar la ventana abierta.

Guardar revisión, aplicar precio o cambiar publicación y generar su evento/outbox ocurre en una transacción coherente. Los bytes nuevos se preparan antes; las asociaciones se confirman junto con los datos y se limpian temporales fallidos después. La eliminación física de archivos exige comprobar que ninguna revisión pública/histórica los referencia.

Eventos propuestos: lista creada/editada/archivada; producto vinculado/retirado; revisión creada; archivo añadido/retirado; importación previsualizada/aplicada/fallida; exportación solicitada/generada/descargada; validación terminada; precio aplicado; publicación publicada/retirada/programada; tareas creadas/reasignadas/completadas y cambios de permisos. Conservar actor, entidad, revisión, origen lista/Biblioteca, trabajo, resultado y fecha. No registrar bytes, credenciales o enlaces de descarga secretos.

La auditoría de una operación no es una tarea editable de agenda. El historial del usuario permite leer sus eventos autorizados, sin borrarlos ni modificar estadísticas. Las estadísticas cuentan unidades confirmadas por ID de operación, no cada intento de procesamiento.

## 11. Qué existe y qué necesita trabajo

Evidencia local leída el 14 de octubre; no se ejecutaron pruebas funcionales ni se consultaron datos de clientes.

- `src/frontend/src/pages/ListaDetailPage.tsx`: pestañas Products/Prices/Access/Audit/Settings (línea 21), auditoría condicionada por permiso (77–80), descarga de plantilla (138–140). Aprovechable; no prueba una descarga completa ni historial unificado de importaciones/fichas.
- `src/frontend/src/pages/ListasPage.tsx`: creación, filtros y operaciones de archivo/restauración; conservar sus protecciones al reorganizar la navegación.
- `src/backend/src/modules/products/products.service.ts:874`: validación previa exige lista activa, precio vigente e imagen; bloquea stock registrado en cero. Recurre a un precio global si no encuentra uno de la lista. No equivale al motor completo propuesto y se debe evitar validar oferta pública con otra tarifa/lista.
- `src/backend/src/modules/products/lifecycle.types.ts`: DRAFT/PUBLISHED/ARCHIVED y eventos de transición; reutilizables. No guardar validación como otro estado del mismo ciclo.
- `src/backend/prisma/schema.prisma`: Product tiene `listaId`, `documents` JSON, imágenes, precios y campos de publicación; no se encontró una tabla de revisiones de producto con snapshot público. Hay `UploadedFile` con bytes en BD y `ImportSession` persistida.
- `src/backend/src/modules/products/import/pipeline/batch-executor.service.ts:272`: las fichas con `nameLockedAt` conservan identidad; fichas sin bloqueo todavía pueden recibir nombre, descripción, marca, categoría y atributos del archivo (312–319). Separar el modo «Actualizar precios» sin depender únicamente de ese bloqueo.
- `src/backend/src/modules/listas/listas.service.ts:663`: el borrado de lista incluye imágenes, precios y productos asociados. Debe cambiar su contrato antes de que Biblioteca sea permanente y multilistado. El historial actual consulta eventos propios `entity: LISTA` (210–219), por lo que no reúne automáticamente todos los cambios de producto/importación.
- `src/backend/prisma/schema.prisma:305`: precio único por producto/tarifa, no por lista comercial; dependencia para múltiples ofertas.
- `src/backend/src/common/security/access-catalog.ts`: acciones existentes agrupan publicar/retirar y archivar/restaurar, y el historial de lista depende de auditoría general. No activar separación nueva sin migración revisable.
- La agenda de S3 y la ficha técnica adicional están documentadas en la comparación previa. Deben leerse de nuevo en la versión elegida al integrar, sin asumir que este worktree contiene sus contratos.

No se utiliza el grafo archivado de septiembre como prueba del código de octubre. La evidencia anterior proviene de lectura directa y debe actualizarse al cambiar la implementación.

## 12. Orden para construir y comprobar antes de delegar

1. **Cerrar contratos de producto:** formato, referencia, campos, reglas por categoría, precio/canal y límites de publicación. Confirmar las decisiones abiertas del apartado 14.
2. **Congelar inventario y versión base:** comparar S3/S4/local; matriz pantalla → botón → API → permiso → alcance → datos → evento → prueba, incluyendo scheduler e importadores alternativos.
3. **Diseñar y ensayar migraciones:** Biblioteca/pertenencias, revisiones públicas, ofertas, activos e historial; preservar IDs y relaciones comerciales. Respaldar y practicar reversión.
4. **Revisiones y permisos:** implementar conservación pública y accesos antes de añadir ediciones en masa o cargas completas. Adaptar API pública a snapshots; impedir exposición de borradores/archivos.
5. **Listas e historial:** separar ficha y oferta, carga de precios, descarga y edición manual; aplicar precios de una revisión exacta.
6. **Validación:** motor compartido, errores accionables, reglas por categoría, estado pendiente y trabajos persistentes. Reutilizarlo en publicación.
7. **Paquetes de Biblioteca:** primero exportación y contrato, después previsualización/importación del mismo formato y pruebas de ida y vuelta con archivos.
8. **Bandeja y herramientas personales independientes:** integrar entradas desde lista/ficha y Mi resumen/Agenda y tareas fuera del panel, sin duplicar datos ni reglas. Modelos y ampliaciones de firmware tienen prioridad baja; preservar lo existente y cerrar sus contratos antes de ampliar.
9. **Piloto local:** permisos positivos/negativos, importaciones con fallos/reintentos, restauración y catálogo público. Solo después preparar tareas de implementación con propietarios y dependencias claras; producción requiere autorización propia.

## 13. Criterios de aceptación

- [ ] Un usuario sin asignaciones no consulta datos internos por menú, API, archivo ni trabajo en segundo plano.
- [ ] Dos personas con el mismo cargo realizan acciones diferentes según sus asignaciones. Un editor sin publicar guarda borrador sin cambiar la tienda.
- [ ] Editar una ficha publicada, sus imágenes o una marca compartida conserva la versión pública anterior hasta publicar la nueva revisión.
- [ ] Eliminar/desvincular una lista conserva la Biblioteca y los históricos comerciales. Archivar no elimina archivos compartidos.
- [ ] Actualizar precios no sobrescribe identidad ni cambia una oferta de otra lista/tarifa. Una oferta interna no cumple el requisito del canal público.
- [ ] Guardar, importar y editar en masa dejan pendientes los resultados obsoletos; el botón de validar y la publicación usan el mismo motor.
- [ ] La ausencia de PDF muestra una pequeña alerta informativa y no bloquea publicar. Un archivo malicioso o un error de precio sí produce la incidencia correspondiente.
- [ ] Mi resumen y Agenda y tareas aparecen como herramientas personales fuera de Catálogo; sus enlaces y cifras respetan los accesos asignados.
- [ ] Una persona con permiso de listas puede resolver precios sin recibir acceso a la Biblioteca. Los enlaces, las URLs directas, el API y las descargas rechazan el acceso global no asignado.
- [ ] Las filas manuales o importadas de una lista son precios vinculados a referencias; una referencia desconocida queda pendiente sin crear ni modificar identidad de Biblioteca.
- [ ] Toda la Biblioteca o un filtro se revisan completos, más allá de la página visible, sin saltarse el alcance autorizado.
- [ ] Exportar y reimportar recupera datos y bytes de imágenes/documentos con integridad comprobada. Falta de medios se informa sin anunciar un paquete completo.
- [ ] Exportar permite un producto, una selección o todos los autorizados, y elegir los diez apartados. Los metadatos mínimos se explican; las notas tienen permiso y selección explícitos.
- [ ] Reimportar una selección de apartados conserva los datos omitidos. Los apartados privados no aparecen en la tienda ni en descargas no autorizadas.
- [ ] Publicar Biblioteca procesa revisiones concretas autorizadas y deja un resultado por producto; un error no se disfraza como éxito global.
- [ ] Destacados representa beneficios del producto. Modelos es compatibilidad opcional de fichas/firmware y no un requisito de publicación ni un sistema de variantes.
- [ ] Un paquete alterado, con rutas peligrosas, archivos inválidos, privilegios falsos o revisiones en conflicto no aplica cambios indebidos ni publica.
- [ ] Reiniciar un trabajo, repetir una confirmación o revocar un permiso no duplica cambios ni permite continuar operaciones no autorizadas.
- [ ] Una tarea no concede acceso al producto enlazado; completar/cancelar/reabrir conserva su historial.
- [ ] Una publicación fallida no deja una mezcla de ficha/archivos públicos. No hay acceso público a borradores ni documentos privados por URL directa.
- [ ] Los procesos existentes que no se cambian mantienen sus pruebas. Para implementar: lint, typecheck, tests pertinentes y recorridos integrales locales, incluyendo API y sesiones.

## 14. Decisiones pendientes, sin bloquear este diseño documental

1. **Oferta pública:** cuando coincidan varias listas/tarifas, elegir la fuente y prioridad; confirmar si se permite mostrar un producto sin precio como «Consultar». No aplicar fallback a cualquier precio.
2. **Disponibilidad:** confirmar si agotados siguen visibles y si se permite solicitar/pedir sin stock. La fuente y sincronización de stock con Yéminus siguen pendientes.
3. **Campos por categoría:** acordar los atributos necesarios y el mínimo de descripción/imagen, sin exigir PDF. Quién administra esas reglas debe tener una acción separada.
4. **Paquetes grandes:** dimensionar bytes/productos reales, tiempos, retención, espacio y limpieza; validar o ajustar los límites iniciales antes del piloto.
5. **Versión de base:** elegir y reconciliar los módulos adicionales de S3 y el acceso granular local antes de implementar sobre una sola versión.
6. **Contrato de cada apartado:** concretar campos de Información general/Identidad, Características/Especificaciones/Atributos para evitar duplicación. Modelos ya tiene finalidad confirmada y baja prioridad; inventariar formatos y controles de firmware existentes antes de ampliarlos.

No hay autorización implícita para comprar herramientas, cambiar el ERP, migrar permisos actuales o desplegar producción. El trabajo de este documento es diseñar el proceso completo para revisión humana.

## 15. Investigación utilizada y límites

Consulta: 14 de octubre de 2026. Son fuentes primarias para comparar patrones; no implican instalar esas plataformas.

- **Akeneo, documentación SaaS Serenity, «Follow your product's completeness».** Explica requisitos por familia/canal y lista de atributos faltantes con acceso al campo. Apoya completitud visible y requisitos por tipo de producto. Nuestra propuesta añade coherencia de precio, archivos y versiones; no copia funciones de un plan comercial ni pretende que llenar campos demuestre exactitud. [Fuente](https://help.akeneo.com/en_US/serenity-take-the-power-over-your-products/187-serenity-follow-your-products-completeness).
- **Shopify, API Admin GraphQL 2026-01, ProductStatus.** Estado activo y publicación por canal son conceptos distintos. Apoya separar estado de vida y visibilidad; no decide las reglas de listas, revisiones o permisos de Grupo Security. [Fuente](https://shopify.dev/docs/api/admin-graphql/2026-01/enums/ProductStatus).
- **J. Kunze, J. Littman, E. Madden, J. Scancella y C. Adams, RFC 8493, octubre de 2018, BagIt v1.0 (informativo).** Describe paquetes con archivos y manifiestos de integridad. Inspira archivos reales + inventario/hash; el ZIP Grupo Security propuesto no se declara conforme con BagIt. El hash no autentica al autor. [Fuente](https://www.rfc-editor.org/info/rfc8493/).
- **OWASP, File Upload Cheat Sheet, guía web consultada hoy, sin versión numérica fijada.** Fundamenta comprobación de formatos/contenido, límites de archivos y descompresión, almacenamiento y autorización. No sustituye pruebas del importador ZIP concreto ni garantiza seguridad por elegir una extensión. [Fuente](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

La elección de bandeja más acciones contextuales, el nombre del paquete y los contratos de revisión son recomendaciones para Grupo Security basadas en sus necesidades y código; no estándares impuestos por esas fuentes.
