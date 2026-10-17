ENCARGO DE UN SOLO PASO. Entregar para auditoría al terminar.

# Encargo para el agente implementador

Trabaja únicamente en la ficha y el paso adjuntos. Lee `AGENTS.md` aplicable, el contexto común y las referencias concretas de la ficha. No reconstruyas toda la conversación ni recorras el repositorio completo. Usa `rg` y lecturas acotadas. Si necesitas documentación de una dependencia, consulta su documentación oficial; no repitas investigación general ya documentada.

No estás solo en el código: conserva cambios ajenos y adapta tu trabajo a ellos. Antes de editar, identifica el estado inicial y los archivos que pertenecen a este paso. Los directorios permitidos delimitan la responsabilidad, no autorizan un refactor de todo su contenido. Si falta un archivo compartido necesario, proponlo al coordinador antes de ampliarte a él.

Para un paso de **contrato**, escribe solo su documento: campos, endpoints, acciones/alcances, errores, auditoría, consistencia, límites y pruebas. Diferencia observado de propuesto. Para backend/frontend, usa el contrato auditado; no inventes reglas comerciales o permisos ni cambies un contrato ya aceptado sin informar al coordinador.

Implementa una entrega pequeña y completa del paso. Si resulta demasiado grande, propón subpasos con un resultado verificable; no simules funciones, uses mocks en producción ni omitas controles para ahorrar contexto. No añadas bibliotecas, migraciones o servicios externos sin justificar su necesidad en el contrato. Las tareas que afectan accesos deben leer las skills `gs-user-access-design`, `gs-access-inventory` y `gs-access-verification` pertinentes.

Primero reproduce el caso que debe cambiar con una prueba útil cuando corresponda; después corrige. Incluye llamadas directas a API permitidas/denegadas para permisos y pruebas con PostgreSQL desechable para transacciones, integridad y concurrencia. No uses `--passWithNoTests`. Pruebas simuladas no acreditan funcionamiento con la base real; UI estática no acredita interacción de navegador.

Ejecuta lint, typecheck y pruebas pertinentes del código modificado. En una tarea solo documental, valida referencias y el paquete en vez de ejecutar toda la aplicación. Repite pruebas solo por cambios o dudas nuevas. Si no hay entorno adecuado, conserva la entrega parcial y documenta exactamente qué no se pudo comprobar; no borres datos, cambies credenciales ni te conectes a producción para conseguir pruebas verdes.

Guarda un informe usando `plantillas/ENTREGA.md` en la ruta indicada. Enumera archivos cambiados, comandos y resultados reales, contrato usado, casos faltantes y riesgos. Resume en pocas líneas; no pegues archivos completos ni datos personales. Marca **LISTO PARA AUDITORÍA**, **PARCIAL** o **NECESITA DECISIÓN**. Nunca marques tu propio paso como aceptado ni edites `estado.json`.

Termina tras esa entrega. El coordinador auditará y decidirá el siguiente paso; no inicies automáticamente otras tareas, sesiones, agentes, commits, pushes ni despliegues.


# Reglas comunes que cada entrega debe conservar

