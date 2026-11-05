# Biblioteca para Compras: refinamiento con Impeccable y respaldo previo

El usuario autorizó implementar Impeccable para ver el resultado en la aplicación, después de guardar una copia del estado que funciona. El alcance conserva la identidad visual actual y todas las capacidades del editor, sin adoptar la maqueta reducida que el usuario rechazó. Se mantiene la ficha del cliente y la pestaña de carga masiva de precios.

## Copia recuperable anterior al cambio

- Rama: `Esnaider/validacion-biblioteca`; HEAD `cb230aa6fa206f142d4cdf8caf7a6a11fe3ebf00`.
- Archivo local fuera del repositorio: `biblioteca-antes-impeccable.tar.gz`, en la carpeta de artefactos de esta conversación.
- **3.164 archivos verificados individualmente** contra su SHA-256 al releer el archivo comprimido; tamaño 24.660.597 bytes.
- SHA-256 del archivo: `f2293cac44c22c8a58aa24f0adf2e0ae7b7309da99573051769da75c8488e41f`.
- `biblioteca-antes-impeccable.manifest.json` conserva rama, HEAD, estado de Git, archivos eliminados, tamaños y huellas de las fuentes copiadas. El manifiesto también está dentro del archivo como `BACKUP-MANIFEST.json`.

La copia incluye las fuentes actuales, los cambios sin commit y los archivos nuevos no ignorados. Omite secretos, dependencias y resultados generados. La configuración de entorno sigue en su ubicación y no se modificó. Es un respaldo de fuentes, no una copia de bases ni de archivos subidos. No se creó ningún commit, push o rama de respaldo vacía que pudiera confundirse con una copia de los cambios sin guardar.

## Instalación y uso de Impeccable

Se instaló la skill oficial de `pbakaus/impeccable`, revisión `3fd443d6828c8b9fefed4021e2d10528f6d7ee93`, versión declarada `4.8.0`, únicamente en `.agents/skills/impeccable`. Se usó el instalador de skills con checkout limitado a esa carpeta. El launcher de Windows descargó su motor con la verificación prevista por el proveedor; la caché quedó en los artefactos locales, mediante `IMPECCABLE_HOME`. Las ejecuciones se hicieron con `DO_NOT_TRACK=1`.

Se leyó `SKILL.md` y las guías `operate`, `distill`, `polish` y `craft-floor`. El comando `context --target src/frontend/src/pages/LibraryProductEditorPage.tsx` confirmó una implementación visual existente y permitió refinamiento acotado sin inventar un diseño nuevo. No se sobrescribió `AGENTS.md` ni se añadieron hooks automáticos a `.codex` o `.claude`. `PRODUCT.md` y `DESIGN.md` no se generaron por inferencia; el código y las decisiones explícitas del usuario son la referencia de esta intervención.

## Cambios de la aplicación

- **Fichas de producto:** el catálogo completo aparece por defecto, con búsqueda de nombre/SKU en el servidor, tarjetas/lista y contexto en la URL. Se conservan los filtros de pendientes y «Siguiente pendiente». Sus conteos se identifican expresamente como datos de la página cargada; no son estadísticas globales. El retorno desde el editor mantiene búsqueda, página y presentación.
- **Editor completo:** se conservan datos generales, imágenes, descripción, especificaciones técnicas, atributos extra, ficha pública estructurada, precios, notas, historial y mover/quitar. Se añade el acceso exacto a Ficha pública y navegación de secciones fija en escritorio, sin desmontar los formularios al saltar entre secciones.
- **Vista de tienda:** se retira el bloque que simulaba una vista previa incompleta. El acceso «Ver ficha publicada» abre la ruta real existente cuando el producto está publicado y visible, y aclara que corresponde a la revisión publicada. El renderer de cliente no se cambia.
- **Publicación desde el editor:** la sección aparece solo con la asignación explícita de Publicación y el permiso correspondiente. Guarda/descarta pendientes antes de actuar. El botón Publicar recalcula la validación y, si resulta apta, llama a la transición existente. El servidor conserva su comprobación final. Los errores abren el detalle de requisitos.
- **Precios y publicación:** sus escrituras se identifican por producto en TanStack Query. Publicar se bloquea mientras se cambia un precio; los cambios de precio se bloquean mientras se procesa publicación. También se vuelve a comprobar el bloqueo del borrador después de esperar la validación, para no continuar si el usuario editó durante la petición.
- **Página de revisión:** la ruta de Publicación utiliza una pantalla de Biblioteca con los datos comerciales de trabajo, especificaciones, recursos, precios de consulta y controles de publicación. No monta la antigua `pages/ProductDetailPage`. Las notas internas no se renderizan allí. Se reutiliza el componente existente de recursos para conservar la aceptación de licencias de firmware.
- **Bandeja de Publicación:** permanece abierta, con búsqueda y filtros visibles, contexto conservado en URL y entrada a la revisión también desde Historial. Error, carga y vacío son estados distintos. Se retira la referencia obsoleta a Listas del mensaje de error.

