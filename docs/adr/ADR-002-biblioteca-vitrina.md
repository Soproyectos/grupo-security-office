# ADR-002: Biblioteca de Vitrina — separar la identidad del producto del precio

| Campo | Valor |
|-------|-------|
| **Estado** | Propuesta |
| **Fecha** | 2026-09-22 |
| **Decisor** | Tech Lead + Producto |
| **Alcance** | Prisma schema (`Product`), import pipeline, vitrina pública, proceso de publicación |
| **Relacionada** | Revisa parcialmente [ADR-001](./ADR-001-import-hybrid-architecture.md) |

---

## Contexto

Las listas de proveedor traen **dos columnas útiles: referencia y descripción**. No traen nombre comercial, ni marca, ni categoría, ni imagen. Medido sobre las 5 listas reales que se cargan a diario (764 referencias únicas):

| Dato | Valor |
|------|-------|
| Referencias únicas en total | 764 |
| Listas que traen una columna de nombre | 0 de 5 |
| Descripciones que ya caben en 70 caracteres | 443 (58%) |
| Marca deducible por prefijo de referencia o por el texto | 529 (69%) |
| Productos con su categoría en las filas de sección del Excel | 504 (66%) |
| Listas que traen imagen | 0 de 5 |

**Problema 1 — la vitrina muestra fichas técnicas como títulos.** Sin columna de nombre, el pipeline usa la descripción completa, y `RowValidatorService` acepta hasta 500 caracteres (`row-validator.service.ts:128`). El resultado son tarjetas de catálogo con títulos de hasta **525 caracteres**. La función que acorta un nombre existe (`text-normalizer.ts`), pero solo se activa cuando el campo nombre llega vacío, nunca cuando llega lleno de texto largo.

**Problema 2 — cada carga mensual reescribe lo que el cliente ya está viendo.** En `batch-executor.service.ts:257-267`, la rama de actualización sobrescribe `name`, `description`, `categoryId`, `brandId` y `extraAttributes`. No cambia `lifecycleStatus`: el producto **sigue publicado**, pero su identidad cambia en silencio. Corregir un nombre a mano no sirve de nada, porque la siguiente lista lo pisa sin avisar.

**Problema 3 — datos comerciales internos viajan pegados al producto.** Un registro real de la base guarda `{"PLATINO": 23, "COLUMNA3": 23, "COLUMNA4": 110553}` en `extraAttributes`. Son las columnas sin mapear de la hoja cruda: `PLATINO: 23` es un margen de utilidad y `COLUMNA4` un costo. Hoy solo las ve el admin porque no existe endpoint público, pero están adheridas al registro del producto y saldrían con él el día que se abra la vitrina.

### Restricciones

- No romper el pipeline de importación ni el wizard existentes.
- Las listas se recargan cada mes con los mismos productos y distinto precio: el flujo normal no puede exigir revisión humana.
- El equipo comercial sube listas sin tocar Excel previamente.
- Nombrar 764 productos a mano no es viable como trabajo recurrente.

---

## Decisión

Separar el modelo en dos capas con dueños distintos:

- **Biblioteca** — la identidad del producto: nombre de vitrina, marca, categoría, descripción, imagen y specs. Llave: la referencia. Se define una vez y queda fija.
- **Lista** — el precio y su vigencia. Se reemplaza completo en cada carga.

La regla de fondo: **la identidad es permanente, el precio es desechable.**

La biblioteca **no requiere tabla nueva**. Ya existe: `products.sku` es único en todo el sistema, y `Price` cuelga de `(producto, lista, tipo de precio)`. Lo que falta es respetar quién manda sobre cada campo, y cuatro elementos de control:

| Elemento | Para qué |
|----------|----------|
| `nameSource` | Saber si el nombre lo puso el proveedor, el sistema o una persona |
| `nameLockedAt` | Impedir que una importación pise un nombre ya aprobado |
| `lastSeenAt` | Responder qué referencias dejaron de aparecer en las listas |
| Tabla rol → tipo de precio | Decidir qué precio ve cada quien en la vitrina |

---

