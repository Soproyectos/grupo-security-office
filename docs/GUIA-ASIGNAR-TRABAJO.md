# Cómo asignar trabajo a una persona

Cada usuario tiene su propia caja de herramientas. Super Admin elige qué herramientas aparecen y qué puede hacer con ellas. Dos personas pueden tener el mismo cargo y recibir trabajos diferentes.

## Primeros pasos

1. Entra como Super Admin y abre **Usuarios**.
2. Busca a la persona y pulsa **Paneles**.
3. Abre un área, por ejemplo **Gestión de tienda**, y después un apartado, como **Consultas de visitantes**.
4. Marca **Ver** para que pueda entrar. Marca **Atender consultas** si también debe responder y cerrar consultas.
5. Lee las acciones necesarias que aparecen debajo de cada casilla. Selecciónalas antes de guardar.
6. Escribe el motivo del cambio y pulsa **Guardar asignaciones**.

Una cuenta nueva comienza sin paneles. Puede iniciar sesión y usar su cuenta personal. Super Admin es la excepción: conserva el acceso reservado para administrar la plataforma.

## Un ejemplo

Ana y Luis tienen el cargo Consulta. Ana recibe **Productos → Ver**. Luis recibe **Productos → Ver** y **Publicar y retirar publicación**.

Ana consulta los productos de sus Listas. Luis puede publicarlos si cumplen los requisitos del catálogo. Ninguno puede editar un producto: para eso hace falta marcar **Editar**. Cambiarles el cargo no añade ese permiso.

## Acción y datos son dos decisiones diferentes

La acción indica **qué** puede hacer una persona. El alcance indica **con qué datos** puede hacerlo.

Para el catálogo también hay que asignarle las Listas correspondientes en **Acceso a Listas**, con su nivel de acceso. Ver productos no permite ver sus precios: se necesitan **Tarifas → Ver** y acceso a precios en esa Lista.

La cartera comercial es propia por defecto. Para trabajar con el equipo hay que marcar el alcance de equipo; la jerarquía limita qué personas incluye. Ver toda la empresa requiere su casilla separada. Ampliar el alcance no concede acciones.

Importar archivos necesita varias acciones porque el importador actual puede crear categorías, marcas y precios en el catálogo completo. La pantalla muestra estos requisitos; no los selecciona a escondidas.

## Qué ocurre al cambiar permisos

La API comprueba las asignaciones actuales en cada solicitud. Quitar un permiso bloquea la siguiente solicitud, aunque la persona tenga la sesión abierta. La pantalla vuelve a comprobar el perfil cada diez segundos y al recuperar el foco, y elimina los datos anteriores cuando cambia el acceso.

Si dos administradores editan a la misma persona, una pantalla antigua no puede sobrescribir la selección nueva: debe recargarla. Quitar una acción necesaria también quita las acciones que dependían de ella en la selección.

El cambio de permisos y su registro de auditoría se guardan juntos. La auditoría identifica quién cambió el acceso, a quién, cuándo, qué había antes y qué dejó seleccionado.

## Usuarios existentes y nuevas herramientas

Los permisos antiguos del rol aparecen como referencia histórica y no conceden trabajo. Antes de publicar este cambio hay que revisar a cada integrante y sus Listas. La herramienta de comparación y el procedimiento técnico están en [Implementación de acceso por usuario](IMPLEMENTACION-ACCESO-POR-USUARIO.md).

Una herramienta nueva debe tener pantalla, API, permisos, alcance, auditoría y pruebas antes de ofrecerla en esta selección. Banners ya está disponible localmente en **Configuración de la página → Banners**, con Ver, Crear, Editar, Publicar y Eliminar. La [guía de banners](BANNERS-Y-CONFIGURACION-PAGINA.md) explica imágenes, borradores, publicación y revisión local.