- Dos paneles en alcance: Comercial y Catálogo y precios. Configuración de la página/banners es un panel separado. No rediseñar la presentación pública de productos como consecuencia de este trabajo.
- Usuarios nuevos sin acceso administrativo de trabajo; cuenta propia disponible. Rol/cargo no concede acciones. Super Admin asigna paquetes, acciones y alcance por usuario; editar no concede publicar. Mi resumen y Agenda y tareas son herramientas personales únicas fuera de los paneles.
- Frontend y API comprueban acciones y alcance propio/equipo/lista. No basta ocultar un botón. Revocar acceso afecta la siguiente solicitud con el mismo token. No ampliar a toda Biblioteca o todas las listas para resolver un error.
- Compras prepara precios finales con IVA. COP entero, redondeo HALF_UP en el preview; falta unificar límite con edición manual antes de aplicar. Vacío conserva precio. No sumar IVA, calcular márgenes ni convertir monedas en la carga.
- Plantilla: `.xlsx`, hojas PRECIOS e INSTRUCCIONES; solo PRECIOS contiene datos. Referencia textual y al menos una tarifa. Códigos exactos: INSTALADOR_IVA, TIENDA_IVA, ORO_IVA, DPP_PLATINO_IVA, CLIENTE_FINAL_IVA. Oro no es DPP Oro. No cambiar ni vaciar el archivo editado por el usuario para generar una descarga.
- Producto con cero o una lista (`Product.listaId`). Recargar la misma actualiza precios; otra lista obtiene conflicto. No clonar ni mover productos silenciosamente. La lista archivada conserva su pertenencia. Importar precios no modifica identidad, imágenes, documentos ni históricos comerciales.
- Preview ya implementado localmente en `modules/prices/import` y `features/price-import`: no persiste revisiones ni aplica precios. Informe anterior: 332 pruebas backend y 13 frontend, con repositorios/sesiones simulados; no es una certificación de PostgreSQL real o de producción. Reutilizar y proteger ese trabajo.
- Editar producto publicado conserva la revisión pública anterior hasta publicar la revisión concreta. PDF opcional: su ausencia genera aviso informativo, no bloqueo. Destacados son beneficios; Modelos es compatibilidad de ficha/firmware, opcional y de baja prioridad. Notas internas nunca salen al público.
- Biblioteca exportable/reimportable con datos y bytes de medios, apartados seleccionables y verificación; omitir apartados no equivale a borrarlos. Publicar y validar son acciones distintas y compartidas desde todas las rutas.
- Comercial: vendedor factura en Yéminus sin aprobación de ventas. Cotización ganada/pedido interno no prueba factura ERP. Solicitudes sin stock hoy están en Excel «Pedidos»; no son ventas ni `SalesOrder`. API ERP y formato saneado del Excel pendientes.
- Agenda/promociones internas/ficha técnica tienen piezas documentadas en S3 que no están todas en este checkout. No reemplazar esas funciones suponiendo que local equivale al servidor. Primero inventario y contrato de integración.
- PostgreSQL/Prisma son la fuente de verdad; no cambiar stack. Datos ficticios en pruebas. No secretos/PII en entregas, logs o Git. No producción, credenciales, commits ni pushes por este encargo. Preservar cambios ajenos del árbol sucio; no reset/clean/revert global.

La auditoría de acciones se genera en servidor y distingue intentos de operaciones confirmadas. Una tarea asignada o un enlace no otorga acceso al recurso. Los trabajos persistidos deben revalidar permisos al ejecutar; reintentar no duplica cambios ni estadísticas.


# Ficha seleccionada
{
  "id": "BASE-01",
  "title": "Fijar inventario y versión de trabajo",
  "paso": "inventario",
  "objetivo": "Guardar inventario corto pantalla/API/modelo/permiso/prueba y propuesta de base, con rutas y evidencia verificable. Solo documentación.",
  "actor": "implementador",
  "lecturas": [
    {
      "path": "docs/COMPARACION-10-PANELES-2026-10-13.md",
      "section": "S3/S4/local y diferencias de módulos"
    },
    {
      "path": "docs/IMPLEMENTACION-REVISION-PRECIOS-2026-10-14.md",
      "section": "Estado y evidencia del preview"
    }
  ],
  "codigo_a_consultar_segun_necesidad": [
    "AGENTS.md",
    "src/backend/src/app.module.ts",
    "src/frontend/src/App.tsx",
    "src/backend/prisma/schema.prisma"
  ],
  "reglas": [
    "Local es el checkout autorizado. Registrar HEAD y cambios previos sin reset/clean; HEAD no describe por sí solo el árbol sucio.",
    "No fusionar ni reemplazar S3/S4. Elaborar lista de funciones que deben conservarse y dónde se verificaron.",
    "No consultar clientes, usuarios ni credenciales. Diferenciar hechos observados, informes anteriores y propuestas."
  ],
  "casos_obligatorios": [
    "El inventario distingue preview temporal de aplicación de precios.",
    "Agenda/promociones/ficha técnica de S3 no se declaran presentes localmente por documentación.",
    "Una propuesta de consolidación preserva IDs, medios y funciones públicas; deja las diferencias sin resolver explícitas."
  ],
  "criterios_del_paso": [
    "El inventario distingue preview temporal de aplicación de precios.",
    "Agenda/promociones/ficha técnica de S3 no se declaran presentes localmente por documentación.",
    "Una propuesta de consolidación preserva IDs, medios y funciones públicas; deja las diferencias sin resolver explícitas."
  ],
  "dependencias": [],
  "contratos_y_auditorias_previos": [],
  "decisiones_requeridas": [],
  "auditorias_del_mismo_paquete": [],
  "archivos_permitidos": [
    "docs/ejecucion-paneles/contratos/BASE-01.md",
    "docs/ejecucion-paneles/resultados/BASE-01-inventario-entrega.md"
  ],
  "contrato_aceptado": null,
  "entrega": "docs/ejecucion-paneles/resultados/BASE-01-inventario-entrega.md"
}

El prompt y contexto ya están incluidos: no vuelvas a leerlos ni abras todas las fichas. Consulta el contrato aceptado cuando corresponda. Las rutas futuras se crean solo tras sus dependencias.
No editar tareas.json, estado.json ni el preparador desde una tarea de aplicación.
