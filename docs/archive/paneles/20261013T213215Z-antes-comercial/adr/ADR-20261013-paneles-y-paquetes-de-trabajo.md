# Diez paneles y paquetes de trabajo por usuario

**Estado:** estructura principal aprobada por el usuario el 13 de octubre de 2026; detalle e implementación de paquetes pendientes.

## Decisión

Grupo Security organizará su plataforma administrativa y tienda en diez paneles principales:

1. Comercial.
2. Catálogo y precios.
3. Tienda online.
4. Configuración de la página y promociones.
5. Pedidos y despachos.
6. Inventario y abastecimiento.
7. Servicio al cliente.
8. Informes y auditoría.
9. Usuarios y accesos.
10. Configuración técnica e integraciones.

Inicio y Mi cuenta siguen siendo accesos personales básicos. Sin asignaciones, Inicio no muestra información administrativa.

La selección se organizará como **Panel → Paquete de trabajo → Herramienta → Acción**. Por ejemplo: Comercial → Vendedor → Mis clientes → Ver/Crear/Editar. Seleccionar Vendedor prepara las acciones definidas en ese paquete y las muestra a Super Admin antes de guardar. El cargo organizativo Vendedor por sí solo no concede ese acceso.

Super Admin puede ajustar la selección por persona. Las acciones y el alcance de datos se revisan por separado. Una herramienta puede aparecer en varios paquetes usando los mismos permisos; la procedencia de cada concesión debe preservarse para retirar un paquete sin borrar el acceso que proviene de otro. Nuevas acciones o nuevas versiones requieren revisión antes de ampliar las asignaciones existentes.

## Motivo

La empresa necesita delegar trabajos distintos a integrantes que pueden tener el mismo cargo. Seleccionar un paquete completo reduce las casillas manuales, pero debe mantener visibles las acciones concretas, los datos autorizados y las dependencias.

## Consecuencias y siguiente etapa

- Reutilizar los módulos existentes y consolidar las diferencias entre la versión local y las ramas del servidor.
- Definir y revisar los hijos de cada panel, sus acciones, alcance, dependencias y auditoría antes de implementar paquetes.
- Incorporar al inventario los módulos reales del servidor, entre ellos promociones internas, agenda/solicitudes, notificaciones, portal de clientes y ficha técnica de productos.
- Precisar la responsabilidad de Yéminus antes de construir inventario, compras o facturación.
- Separar estructura aprobada, código disponible y funcionamiento verificado. La aprobación de los nombres no certifica procesos todavía inexistentes ni convierte prototipos en funciones operativas.

## Documentos

- [Estructura completa y checklist](../PROPUESTA-ARBOL-PANELES-2026-10-13.md).
- [Comparación con el servidor y la versión local](../COMPARACION-10-PANELES-2026-10-13.md).
