# Cómo probar los cambios de tienda y recuperación

**Estado al 19 de noviembre de 2026.** Los cambios están en dos worktrees locales sobre `bce9b1d`. Las pruebas automatizadas pasaron en los alcances descritos abajo. El flujo real con datos, correo y sesiones depende de una API de prueba y de la migración de recuperación.

## 1. Abre las vistas locales

| Qué quieres revisar | URL desde esta computadora | Qué puedes observar |
|---|---|---|
| Vitrina | `http://127.0.0.1:4173/tienda` | Portada de la copia de validación del catálogo. Las marcas y categorías dependen de una API local con productos publicados. |
| Búsqueda por marca y Cámaras | `http://127.0.0.1:4173/catalogo/buscar?brand=hikvision&category=camaras` | El filtro activo y el estado de carga, error o resultados. |
| Solicitud de recuperación | `http://127.0.0.1:4175/clientes/login` | Pulsa «¿Olvidaste tu contraseña?» para abrir `/clientes/recuperar`. Puedes revisar diseño, etiquetas y validación de formulario. |
| Enlace incompleto | `http://127.0.0.1:4175/clientes/restablecer` | La página indica que el enlace es inválido o está incompleto y ofrece solicitar otro. |

Estas direcciones requieren que Vite siga abierto. Si se cerró, desde PowerShell ejecuta uno de los siguientes bloques en su propia terminal.

```powershell
# Recuperación
Set-Location 'C:/Users/sopor/.codex/worktrees/entrega-recuperacion/grupo-security-office/src/frontend'
$env:VITE_API_TARGET = 'http://127.0.0.1:3000'
npm.cmd run dev -- --host 127.0.0.1 --port 4175 --strictPort
```

```powershell
# Catálogo. Copia de validación con dependencias de frontend disponibles.
Set-Location 'C:/Users/sopor/.codex/visualizations/2026/11/17/01a1eb48-d8a4-7833-96cd-abb101d33e55/qa-catalogo'
npm.cmd run dev -- --host 127.0.0.1 --port 4173 --strictPort
```

El catálogo que se debe revisar e integrar está en `C:/Users/sopor/.codex/worktrees/entrega-catalogo/grupo-security-office`. La copia de validación reproduce el frontend comprobado de ese worktree.

## 2. Prueba el catálogo con datos ficticios

Usa el backend del worktree de catálogo con PostgreSQL operativo local y apunta `VITE_API_TARGET` a esa API. El catálogo necesita una cámara Hikvision publicada en Cámaras IP y Wi-Fi, un accesorio publicado y una segunda marca sin productos públicos.

1. Abre la tienda y pulsa **Hikvision → Ver cámaras de la marca → ficha de la cámara**. Comprueba que la acción de cotizar incluye el SKU exacto en el enlace de WhatsApp. Puedes inspeccionar el enlace sin enviar un mensaje.
2. Abre `/catalogo/categoria/camaras`. Elige el tipo de cámara y una característica técnica si la ficha tiene datos publicados. Comprueba que la selección permanece al recargar y al pulsar **Cargar más**. Volver a todos los tipos debe limpiar las características de la subcategoría anterior.
3. Comprueba que la portada destaca la cámara y que el accesorio sigue accesible desde el catálogo. La segunda marca y una categoría sin productos quedan fuera de la navegación. Su URL directa sigue ofreciendo orientación.
4. En el panel local, cambia la marca o categoría de una ficha **en borrador**. Repite la consulta pública. Los resultados y conteos conservan la revisión publicada hasta que se publique el cambio.

Las subcategorías persistidas existen en el esquema operativo. El cliente de biblioteca dedicada carece de ese modelo y omite esos filtros.

## 3. Prueba la recuperación con un buzón local

Usa el backend del worktree de recuperación. Prepara PostgreSQL operativo desechable y un SMTP de pruebas. Configura en ese backend `DATABASE_URL` para la base ficticia, `API_PORT=3000`, `STOREFRONT_URL=http://127.0.0.1:4175` y `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` y `SMTP_FROM` según el buzón. Mantén credenciales de prueba fuera de Git. Si la vista ya estaba abierta con un destino de API distinto, reinicia solo tu instancia de Vite con el comando anterior.

La instalación de dependencias y la aplicación de la migración requieren autorización explícita. Una vez concedida, sigue el orden de CI para preparar los clientes de Prisma: `npm.cmd ci`, `npm.cmd run db:generate` y `npm.cmd run db:generate:library` en `src/backend`. Verifica que `DATABASE_URL` apunta a la base desechable antes de aplicar la migración preparada, `20261119120000_portal_password_resets`. Después, inicia el backend local con `npm.cmd run dev`.

| Paso | Resultado esperado |
|---|---|
| Abre dos sesiones del mismo cliente y una de un empleado ficticio con el mismo correo | Las tres sesiones funcionan. |
| Pide el enlace desde `/clientes/recuperar` | Aparece la confirmación genérica y las tres sesiones continúan. |
| Abre el correo del buzón de prueba y confirma una contraseña nueva de 12 a 128 caracteres | La página confirma el cambio. Ambas sesiones del cliente terminan y la del empleado sigue activa. |
| Prueba la contraseña nueva y reutiliza el mismo enlace | La nueva contraseña permite acceder. El enlace usado ofrece pedir otro. |
| En el entorno de prueba, verifica caducidad, dos confirmaciones simultáneas y fallo SMTP | El enlace vencido falla, solo una confirmación concurrente cambia la contraseña y el fallo SMTP conserva la respuesta pública genérica. |

## 4. Evidencia y pendientes

| Verificación | Resultado |
|---|---|
| Frontend de recuperación | 1.691 pruebas aprobaron. TypeScript, lint y compilación pasaron. |
| Frontend de catálogo | 122 pruebas focalizadas aprobaron en la copia local. TypeScript y lint pasaron. Los archivos integrados se cotejaron por SHA-256. |
| Backend en copias de prueba | 93 pruebas de catálogo y 27 de recuperación aprobaron con dobles y dependencias reutilizadas. Queda pendiente comprobar tipos y ejecución con Prisma 6.19.3, PostgreSQL real de pruebas y SMTP. |
| Aceptación manual y rendimiento | Pendientes el recorrido completo en móvil y escritorio y las cinco cargas comparables por página. |

- [Contrato y migración de recuperación](recuperacion-portal-clientes.md)
- [Política de tratamiento de datos marcada como prueba](politica-tratamiento-datos-prueba.md)
- [Piloto de Better Auth](piloto-better-auth.md)
- [Preparación de indexación y medición de rendimiento](tienda-indexacion-rendimiento.md)
