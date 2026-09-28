#!/usr/bin/env python3
"""Parsea las listas Excel del proveedor (listas/*.xlsx) a catalogo-base.json.

Entrada:  listas/*.xlsx (se omite PLANTILLA GRUPO SECURITY, que es formato de
          carga, no lista fuente).
Salida:   catalogo-base.json en la raiz del repo, con productos[] =
          {referencia, descripcion, origen: {archivo, hoja, seccion}, pista_marca}.
          pista_marca toma el nombre de la hoja (POWEST, HIKVISION TURBO...)
          y origen.seccion el titulo de bloque vigente (o la hoja si no hay).

Ignora TODAS las columnas de precio (regla del bibliotecario: sin precios).
Tolerante a losquirks reales de las listas: encabezados con acentos/espacios
(DESCRIPCION / DESCRIPCION con acento), filas basura arriba del encabezado y
titulos de bloque dentro de las columnas.

Re-ejecutable: sobreescribe catalogo-base.json con el estado actual de listas/.

Uso:  python3 scripts/parsear_listas.py   (desde la raiz del repo)
"""

import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

import openpyxl

RAIZ = Path(__file__).resolve().parent.parent
DIR_LISTAS = RAIZ / "listas"
SALIDA = RAIZ / "catalogo-base.json"

ENCABEZADO_MAX_FILAS = 10  # busca la fila de encabezado solo hasta aqui

# Palabras que indican columna de precio: nunca se copian a la salida.
RE_PRECIO = re.compile(r"PRECIO|COSTO|VALOR|PREC1|IVA", re.IGNORECASE)


def normaliza(texto):
    """minusculas sin acentos, para comparar encabezados."""
    texto = unicodedata.normalize("NFKD", str(texto or ""))
    return "".join(c for c in texto if not unicodedata.combining(c)).strip().lower()


def limpia_celda(valor):
    """str limpio o None si la celda esta vacia."""
    if valor is None:
        return None
    texto = re.sub(r"\s+", " ", str(valor)).strip()
    return texto or None


def es_titulo_bloque(ref, desc, precios_vacios):
    """Fila que titula una seccion del catalogo, no un producto."""
    if ref and not desc and precios_vacios:
        # p.ej. '1. VARIADORES DE FRECUENCIA.' en la columna REFERENCIA
        return True
    if desc and not ref and precios_vacios:
        # p.ej. 'MOTORES PARA PUERTAS LEVADIZAS' en la columna DESCRIPCION
        return True
    return False


def localiza_columnas(ws):
    """Devuelve (fila_encabezado, col_ref, col_desc, col_precios) o None."""
    for fila_idx, fila in enumerate(
        ws.iter_rows(min_row=1, max_row=ENCABEZADO_MAX_FILAS, values_only=True), start=1
    ):
        col_ref = col_desc = None
        col_precios = []
        for idx, celda in enumerate(fila):
            nombre = normaliza(limpia_celda(celda))
            if not nombre:
                continue
            if col_ref is None and re.fullmatch(r"referencia\s*\*?", nombre):
                col_ref = idx
            elif col_desc is None and re.fullmatch(r"descripci[o]n\s*\*?", nombre):
                col_desc = idx
            elif RE_PRECIO.search(nombre):
                col_precios.append(idx)
        if col_ref is not None and col_desc is not None:
            return fila_idx, col_ref, col_desc, col_precios
    return None


def parsea_hoja(ws, archivo):
    """Devuelve (productos_de_la_hoja, filas_sin_referencia)."""
    cols = localiza_columnas(ws)
    if not cols:
        return [], 0
    fila_enc, col_ref, col_desc, col_precios = cols

    productos = []
    sin_referencia = 0
    seccion = None  # titulo de bloque vigente; cae a None al cambiar

    for fila in ws.iter_rows(min_row=fila_enc + 1, values_only=True):
        ref = limpia_celda(fila[col_ref]) if col_ref < len(fila) else None
        desc = limpia_celda(fila[col_desc]) if col_desc < len(fila) else None
        precios_vacios = all(
            limpia_celda(fila[i]) is None for i in col_precios if i < len(fila)
        )

        if not ref and not desc:
            continue  # fila vacia
        if es_titulo_bloque(ref, desc, precios_vacios):
            seccion = desc or ref
            continue
        if not ref or not desc:
            sin_referencia += 1
            continue

        productos.append(
            {
                "referencia": ref,
                "descripcion": desc,
                "origen": {
                    "archivo": archivo,
                    "hoja": ws.title,
                    "seccion": seccion or ws.title,
                },
                "pista_marca": ws.title,  # la hoja es la mejor pista de marca
            }
        )
    return productos, sin_referencia


def main():
    if not DIR_LISTAS.is_dir():
        sys.exit(f"No existe {DIR_LISTAS}")

    archivos = sorted(
        p for p in DIR_LISTAS.glob("*.xlsx")
        if "PLANTILLA" not in p.name.upper() and not p.name.startswith("~$")
    )
    if not archivos:
        sys.exit("No hay listas *.xlsx en listas/ (excluyendo PLANTILLA)")

    vistos = {}
    productos = []
    duplicados = 0
    sin_referencia = 0
    hojas_utiles = 0

    for archivo in archivos:
        wb = openpyxl.load_workbook(archivo, read_only=True, data_only=True)
        for ws in wb.worksheets:
            prods, sin_ref = parsea_hoja(ws, archivo.name)
            sin_referencia += sin_ref
            if prods:
                hojas_utiles += 1
            for p in prods:
                clave = p["referencia"].upper()
                if clave in vistos:
                    duplicados += 1
                    continue  # se conserva la primera aparicion
                vistos[clave] = True
                productos.append(p)
        wb.close()

    salida = {
        "meta": {
            "generado": str(date.today()),
            "archivos": [a.name for a in archivos],
            "hojas_con_productos": hojas_utiles,
            "productos": len(productos),
            "duplicados_omitidos": duplicados,
            "filas_sin_referencia_omitidas": sin_referencia,
            "nota": "Columnas de precio ignoradas por regla del bibliotecario",
        },
        "productos": productos,
    }
    SALIDA.write_text(
        json.dumps(salida, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        f"catalogo-base.json: {len(productos)} productos "
        f"({duplicados} duplicados, {sin_referencia} filas sin referencia omitidas, "
        f"{hojas_utiles} hojas utiles, {len(archivos)} archivos)"
    )


if __name__ == "__main__":
    main()