Los tres paquetes y sus límites permanecen independientes. Esta entrega mejora el recorrido compartido de Compras; no reclasifica permisos ni cambia la navegación para vendedores. El importador masivo, el backend, el esquema y la ficha del cliente permanecen fuera del delta funcional.

## Validación y límites

Comprobaciones finales ejecutadas:

- **Frontend completo: 1.003 pruebas aprobadas en 105 archivos**, mediante `npm run test -- --reporter=dot`. La ampliación detectó dos mocks de ruta que debían apuntar a la nueva página y una expectativa antigua del catálogo de permisos (`panels-20261019-3`); se actualizaron los tests a la ruta y al contrato actuales, sin cambiar los permisos del servicio. Se conservan los avisos anteriores de render SSR/Zustand del entorno de pruebas.
- `npm run lint`: sin errores, cinco advertencias preexistentes en SpecEditor, useToast, ListasPage y Login. ESLint dirigido final sobre todos los archivos de código/tests de este bloque: limpio.
- `npm run build`: TypeScript y Vite aprobados, 537 módulos. En Windows se usó el ajuste local de transferencia de esbuild ya documentado en la bitácora anterior; se conserva el aviso de bundle mayor de 500 KB. No se modificaron dependencias ni configuración de Vite por esa limitación del entorno.
- Detector mecánico de Impeccable sobre las seis pantallas/componentes finales modificados: salida 0, `[]` (sin hallazgos de ese detector). Hubo una ejecución anterior antes de la revisión visual; el resultado final posterior a los últimos ajustes es `impeccable-detect-final.json`. Es comprobación de fuentes, no certificación de accesibilidad de toda la aplicación.
- Chrome/Playwright sobre la aplicación React real: recorrido final aprobado, **122 peticiones interceptadas**, cero errores JavaScript y cero rutas de API sin fixture. Se comprobaron búsqueda por SKU y entrada al editor, presencia de todas las secciones, conservación de borrador al saltar de sección, guardado independiente, ficha pública estructurada, ancho móvil sin desbordamiento, revisión sin notas internas, bloqueo por precio en proceso, bloqueo de precios durante Publicar, cancelación de publicación si aparece un borrador durante la validación, validación antes de transición, requisito incumplido sin transición, programación, reprogramación, cancelación y despublicación. Perfiles de solo Publicación y solo Actualización conservaron sus límites.
- Vista local Vite en `127.0.0.1:5173`, conectada por el túnel local existente a QA. Salud HTTP: `status: ok`, `database: connected`, `environment: development`. El Vite y el túnel se volvieron a iniciar localmente; no se reinició ningún contenedor.
- Comparación de huellas contra el respaldo anterior: sin cambios en fuentes backend ni en los componentes de la ficha pública del cliente. El inventario del delta está en `biblioteca-impeccable-delta.json`; la instalación añade 63 archivos de skill. Las copias anteriores de los archivos tocados también se extrajeron a `biblioteca-impeccable-baseline` para facilitar revisión/restauración selectiva.

La revisión visual se realiza sobre el frontend real en Chrome mediante Playwright, interceptando **todas** las peticiones de API con datos ficticios. Esto permite comprobar formularios, permisos, borradores, estados y publicación sin escribir en QA. No sustituye la aceptación manual del usuario con la API real. Se conserva el informe y las capturas en los artefactos de esta conversación.

