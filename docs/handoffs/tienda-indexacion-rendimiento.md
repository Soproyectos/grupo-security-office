# Indexación y medición de la tienda

El dominio comercial sigue pendiente de aprobación. La entrada pública del entorno actual es /tienda.

## Preparar la salida comercial

1. En el entorno comercial aprobado, servir HTML inicial con el título y la descripción de cada página pública. Publicar URL canónicas absolutas del dominio aprobado en portada, categorías visibles y fichas publicadas. Resolver búsquedas y filtros de forma que el sitemap incluya únicamente las URL canónicas.
2. Configurar rutas exactas para /robots.txt y /sitemap.xml antes de la regla de fallback de la SPA en src/frontend/nginx.conf. La primera debe responder text/plain y la segunda con XML. En el entorno de pruebas, aplicar la política de indexación aprobada para ese entorno y evitar URL de prueba en el sitemap comercial.
3. Generar el sitemap a partir de las mismas reglas de visibilidad que usa la vitrina. Excluir panel, login, registro y recuperación. Mantener los controles de acceso del servidor en rutas privadas.
4. Antes de activar, comprobar la respuesta HTTP, el tipo de contenido, los títulos iniciales y las URL canónicas. Revisar una ficha publicada, una retirada y una ruta de recuperación. Activar con el dominio comercial aprobado.

## Medir antes de optimizar

Comparar la base bce9b1d con la entrega, usando los mismos datos ficticios, navegador, viewport móvil y perfil de red. Hacer cinco cargas en frío por revisión en portada, Cámaras y una ficha. Capturar las medianas de bytes transferidos, LCP y CLS. Guardar los registros de cada carga junto con la revisión y el perfil usado. La cifra de la auditoría de 1,32 MB era el tamaño de JavaScript decodificado, por lo que no reemplaza una medición de transferencia.

La compilación local de recuperación produjo un archivo principal de JavaScript de 1.326,20 kB y 379,61 kB con gzip según Vite. Son cifras de compilación. Las cargas en navegador siguen pendientes.

Si la traza muestra código de administración descargado para una ruta pública, separar esas rutas con carga diferida y repetir las cinco cargas con la misma configuración. Verificar el flujo de tienda y la navegación del panel después del cambio.
