# Solicitud de recursos — Plataforma Comercial

**Fecha:** 12 de septiembre de 2026
**Estado:** Fase 1 (panel administrativo) entregada y funcionando
**Costo mensual solicitado:** USD 140 (≈ COP 560.000) · **Pago único:** USD 120 (≈ COP 480.000)
**Personal adicional:** ninguno

---

## 1. Lo que se solicita

### 1. Suscripción Claude Max, a nombre de la empresa — USD 100/mes

*Hoy: plan Claude Pro, pagado por mí.*

Es la herramienta con la que se escribe, revisa y prueba el código del sistema. El plan Pro
tiene un límite de uso bajo: se agota a media jornada y hay que esperar horas para
continuar. El plan Max multiplica ese límite y permite trabajar la jornada completa sin
cortes. (Comparación detallada en la sección 2.)

### 2. Subir el plan de Hostinger a VPS — USD 15/mes

*Hoy: hosting compartido.*

El plan compartido no está hecho para una aplicación como esta y ya causó tres fallas
reales que costaron días de trabajo: la base de datos se caía sola, las fotos de producto
desaparecían en cada actualización, y las importaciones de Excel se perdían a mitad de
proceso. Con un VPS la aplicación corre en su propio servidor y esas fallas desaparecen.
La configuración ya está escrita y lista para usar.

### 3. Plan pago de base de datos, con respaldo automático — USD 25/mes

*Hoy: plan gratuito, sin respaldo garantizado.*

Ahí viven los productos, las listas de precios, los usuarios y la auditoría de cambios. El
plan gratuito no garantiza copias de seguridad: si algo se borra o una actualización sale
mal, no hay desde dónde recuperar. El plan pago incluye respaldo automático y permite
volver atrás a un punto en el tiempo.

### 4. Ampliar memoria y disco del PC de trabajo — USD 120 (una sola vez)

*Equipo actual: Dell OptiPlex 7040 · Core i5-6500 · 16 GB RAM · SSD 250 GB (83 GB libres).*

El equipo es de la empresa y sirve, pero se queda corto: para trabajar hay que tener
abiertos al mismo tiempo el servidor, la aplicación web, la base de datos local y las
pruebas. Con 16 GB queda en el límite y todo se vuelve lento. Subir a 32 GB de memoria y
agregar un disco de 500 GB es lo más barato que se puede hacer por la velocidad de
trabajo. **No hace falta comprar equipo nuevo**: este soporta la ampliación.

---

## 2. Lo que confirman las cuentas reales

*Verificado el 12 de septiembre de 2026, entrando en modo solo lectura a la cuenta de
Hostinger y al proyecto de base de datos en Neon. No se modificó nada.*

### Hostinger — plan Cloud Startup

| | |
|---|---|
| Sitios en el mismo plan compartido | **12** |
| De esos, ajenos a Grupo Security | **3** |
| Memoria y CPU del plan completo | 4 GB · 4 núcleos |
| Procesos simultáneos, límite del plan | 200 |
| Procesos usados en pico (6–7 de septiembre) | **200 / 200** |
| Velocidad de disco, picos de la semana | al tope 7 veces |
| Forma de actualizar el backend | subida manual de `.zip` |
| Respaldo diario de archivos | sí, incluido |

### Neon — base de datos (plan Free)

| | |
|---|---|
| Cómputo usado desde el 7 de septiembre | **26.8 / 100 horas** |
| Ritmo actual, proyectado al mes | **~160 horas** |
| Ventana para recuperar un punto anterior | **6 horas** |
| Esa misma ventana, con plan pago | 30 días |
| Se apaga tras inactividad de | 5 minutos |
| Espacio en disco usado | 0.04 / 0.5 GB |