No se ejecutó una auditoría integral con lector de pantalla, axe ni dispositivo móvil físico. Los diálogos reutilizan el componente Modal existente; sus limitaciones anteriores de semántica/foco no se declaran resueltas por esta intervención. Pendiente aceptación manual de Compras sobre los datos de prueba actuales.

Limitación existente: el backend ofrece PUBLISH desde Borrador y UNPUBLISH desde Publicado; no existe una transición directa para promover una nueva revisión de un producto ya publicado. La interfaz no inventa «Publicar cambios» ni ejecuta una despublicación automática. La política de stock cero y las demás decisiones comerciales pendientes no se modifican. El historial global sigue sin implementarse; el historial por producto se conserva.

No se ejecutaron migraciones ni cambios de bases. No se desplegó ni reinició la API de pruebas o producción. Se volvió a iniciar la vista local de Vite y el túnel local ya utilizado para consultar la API QA, sin comandos remotos de cambio de servicios.

## Reversión

Verificar el hash del respaldo y extraerlo en una carpeta nueva, sin sobrescribir el worktree directamente. Recuperar del respaldo únicamente los archivos modificados por esta intervención; conservar los cambios previos del usuario y de Claude. Las fuentes nuevas de este bloque se identifican en el inventario del delta guardado en los artefactos. Eliminar únicamente esas fuentes al revertir, tras revisar que no tengan trabajo posterior. El entorno y las bases no forman parte de esta reversión.

No usar `git reset --hard`, `git clean` ni restaurar archivos completos desde HEAD: el estado de partida contiene trabajo anterior sin commit. La retirada de la skill es independiente de revertir los cambios de interfaz. No se ejecutó ninguna reversión.

## Rediseño V2 tras la revisión del usuario

El usuario indicó que el refinamiento anterior se veía prácticamente igual y pidió cambiar de forma visible la navegación, las pestañas y el estilo. Ante la elección de una sección a la vez o un formulario largo, delegó la decisión en criterios de UX/UI y familiaridad. El refinamiento previo se conserva como evidencia histórica; no se considera aceptado visualmente.

Se eligió un editor con índice lateral y sección única visible, sin secuencia obligatoria, con selector móvil. Las secciones conservan sus componentes y borradores montados; la ficha pública se monta al primer acceso. El cambio de sección usa React Router y conserva el estado de retorno, incluidos enlaces directos y Atrás/Adelante. Se protege la salida mediante enlaces del menú cuando hay cambios pendientes. Los errores de datos generales abren la sección que debe corregirse.

La navegación de Biblioteca ahora expone directamente Productos, Fichas de producto, Carga de precios y Publicación según la asignación explícita existente. Actualización sigue siendo el paquete de permisos que concede fichas y carga; no se agrega Consulta por su permiso dependiente de lectura. Se retiró la segunda fila de navegación y el enlace global Historial de cambios que solo decía Próximamente; el historial real de cada producto se conserva. La cola de edición abre como lista compacta, con búsqueda, precio de referencia cuando está autorizado y opción de tarjetas.

La identidad de Biblioteca tiene cabecera azul tinta, fondo claro, superficies blancas y acciones rojas institucionales. Se elimina el gran panel lateral de vista previa del editor; se conserva el enlace a la ficha pública real para productos publicados. La ficha que ve el cliente y el importador no se rediseñan. Publicación presenta filas de revisión y una página comercial con los controles de transición existentes.

### Segundo respaldo anterior a V2

- Archivo `biblioteca-antes-redisenio-v2.tar.gz`, en la carpeta de artefactos local de esta conversación.
- 3.234 archivos; 25.516.976 bytes; manifiesto `biblioteca-antes-redisenio-v2.manifest.json`.
- SHA-256 `cf82b503d74b49cf50443e332e33f924680ec46037d27cfb9b3bb03a5f1c092c`.
- Conserva la versión funcional refinada y los cambios anteriores sin commit. Mismas exclusiones de secretos, dependencias y archivos generados del primer respaldo. No es copia de base ni de cargas de usuarios.

### Comprobaciones de V2

