# Consulta interna de productos: Biblioteca V2

## Solicitud y alcance

El usuario pidió una consulta más bonita y amigable desde `/commercial/products/:productId`, indicando un viewport de 1906×961. Se amplió la identidad de Biblioteca V2 al detalle interno de solo lectura, conservando la ficha pública del cliente y los flujos de edición, precios masivos y publicación.

Archivos: `src/frontend/src/pages/LibraryProductConsultationPage.tsx`, su CSS y spec; el import de detalle en `App.tsx` y su mock de prueba en `App.spec.tsx`. La página legacy se conserva para evitar una reescritura de sus superficies contextuales y helpers probados. Los guards de Consulta aplicada explícitamente y `products:read` permanecen en la ruta.

## Resultado

- Galería con imagen principal y miniaturas, nombre comercial, SKU copiable, marca, categoría, modelo y destacados.
- Tres destinos: Información, Precios y Archivos. Navegación de pestañas con flechas, Inicio y Fin; los accesos directos llevan el foco al contenido elegido.
- Información de la ficha estructurada existente: características, grupos de especificaciones, modelos, referencias del fabricante y datos básicos/técnicos del producto. Nunca se renderizan notas internas.
- Precios con permiso independiente `prices:read` y componente compartido en `mode=readOnly`, incluso para administradores. En móvil, cada registro presenta tarifa, importe y vigencia sin desplazamiento horizontal. La retirada del permiso elimina la pestaña y su contenido aunque estuviera seleccionada.
- Documentos y firmware reutilizan ProductResources y su confirmación de licencia. Se conservan enlaces de documentos anteriores, evitando repetir URLs ya presentes en la ficha estructurada.
- Estados de carga y error separados: si falla la ficha complementaria, siguen disponibles los datos básicos y se ofrece reintento.

El selector de feedback sugería un wrapper Biblioteca duplicado. La inspección de las fuentes no encontró esa duplicación: el wrapper sigue perteneciendo únicamente a CommercialLayout; el detalle nuevo usa su propio prefijo `library-consultation`.

## Respaldo

Antes del cambio se guardó `biblioteca-antes-consulta-v2.tar.gz`, fuera del repositorio en los artefactos de la conversación. 3.252 archivos verificados individualmente, 26.498.313 bytes; SHA-256 `75dbf2ab89bf4dd0df81402cf880c7190e325d083a9f841e1d7469f95433deb6`. Incluye fuentes actuales sin commit y excluye secretos, dependencias y datos externos; no es respaldo de base ni archivos de usuarios.

## Evidencia

- Suite frontend completa: 1.010 pruebas en 106 archivos aprobadas. Las 21 pruebas dirigidas de consulta/rutas también pasaron; se comprueban campos comerciales, ausencia de notas/acciones, acceso a precios, información básica sin ficha y recursos/licencia.
- ESLint: cero errores y las cinco advertencias anteriores del proyecto.
- Recorrido Chrome sobre React real: 35 peticiones interceptadas con fixtures ficticios, cero errores JavaScript sin manejar, cero rutas sin fixture y cero peticiones de escritura. Se verificaron galería, copia de referencia con portapapeles simulado (sin cambiar el del usuario), navegación por teclado, precios read-only con permisos administrativos, licencia de firmware/cancelación, fallo de ficha/reintento y perfil sin permiso de precios.
- Capturas en `.impeccable/review/consulta-*`: 1906×961 solicitado, escritorio de 1440×1000, móvil de 390×844, precios, archivos y fallo complementario. Las imágenes de producto de las capturas están identificadas como ficticias y pertenecen únicamente al fixture; no se incorporaron nuevos recursos gráficos a la aplicación.
- Detector de Impeccable sobre los archivos nuevos: `[]`. No es una certificación integral de accesibilidad.
- Revisión independiente con las instrucciones equivalentes de finish-reviewer: disposición **ship**, sin correcciones materiales. La revisión compara con el contrato y Biblioteca V2; no existe un comp aprobado para esta extensión.
- TypeScript y Vite aprobados en la comprobación final: 534 módulos. Persiste el aviso anterior de bundle mayor de 500 KB. El primer control detectó dos accesos de índice posiblemente indefinidos en la navegación de teclado; se añadió la comprobación del destino antes de usarlo y la compilación final pasó.

- El documentador cotejó la extensión con DESIGN.md y .impeccable/design.json y los conservó: no hay cambios de paleta, fuentes ni mundo visual. La presentación móvil de precios en filas es una excepción local de Consulta documentada en su contrato; el resto de Biblioteca mantiene sus tablas actuales. Los roles específicos de Impeccable no están registrados; revisión y cotejo se hicieron con agentes separados usando sus instrucciones equivalentes.

La prueba automatizada no escribe en QA ni valida el contenido real de la referencia seleccionada por el usuario. Pendiente aceptación manual en esa ficha y revisión con tecnología asistiva/dispositivo móvil físico. La vista local sigue usando la API de pruebas existente; su salud informa `ok`, `development` y `connected`.

## Reversión

Revisar el respaldo y restaurar selectivamente el import de App y el mock anterior; retirar los tres archivos nuevos de consulta únicamente si no tienen trabajo posterior. Mantener el resto de V2 y el trabajo de Claude. No usar reset global ni limpiar el worktree. No se hicieron commits, push, migraciones, despliegues, cambios de base ni reinicios de contenedores.

[Contrato de consulta](../biblioteca-dominio/biblioteca-consulta-v2.md).
