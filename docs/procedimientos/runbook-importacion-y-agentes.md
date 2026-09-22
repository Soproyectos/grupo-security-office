---
tags: [procedimientos, runbook, importacion, agentes, grupo-security]
date: 2026-09-22
---

# Runbook — importación de listas y agentes

Fallos reales que ya ocurrieron, ordenados por **lo que vas a ver**, no por su causa. Cada uno trae cómo confirmarlo y cómo salir.

Si tenés poco tiempo: los dos primeros son los que más horas cuestan, porque ninguno parece lo que es.

---

## Arreglé el código pero el backend se comporta como antes

**Lo que ves:** hacés un cambio, el watcher dice que recompiló, y el comportamiento viejo sigue ahí. Peor: a veces funciona el arreglo y a veces no, sin patrón.

**Qué está pasando:** hay **dos procesos de Node peleando por el puerto 3000**. El de `nest start --watch` tiene tu código nuevo; un `node dist/src/main` viejo tiene una compilación congelada. El que agarró el puerto primero es el que responde, y no siempre es el tuyo.

Esto ya pasó y tuvo consecuencias reales: borrar una Lista funcionaba o dejaba productos huérfanos según cuál de los dos procesos atendiera la petición. El log de auditoría quedó inconsistente por eso.

**Cómo confirmarlo** (PowerShell):

```powershell
Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select-Object ProcessId, CreationDate, CommandLine
```

Si aparece más de un `node.exe` y el que tiene el puerto **no** es el de `nest start`, ese es el problema.

**Cómo salir:**

1. Matá **los dos** procesos, no solo el viejo: `Stop-Process -Id <pid1>,<pid2> -Force`
2. Confirmá que el puerto quedó libre antes de relanzar.
3. Arrancá uno solo, y verificá que sea el dueño del puerto.

**Cómo no repetirlo:** antes de dar por bueno cualquier arreglo de backend, confirmá qué proceso tiene el puerto. Un test que pasa contra el proceso equivocado no prueba nada.

---

## "Request failed with status code 429" al importar

**Lo que ves:** un banner rojo en el paso de confirmación del asistente de importación.

**Qué está pasando:** no es el proveedor ni la red. Es **nuestro propio sondeo de progreso** chocando contra el límite de tasa global (`ThrottlerModule`, 20 peticiones por minuto por IP) que existe para frenar ataques de fuerza bruta al login.

**Cómo salir:** el endpoint de progreso lleva `@SkipThrottle()` y el sondeo va cada 4 segundos. Ya está aplicado.

**La regla que dejó:** un endpoint que se sondea en bucle **nunca** puede compartir el límite pensado para el login. Si agregás otro sondeo, excluílo explícitamente.

---

## La importación dice "completada" pero no cargó nada

**Lo que ves:** la barra salta al 100% casi de inmediato y el resumen dice completada, con cero productos.

**Qué está pasando:** `getProgress` devolvía `status: 'completed'` cuando el `importId` **no existía**. Era un resto de cuando el contexto se borraba al terminar bien; al volverse asíncrona la ejecución, dejó de borrarse y la suposición quedó invertida.

**Cómo salir:** ya devuelve `failed` con un mensaje explícito de que no encontró esa importación.

**La regla que dejó:** ante un identificador desconocido, el estado por defecto es **fallo**, nunca éxito. Un éxito inventado es peor que un error.

---

## Borrar una Lista deja productos huérfanos

**Lo que ves:** borrás una Lista y el contador de borradores no baja. Quedan productos sin Lista que nadie ve pero siguen contando.

**Qué está pasando:** la llave foránea `Product.listaId` es `ON DELETE SET NULL`. El código asumía cascada y un comentario decía que cascadeaba. No lo hacía.

**Cómo salir:** corregido en `e85d63f` — `removeLista` ahora borra en cascada dentro de una transacción y exige `confirm: true`. Para huérfanos que hayan quedado de antes:

```bash
npx ts-node prisma/cleanup-orphaned-list-products.ts --confirm-delete-orphaned-products
```

**Verificá primero sin la bandera** para ver qué borraría.

---

## Un agente de OpenCode lleva días corriendo sin avanzar

**Lo que ves:** los trabajos nuevos van lentos o pegan límite de tasa, sin razón aparente.

**Qué está pasando:** el envoltorio de `/usr/local/bin/opencode` reintenta rotando modelos cuando una sesión termina con error. Si la tarea es imposible —por ejemplo, su archivo de instrucciones fue borrado— reintenta **indefinidamente** y consume llamadas a la API en cada vuelta.

Ya hubo uno corriendo **3 días y 21 horas** contra un `contract_backend.md` que ya no existía.

**Cómo confirmarlo:**

```bash
pgrep -af opencode
ps -o pid,etime,cmd -p <pid>
```

Cualquier cosa con horas en `ETIME` merece una mirada.

**Cómo salir:** `kill -TERM`, esperá, y si no cede `kill -9`. Revisá que no queden hijos huérfanos: al matar el padre a veces sobrevive un `opencode` suelto.

---

## El agente investiga todo y no escribe nada

**Lo que ves:** el agente trabaja veinte minutos, lo cortás, y la carpeta de salida está vacía.

**Qué está pasando:** acumula los resultados en memoria y escribe al final. Cualquier corte —timeout, límite de tasa, caída— se lleva todo el trabajo.

**Cómo salir:** la instrucción tiene que ser explícita: **escribir cada unidad apenas se termina, antes de empezar la siguiente**. El archivo en disco es el único progreso que cuenta. Sin esa regla escrita, el modelo tiende a agrupar.

Lo mismo con los reintentos de red: sin un tope, se traba reintentando la misma URL caída. Un reintento y sigue.

---

## Antes de dar por bueno un arreglo de backend

- [ ] Un solo proceso Node y es el dueño del puerto 3000
- [ ] El proceso arrancó **después** de tu último cambio
- [ ] Probaste contra el endpoint real, no solo con tests unitarios
- [ ] Si tocaste importación: verificaste con un archivo real, no con un fixture

---

## Referencias

- [ADR-001 — arquitectura híbrida de importación](../adr/ADR-001-import-hybrid-architecture.md)
- [ADR-002 — biblioteca de vitrina](../adr/ADR-002-biblioteca-vitrina.md)
- `.claude/skills/catalog-librarian/` — procedimiento de construcción de la biblioteca
