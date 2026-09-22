# Tarea: completar los nombres de vitrina y consolidarlos en cada ficha

Trabajas en `~/catalogo-vitrina`. Esta tarea es **solo de texto**: no busques en la web,
no uses `websearch` ni `webfetch`. Todo lo que necesitas ya esta en disco.

## Que hay

- `biblioteca/<slug>.json` — 764 fichas con `referencia`, `categoria`, `descripcion`,
  `estado` y `fuentes_consultadas`. **Ninguna tiene `nombre_vitrina` todavia.**
- `biblioteca/titulos-vitrina.csv` — columnas `referencia,nombre_vitrina,estado`.
  Trae 609 nombres ya redactados y **155 vacios**.

## Correccion importante sobre `estado`

En la corrida anterior 155 productos quedaron sin nombre porque su `estado` era
`no_encontrado`. Eso fue un error de interpretacion:

**`estado` dice si el producto se pudo verificar en la web. NO dice si se le puede poner
nombre.** Un producto que no aparece en internet igual tiene descripcion, y de esa
descripcion sale su nombre.

**Los 764 deben terminar con nombre. Ninguno queda vacio.**

## Que tienes que hacer

Para cada uno de los 764 archivos de `biblioteca/`:

1. Busca su `referencia` en `titulos-vitrina.csv`.
2. Consigue el nombre:
   - Si el CSV ya trae nombre, **usalo tal cual**.
   - Si el CSV lo trae vacio, **redactalo desde el campo `descripcion` de la ficha**.
3. Agrega el campo `nombre_vitrina` a la ficha y **escribela al disco antes de pasar a la
   siguiente**. El archivo en disco es el unico progreso que cuenta.
4. **No toques ningun otro campo.** `estado`, `categoria`, `descripcion`, `marca` y
   `fuentes_consultadas` quedan exactamente como estan.

## Como se redacta un nombre

Maximo **70 caracteres**. Es el titulo que lee un cliente en la tienda.

- Si la descripcion ya mide 70 o menos: usala, normalizando mayusculas a Titulo
  (`AISLADOR TIPO ANILLO` -> `Aislador Tipo Anillo`). Respeta siglas, medidas y modelos
  tal cual: `UPS`, `LED`, `IP67`, `MG 750`, `2TB`, `3/4 HP`, `433MHZ`.
- Si mide mas de 70: arma el nombre **con palabras que ya esten en la descripcion** —
  tipo de producto + marca + modelo + la caracteristica que lo distingue. El resto del
  texto tecnico se queda donde esta, en `descripcion`.
- Nunca metas la referencia dentro del nombre.
- Nunca inventes una caracteristica que la descripcion no diga.

## Formato exacto del campo

```json
"nombre_vitrina": {
  "valor": "Aislador Tipo Anillo",
  "origen": "lista"
}
```

- `origen: "lista"` cuando el nombre es la descripcion completa, solo con mayusculas
  normalizadas.
- `origen: "inferido"` cuando tuviste que acortar o reordenar. En ese caso agrega
  `"razon"` explicando de donde lo sacaste.

## Al terminar, informa

- Cuantas fichas quedaron con `nombre_vitrina` (debe ser 764).
- Cuantos nombres salieron del CSV y cuantos redactaste tu.
- Cuantos quedaron `origen: "lista"` y cuantos `origen: "inferido"`.
- El nombre mas largo y su cantidad de caracteres (debe ser <= 70).
- Si alguno quedo sin nombre: cual y por que.
