# Checklist UX/UI — web Grupo Security

Marcar cada ítem como cumplido, fallido u omitido (con motivo). Superficie en modo Operate. Los ítems medibles se comprueban sobre el render, no por intención.

## Tarea y jerarquía
- [ ] Una línea define quién usa la pantalla y qué tarea completa.
- [ ] La acción principal se reconoce en pocos segundos; hay una sola acción primaria por vista.
- [ ] Un solo título por vista; ningún título repetido entre cabecera, sección y tarjeta.
- [ ] Visibilidad del estado: se ve dónde está la persona, qué se guardó y qué está pendiente, con mensajes veraces («Sin guardar», «Guardado», «Publicado»).
- [ ] Control y libertad: salida clara (cancelar, volver); deshacer antes que confirmar si la acción es reversible; aviso al salir con cambios sin guardar.
- [ ] Prevención de errores: la acción destructiva nombra el objeto y la consecuencia; el botón de confirmar repite la acción, no dice «Sí» ni «OK».
- [ ] Reconocimiento antes que memoria: opciones, filtros y valores visibles; no se exige recordar datos de otra pantalla.
- [ ] Diseño minimalista: cada elemento sirve a la tarea.
- [ ] Ningún campo ni acción existente desapareció sin aprobación del usuario.
- [ ] Acceso directo a cualquier sección; no se impone una secuencia lineal.

## Espacio y layout
- [ ] Elementos relacionados juntos y separación generosa entre grupos.
- [ ] Más espacio arriba de un título que debajo.
- [ ] Sin espacio vertical desperdiciado en cabeceras (cabecera compacta de una fila).
- [ ] Sin tarjetas anidadas; la elevación se declara una sola vez (borde o sombra, no ambos).
- [ ] Radios coherentes: paneles 12–16px, controles 7–9px; píldoras solo en controles pequeños y estados.
- [ ] Separaciones tomadas de los tokens `--spacing-*`; alineación consistente.
- [ ] Menús y popovers no se recortan por el `overflow` de su contenedor.

## Tipografía
- [ ] Roboto en cuerpo y controles; Roboto Condensed solo en títulos; ninguna fuente nueva.
- [ ] Tamaños en rem con pasos de escala y de peso visibles; sin tipografía fluida en etiquetas ni controles.
- [ ] Prosa con medida de 65–75ch; tablas y datos pueden ser más densos.
- [ ] Cifras con `tabular-nums` en precios, SKU y tablas.
- [ ] Interlineado de cuerpo ≥1.5; tracking no menor de -0.04em.
- [ ] Textos reales (nombres largos, importes altos) sin desbordar en cada ancho.

## Color y marca
- [ ] Solo tokens (`--color-*`, `--library-*`); ningún hex nuevo (`rg "#[0-9a-fA-F]{3,8}"` sobre el diff).
- [ ] Sin tintes azules; el azul solo aparece en el estado informativo funcional ya definido.
- [ ] Rojo de marca en acción primaria, selección, foco y cabecera aprobada de Biblioteca; no en estados inactivos ni como decoración.
- [ ] Éxito, aviso, error e info usan sus tokens funcionales.
- [ ] Contraste ≥4.5:1 en texto y placeholder; ≥3:1 en texto grande y en bordes de controles.
- [ ] Sobre superficies de color, el texto secundario toma el tono de la superficie, no un gris.
- [ ] Selección de texto (`::selection`) y caret (`caret-color`) con colores de la paleta.
- [ ] Focus visible con el color de acción; barras de desplazamiento temadas con la paleta.
- [ ] Sin texto con degradado, sin sombras de desplazamiento duro, sin halos de color con offset cero.

## Estados
- [ ] Cada control interactivo tiene reposo, hover, focus-visible, active, disabled, loading y error.
- [ ] Carga con skeleton, no spinner centrado; el texto de carga nombra la operación real y no inventa progreso.
- [ ] El estado vacío distingue primer uso, sin resultados, filtros, falta de permiso y fallo, y ofrece la siguiente acción.
- [ ] El error dice qué falló, por qué (si se sabe) y cómo recuperarse; ningún código interno como mensaje principal.
- [ ] El éxito confirma el resultado en una línea.
- [ ] Cada guardado independiente comunica su propio resultado.
- [ ] Un botón deshabilitado indica por qué lo está.

## Texto de interfaz
- [ ] Español simple y profesional; sin jerga técnica; describe lo que la persona ve o puede hacer.
- [ ] Los controles nombran su acción con verbo y objeto; no hay «Aceptar», «Enviar» ni «OK» genéricos.
- [ ] Un concepto, una palabra en toda la app.
- [ ] Cada idea se dice una vez: ninguna introducción repite el título ni ninguna ayuda repite la etiqueta.
- [ ] Etiquetas persistentes en formularios; el placeholder es un ejemplo, no la etiqueta.
- [ ] Formato y requisitos se indican antes de enviar.
- [ ] Mensajes completos, sin fragmentos concatenados.
- [ ] Sin emoji ni símbolos unicode como iconos; iconos con un solo trazo consistente.

## Accesibilidad
- [ ] Todo se opera con teclado, con orden de tabulación lógico y sin trampas.
- [ ] `:focus-visible` con anillo visible; ningún `outline: none` sin reemplazo.
- [ ] HTML semántico: `button` para acciones, `a` para navegación, encabezados sin saltos, landmarks.
- [ ] Cada campo tiene etiqueta asociada; los errores se anuncian (`aria-live` o `aria-describedby`).
- [ ] Controles solo de icono con nombre accesible; imágenes con alt informativo o vacío si son decorativas.
- [ ] El estado no depende solo del color: lleva texto o icono.
- [ ] `prefers-reduced-motion` conserva el cambio de estado; sin parpadeos.
- [ ] Con zoom al 200% no se pierde contenido ni función.

## Responsive
- [ ] Sin scroll horizontal de página a 375px; las tablas anchas se desplazan dentro de su contenedor.
- [ ] Objetivos táctiles ≥44px en móvil, con separación entre vecinos.
- [ ] Revisado a 375px, 768px y ~1440px; la estructura colapsa (índice a selector, columnas a pila) sin reducir la tipografía.
- [ ] Las barras fijas no tapan contenido ni campos con el teclado abierto.
- [ ] Sin anchos fijos en px que rompan el viewport; los textos largos se truncan o envuelven de forma controlada.
- [ ] Todo gesto táctil (arrastrar, deslizar) tiene alternativa con un toque.

## Permisos visibles
- [ ] Ocultar un control no sustituye la autorización: el servidor la impone y responde con un error claro.
- [ ] El permiso con que la interfaz muestra el control coincide con el que el servidor exige; si difieren, anotarlo en el traspaso.
- [ ] Sin permiso no hay controles muertos: la persona ve solo lectura o un mensaje simple que dice qué puede hacer y a quién pedirlo.
- [ ] Un rechazo del servidor (403) se muestra con un mensaje comprensible, no con un fallo genérico.

## Rendimiento percibido
- [ ] La estructura aparece de inmediato (skeleton) y el contenido llega sin saltos de layout.
- [ ] Toda acción da respuesta visible en menos de 100 ms (pulsado o loading), aunque la operación tarde.
- [ ] Listas largas paginadas o virtualizadas; imágenes con dimensiones reservadas y carga diferida.
- [ ] Animaciones de 150–250 ms, preferentemente de `transform` y `opacity`; sin coreografía de carga.
- [ ] Las búsquedas al teclear usan una espera razonable (debounce) y no repintan toda la pantalla.
- [ ] Un cambio optimista solo se usa si puede revertirse con un mensaje veraz.
