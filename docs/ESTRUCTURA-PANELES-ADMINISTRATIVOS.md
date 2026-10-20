# Paneles administrativos y asignación de trabajo

**Estado: estructura de producto aprobada; implementación parcial en revisión, 20 de octubre de 2026.** Este es el punto de entrada para trabajar en los paneles de Grupo Security. Los diez paneles describen la organización prevista. La copia aislada de revisión trabaja hoy en Comercial y Catálogo y precios; eso no convierte automáticamente los otros ocho en funciones disponibles.

## La regla principal

Un **panel** agrupa un área de trabajo. Cada panel tiene **hijos** como Vendedor o Gestión comercial. Cada hijo reúne **acciones concretas**, por ejemplo ver clientes o editar metas. Cada acción lleva un **alcance**: datos propios, del equipo, de una lista o producto autorizado, o global cuando esté permitido.

```text
Persona → panel → hijo o paquete → acciones → alcance de los datos
```

Super Admin asigna el trabajo a **cada persona**. El cargo general aparece en su ficha, pero no concede por sí solo acceso operativo. Dos vendedores con el mismo cargo pueden tener tareas distintas. Un usuario nuevo empieza sin paneles asignados; conserva su cuenta y las herramientas personales que correspondan, sin recibir datos administrativos. Super Admin es la excepción explícita para administrar el sistema.

Marcar un hijo sirve como punto de partida visible: el administrador debe poder revisar sus acciones y sus alcances. También puede asignar acciones individuales. **Leer no concede editar, publicar ni eliminar.** Un cambio de alcance tampoco añade acciones nuevas.

## Mapa de los diez paneles

| Panel | Para qué sirve | Situación en esta etapa |
| --- | --- | --- |
| 1. Comercial | Clientes, cotizaciones, actividades, metas y avisos internos. | Primera prioridad de implementación y revisión. |
| 2. Catálogo y precios | Listas, tarifas, Biblioteca y publicación del catálogo. | Segunda prioridad; Biblioteca conserva funciones existentes y recibe accesos preparatorios. |
| 3. Tienda online | Cuentas web, operación de compra y opciones comerciales de la tienda. | Estructura propuesta; requiere diseño y verificación por hijo. |
| 4. Configuración de la página y promociones | Banners, campañas, contenido y publicación de páginas. | Panel propio, separado de Comercial. |
| 5. Pedidos y despachos | Seguimiento y preparación de pedidos y entregas. | Estructura propuesta. |
| 6. Inventario y abastecimiento | Existencias, movimientos y reposición. | Estructura propuesta. |
| 7. Servicio al cliente | Consultas, casos y seguimiento de atención. | Estructura propuesta. |
| 8. Informes y auditoría | Consultas, indicadores y registro de acciones. | Estructura propuesta; los eventos de asignación ya forman parte de la revisión de acceso. |
| 9. Usuarios y accesos | Personas, paquetes, acciones y alcances. | La asignación de los dos primeros paneles está en revisión. |
| 10. Configuración técnica e integraciones | Correo, notificaciones, conexiones y diagnóstico. | Estructura propuesta; Yéminus sigue pendiente. |

El [árbol de diez paneles](PROPUESTA-ARBOL-PANELES-2026-10-13.md) desarrolla los hijos propuestos de cada uno. Su lista de hijos es un punto de diseño, no una prueba de que exista ya la pantalla, el permiso o el proceso. Cuando este documento y aquella propuesta difieran, prevalece la decisión posterior indicada aquí y en los diseños de cada panel.

## Los dos paneles que se construyen primero

### Comercial

