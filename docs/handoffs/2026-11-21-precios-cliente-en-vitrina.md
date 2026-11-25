# Precios del cliente en la vitrina

- **Fecha** 21 de noviembre de 2026
- **Rutas** `/catalogo`, sus listados y fichas, y `/clientes/comparar`
- **Estado** `integrado` en esta copia. La vista del puerto 4173 usa el catálogo público de producción y el acceso con Google del entorno local.

## 1. Lo que pide el diseño

El cliente conoce su precio en los listados y la ficha de la vitrina que ya usa. Cada referencia conserva los datos publicados de la Biblioteca. La tienda sigue disponible antes de iniciar sesión.

Una cuenta activa de Cliente Final recibe la tarifa base sin aprobación individual. Si una persona autorizada le asigna un escalafón, se aplica la tarifa de ese escalafón. Para cuentas sin escalafón, se usa la asignación general activa del portal si existe y, en su ausencia, `CLIENTE_FINAL_IVA` cuando está activa y vigente.

La interfaz necesita el identificador del producto, el valor vigente y la moneda. Una cuenta sin valor aplicable conserva la opción de consultar o cotizar. Si falla la consulta, se informa que el precio está temporalmente indisponible.

## 2. Contrato de funcionalidad

`GET /api/customer-portal/customer/catalog/prices?ids=<id1>,<id2>` consulta hasta 50 referencias en el mismo lote. La API resuelve la tarifa con la cuenta del guard del portal. La respuesta privada contiene `data.prices`, un arreglo de `{productId, value, currency}`. Se omiten referencias invisibles y referencias sin precio. Se aplican las reglas de publicación y vigencia del catálogo protegido, sin cambios de esquema.

```json
{"data":{"prices":[{"productId":"equipo-prueba","value":"289000","currency":"COP"}]}}
```

El servidor responde con `Cache-Control: private, no-store` y `Vary: Cookie`. El DTO rechaza con HTTP 400 una lista vacía, inválida o de más de 50 referencias. El guard mantiene la comprobación de la cuenta autenticada y activa. Las tres suites de Jest del módulo pasaron 36 pruebas. TypeScript y lint de backend terminaron sin errores.

## 3. Integración

Los listados y las fichas conservan su API de lectura actual. El valor asignado se consulta con la sesión del cliente y se guarda en caché temporal por cuenta y escalafón.

Se comprobó el flujo con datos ficticios antes de conectar la vista a la API publicada. El puerto 5180 redirige al 4173. Esta vista obtiene los listados, las categorías, las fichas, las campañas y sus archivos públicos por HTTPS desde la API publicada. La API de Google y las sesiones usan el entorno local. Si hay una sesión local activa, la vista explica que los importes de producción requieren una sesión en el portal publicado.

Se comprobaron 850 referencias publicadas, 11 categorías principales, un listado filtrado y la respuesta de una ficha, su imagen y un documento. En la vista independiente con API publicada, la consulta de precios asignados usa el detalle protegido existente hasta que esté disponible la consulta por lote. Queda pendiente probar los importes asignados con una cuenta real activa.

Al integrar el endpoint nuevo en la rama que contiene Better Auth, aplicar también `requireCompleteProfile(req)`, que ya usan los endpoints de catálogo autenticado de esa rama.