**Lo que esto explica:** el 6 y 7 de septiembre el plan de Hostinger llegó y se sostuvo en
su límite exacto de 200 procesos simultáneos, compartido con otros 11 sitios —tres de
ellos de un negocio distinto—. Es la misma fecha en que se documentaron las
importaciones perdidas y las fallas de la base de datos. Y en Neon, si el consumo de
cómputo sigue al ritmo de estos primeros cinco días, se agota antes de que termine el
mes, lo que detiene la base de datos hasta el siguiente ciclo. Además, ahora mismo solo
se puede recuperar un error de hasta 6 horas atrás — pasado ese margen, no hay vuelta
atrás.

---

## 3. Por qué Claude Max y no el plan Pro

La diferencia de precio es real: USD 20 contra USD 100 al mes. La diferencia no está en lo
que la herramienta sabe hacer, sino en **cuánto alcanza a trabajar antes de detenerse**.
Ambos planes usan los mismos modelos; el Pro impone un límite de uso por ventana de
tiempo, y este proyecto lo consume rápido porque el sistema ya tiene unas 45.000 líneas de
código repartidas en 15 módulos: cada tarea implica leer archivos, revisar el historial y
correr pruebas.

| | Pro · USD 20 | Max 5x · USD 100 |
|---|---|---|
| Capacidad de uso | Base | 5 veces la del plan Pro |
| Jornada de trabajo real | Se agota a media jornada y hay que esperar a que se reinicie el límite | Alcanza la jornada completa |
| Tareas grandes (un módulo completo, una migración) | Se cortan a la mitad y hay que retomarlas después | Se terminan de una sola vez |
| Trabajo en paralelo con el servidor de agentes | Compite por el mismo límite | Queda margen para ambos |

**En términos prácticos:** con el plan Pro se pierden entre dos y tres horas de trabajo
útil al día esperando que se libere el límite. Al costo de la hora de desarrollo, esa
espera vale bastante más que los USD 80 de diferencia entre un plan y otro.

---

## 4. ¿Hace falta también ChatGPT?

**No, no para el desarrollo.**

Claude está integrado directamente con el repositorio de la empresa: lee el código, escribe
los cambios, ejecuta las pruebas y abre las solicitudes de cambio. ChatGPT sería una
segunda herramienta para lo mismo, pagando dos veces por la misma función y sin esa
integración con el código. **No se está pidiendo.**

Vale la pena reconsiderarlo más adelante, y solo si aparece esta necesidad puntual: cuando
haya que **generar contenido comercial** para el catálogo público —textos de producto,
imágenes de apoyo, material para redes—. Ese es un trabajo distinto al de programar. Si
llega ese momento, se propone por separado; hoy no aplica.

---

## 5. Lo que ya está resuelto y no hay que pagar

- **PC de trabajo y servidor interno** — ambos son de la empresa, ya están funcionando.
- **Repositorio del código** — en la cuenta de la empresa, con plan gratuito suficiente.
- **Dominio y subdominios** — ya contratados.
- **Servidor de agentes automáticos** — corre en el servidor de la empresa con una clave de
  API propia, sin costo adicional, y avanza tareas mientras nadie está frente al equipo.
- **Sistema de pruebas y despliegue automático** — ya construido y funcionando, sin costo.
- **Personal** — el desarrollo lo hace una sola persona con apoyo de la herramienta de IA.
  No se requiere contratar a nadie.

---

## 6. Qué mejora con esto

- **Se acaban las caídas y las pérdidas de datos** del hosting compartido, que hasta ahora
  se resolvían a mano y consumían días enteros.
- **El catálogo queda respaldado.** Si algo se borra por error, se recupera; hoy no se puede.
- **Se recuperan entre dos y tres horas de trabajo diarias** que hoy se pierden esperando el
  límite del plan Pro.
- **El módulo comercial puede cerrarse** —cotizaciones, pedidos, metas de venta y tablero
  por supervisor—, que es el trabajo que sigue y ya está planificado.
- **La plataforma deja de depender de una suscripción personal** y queda a nombre de la
  empresa.

---

*Valores estimados a septiembre de 2026, a confirmar con cada proveedor al momento de
contratar. Conversión usada: 1 USD ≈ 4.000 COP. Las características del PC fueron tomadas
directamente del equipo el 12 de septiembre de 2026.*
