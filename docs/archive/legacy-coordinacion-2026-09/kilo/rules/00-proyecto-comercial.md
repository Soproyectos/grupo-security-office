# Proyecto: Plataforma Comercial — Grupo Security

## Propósito
Desarrollar el módulo comercial por incrementos pequeños para que el área de compras pueda:

- Crear y administrar listas comerciales.
- Crear productos dentro de una lista.
- Asignar y actualizar precios por producto y lista.
- Cargar precios masivos mediante Excel/CSV.
- Definir quién puede ver, editar o administrar cada lista y sus precios.
- Activar, desactivar, ocultar o publicar productos.
- Gestionar proveedores y evaluarlos.
- Confirmar y controlar stock.
- Gestionar solicitudes y órdenes de compra.
- Mantener auditoría de acciones críticas.

## Regla de negocio principal
El flujo objetivo obligatorio es:

1. Crear o seleccionar una Lista.
2. Crear el Producto dentro de esa Lista.
3. Registrar el Precio y su vigencia.
4. Definir los permisos de visibilidad y edición de la Lista.
5. Activar o publicar el Producto solamente si cumple las validaciones.

No implementar creación de productos sin una lista asociada.

## Estado actual conocido
Ya existen funcionalidades de productos, múltiples listas de precios por producto, vigencias, importación Excel/CSV, catálogo general, usuarios, roles, asignaciones y auditoría básica.

## Restricciones
- No eliminar ni romper funcionalidades existentes.
- No modificar modelo de datos, base de datos o migraciones sin un plan documentado y aprobación humana.
- No exponer precios ni listas a usuarios no autorizados.
- No permitir precios negativos, vigencias inválidas ni solapamientos no controlados.
- No guardar secretos, tokens o credenciales en el repositorio.
- No desarrollar funcionalidades fuera del incremento activo.

## Forma de trabajo
- Trabajar solamente en una tarea o incremento por solicitud.
- Antes de modificar código, inspeccionar arquitectura, rutas, modelos, APIs, componentes y pruebas existentes.
- Proponer primero un plan corto con archivos afectados, riesgos y validaciones.
- Ejecutar lint, pruebas y build disponibles al finalizar.
- Informar siempre archivos modificados, decisiones, pruebas realizadas, resultados y pendientes.
- Registrar decisiones técnicas importantes en `.kilo/context/decisiones.md`.