## Opciones consideradas

### Opción A: Dejarlo como está — la lista manda sobre la identidad

| Dimensión | Evaluación |
|-----------|------------|
| Complejidad | Ninguna |
| Costo | Cero |
| Escalabilidad | Mala — el problema crece con cada lista |
| Familiaridad del equipo | Total |

**A favor:** no hay que hacer nada.

**En contra:** la vitrina queda inservible (títulos de 525 caracteres), el trabajo de curaduría se pierde en cada carga, y los márgenes siguen pegados a los productos.

### Opción B: Exigir nombre y marca en la plantilla

| Dimensión | Evaluación |
|-----------|------------|
| Complejidad | Baja en código, alta en operación |
| Costo | Alto y recurrente — trabajo manual por carga |
| Escalabilidad | Mala — crece lineal con el catálogo |
| Familiaridad del equipo | Alta |

**A favor:** máxima calidad de nombres, sin dependencias técnicas nuevas.

**En contra:** obliga a reescribir a mano 211 filas por lista antes de cada carga. La prueba real de esto ya se hizo: la carpeta `AJUSTADAS` fue ese intento, y terminó con el encabezado `DESCRIPCION` renombrado a `NOMBRE` — es decir, el trabajo manual no se hizo, se simuló. Ese es precisamente el origen del Problema 1.

### Opción C: Biblioteca permanente, identidad resuelta una sola vez (elegida)

| Dimensión | Evaluación |
|-----------|------------|
| Complejidad | Media — 4 elementos nuevos y cambios en el pipeline |
| Costo | Alto una vez, casi cero después |
| Escalabilidad | Buena — el costo no crece con las recargas |
| Familiaridad del equipo | Media — introduce el concepto de identidad bloqueada |

**A favor:** el trabajo de nombrado se paga una vez por referencia, no por carga. Subir la lista de Hikvision doce veces al año agrega 764 productos la primera vez y cero las once restantes. Habilita corrección manual que sobrevive.

**En contra:** exige migración de esquema, introduce un estado nuevo que el equipo tiene que entender, y deja 764 fichas que hay que sembrar antes de estrenar.

---

## Análisis de trade-offs

El eje real no es la calidad del nombre, sino **cada cuánto se paga el trabajo**.

La opción B produce los mejores nombres, pero cobra el costo en cada carga mensual y por eso no se sostiene — ya falló una vez en la práctica. La opción C produce nombres algo peores en los casos límite, pero cobra una sola vez por referencia. Como el catálogo es cerrado (764 referencias que cambian poco) y las recargas son frecuentes, el costo total de C es un orden de magnitud menor.

El segundo eje es **qué pasa cuando alguien corrige a mano**. En A y B la corrección se pierde en la siguiente carga; en C sobrevive, porque el nombre queda bloqueado. Sin esa propiedad, pedirle al equipo comercial que cuide la vitrina no tiene sentido: su trabajo se borraría solo.

---

## Cómo cambia la publicación

Hoy publicar es una decisión por producto y por carga, sobre un catálogo que se reescribe solo. Los 544 productos actuales están todos en `DRAFT`.

Con la biblioteca, publicar pasa a ser **una decisión sobre la identidad, no sobre el precio**:

1. **Referencia conocida, cambió el precio** → se actualiza sin avisar. No toca la publicación.
2. **Referencia conocida, mismo precio** → solo se cuenta en el resumen.
3. **Referencia conocida, cambió la identidad** (descripción o marca distinta) → se marca para revisión. **No se pisa automáticamente**, que es lo contrario de lo que pasa hoy.
4. **Referencia nueva** → se genera su ficha, entra como borrador y espera aprobación. Es el único caso que consume decisión humana.
5. **Referencia que desapareció de la lista** → no se borra ni se despublica: se reúne y se pregunta qué hacer.

El efecto práctico: un producto se aprueba una vez y se queda publicado con la identidad que se aprobó. Hoy sigue publicado también, pero mostrando lo que la última lista dictó.

---

## Revisión de ADR-001

