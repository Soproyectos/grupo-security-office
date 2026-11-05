# Reglas de publicación, atributos esenciales y proveedores

**Reconfirmación del usuario (26/10/2026):** publicar una ficha exige **al menos un precio vigente**, también si hoy está en Borrador. El informe previo debe mostrar ese mismo bloqueo antes de intentar publicar, sin depender de Listas. Se conserva el criterio temporal operativo (`validFrom` nulo o menor/igual a ahora; `validUntil` nulo o mayor a ahora). Esta confirmación no resuelve la elección de tarifa de referencia, IVA ni otras decisiones D4. La divergencia de precio entre CAT-05 y Publicar se corrigió con `cat05-r2`, cargado en QA con autorización y comprobado en modo de solo lectura; [seguimiento de aceptación](../bitacora/2026-10-26-biblioteca-correcciones-aceptacion.md). Las propuestas y el estado histórico del 22/10 se conservan debajo.

**Fecha:** 22/10/2026 · **Estado:** reglas confirmadas por el usuario más propuestas a revisión; nada está implementado. Contexto: [ADR-20261022](../adr/ADR-20261022-biblioteca-postgresql-dedicado.md) y [modelo de datos](./modelo-de-datos.md) (tablas `product_gaps` y `field_evidence`, que registran los faltantes y la verificación).
**Etiquetas:** `[CONFIRMADO]` lo definió el usuario · `[PROPUESTA]` a revisión, no aprobada · `[DECISIÓN]` abierta (códigos D1…D11 del ADR).
**Fuentes:** mensaje del usuario del 22/10; `validation-rules.ts` (regla `cat05-r1`); categorías reales del manifiesto de 5.038 productos (40 categorías). No se consultó ninguna base.
**La tienda no muestra precios a visitantes** `[CONFIRMADO]`: el «precio de venta» es un requisito de publicación y de cotización, no un dato que se exhiba públicamente. Ese acceso no se rediseña.

## 1. Tres dimensiones separadas (nunca una sola bandera)
| Dimensión | Pregunta | Resultado |
|---|---|---|
| **A. Puede publicarse** | ¿Cumple el mínimo? | Sí / No, con la lista de lo que bloquea |
| **B. Qué le falta** | ¿Qué datos o documentos no están? | Lista de faltantes registrados, que no bloquean |
| **C. Verificación** | ¿Cada dato es confiable? | Por dato: verificado / declarado / inferido / contradictorio |

Un producto publicable puede tener faltantes y datos solo declarados. `[CONFIRMADO]` No se exige ficha 100 % completa. `[CONFIRMADO]` La ausencia de PDF, datasheet, manual, firmware u otros documentos no impide publicar.

**Estados de un dato que falta** (no se mezclan): `no_encontrado` (se buscó y no apareció), `no_publicado` (el fabricante no lo publica, confirmado por una persona) y `no_aplica` (no corresponde a este producto, decidido por una persona o por la regla de la categoría). **«No encontrado» nunca se interpreta como «no aplica».**

**Verificación (dimensión C)**
| Nivel | Significado |
|---|---|
| Verificado | Fuente oficial con la referencia exacta, o confirmación humana, con la fuente registrada |
| Declarado | Viene de la lista del proveedor o de una fuente no oficial |
| Inferido | Deducido por un script o una persona, con la razón registrada |
| Contradictorio | Dos fuentes dicen cosas distintas |

Reglas `[PROPUESTA]`: (1) un dato contradictorio **no se muestra como verificado**; (2) si la contradicción afecta al mínimo (nombre, referencia, marca, precio o imagen), el producto no puede publicarse hasta resolverla; (3) si afecta a un dato fuera del mínimo, se publica sin ese dato (o sin la etiqueta de verificado) y queda como faltante a resolver; (4) **no se cambia automáticamente la publicación de productos existentes**: cualquier reevaluación produce un informe, no un despublicado.

