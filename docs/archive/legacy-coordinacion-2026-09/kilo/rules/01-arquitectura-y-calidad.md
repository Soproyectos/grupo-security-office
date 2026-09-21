# Arquitectura, seguridad y calidad

## Arquitectura
- Respetar el framework, estructura, patrones, convenciones y librerías ya presentes en el repositorio.
- Reutilizar componentes, tipos, servicios y utilidades existentes antes de crear otros.
- Separar UI, lógica de negocio, validaciones y acceso a datos.
- Mantener tipado estricto si el proyecto utiliza TypeScript.
- Todo endpoint nuevo debe validar autenticación, autorización y datos de entrada.
- Los permisos deben validarse en backend; ocultar botones en frontend no es suficiente.

## Trazabilidad
- Los cambios críticos de precios deben conservar usuario, fecha, producto, lista, valor anterior y valor nuevo.
- Las acciones críticas sobre permisos, stock, proveedores y compras deben poder auditarse.
- Las cargas masivas deben reportar claramente filas exitosas, filas fallidas y motivo de cada error.

## Experiencia de compras
- Formularios claros para usuarios no técnicos.
- No introducir campos JSON crudos en interfaces de uso comercial.
- Incluir validaciones, estados de carga, errores útiles y confirmaciones para acciones críticas.

## Validaciones mínimas futuras
- Precio mayor o igual a cero.
- Fecha desde menor o igual a fecha hasta.
- Producto activo con lista asociada.
- Restricción de acceso a listas y precios no asignados.
