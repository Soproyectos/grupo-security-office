# Auditoría del lote oficial de 39 listas

El lote importable de la biblioteca contiene **5.038 SKU únicos** obtenidos exclusivamente de los 39 Excel de `D:\Empresa\web-gruposecurity\listas\LISTA_DE_PRECIOS_EXCEL`. Esta es la fuente canónica para este cargue. El snapshot público contiene 497 SKU: 479 coinciden con las listas y 18 están publicados aunque no aparecen en esta fuente oficial.

## Resultado listo para revisión

- Manifiesto importable: [`biblioteca-import-39-listas.json`](../../biblioteca-import-39-listas.json).
- Auditoría completa: [`biblioteca-import-39-listas.report.json`](../../biblioteca-import-39-listas.report.json).
- Checksums SHA-256: [`biblioteca-import-39-listas.sha256`](../../biblioteca-import-39-listas.sha256).
- Generador reproducible: [`scripts/generar_manifiesto_biblioteca.py`](../../scripts/generar_manifiesto_biblioteca.py).
- Estado operativo: generado y validado localmente; **no aplicado a producción**.

Conteo consolidado:

- 39 archivos Excel.
- 5.367 filas reconocidas como productos.
- 5.038 SKU únicos importables.
- 329 apariciones duplicadas, todas entre archivos distintos.
- 722 SKU con ficha curada coincidente.
- 4.316 SKU en `pendiente_enriquecimiento`.
- 10 pendientes tienen SKU pero no descripción; se pueden crear como placeholders.
- 198 filas tienen descripción o precio pero no referencia; no pueden convertirse en producto hasta asignarles un SKU.
- 31 filas fueron identificadas como secciones o rótulos, no como productos.
- 0 SKU superan el máximo de 100 caracteres.
- 0 precios se copian al manifiesto.
- 479 de los 497 SKU del snapshot público están en el lote oficial.
- 18 SKU publicados están fuera de las 39 listas y se preservan; el cargue no los elimina.

La cifra demostrable es 5.038, no 5.028. Si el negocio esperaba exactamente 5.028, debe indicar cuáles diez SKU excluir; el generador no elimina referencias válidas para forzar un total objetivo.

Los 18 SKU publicados fuera de las listas están enumerados en `publicCatalogReconciliation.publicOutsideOfficialListSkus` dentro del reporte. No se incorporan artificialmente al manifiesto oficial, porque su procedencia no está en los 39 Excel, y tampoco se borran de la web.

## Duplicados encontrados

Los 329 duplicados se explican por cuatro cruces:

- 143 SKU aparecen tanto en `LISTA HIKVISION TURBO GRUPO.xlsx` como en `LISTA TURBO HIKVISION GRUPO.xlsx`.
- 111 SKU aparecen tanto en `LISTA CABLEADO ESTRUCTURADO GRUPO.xlsx` como en `LISTA LANPRO CABLEADO ESTRU. GRUPO.xlsx`.
- 74 SKU aparecen tanto en `LISTA CONTROL ACCESO ZK GRUPO.xlsx` como en `LISTA CONTROL DE ACCESO ZK GRUPO.xlsx`.
- `DS-K7PEB` aparece en `LISTA ACCESORIOS HIKVISION GRUPO.xlsx` y `LISTA CONTROL ACCESO HIKVISION GRUPO.xlsx`.

No hay duplicados dentro de un mismo archivo. De los 329 SKU repetidos, 45 tienen descripciones distintas y uno (`DS-K7PEB`) aparece en dos categorías de origen. El manifiesto conserva una sola ficha por SKU: primero manda la ficha curada, si existe; para un pendiente se elige la descripción no vacía más larga y se conserva el detalle completo de todas las apariciones en el reporte.

## Clasificación por lista de origen

- Cableado: 1.153 SKU.
- Control de Acceso: 1.035 SKU.
- Redes y Cableado: 856 SKU.
- Alarmas y Smart Home: 694 SKU.
- Videovigilancia: 509 SKU.
- Energía y Respaldo: 316 SKU.
- Cámaras IP: 236 SKU.
- Seguridad electrónica: 153 SKU.
- Intercomunicación: 50 SKU.
- Racks: 36 SKU.

La categoría de una ficha curada tiene prioridad. Para los pendientes se usa la categoría de la lista de origen. La marca solo se infiere cuando el nombre del archivo identifica una marca única; las listas genéricas o mixtas quedan como `Sin marca` para evitar inventar datos.

## Conteo por cada uno de los 39 Excel

Cada valor siguiente es el número de filas de producto válidas del archivo. En todos los archivos, ese valor coincide con sus SKU únicos internos; los duplicados aparecen únicamente al cruzar archivos.