## 2. Matriz: dato → obligatorio o advertencia → regla → ejemplo de error
| Dato | Tipo | Regla | Ejemplo de error |
|---|---|---|---|
| Nombre de vitrina `[CONFIRMADO]` | **Obligatorio** | Entre 1 y 70 caracteres; sin la referencia dentro; no todo en mayúsculas; sin marcadores como «pendiente» o «sin nombre» | `DS-2CE10DF0T-F` o `PENDIENTE` |
| Referencia exacta del producto `[CONFIRMADO]` | **Obligatorio** | La referencia del fabricante, tal cual la publica; si difiere del SKU interno, ambas se guardan por separado | `2CE10DF0T` (truncada) o la de otra variante de lente |
| SKU interno `[PROPUESTA]` | Obligatorio (ya existe) | Único; coincidencia sin espacios ni mayúsculas. Nunca cambia por proveedor | Dos fichas con el mismo SKU normalizado |
| Marca `[CONFIRMADO]` | **Obligatorio** | Marca real del catálogo; no «Sin marca» ni vacío | «Sin marca» (hoy 1.386 de los 5.038 no tienen marca: no podrían publicarse hasta resolverlo) |
| Especificaciones esenciales `[CONFIRMADO]` | **Obligatorio** | Las esenciales de la familia de su categoría (sección 3), con valor declarado o verificado | Cámara sin resolución ni tipo |
| Precio de venta `[CONFIRMADO]` | **Obligatorio** | Ver sección 5 | Solo existe el costo del proveedor |
| Imagen principal correcta `[CONFIRMADO]` | **Obligatorio** | Accesible, de la variante correcta, con texto alternativo (detalle abajo) | Imagen que da 404 o de otra variante |
| Categoría válida `[PROPUESTA]` | Obligatorio | Existente, activa y lo bastante específica para tener atributos esenciales | Categoría archivada o la genérica «Cableado» |
| Descripción breve `[PROPUESTA]` | Obligatorio | Texto propio de al menos 20 caracteres, distinto del nombre | Copia exacta del nombre |
| Datasheet / PDF `[CONFIRMADO]` | **Advertencia** | Faltante registrado; nunca bloquea | Faltante sin registrar |
| Manual, guía rápida, firmware, certificados, otros documentos `[CONFIRMADO]` | **Advertencia** | Igual: se registran como faltantes | — |
| Destacados y características `[PROPUESTA]` | Advertencia | Recomendados | Listas vacías (se avisa) |
| Medios adicionales (más imágenes) `[PROPUESTA]` | Advertencia | Recomendados | — |

**Imagen principal correcta `[PROPUESTA]`:** se abre sin error y es una imagen real; es de la variante del producto (la referencia aparece en la fuente de la imagen o una persona la confirmó); tiene un tamaño mínimo a definir con diseño; tiene texto alternativo.
**Hoy en el código:** la ausencia de datasheet ya es siempre aviso (`docs.datasheet_missing`), lo que coincide. No he verificado si la validación actual exige imagen principal, descripción o especificaciones; hay que comprobarlo contra las reglas antes de implementar.

## 3. Atributos esenciales por familia de categorías `[PROPUESTA]`
Las 40 categorías reales se agrupan en familias; cada familia tiene sus esenciales. No hay un número fijo de campos: lo que cuenta es que estén los esenciales de la familia.

| Familia (categorías reales) | Esenciales propuestos |
|---|---|
| Cámaras (Cámaras IP, Camaras Turbo, Videovigilancia) | Tipo (bala, domo, PTZ…), resolución, lente, protección IP, alimentación |
| Grabadores (DVRs Turbo, NVR dentro de Videovigilancia) | Canales, resolución máxima, compresión, número de discos o capacidad |
| Control de acceso y cerraduras (Control de Acceso, Cerraduras Inteligentes) | Tipo de dispositivo, método de identificación, alimentación, comunicación |
| Intercomunicación | Tipo (video/audio), alimentación, conexión |
| Alarmas y Smart Home | Tipo de dispositivo, zonas o canales, conectividad, alimentación |
| Cableado (Cableado Categoría 5E/6/6A, Accesorios de Cableado) | Categoría, tipo (UTP/FTP…), presentación o longitud, material del conductor |
| Racks y gabinetes (Racks, Gabinetes Tipo Rack) | Unidades (U), dimensiones, capacidad de carga |
| UPS y protección (UPS On Line/Interactivas/Trifásicas, Accesorios y Kits de UPS, Protectores y Reguladores de Voltaje) | Potencia (VA/W), tipo, voltaje de entrada y salida, autonomía (si aplica) |
| Baterías (Baterías Selladas, Plomo Carbono, Gel, Litio, Bancos de Baterías para UPS) | Voltaje, capacidad (Ah), química o tipo |
| Solar (Paneles, Inversores, Controladores, Accesorios, Baterías Solares) | Potencia, voltaje, tipo |
| Transformadores y variadores (Transformadores de Aislamiento, Variadores de Frecuencia) | Potencia, voltajes, fases |
| Motores y herrajes para puertas levadizas | Motor: tipo de puerta, fuerza, voltaje · Herraje: material, compatibilidad |
| Almacenamiento | Tipo (HDD/SSD), capacidad, interfaz |

**Categorías que no sirven para definir esenciales (decisión pendiente):** «Cableado» (1.153 productos), «Redes y Cableado» (856), «Seguridad electrónica» (153) y «Videovigilancia» (281) son demasiado amplias. Hasta que se reclasifiquen o se definan esenciales por tipo de producto, no se puede evaluar el mínimo de esos productos. Esta lista de esenciales la debe validar compras: los nombres de atributos son propuesta mía, no salen de una fuente verificada.

