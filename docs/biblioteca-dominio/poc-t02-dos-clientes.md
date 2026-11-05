# T02 · Prueba local de dos esquemas y dos clientes Prisma

**Fecha:** 22/10/2026 · **Estado:** ejecutada; **los criterios de aceptación locales se cumplen, pero la tarea no se da por cerrada** por las comprobaciones pendientes de abajo. Autorización del usuario: prueba local, sin instalaciones, sin cambios de dependencias ni lockfile, sin bases, Docker ni SSH.
**Rama / base:** `Esnaider/nifty-robinson-8a8974`, `cb230aa`. Sin commit ni push. Plan: [T02](./plan-de-implementacion.md#t02--prueba-de-concepto-de-dos-esquemas-y-dos-clientes-prisma).

## Qué se hizo
Dos esquemas Prisma **mínimos** y ficticios (un modelo cada uno), con `output` distinto, en una carpeta propia e identificada. No se tocó el esquema productivo, el `PrismaService`, módulos, migraciones, CI, `package.json` ni el lockfile.

| Archivo (todos nuevos, en `src/backend/prisma/poc-dos-clientes/`) | Para qué |
|---|---|
| `operativo.prisma` | Esquema mínimo del «dominio operativo» (`PocUsuario`), salida `./generated/operativo`, URL `POC_OPERATIVO_URL` |
| `biblioteca.prisma` | Esquema mínimo de «biblioteca» (`PocProducto`, con referencia de actor sin FK), salida `./generated/biblioteca`, URL `POC_BIBLIOTECA_URL` |
| `comprobar-clientes.js` | Importa ambos clientes **sin instanciarlos**, verifica metadatos y comprueba tipos con `checkJs` |
| `tsconfig.json` | Extiende el `tsconfig.json` del proyecto (`noEmit`, `allowJs`, `checkJs`) y solo incluye la prueba y los `.d.ts` generados |
| `.gitignore` | Ignora `generated/` (salida regenerable, 48 MB) |
`comprobar-clientes.js` es JavaScript a propósito: el `tsconfig.json` y `tsconfig.build.json` del proyecto **no tienen `include`**, así que un `.ts` ahí entraría en `tsc` y en `nest build` y rompería la compilación donde los clientes generados no existen (CI, Docker).

## Comandos (desde `src/backend`, PowerShell o Git Bash)
Se usaron URLs ficticias que no existen (`*.invalid`) y un proxy local inválido para que cualquier descarga automática **falle** en vez de ocurrir sin avisar:
```bash
export POC_OPERATIVO_URL='postgresql://poc:poc@poc-operativo.invalid:5432/poc'
export POC_BIBLIOTECA_URL='postgresql://poc:poc@poc-biblioteca.invalid:5432/poc'
export CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1 HTTP_PROXY=http://127.0.0.1:9 HTTPS_PROXY=http://127.0.0.1:9
npx prisma validate --schema prisma/poc-dos-clientes/operativo.prisma
npx prisma validate --schema prisma/poc-dos-clientes/biblioteca.prisma
npx prisma generate --schema prisma/poc-dos-clientes/operativo.prisma
npx prisma generate --schema prisma/poc-dos-clientes/biblioteca.prisma
node prisma/poc-dos-clientes/comprobar-clientes.js
npx tsc -p prisma/poc-dos-clientes/tsconfig.json
npx tsc --noEmit -p tsconfig.json        # comprobación de tipos existente del proyecto
```

## Resultados (Prisma 6.19.3, Windows)
| Criterio | Resultado |
|---|---|
| Ambos esquemas validan | **Sí** (con la advertencia de que la función de vista previa `driverAdapters` está obsoleta; el esquema productivo la declara igual) |
| Dos clientes en rutas independientes | **Sí**: `generated/operativo` y `generated/biblioteca`; cada uno trae su propio `schema.prisma`, `index.d.ts` y motor |
| Un archivo importa ambos y compila | **Sí**: `node comprobar-clientes.js` → 8 comprobaciones `ok` (sin instanciar clientes); `tsc -p` de la prueba → código 0. La línea `@ts-expect-error` confirma que los tipos de los dos dominios **no son intercambiables** |
| La generación no usó la red | **Sí**: se completó con el proxy inválido, sin descargas (los motores ya estaban instalados) |
| El cliente actual y los tipos existentes no se rompen | **Sí**: `npx tsc --noEmit -p tsconfig.json` → código 0 antes y después; el cliente generado del proyecto (`node_modules/.prisma/client`) no cambió |
| Sin cambios en dependencias, lockfile, configuración productiva ni parche SQL | **Sí**: 25 archivos protegidos con huella SHA-256 idéntica antes y después (`package.json`, `package-lock.json`, `schema.prisma`, `prisma.service.ts`, `tsconfig.json`, `products.service*.ts`, el archivo de integración, `AGENTS.md`, índices, el cliente actual y todos los documentos de esta obra) |

## Limitaciones y comprobaciones pendientes (por eso no se cierra)
- **No se instanció ningún cliente ni se abrió ninguna conexión** (por mandato): no se probó el adaptador `pg` en ejecución con dos clientes, ni consultas reales.
- **Solo Windows.** Los motores copiados son los de este equipo (`query_engine-windows.dll.node`). No se probó Linux/Alpine (la imagen de Docker usa `node:20-alpine`): hará falta declarar y probar `binaryTargets` en T04/T12.
- **Tamaño:** cada cliente generado copia el motor (la carpeta `generated` pesa 48 MB para dos modelos). Si ambos se generan en la imagen de Docker, el tamaño crecerá; medirlo en T04/T12 (sin cifras prometidas).
- **No se ejecutó** `npm run build`/`nest build`, `docker build` ni `npm run lint`: la prueba vive en `prisma/`, fuera del `src` que revisa el lint, y solo se verificó `tsc --noEmit`. Queda pendiente comprobar el build real con la carpeta presente (y sin los clientes generados, como en CI).
- No se probaron `migrate diff`/`migrate deploy` por esquema ni el flujo de `deploy.sh` con dos esquemas (T03, T04, T12).
- Modelos mínimos de juguete: no demuestran que los 23 modelos reales se separen sin otros problemas.

## Evidencia
Huellas antes y después (25 archivos), registradas en la carpeta `traspaso-codex-biblioteca/evidencia/T02/` del equipo de trabajo (no versionada). Comandos y resultados, en las secciones anteriores.

## Cómo retirar la prueba sin afectar otros cambios
La prueba es solo una carpeta nueva sin seguimiento en git. Mientras no haya commit:
```bash
rm -r src/backend/prisma/poc-dos-clientes
```
(Ruta exacta; **no usar `git clean`**, porque borraría también el parche SQL sin commit y la documentación.) No hay nada más que deshacer: no se modificó ningún archivo existente por esta tarea. Si ya hubiera un commit, revertir solo ese cambio.
