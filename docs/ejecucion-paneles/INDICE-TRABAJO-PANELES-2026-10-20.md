# Dónde quedó documentado el trabajo de paneles

**Estado al 20 de octubre de 2026.** La revisión que se puede abrir en `http://100.87.48.41:5180` corre en la copia aislada `gs-tanda-01` de `srv-soporte`. La web principal todavía no recibió estos cambios. Este índice indica qué documento leer para cada tema y distingue el diseño de lo comprobado.

## Para entender la decisión

Empieza por la [guía vigente de paneles administrativos](../ESTRUCTURA-PANELES-ADMINISTRATIVOS.md). Une el mapa de los diez paneles con el funcionamiento actual de los dos primeros.

1. [Regla de acceso por persona](../PANELES-Y-PERMISOS.md): un cargo no concede herramientas; Super Admin asigna acciones y alcances a cada usuario.
2. [Árbol propuesto de diez paneles](../PROPUESTA-ARBOL-PANELES-2026-10-13.md): mapa general de la administración. Es una propuesta de estructura, no diez paneles implementados.
3. [Diseño del panel Comercial](../DISENO-PANEL-COMERCIAL-2026-10-13.md): Vendedor, Supervisor comercial y Gestión comercial.
4. [Diseño de Catálogo y precios](../DISENO-PANEL-CATALOGO-Y-PRECIOS-2026-10-14.md): listas, Biblioteca y publicación.
5. [Diseño de importación de precios](../DISENO-IMPORTACION-PRECIOS-2026-10-14.md) y [plantilla vigente v3](../plantillas/PLANTILLA-PRECIOS-GRUPO-SECURITY-v3.xlsx): precios finales con IVA en pesos enteros.

## Para saber qué se construyó y qué falta

- [Alcance vigente](ALCANCE-PANELES-2026-10-19.md): concentra la prioridad actual. La Biblioteca solo recibe accesos preparatorios; la integración Yéminus y el Excel Pedidos se posponen.
- [Estado de los dos paneles](ESTADO-DOS-PANELES-2026-10-19.md): funciones conectadas, pruebas ejecutadas, límites conocidos y URL de revisión. Incluye la corrección del QR de Authenticator detectada durante la preparación de la cuenta Super Admin de prueba.
- [Acuerdo técnico sobre paneles y paquetes](../adr/ADR-20261013-paneles-y-paquetes-de-trabajo.md): explica por qué las acciones se asignan por persona.

## Cómo probarlo hoy

1. Abre la web de revisión e ingresa con una cuenta de su base desechable. Las cuentas de la web principal no se copiaron. Las credenciales de prueba se entregan por separado; no se guardan aquí.
2. Como Super Admin, termina el registro de Authenticator y abre **Asignar paneles** (`/users/access`). El botón antiguo **Paneles** de la ficha de Usuarios administra bloques del resumen y no es el nuevo árbol de permisos.
3. Crea un usuario ficticio y confirma que comienza sin paneles. Asígnale, por ejemplo, Vendedor; comprueba qué puede ver. Retira el paquete y comprueba que pierde acceso con la misma sesión.

La inscripción de Authenticator ya mostró el QR tras corregir una carrera entre dos solicitudes. La navegación completa como Super Admin después de confirmar el código y la revisión visual de cada botón **aún no están acreditadas**.

## Registro que no está disponible en esta copia

El encargo de ejecución pide `resultados/TANDA-01-avance.json` y `resultados/TANDA-01-entrega.md`. En la ruta esperada de `gs-tanda-01` no aparecieron al revisar el servidor el 20 de octubre; allí solo se encontraron los dos archivos de BASE-01. Por eso los resúmenes de avances comunicados anteriormente no se toman como sustituto de esos informes. El estado verificable de esta continuación está en el documento **Estado de los dos paneles** enlazado arriba.

Tampoco se ha trasladado ni aprobado esta implementación en la web principal. Para ese paso faltan la revisión de Super Admin, la auditoría final de cambios y una decisión explícita de publicación.