## 4. Ejemplo: producto publicable con el PDF pendiente (ilustrativo)
| | |
|---|---|
| Nombre de vitrina | Cámara bala Hikvision ColorVu 2 MP |
| SKU interno / Referencia exacta | `DS-2CE10DF0T-F` (ejemplo) / `DS-2CE10DF0T-F(2.8MM)` (la variante de lente es referencia propia) |
| Marca / Categoría | Hikvision / Cámaras Turbo |
| Descripción breve | «Cámara Turbo HD de 2 MP con imagen a color 24/7 y luz blanca de hasta 20 m.» |
| Especificaciones esenciales | Tipo bala · 2 MP · lente 2,8 mm · IP67 · 12 V CC (todas con fuente oficial) |
| Precio de venta | `[valor definido por compras]`, COP, tarifa de referencia, IVA definido, vigente |
| Imagen principal | Accesible, de la variante, con texto alternativo |
| **A. Puede publicarse** | **Sí** |
| **B. Qué le falta** | Datasheet (PDF), manual, firmware (`no_encontrado` o pendiente de revisión) |
| **C. Verificación** | Nombre, marca y especificaciones: verificados (fuente oficial con la referencia exacta). Descripción: inferida. Precio: declarado en la lista de compras, aprobado por una persona |
Los datos de este ejemplo salen de la prueba del bot del 22/10; **no están aprobados por una persona** y el precio no se inventó.

## 5. Precio de venta, vigencia y proveedores
**Precio de venta válido `[PROPUESTA]`:** existe para la **tarifa de referencia** (por definir, D4; las tarifas conocidas son Instalador, Tienda, Oro, Platino y Cliente final según ADR-20261014); está en COP; tiene definido si incluye IVA; es mayor que cero; está vigente; **el costo de proveedor no sirve como precio de venta**. Hoy el código exige, al menos, un precio en la lista (revisión parcial) y `Price.validFrom/validUntil` existen pero nunca se escriben.

**Proveedores `[PROPUESTA]`, solo documental:** un producto puede tener varios proveedores y referencias equivalentes sin cambiar su identidad ni duplicar la ficha.
| Concepto | Qué es | Cambia la ficha pública |
|---|---|---|
| Producto (SKU interno) | Identidad única | — |
| Referencia de fabricante | Código oficial del producto | Sí (referencia exacta) |
| Referencia de proveedor | Código con que cada proveedor lo vende; varias por producto | No |
| Costo de compra por proveedor | Precio al que compra Grupo Security; con proveedor, moneda, IVA, vigencia y origen (importación) | **No. Nunca se publica** |
| Tarifa de venta (`PriceList` + `Price`) | Precio al público o al canal | Sí |
Costo de compra y tarifa de venta viven en tablas separadas y un cambio de costo **nunca** modifica una tarifa de venta de forma automática.

## 6. Decisiones pendientes (D4 y D5 del ADR; una por una, recomendación provisional)
1. **Tarifa de referencia (D4).** ¿Qué tarifa define si un producto «tiene precio de venta válido»? Recomiendo marcar una sola (`price_lists.is_reference_sale`). *Impacto:* sin ella no se puede evaluar «precio de venta válido»; lo que se muestra hoy no cambia (la tienda no muestra precios a visitantes).
2. **IVA y moneda del precio de referencia (D4).** ¿Con o sin IVA? Recomiendo un único modo, en COP. *Impacto:* afecta la comparación y el redondeo en la importación.
3. **Vigencia del precio (D4).** ¿Los precios tienen fecha de vencimiento o rigen hasta que se reemplazan? Recomiendo vigencia opcional: si no hay fecha, rige hasta el siguiente cambio. *Impacto:* hoy los campos existen y están sin uso.
4. **Qué pasa si el precio deja de ser válido** (vence, se anula o se borra). Recomiendo **no despublicar automáticamente**: el producto sigue visible sin precio («consultar»), se alerta a compras y solo una persona decide despublicar. *Impacto:* cumple tu regla de no cambiar la publicación en automático; evita ofertas con precio viejo.
5. **Categorías amplias (D5)** («Cableado», «Redes y Cableado», «Seguridad electrónica»): reclasificar o definir esenciales por tipo de producto. *Impacto:* 2.443 productos del manifiesto (1.153 + 856 + 153 + 281) no podrían evaluarse hasta resolverlo; es un conteo del manifiesto, no de producción.
6. Las decisiones D2 (variantes) y D3 (campo oficial del nombre y la ficha) siguen abiertas. Que un producto pueda tener varios proveedores y referencias equivalentes es la dirección indicada por el usuario; el diseño de tablas está en el modelo de datos, sin implementar.

**No verificado:** que la validación actual exija o no cada dato del mínimo; el comportamiento real de publicación en producción; los conteos de producción (solo el manifiesto); los atributos esenciales por categoría.
PostgreSQL dedicado a biblioteca, separado del operativo, reutilizando la web y la API actuales, sigue siendo el objetivo. El parche SQL sigue como pendiente de seguridad independiente. Hermes y Gentle AI siguen pausados.
