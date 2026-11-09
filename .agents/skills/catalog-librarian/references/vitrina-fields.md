# Campos de la ficha de vitrina

Qué significa cada campo, quién lo llena y cuál es su regla. El contrato formal está en `../assets/producto.schema.json`.

## Los campos

| Campo | Obligatorio | Regla |
|---|---|---|
| `referencia` | Sí | El código del proveedor, tal cual. Es la llave de la biblioteca y nunca se muestra como título. |
| `nombre_vitrina` | Sí | Máximo 70 caracteres. Título comercial que lee el cliente. Nunca contiene la referencia. |
| `marca` | No | Puede faltar: 235 de las 764 referencias no la traen ni deducible. `null` es válido. |
| `categoria` | Sí | Normalizada. La mejor pista es `origen.seccion` del Excel. |
| `descripcion` | Sí | El texto técnico completo del proveedor, sin recortar. Es lo contrario del nombre. |
| `specs` | No | Lista de pares nombre/valor. Cada spec lleva su propio origen. |
| `imagen` | No | Solo si se encontró en una página que menciona la referencia exacta. |

## Los tres orígenes

Todo valor declara de dónde salió. Esto es lo que permite auditar la biblioteca después.

| Origen | Significa | Exige |
|---|---|---|
| `lista` | Venía en el Excel del proveedor | nada |
| `web` | Se encontró en una página verificada | `fuente` con la URL |
| `inferido` | Se dedujo de la evidencia disponible | `razon` explicando de qué |

La inferencia está permitida y es necesaria — casi ningún nombre de vitrina viene hecho. Lo que no está permitido es inferir en silencio: un valor `inferido` sin `razon` es salida inválida.

## Por qué la puerta de coincidencia exacta

El catálogo mezcla productos con ficha oficial (Hikvision, Accessmatic, Powest) con genéricos que no tienen ninguna (cables, resortes, aisladores, patch cords). Sin una regla dura, un agente que busca "cable 16 AWG" encuentra mil resultados plausibles y llena la ficha con datos de otro producto.

La regla es: **la referencia exacta debe aparecer escrita en la página**. Si no aparece, no es ese producto, y `no_encontrado` es la respuesta correcta.

## Cobertura esperada

Medido sobre las 764 referencias reales:

- 58% tiene descripción de 70 caracteres o menos, así que el nombre sale sin buscar en la web.
- 69% permite deducir la marca por prefijo de referencia o por el texto de la descripción.
- 66% trae sección de categoría en el Excel de origen.
- Las imágenes no vienen en ninguna lista: el 100% depende de la web.

## Qué NO va en la ficha

Precios, costos, márgenes y porcentajes de utilidad. El extractor solo lee las columnas de referencia y descripción, así que esos datos no pueden llegar aquí por construcción. Si aparecen, hay un error en el extractor.
