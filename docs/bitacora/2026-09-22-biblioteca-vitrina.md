---
tags: [bitacora, importacion, catalogo, grupo-security]
date: 2026-09-22
autor: zatairo
---

# Bitácora — 2026-09-22

Sesión sobre importación de listas y construcción de la biblioteca de vitrina. Arrancó investigando por qué el panel de admin no mostraba nada y terminó con el catálogo completo generado y la decisión de arquitectura escrita.

## ¿Qué se hizo?

**Arreglos de importación, ya en `main`:**

| Commit | Qué corrige |
|--------|-------------|
| `e85d63f` | Borrar una Lista ahora elimina en cascada sus productos, en una transacción y con confirmación explícita |
| `0dda5af` | La ejecución de importación pasa a segundo plano: las listas grandes dejan de fallar por tiempo |
| `395bfde` | Tarjeta flotante global con el progreso, montada una sola vez y visible en cualquier pantalla |
| `796d83f` | Reabrir el asistente con una importación en curso muestra su progreso en vez de la pantalla de carga |
| `a397c93` | La tarjeta es clicable y abre el asistente con el estado de esa importación |

**Limpieza de datos:** se eliminaron 769 y después 150 productos huérfanos que habían quedado de borrados de Lista anteriores, con confirmación explícita en cada caso.

**Análisis del catálogo real:** se midieron las 5 listas de proveedor. 764 referencias únicas, de las cuales el 58% ya tiene descripción que cabe en 70 caracteres, el 69% permite deducir la marca y el 66% trae su categoría en las filas de sección del Excel. Ninguna lista trae imágenes.

**Skill `catalog-librarian`:** define el procedimiento de construcción de la biblioteca. Incluye el extractor de Excel, la definición del agente de OpenCode, el esquema de salida y la guía de campos. Va en el PR #52.

**Catálogo generado:** el agente produjo 764 fichas en el servidor. Se revisaron las 764, no una muestra.

## Decisiones tomadas

- **La identidad del producto es permanente, el precio es desechable.** Es la decisión de fondo y de ella salen todas las demás. Registrada en [ADR-002](../adr/ADR-002-biblioteca-vitrina.md).
- **La biblioteca no necesita tabla nueva.** `products.sku` ya es único en todo el sistema y los precios ya cuelgan de la Lista. Lo que falta es respetar quién manda sobre cada campo.
- **El nombre de vitrina no pasa de 70 caracteres** y nunca contiene la referencia. La descripción técnica completa se conserva aparte, sin recortar.
- **Todo campo declara su origen:** de la lista, de la web con su URL, o inferido con su razón escrita. Inferir está permitido; inferir en silencio no.
- **El extractor solo abre las columnas de referencia y descripción.** Así los datos de costo y margen no pueden salir del archivo ni viajar a un servidor externo.
- **Se descartó exigir nombres en la plantilla.** No por teoría: ya se intentó, y terminó con el encabezado `DESCRIPCION` renombrado a `NOMBRE`. El trabajo manual no se hizo, se simuló.

## Problemas encontrados

**El diagnóstico inicial estaba equivocado.** No era la referencia lo que se mostraba como título de producto, era la descripción técnica completa —hasta 525 caracteres— metida en el campo de nombre. Cambiaba por completo cuál era el arreglo.

**Dos procesos de Node peleando por el puerto 3000.** Uno con el código vivo y otro con una compilación congelada de días atrás. Explicaba por qué el borrado de Listas funcionaba a veces sí y a veces no. Es el fallo que más horas costó y el que menos se parecía a lo que era. Documentado en el [runbook](../procedimientos/runbook-importacion-y-agentes.md).

**El 429 al importar era nuestro.** El sondeo de progreso chocaba contra el límite de tasa pensado para frenar fuerza bruta en el login.

**`getProgress` reportaba éxito ante un identificador desconocido.** Encontrado probando a mano en el navegador, no por los tests.

**Márgenes de utilidad guardados dentro de los productos.** Un registro real tiene `{"PLATINO": 23, "COLUMNA4": 110553}` en `extraAttributes`: son columnas basura de la hoja cruda donde `PLATINO: 23` es un margen. Hoy solo lo ve el admin, pero viaja con el producto.

**Un agente de OpenCode llevaba 3 días y 21 horas** reintentando una tarea cuyo archivo de instrucciones ya había sido borrado, consumiendo llamadas a la API en cada vuelta.

**La investigación web rindió mucho menos de lo esperado.** De 764 fichas: 3% verificadas contra una fuente, **0 imágenes** y **0 specs técnicas**. Redactar nombres a partir de un texto que ya los contiene funcionó bien; buscar en internet y juzgar si una página corresponde al producto, no.

**155 productos quedaron sin nombre por un defecto de instrucción.** El agente confundió «no lo pude verificar en la web» con «no lo puedo nombrar». Los 155 tienen descripción y 106 ya caben en 70 caracteres.

**`POST /bulk-transition` existe y no tiene interfaz.** Publicar varios productos a la vez está implementado en el backend pero no hay forma de hacerlo desde la web. Borrado masivo, actualización masiva de precios y mover categoría sí tienen su modal. Publicar no. Con 764 productos por publicar, esto bloquea el estreno de la vitrina.

## Próximos pasos

- [ ] Decidir qué precio ve cada rol — bloquea la vitrina pública por completo
- [ ] Interfaz para `bulk-transition` — sin esto son 764 publicaciones de a una
- [ ] Migración Prisma: `nameSource`, `nameLockedAt`, `lastSeenAt`, tabla rol → tipo de precio
- [ ] Dejar de sobrescribir identidad en la rama de update del pipeline
- [ ] Tope de 70 caracteres en el validador y corte de líneas en la tarjeta
- [ ] Importar las 764 fichas a la base de datos
- [ ] Limpiar costo y margen de `extraAttributes` en los 544 productos cargados
- [ ] Decidir qué pasa al borrar una Lista: hoy arrastra sus productos
- [ ] Resolver el origen de las imágenes — sin propuesta todavía
- [ ] Atender las 8 vulnerabilidades de Dependabot en la rama principal (7 altas, 1 baja)

## Referencias

- [ADR-002 — biblioteca de vitrina](../adr/ADR-002-biblioteca-vitrina.md)
- [ADR-001 — arquitectura híbrida de importación](../adr/ADR-001-import-hybrid-architecture.md)
- [Runbook — importación y agentes](../procedimientos/runbook-importacion-y-agentes.md)
- PR #52 — skill `catalog-librarian` y ADR-002