- Frontend: 1.002 pruebas en 105 archivos, aprobadas. Se sustituyeron expectativas de la navegación secundaria eliminada por cobertura de los destinos y accesos actuales.
- ESLint: cero errores y las cinco advertencias anteriores del proyecto. TypeScript y Vite correctos, 540 módulos; persiste el aviso anterior de tamaño de bundle.
- Navegador Chrome sobre React real: 84 peticiones de API interceptadas, cero errores JavaScript y cero rutas sin fixture. Se comprobó búsqueda, nueve secciones, retención de borradores generales/ficha pública/notas, hash inicial y Atrás/Adelante, salida cancelada desde el menú, error que vuelve a Datos generales, bloqueo de publicación con borrador, validación antes de publicar y rechazo sin transición cuando falta precio. Se comprobaron perfiles separados de Actualización y Publicación. Ninguna petición de ese recorrido llegó a QA.
- Capturas en `.impeccable/review/`: catálogo, editor, ficha pública editable, bandeja y revisión de publicación en escritorio y móvil. Datos ficticios identificados como QA. La ausencia de desbordamiento de página no certifica por sí sola la legibilidad de tablas: se revisa también visualmente.
- Detector de Impeccable: dos avisos por conservar Roboto, la fuente del sistema existente. No se incorporan fuentes nuevas ni se interpreta ese detector como certificación de accesibilidad.
- Revisión visual independiente y documentación final del sistema: en curso al registrar esta entrada. Pendiente aceptación de Compras con la API real.

La implementación usa agentes económicos. Al no estar disponibles los tipos de agente propios de Impeccable en la herramienta de delegación, la revisión se asigna a un agente nuevo, sin historial heredado, con las instrucciones de revisión de la skill. No se ejecutan migraciones, despliegues, cambios de bases ni reinicios remotos; no hay commit ni push.

[Decisión, fuentes UX y contrato de diseño](../biblioteca-dominio/biblioteca-v2-diseno.md).

### Cierre de revisión V2

El revisor independiente pidió dos correcciones materiales: evitar que la tabla de precios partiera importes/acciones en móvil y retirar la barra general de guardado de secciones que ya guardan por separado. Se aplicaron ambas, se repitió el recorrido de navegador (84 peticiones interceptadas, cero errores/rutas faltantes) y se recapturaron los mismos tamaños, incluido el extremo de acciones de la tabla. La segunda pasada calificó ambas correcciones como **resueltas**, sin regresiones visibles en esas capturas, con disposición **ship al alcance de la tanda revisada**. No es una certificación completa de accesibilidad ni la aceptación manual del usuario.

La tabla ahora conserva importes legibles con desplazamiento horizontal dentro del panel; el contenedor es enfocable con teclado y muestra una indicación en móvil. El guardado general solo aparece con datos generales/descripcion/especificaciones pendientes, un guardado en curso o un error; en móvil permanece en el flujo. El éxito dice «Datos generales guardados» junto a la cabecera durante cinco segundos. Ficha pública y notas conservan sus guardados propios.

Comprobación final posterior a esas correcciones: **1.003 pruebas en 105 archivos aprobadas**, ESLint cero errores/cinco advertencias preexistentes y TypeScript/Vite correctos (540 módulos). El proxy local de salud informa `ok`, `development` y base `connected`. El cotejo con el segundo respaldo no registra cambios backend ni en el renderer público del cliente. Se retiró únicamente una carpeta temporal de caché de compilación creada durante estas pruebas, tras verificar su ruta dentro del worktree.

Se documentó el sistema construido en `DESIGN.md` y `.impeccable/design.json`, limitado a Biblioteca V2. Los roles específicos de Impeccable no están registrados en la herramienta; la revisión y documentación se realizaron con agentes separados usando las instrucciones equivalentes de la skill. No se instalaron dependencias de la aplicación. La tarjeta de calidad oficial se conserva fuera del repositorio como referencia; no es un comp aprobado ni un recurso de la interfaz.

Pendiente: aceptación manual de Compras con los productos y la API de pruebas actuales. Se conservan los dos respaldos anteriores y el frontend local en `http://127.0.0.1:5173`. La API y las bases no fueron desplegadas, migradas ni reiniciadas en V2.
