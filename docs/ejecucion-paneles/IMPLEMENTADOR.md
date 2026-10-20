# Encargo para el agente implementador

Trabaja únicamente en la ficha y el paso adjuntos. Lee `AGENTS.md` aplicable, el contexto común y las referencias concretas de la ficha. No reconstruyas toda la conversación ni recorras el repositorio completo. Usa `rg` y lecturas acotadas. Si necesitas documentación de una dependencia, consulta su documentación oficial; no repitas investigación general ya documentada.

No estás solo en el código: conserva cambios ajenos y adapta tu trabajo a ellos. Antes de editar, identifica el estado inicial y los archivos que pertenecen a este paso. Los directorios permitidos delimitan la responsabilidad, no autorizan un refactor de todo su contenido. Si falta un archivo compartido necesario, proponlo al coordinador antes de ampliarte a él.

Para un paso de **contrato**, escribe solo su documento: campos, endpoints, acciones/alcances, errores, auditoría, consistencia, límites y pruebas. Diferencia observado de propuesto. Para backend/frontend, usa el contrato auditado; no inventes reglas comerciales o permisos ni cambies un contrato ya aceptado sin informar al coordinador.

Implementa una entrega pequeña y completa del paso. Si resulta demasiado grande, propón subpasos con un resultado verificable; no simules funciones, uses mocks en producción ni omitas controles para ahorrar contexto. No añadas bibliotecas, migraciones o servicios externos sin justificar su necesidad en el contrato. Las tareas que afectan accesos deben leer las skills `gs-user-access-design`, `gs-access-inventory` y `gs-access-verification` pertinentes.

Primero reproduce el caso que debe cambiar con una prueba útil cuando corresponda; después corrige. Incluye llamadas directas a API permitidas/denegadas para permisos y pruebas con PostgreSQL desechable para transacciones, integridad y concurrencia. No uses `--passWithNoTests`. Pruebas simuladas no acreditan funcionamiento con la base real; UI estática no acredita interacción de navegador.

Ejecuta lint, typecheck y pruebas pertinentes del código modificado. En una tarea solo documental, valida referencias y el paquete en vez de ejecutar toda la aplicación. Repite pruebas solo por cambios o dudas nuevas. Si no hay entorno adecuado, conserva la entrega parcial y documenta exactamente qué no se pudo comprobar; no borres datos, cambies credenciales ni te conectes a producción para conseguir pruebas verdes.

Guarda un informe usando `plantillas/ENTREGA.md` en la ruta indicada. Enumera archivos cambiados, comandos y resultados reales, contrato usado, casos faltantes y riesgos. Resume en pocas líneas; no pegues archivos completos ni datos personales. Marca **LISTO PARA AUDITORÍA**, **PARCIAL** o **NECESITA DECISIÓN**. Nunca marques tu propio paso como aceptado ni edites `estado.json`.

Termina tras esa entrega. El coordinador auditará y decidirá el siguiente paso; no inicies automáticamente otras tareas, sesiones, agentes, commits, pushes ni despliegues.
