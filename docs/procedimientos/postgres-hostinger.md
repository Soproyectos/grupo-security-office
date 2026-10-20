# Runbook: PostgreSQL containerizado en Hostinger

> **Reemplazado por el despliegue en el VPS:** el runbook [deploy-vps.md](deploy-vps.md) sustituye este procedimiento para producción, que ahora usa `postgres:18-alpine` (no 16) con el volumen montado en `/var/lib/postgresql`. Este documento se conserva solo como referencia histórica.

Procedimiento acotado para pasar la API de una URL externa a la base PostgreSQL del servicio `db` de producción. Las acciones contra Hostinger, la exportación/importación de datos y el cambio de credenciales deben ejecutarse únicamente desde un entorno autorizado.

## Lo que ya existe

- `docker-compose.prod.yml` ya incluye `postgres:16-alpine` como `db`, con el volumen persistente `pgdata`.
- La API espera que `DATABASE_URL` exista; Compose detiene el arranque si falta.
- La URL debe apuntar al servicio interno y llevar la contraseña codificada para URL, por ejemplo:

  ```text
  postgresql://<user>:<url-encoded-password>@db:5432/<db>?schema=public
  ```

- Prisma conserva el fallback actual: usa el adapter de Neon cuando la URL corresponde a Neon y el motor nativo para PostgreSQL propio. Las dependencias de Neon no se eliminan en este cambio.

## Configuración exclusiva en Hostinger

1. Crear las variables en el panel/entorno seguro de Hostinger, nunca en archivos trackeados:
   `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `JWT_SECRET` y las demás requeridas por la instalación.
2. Construir `DATABASE_URL` explícitamente con la contraseña **URL-encoded** y el host interno `db`. No concatenar credenciales sin escapar desde Compose ni reutilizar una URL de Neon para este destino.
3. Mantener contraseñas, tokens y dumps fuera de Git. No publicar su contenido en logs, tickets ni capturas.

## Backup antes del cutover — obligatorio

No iniciar el cambio sin una copia restaurable y verificada.

1. Programar una ventana de mantenimiento y detener escrituras mientras se toma la copia.
2. Desde un entorno autorizado, generar un dump completo de la base origen en formato custom. No usar opciones que excluyan blobs/objetos grandes.
3. Migrar también los archivos de producto almacenados en PostgreSQL (columnas binarias u objetos grandes), además de los datos relacionales. Si existe contenido en `data/uploads`, respaldar ese volumen por separado.
4. Guardar el dump y sus checksums fuera del repositorio. Verificar su inventario y restaurarlo en una instancia PostgreSQL aislada; comparar conteos, relaciones y una muestra de archivos descargables antes de continuar.
5. Registrar ubicación, fecha, versión de origen y resultado de la restauración de prueba. Si la restauración falla, cancelar el cutover.

## Primer arranque

1. Preparar el archivo de variables fuera de Git y comprobar que `DATABASE_URL` usa `@db:5432` y no contiene credenciales sin escapar.
2. Crear/verificar `data/uploads` con permisos para el usuario del contenedor si la aplicación lo utiliza.
3. Validar la configuración sin imprimirla:

   ```bash
   docker compose --env-file <secure-env-file> -f docker-compose.prod.yml config --quiet
   ```

4. Iniciar la pila y esperar el estado saludable de PostgreSQL antes de habilitar tráfico:

   ```bash
   docker compose --env-file <secure-env-file> -f docker-compose.prod.yml up -d
   docker compose --env-file <secure-env-file> -f docker-compose.prod.yml ps
   ```

## Migraciones Prisma

Con la base restaurada (o inicializada si es una instalación nueva), y antes de abrir tráfico normal:

```bash
docker compose --env-file <secure-env-file> -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

`migrate deploy` es explícito y controlado; no se ejecuta automáticamente en el entrypoint de producción. Registrar el resultado y detener el procedimiento ante cualquier migración fallida.

## Validación posterior

- Confirmar que `db`, `api`, `frontend` y `nginx` están saludables.
- Revisar logs de `api` sin exponer variables secretas y confirmar conexión al PostgreSQL interno.
- Probar autenticación, lectura del catálogo, imágenes/archivos de producto y una operación administrativa controlada.
- Comparar conteos de productos, categorías, usuarios y registros críticos con la copia de origen.
- Confirmar que los archivos almacenados en PostgreSQL y el volumen de uploads, cuando corresponda, se pueden leer desde la aplicación.
- Mantener la ventana de mantenimiento hasta completar estas validaciones.

## Rollback

1. Bloquear nuevas escrituras y conservar el dump, el volumen anterior y cualquier evidencia de validación.
2. Restaurar la última copia verificada en el destino autorizado, o volver al volumen/base anterior si no hubo escrituras posteriores.
3. Reponer la `DATABASE_URL` anterior en el entorno seguro y reiniciar la API/pila.
4. Validar login, catálogo y archivos antes de retirar el mantenimiento. No borrar `pgdata`, dumps ni uploads como parte de un rollback improvisado.

## Fuera de alcance

- Este cambio no accede a Hostinger ni ejecuta el cutover, exportaciones, importaciones, despliegues o cambios de credenciales.
- No modifica el schema/modelos de Prisma ni elimina dependencias o fallback de Neon.
- No convierte secretos, dumps ni datos reales en fixtures o archivos del repositorio.
- No garantiza la migración sin una copia restaurable, validación de archivos de producto y autorización operativa explícita.
