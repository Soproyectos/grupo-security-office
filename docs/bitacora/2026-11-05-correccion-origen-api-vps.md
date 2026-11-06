# Corrección del origen de API en la web del VPS

El usuario reportó que no podía entrar a administración y que no veía categorías después del despliegue 586bf19d. La base activa y su API seguían saludables: nueve categorías, 66 subcategorías, un usuario, cero productos y precios. No se modificaron datos ni credenciales para esta corrección.

Causa confirmada: Dockerfile copia `.env.production` y Vite incorporaba `https://api-dev.gruposecurity.com.co/api` al bundle. Ese servidor devuelve CORS `https://dev.gruposecurity.com.co`, distinto del origen real `https://dev.gruposecurity.cloud`; el navegador bloquea las respuestas. La interfaz reproducía «No pudimos cargar las categorías», aunque consultar directamente la API correcta devolvía las nueve raíces. La comprobación directa previa del despliegue no había verificado el destino real de las llamadas del navegador.

Cambio mínimo: `VITE_API_URL=/api`. El proxy existente del mismo dominio sirve la API y los archivos; Axios ya admite ruta relativa y cookies. No se altera CORS del backend, autenticación, permisos o esquema. Se corrige el comentario del cliente que asumía dos subdominios.

Segunda causa confirmada del menú: `navigableRoots` ocultaba todas las raíces sin hijos. Conserva ahora el filtro anterior cuando hay familias con hijos, pero muestra las raíces recibidas cuando todas están vacías. Esto permite navegar por las nueve categorías sin productos, sin duplicar datos ni fabricar relaciones. Las 66 subcategorías permanecen en su tabla y en el contrato administrativo; el menú público actual no las expone. Convertirlas en enlaces requiere otro cambio coordinado de rutas/filtros por subcategoría y no se simula en esta incidencia. Suite focalizada del mega menú: 34 pruebas aprobadas; tipos frontend correctos.

Validación pendiente de completar: CI y comprobación del menú y respuesta de autenticación desde el navegador después del nuevo despliegue. No usar credenciales reales en el chat ni afirmar login autenticado sin comprobarlo.
