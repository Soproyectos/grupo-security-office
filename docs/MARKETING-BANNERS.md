# Marketing y mercadeo: banners y pop-ups de la tienda

Esta guía explica cómo preparar y publicar la publicidad de la tienda sin tocar código.

> **Nota del 2026-11-04:** esta guía describe la primera versión del panel y está parcialmente desactualizada. Hoy el menú abre un índice de páginas, la tarjeta se llama «Banners de inicio» (no «Banner del título»), el formulario se abre en un panel lateral con la vista previa de la portada real, y hay un botón «Ver» de solo lectura y un aviso de cambios sin guardar. Para el estado real del código, ver [handoffs/2026-11-04-marketing-banners-y-paneles.md](handoffs/2026-11-04-marketing-banners-y-paneles.md).

## Qué es el panel

**Marketing y mercadeo** es un panel de la administración con una pestaña, **Banners**. Desde ahí se manejan dos cosas:

- **Banner del título:** las imágenes que se deslizan en la parte superior de la tienda.
- **Pop-up:** una ventana con una sola imagen que aparece al entrar a la tienda.

Los avisos internos para vendedores son otra herramienta y no cambian.

## Cómo se delega el panel

El panel no aparece solo: lo asigna el Super Admin en **Asignar paneles**, persona por persona, en el bloque **Marketing y mercadeo**. Hay tres paquetes y se pueden combinar:

| Paquete | La persona podrá |
|---|---|
| Ver banners y pop-ups | Entrar al panel y ver cada banner con su estado. |
| Preparar banners y pop-ups | Crear, cambiar y eliminar borradores, y subir imágenes. No puede publicar. |
| Publicar y retirar banners | Hacer que un banner se vea en la tienda o quitarlo. No puede crear ni cambiar. |

Así, una persona puede diseñar y otra decidir cuándo sale. Quien no tiene ningún paquete no ve el ítem **Marketing y mercadeo** en el menú.

## Crear un banner o un pop-up

1. Entra a **Marketing y mercadeo → Banners**.
2. En **Banner del título** o **Pop-up**, pulsa **Nuevo banner** o **Nuevo pop-up**.
3. Escribe el **Nombre interno** (solo lo ves tú, para reconocerlo en la lista).
4. Escribe el **Texto alternativo**: describe la imagen para quien no puede verla. Es obligatorio para publicar.
5. Si quieres, agrega un **Enlace** (por ejemplo `/catalogo` o una dirección completa) para que al hacer clic lleve a esa página.
6. Si quieres, indica **Inicio** y **Fin** (hora de Colombia). Sin fechas, se muestra mientras esté publicado.
7. Pulsa **Guardar borrador**. Hasta que el borrador exista no se pueden subir imágenes.
8. Sube la imagen. La vista previa muestra cómo se verá. En el banner puedes elegir el **Ajuste de la imagen** y el foco para decidir qué parte se queda visible si hay recorte.
9. Pulsa **Guardar cambios** cuando termines.

Guardar un borrador **no lo muestra en la tienda**.

## Medidas de las imágenes

| Pieza | Tamaño recomendado | Ancho mínimo | Proporción |
|---|---|---|---|
| Banner de escritorio | 1200 × 520 px | 1000 px | entre 2,0 y 2,6 |
| Banner de móvil (opcional) | 900 × 675 px | 600 px | entre 1,2 y 1,5 |
| Pop-up | 900 × 900 px | 600 px | entre 0,6 y 1,8 |

- Peso máximo: **3 MB** por imagen.
- Formatos: PNG, JPEG o WebP.
- Si una imagen no cumple, el panel dice qué medida tiene y cuál se espera.
- El pop-up muestra **solo la imagen**: el texto que quieras comunicar debe ir dentro de la imagen.

## Publicar y retirar

- **Publicar:** en un borrador, pulsa **Publicar**. Desde ese momento se ve en la tienda durante su vigencia (si tiene fechas, solo dentro de ellas).
- **Cambiar algo ya publicado:** edítalo y guarda. Los cambios quedan como borrador y la tienda sigue mostrando la versión publicada hasta que pulses **Publicar cambios**. La lista lo marca como «Publicado con cambios sin publicar».
- **Retirar:** pulsa **Retirar de la tienda**. El banner deja de verse y el borrador se conserva.
- **Eliminar:** solo se puede eliminar un borrador (**Eliminar borrador**). Para eliminar uno publicado, primero retíralo.
- Límites a la vez: hasta 6 banners del título y 1 pop-up publicados.

## Estados que verás en la lista

| Estado | Significa |
|---|---|
| Borrador | Aún no se ve en la tienda. |
| Publicado | Se ve en la tienda ahora. |
| Programado | Está publicado, pero su fecha de inicio todavía no llega. |
| Vencido | Está publicado, pero su fecha de fin ya pasó. |
| Publicado con cambios sin publicar | Se ve la versión anterior; hay cambios guardados esperando que alguien con permiso los publique. |

Si dos personas editan lo mismo a la vez, el panel avisa «Otra persona cambió esto; recarga para ver la versión nueva» y ofrece **Recargar**.

## Si no ves un botón

Cada botón depende de lo que te asignaron. Si falta **Publicar**, **Guardar cambios** o **Eliminar borrador**, tu cuenta no tiene ese permiso: pídeselo al Super Admin.