ADR-001 decidió preservar en `extraAttributes` toda columna sin mapear, y lo listó como consecuencia positiva ("columnas adicionales preservadas para uso futuro"). Para columnas descriptivas fue correcto. Para columnas de **costo, utilidad y margen** no lo es: las guarda en el mismo registro que se va a exponer al cliente.

Esta ADR no revierte el campo `__extra` ni `extraAttributes`. Acota su alcance: **las columnas de costo y margen no se guardan**, ni siquiera como atributo extra. El extractor de la biblioteca aplica esa regla por construcción — solo abre las columnas de referencia y descripción, así que el resto no puede filtrarse.

Queda pendiente limpiar los 544 productos ya cargados que las tienen.

---

## Consecuencias

### Positivas

- La curaduría manual sobrevive a las recargas: corregir un nombre deja de ser trabajo perdido.
- La carga mensual deja de exigir revisión: solo pregunta por lo genuinamente nuevo o cambiado.
- Los datos de costo y margen dejan de viajar con el producto.
- La biblioteca deja de crecer con cada carga: crece solo cuando el proveedor saca productos nuevos.
- Un producto puede existir aunque su lista se borre.

### Negativas / Deuda técnica

- Requiere migración de esquema.
- Hay que sembrar 764 fichas antes de estrenar la vitrina.
- **Las imágenes siguen sin resolver: 0 de 764.** La investigación web automática rindió 3% de verificación y ninguna imagen. Esta ADR no propone solución para eso.
- Introduce un concepto nuevo — identidad bloqueada — que hay que explicarle al equipo comercial.
- `Product.listaId` queda como dato informativo y deja de expresar pertenencia, lo que obliga a revisar toda consulta que hoy filtre por ese campo.

---

## Limitaciones conocidas

- **Un producto no puede estar en dos listas.** `Product.listaId` es un solo campo. Mientras haya una lista por proveedor no molesta; aparece el día que exista una lista de promoción con productos repetidos.
- **Borrar una lista arrastra sus productos.** Contradice la biblioteca permanente. Lo razonable es que borre sus precios y solo arrastre productos nunca publicados, pero es una decisión de negocio sin tomar.
- **No existe la regla rol → tipo de precio.** Los siete códigos de precio solo se usan al importar; nada decide qué precio ve un cliente. Bloquea la vitrina pública por completo.
- **Publicar varios productos a la vez no tiene interfaz.** El endpoint `POST /bulk-transition` existe y funciona, pero no hay forma de invocarlo desde la web: borrado masivo, actualización masiva de precios y mover categoría tienen su modal, publicar no. Con 764 productos por aprobar, esto convierte el estreno de la vitrina en 764 acciones de a una.

---

## Acciones pendientes

1. [ ] Decidir qué precio ve cada rol (bloquea la vitrina pública).
2. [ ] Interfaz para `bulk-transition` — sin ella, publicar el catálogo son 764 acciones de a una.
3. [ ] Migración Prisma: `nameSource`, `nameLockedAt`, `lastSeenAt`, tabla rol → tipo de precio.
4. [ ] Dejar de sobrescribir identidad en la rama de update del pipeline.
5. [ ] Tope de 70 caracteres en el validador y corte de líneas en la tarjeta.
6. [ ] Importar las 764 fichas de la biblioteca.
7. [ ] Limpiar costo y margen de `extraAttributes` en los 544 productos ya cargados.
8. [ ] Decidir el comportamiento de borrado de listas.
9. [ ] Resolver el origen de las imágenes — sin propuesta todavía.

---

## Archivos relacionados

- `.claude/skills/catalog-librarian/` — procedimiento y piezas para construir la biblioteca
- `src/backend/src/modules/products/import/pipeline/batch-executor.service.ts` — la rama de update que sobrescribe identidad
- `src/backend/src/modules/products/import/pipeline/row-validator.service.ts` — el límite de 500 caracteres del nombre
- `src/backend/src/modules/products/import/helpers/text-normalizer.ts` — derivación de nombre corto
- `src/backend/prisma/schema.prisma` — `Product`, `Price`, `Lista`, `PriceList`