1. `LISTA  CABLEADO ESTRUCUTRADO CILES GRUPO.xlsx`: 773.
2. `LISTA ACCESORIOS ALARMAS GRUPO.xlsx`: 42.
3. `LISTA ACCESORIOS CCVT GRUPO.xlsx`: 105.
4. `LISTA ACCESORIOS HIKVISION GRUPO.xlsx`: 28.
5. `LISTA ALARMAS COMUNITARIAS GRUPO.xlsx`: 35.
6. `LISTA ALARMAS HIKVISION GRUPO.xlsx`: 133.
7. `LISTA ALMACENAMIENTO GRUPO.xlsx`: 19.
8. `LISTA AUDIO Y SENSING HIKVISION GRUPO.xlsx`: 18.
9. `LISTA AUTOMATIZACIÓN GRUPO.xlsx`: 222; además, 37 filas sin referencia quedaron fuera.
10. `LISTA CABLE ENERLINE GRUPO.xlsx`: 103.
11. `LISTA CABLEADO  DUPLEX GRUPO.xlsx`: 12.
12. `LISTA CABLEADO ESTRUCTURADO GRUPO.xlsx`: 142.
13. `LISTA CABLEADO HIKVISION GRUPO.xlsx`: 47.
14. `LISTA CÁMARAS DASHCAM Y WEB HIKVISION GRUPO.xlsx`: 19.
15. `LISTA COMMAX GRUPO.xlsx`: 8.
16. `LISTA CONECTIVIDAD HIKVISION GRUPO.xlsx`: 76.
17. `LISTA CONTROL ACCESO HIKVISION GRUPO.xlsx`: 133.
18. `LISTA CONTROL ACCESO VARIOS Y YALE GRUPO.xlsx`: 735; además, 161 filas sin referencia quedaron fuera.
19. `LISTA CONTROL ACCESO ZK GRUPO.xlsx`: 158.
20. `LISTA CONTROL DE ACCESO ZK GRUPO.xlsx`: 84.
21. `LISTA DSC GRUPO.xlsx`: 57.
22. `LISTA EBS - SECORLAM - LYNX GRUPO.xlsx`: 96.
23. `LISTA EZVIZ GRUPO.xlsx`: 89.
24. `LISTA HIKVISION TURBO GRUPO.xlsx`: 211.
25. `LISTA HILOOK TURBO GRUPO.xlsx`: 49.
26. `LISTA INCENDIO HIKVISION GRUPO.xlsx`: 20.
27. `LISTA INTELBRAS GRUPO.xlsx`: 153.
28. `LISTA INTERCOM HIKVISION GRUPO.xlsx`: 42.
29. `LISTA IP HIKVISION GRUPO.xlsx`: 227.
30. `LISTA IP HILOOK GRUPO.xlsx`: 9.
31. `LISTA LANPRO CABLEADO ESTRU. GRUPO.xlsx`: 187.
32. `LISTA MONITORES Y PANTALLAS HIKVISION GRUPO.xlsx`: 54.
33. `LISTA PROTECCION HIKVISION GRUPO.xlsx`: 12.
34. `LISTA PROTECCION POWEST GRUPO.xlsx`: 304; además, 31 filas de sección quedaron fuera.
35. `LISTA RACK GRUPO.xlsx`: 36.
36. `LISTA RUJIE - UBIQUITI GRUPO.xlsx`: 100.
37. `LISTA TENDA GRUPO.xlsx`: 42.
38. `LISTA TP-LINK GRUPO.xlsx`: 638.
39. `LISTA TURBO HIKVISION GRUPO.xlsx`: 149.

## Cómo regenerarlo

Desde la raíz del repositorio:

```powershell
python scripts/generar_manifiesto_biblioteca.py `
  --lists-dir "D:\Empresa\web-gruposecurity\listas\LISTA_DE_PRECIOS_EXCEL" `
  --expected-files 39
```

`--expected-files 39` detiene la generación si la carpeta cambia accidentalmente. El script lee los Excel y las fichas curadas, pero no modifica las fuentes ni se conecta a la base de datos.

## Criterio de aceptación antes de cargar

- [x] Los 39 Excel fueron encontrados.
- [x] El manifiesto contiene 5.038 fichas y ninguna referencia duplicada.
- [x] El cargador TypeScript acepta 5.038 fichas y reporta 0 inválidas.
- [x] Los precios quedaron fuera del manifiesto.
- [x] Las filas sin SKU están identificadas en `omissions`.
- [ ] Un responsable de negocio revisa los 45 conflictos de descripción y el conflicto de categoría de `DS-K7PEB`.
- [ ] Un humano autoriza el dry-run contra la base destino.
- [ ] Un humano autoriza por separado la aplicación o despliegue en producción.