| Hijo | Trabajo asignable | Límite actual |
| --- | --- | --- |
| Vendedor | Clientes y prospectos propios, cotizaciones, agenda, lectura de metas y avisos vigentes. | La factura se hace en Yéminus; marcar una cotización como ganada no certifica facturación. |
| Supervisor comercial | Consulta y seguimiento del equipo autorizado; asignación de actividades cuando tenga esa acción. | Supervisar no significa aprobar cada venta ni administrar usuarios. |
| Gestión comercial | Reasignar cartera, editar metas y preparar, publicar o retirar avisos mediante acciones separadas. | El Excel «Pedidos» no está conectado en esta etapa. |

El [diseño Comercial](DISENO-PANEL-COMERCIAL-2026-10-13.md) detalla procesos, pantallas y límites. **Mi resumen** y **Agenda y tareas** son herramientas personales compartidas; no se duplican como hijos de cada panel.

### Catálogo y precios

| Hijo | Trabajo asignable | Límite actual |
| --- | --- | --- |
| Gestión de listas y precios | Crear y administrar listas; descargar plantilla, revisar cambios, guardar y aplicar una revisión de precios con acciones distintas. | Precios finales con IVA, pesos enteros; un producto pertenece como máximo a una lista. |
| Biblioteca de productos | Accesos para consultar, editar y validar las fichas según las acciones habilitadas. | Exportación e importación completas de fichas, medios y documentos quedan para otra etapa; las casillas reservadas siguen deshabilitadas. |
| Publicación del catálogo | Consultar, validar y publicar revisiones concretas. | Una edición pendiente no sustituye la ficha pública hasta publicarse. |

No se crea un cuarto hijo «Supervisor de catálogo y precios»: a quien supervise se le conceden las acciones y alcances necesarios de estos tres hijos. El [diseño de Catálogo y precios](DISENO-PANEL-CATALOGO-Y-PRECIOS-2026-10-14.md) explica la navegación. La [importación de precios](DISENO-IMPORTACION-PRECIOS-2026-10-14.md) y la [decisión de lista única](adr/ADR-20261014-producto-una-sola-lista.md) fijan las reglas de carga.

## Cómo se administra un acceso

1. Super Admin crea o busca a la persona en **Usuarios**. Crear la cuenta no le asigna automáticamente trabajo.
2. Abre **Asignar paneles** (`/users/access`), elige a la persona y revisa los paquetes de Comercial o Catálogo y precios.
3. Selecciona un hijo o acciones individuales. Antes de guardar comprueba el alcance de cada acción y las dependencias que muestra la pantalla.
4. Prueba con esa persona qué aparece en el menú y qué puede hacer. Si retira una concesión, la siguiente operación debe perder acceso incluso con la misma sesión.

**Nombres parecidos:** el botón antiguo **Paneles** dentro de la ficha de Usuarios administra bloques del resumen. **Asignar paneles** es la pantalla del nuevo árbol de acciones. Estos controles necesitan unificación visual antes de presentar el sistema como terminado.

El navegador oculta páginas y botones no autorizados para ayudar a la persona. El servidor debe comprobar cada petición y el recurso concreto: un enlace directo, un identificador cambiado o una descarga no pueden ampliar lo concedido. Al asignar, modificar o retirar acceso se registra quién hizo el cambio y cuándo; las acciones administrativas relevantes también se auditan. La [regla de permisos](PANELES-Y-PERMISOS.md) desarrolla estas garantías.

## Estado verificable y próximos pasos

La [definición de alcance actual](ejecucion-paneles/ALCANCE-PANELES-2026-10-19.md) pospone la integración con Yéminus, el Excel «Pedidos» y la ampliación completa de Biblioteca. Los resultados de la copia aislada no significan que se hayan publicado cambios en la web principal.

Para agregar otro hijo o panel, primero se define su trabajo y sus acciones; después se conecta cada acción a pantalla, API, alcance de datos y auditoría. Se prueba tanto lo permitido como lo denegado antes de habilitarlo a usuarios. Las funciones que aún no tienen datos o reglas reales se presentan como pendientes, sin cifras inventadas.

La auditoría final de la implementación se entregará por separado antes de decidir su publicación en la web principal.
