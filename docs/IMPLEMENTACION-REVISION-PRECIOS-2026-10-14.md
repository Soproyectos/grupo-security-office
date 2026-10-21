# Revisar el Excel de precios antes de guardar cambios

**Estado al 14 de octubre de 2026: revisión implementada en el worktree local.** La pantalla recibe la plantilla, comprueba sus filas y compara los precios con los de la lista elegida. Todavía no aplica actualizaciones. Las pruebas HTTP usan el servidor Nest y los controles de acceso reales, con datos y sesiones de prueba; no certifican una conexión con PostgreSQL ni una publicación en el servidor de la empresa.

Esta entrega desarrolla la primera parte del [diseño de importación](DISENO-IMPORTACION-PRECIOS-2026-10-14.md). Mantiene la decisión de [un producto como máximo en una lista](adr/ADR-20261014-producto-una-sola-lista.md).

> **Enmienda 2026-10-20.** Esta entrega describe la revisión original por lista elegida. Las decisiones posteriores (cruce por referencia sin lista destino, filas rechazadas que no bloquean, referencias desconocidas como borrador, alerta de cambios superiores al 30 % e historial por producto) están en la [enmienda del ADR](adr/ADR-20261014-producto-una-sola-lista.md#enmienda-2026-10-20-carga-de-precios-por-referencia-sin-lista-destino) y en el [diseño](DISENO-IMPORTACION-PRECIOS-2026-10-14.md#10-enmienda-2026-10-20-reglas-de-mezcla-de-listas-desconocidos-cambios-grandes-e-historial). Donde este informe las contradice, rige la enmienda; se aplican en una entrega posterior.

## Cómo se utiliza

1. El Super Admin asigna **Revisar archivo de precios**, dentro del grupo actual **Catálogo → Tarifas**. Sus dependencias son consultar precios y consultar listas. No concede acceso a Biblioteca ni a todas las listas.
2. El usuario debe tener acceso a la lista concreta con nivel **Ver precios** o superior. El permiso de la acción y el alcance de la lista son necesarios; uno no reemplaza al otro.
3. Abre **Listas → una lista → Revisar precios**. La ruta actual es `/commercial/lists/:id`. Para quien no tiene lectura de Biblioteca, esta revisión es la pestaña inicial si tiene los permisos correspondientes.
4. Sube el mismo Excel `.xlsx` con PRECIOS e INSTRUCCIONES. El nombre puede cambiar. La pantalla muestra referencias, tarifa, precio anterior, valor recibido, precio redondeado, diferencia y problemas.
5. Corrige el Excel y vuelve a revisarlo. Cambiar archivo o lista cancela la consulta anterior y descarta su resultado. La revisión no se conserva al cerrar la página.

Los resultados se muestran en páginas de 25 o 50 filas. Los problemas de cada fila aparecen en su página; los problemas generales, como una tarifa sin configurar, aparecen arriba. La validación comprueba el archivo completo, aunque solo se muestre una página.

## Reglas que ya comprueba

- **Una lista por producto (enmendado, comportamiento original de esta entrega).** Busca la referencia únicamente dentro de la lista elegida. Una referencia desconocida, de otra lista o restringida para ese usuario queda pendiente con el mismo mensaje. No busca sus precios en otra lista, crea productos ni cambia su pertenencia. Tras la enmienda, la búsqueda es global por referencia, se autoriza por la lista de cada producto y una referencia desconocida se rechaza sin bloquear el resto.
- **Tarifas exactas con IVA.** Reconoce los cinco encabezados acordados, o una selección sin repetirlos. Exige su tarifa exacta activa, vigente y en COP. `ORO_IVA` no se transforma en `DPP_ORO_IVA`; si falta su configuración, informa el problema. No se crearon ni modificaron tarifas en la base de datos.
- **Precios finales.** No añade IVA, márgenes o conversiones. Redondea al peso más cercano: desde 50 centavos sube al siguiente peso. Las comparaciones se calculan con decimales exactos y se envían como texto para conservar la precisión. El máximo propuesto por esta revisión es $9.999.999.999, compatible con `Decimal(12,2)`; antes de aplicar debe unificarse con los límites de la edición manual existente.
- **Vacíos y duplicados.** Una celda vacía deja esa tarifa fuera de la propuesta. Una fila con referencia necesita al menos un precio. Referencias repetidas, incluso con cambios de mayúsculas o espacios exteriores, requieren corrección. Se conservan ceros, guiones, sufijos y espacios internos.
- **Valores claros.** Acepta números de Excel o texto formado solamente por dígitos enteros. Rechaza fechas, booleanos, textos con separadores ambiguos o símbolos, ceros, negativos y valores que no caben después de redondear. Una fórmula detiene la lectura e indica la celda que debe pegarse como valor.

El límite de esta etapa es **5 MB por archivo y 5000 filas de datos**, más los títulos. Las 2000 filas preparadas de la plantilla son una comodidad, no el límite del sistema. No se alteró el Excel editado por el usuario para probar esta entrega: se generó una copia independiente con datos ficticios mediante el mismo generador.

## Qué protege la lectura y el acceso

La API nueva es `POST /api/prices/import/preview`, con `listaId` y `file`. Solo admite la acción `prices:preview` con `prices:read` y `listas:read`, además del alcance de esa lista. Los permisos, el usuario activo y la sesión se consultan de nuevo en cada solicitud; un JWT antiguo no conserva un acceso revocado. No se asignó este permiso automáticamente a los usuarios existentes.

Antes de usar SheetJS se verifica el contenedor XLSX: hasta 25 MB descomprimidos en total, 10 MB por parte y 128 partes; coherencia de tamaños, rutas, CRC y estructura. Se rechazan macros, enlaces a otros libros y contenedores que admitan interpretaciones contradictorias.

Una segunda lectura XML estricta comprueba el libro, sus dos hojas y las referencias reales de PRECIOS. Rechaza datos fuera de la dimensión declarada, filas/celdas repetidas y fórmulas. Así no depende únicamente del rango que el archivo declara. Se usa `sax` 1.6.1 como dependencia directa y versionada; el lector de datos procesa solamente PRECIOS. Un archivo con estructura incompatible debe copiarse en una plantilla nueva. La API no ejecuta contenido del Excel ni lo descomprime a disco.

La auditoría registra usuario, lista, resultado, hash SHA-256, tarifas, regla de redondeo y cantidades revisadas. No guarda el Excel, las referencias ni los valores de cada precio en este evento. Los accesos denegados mantienen el registro existente de seguridad. Esto es auditoría de una revisión; el historial de una actualización aplicada todavía debe construirse.

## Evidencia y archivos para revisar

- `src/backend/src/modules/prices/import/`: contenedor, estructura XML, contrato de plantilla, comparador, endpoint y sus pruebas.
- `src/backend/src/common/security/access-catalog.ts`: acción asignable y clasificación del endpoint. `prices.module.ts` monta el servicio y el controlador.
- `src/frontend/src/features/price-import/` y `services/price-import.service.ts`: formulario, comparación, límites y cancelación. `ListaDetailPage.tsx` añade la pestaña sin requerir Biblioteca.

La verificación terminó con **332 pruebas de backend en diez suites**, incluidas **21 pruebas HTTP**, y **13 pruebas de frontend en dos archivos**. Incluye archivos XLSX sintéticos, una plantilla generada con el mismo formato del documento aprobado, JWT firmado y ACL reales, ausencia de escrituras comerciales, regresiones de permisos y pruebas de la pantalla. Pasaron ESLint de los archivos tocados, TypeScript completo en ambas aplicaciones y la compilación de Vite. La compilación conserva el aviso de tamaño de los bundles de la aplicación; no impidió generar los archivos.

Comandos reproducibles desde `src/backend`:

```powershell
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/modules/prices/import/xlsx-container.spec.ts src/modules/prices/import/price-workbook-structure.spec.ts src/modules/prices/import/price-template.spec.ts src/modules/prices/import/price-import.service.spec.ts src/modules/prices/import/price-import.http.spec.ts src/common/security/access-catalog.spec.ts src/common/security/admin-access.integration.spec.ts src/common/security/access-assignments.service.spec.ts src/common/guards/admin-access.guard.spec.ts src/common/acl/acl.service.spec.ts
node node_modules/eslint/bin/eslint.js src/modules/prices/import src/modules/prices/prices.module.ts src/common/security/access-catalog.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Desde `src/frontend`:

```powershell
node node_modules/vitest/vitest.mjs run src/features/price-import
node node_modules/eslint/bin/eslint.js src/features/price-import src/services/price-import.service.ts src/pages/ListaDetailPage.tsx
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```

Se mantuvieron separadas cuatro partes para la revisión: lectura del archivo; comparación y permisos de la API; pantalla; documentación. No se hicieron commits, cambios de esquema, cargas comerciales ni despliegues.

## Lo siguiente: aplicar una revisión autorizada

Falta construir el guardado de una revisión y su aplicación: permiso separado, transacción de precios, historial por fila, control de cambios simultáneos y reintentos que no dupliquen la operación. Al aplicar se deben verificar otra vez usuario, permisos, lista, tarifas y precios anteriores. El resultado mostrado por el navegador no será una autorización para escribir.

También faltan la descarga de una plantilla nueva desde esta pantalla, perfiles de proveedores, recuperación de trabajos y validación con PostgreSQL del ambiente elegido. La vinculación de productos sin lista exige una acción propia y la carga nunca la hace; tras la enmienda esos productos reciben precio y se marcan «sin lista». Los botones del importador general anterior siguen siendo ese flujo y no se presentan como ejecutor nuevo de precios.

La publicación del catálogo y la apariencia de los productos permanecen fuera de esta entrega. El código está en el worktree local; guardar este documento en el servidor no publica la función.
