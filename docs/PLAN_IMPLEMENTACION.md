# Plan de implementación — Cuenta, Plus y acceso

Actualizado: 2026-11-04. Rama: `Neo_Brutalism`.

## Objetivo aprobado

Consolidar Cuenta gratuita y Plus, incorporar cuentas persistentes y aplicar los permisos desde el backend, manteniendo el diseño neobrutalista vigente. El visitante puede explorar una muestra de seis ofertas; el registro gratuito abre el resto de funciones. Cazador se fusiona con Plus. Afiliados y tiendas nuevas quedan para después; Mercado Libre sigue siendo el conector actual.

Este documento recoge el contrato vigente y el historial de verificaciones. La ampliación de registro, votos y recomendaciones se detalla en [PLAN_REGISTRO_COMUNIDAD.md](PLAN_REGISTRO_COMUNIDAD.md).

## Contrato de producto

| Capacidad | Visitante | Cuenta gratuita | Plus |
|---|---|---|---|
| Explorar catálogo liberado | Muestra de 6 ofertas | Completo | Completo |
| Guardados | Requiere registro | En cuenta | En cuenta |
| Alertas activas | Ninguna | Hasta 3 | Ilimitadas |
| Ventana de historial | Sin acceso | Hasta 30 días | Hasta 365 días |
| Ofertas posteriores a primera carga | Registro para ver más | Espera de 2 horas | Inmediatas |
| Temporadas | Requiere registro | 3 en total por evento | Todas las disponibles |
| Recomendaciones personales y votos | Requiere registro | Sí | Sí |

Plus: $79 MXN/mes o $790 MXN/año con IVA incluido. El total anunciado no lleva un cargo adicional de IVA. El anual ahorra $158 frente a 12 mensualidades. Se ofrecen dos tarjetas comerciales: Cuenta gratuita y Plus; visitante es un estado de acceso.

La ventana de historial limita los datos consultables; no debe inventar precios para completar días sin observaciones. Las temporadas sin fechas oficiales anunciadas se presentan como pendientes y no generan una cuenta regresiva ficticia.

## Secuencia de implementación

### 1. Cuenta y persistencia

Registro e inicio de sesión con correo y contraseña de 12 a 128 caracteres, sesión mediante cookie y datos SQLite. El perfil permite actualizar nombre y dirección opcional, consultar el correo y ver el plan confirmado por el servidor. Google/Facebook no se presentan como OAuth disponible y la recuperación por Resend está implementada, pendiente de credenciales y remitente autorizado.

Aceptación: una cuenta puede iniciar, cerrar y recuperar sesión; los datos persisten al volver a entrar y no se mezclan con otra cuenta. Los guardados locales se incorporan a la cuenta conforme al flujo de migración implementado. Un fallo de conexión conserva un estado explícito y no concede permisos.

### 2. Permisos desde el backend

Aplicar los límites en catálogo, detalle, historial, alertas y temporadas. El frontend representa los permisos recibidos; modificar el plan en localStorage no debe alterar el acceso del servidor. El acceso de temporada se cuenta por el conjunto del evento, no por sección.

Aceptación: comprobar visitante, gratuita y Plus tanto en interfaz como en API; probar límites, datos insuficientes e intentos de consultar datos restringidos directamente.

### 3. Planes y checkout de demostración

Usar una fuente compartida para precios y ventanas de historial. Conservar el aspecto Neo y la animación existente, con textos claros de demostración sin cobros. Los ejemplos visuales no reciben datos bancarios reales y OXXO/SPEI no ofrecen referencias pagables.

La activación exige cuenta y respuesta satisfactoria del backend antes del éxito visual. En desarrollo la demo está habilitada cuando `NODE_ENV` no es `production`. En producción solo se habilita con `ACCOUNT_DEMO_PLANS=true`; si permanece deshabilitada, el servidor rechaza la activación y la interfaz muestra el error sin cambiar el plan.

Aceptación: alternar mensual/anual, comprobar total con IVA incluido y ahorro, abrir login al intentar activar sin cuenta y probar confirmación, error y reintento. Ningún PAN/CVC real se captura, envía o almacena.

### 4. Downgrade y continuidad

Cambiar a Cuenta gratuita mediante la API y esperar su confirmación. Conservar guardados y alertas, manteniendo hasta 3 activas y pausando las excedentes sin borrarlas. Actualizar el historial y las ofertas según el acceso resultante.

Aceptación: crear más de 3 alertas en Plus, bajar a gratuita, volver a entrar y comprobar conservación, límite activo y estado de pausa. Ante un error del servidor, mantener el plan previo y mostrar el fallo.

### 5. Refinamiento y documentación

Mantener la dirección de [DESIGN.md](../DESIGN.md), revisar claridad de textos, estados vacíos, carga, errores y controles de teclado. Actualizar producto, contexto, pendientes y guías sin mantener precios, ramas o capacidades obsoletas como estado actual. La [protopersona](PROTOPERSONA.md) permanece identificada como hipótesis.

## Verificación que cierra la entrega

Entorno: Node.js 22.21 o posterior. Desde la raíz:

```bash
npm install
npm test
```

`npm test` ejecuta `node --test tests/*.test.js`. Las pruebas deben cubrir autorización, aislamiento de cuentas, persistencia, límites, activación o rechazo de Plus y cálculo de precios con IVA incluido.

| Revisión | Estado de cierre |
|---|---|
| Suite Node completa | Aprobada: 26 pruebas, incluidas autorización, biblioteca incremental y migraciones interrumpidas entre cuentas |
| Registro, login, perfil y logout en navegador | Aprobado con SQLite y cuentas de prueba aisladas |
| Planes mensual/anual y precios | Aprobado: $79/$790, dos tarjetas y total con IVA |
| Demo confirmada y error sin éxito falso | Aprobado: confirmación del backend y rechazo simulado 503 |
| Downgrade y alertas pausadas | Aprobado: cinco alertas conservadas, tres activas y dos pausadas |
| Temporadas, cupo por evento y fechas pendientes | Aprobado: tres ofertas con cuenta gratuita y siete con Plus en catálogo de prueba |
| Escritorio, móvil, teclado y temas claro/oscuro | Aprobado: escritorio 1440 px, cinco páginas a 390 px sin desborde, perfil oscuro y entrada/cierre del modal por teclado |

Registrar evidencias y problemas encontrados antes de cambiar estos estados. Una prueba unitaria aprobada no sustituye la revisión del flujo completo.

Prueba de navegador reproducible: `tests/browser-smoke.cjs`, con Playwright disponible en `NODE_PATH` y Chrome instalado. Usa servidores, usuarios, fotografías fallidas y SQLite temporales; no consulta Mercado Libre ni envía avisos de Telegram. Guarda capturas y `browser-results.json` en `.playwright-cli/`, fuera de Git. Las pruebas no verifican credenciales ni servicios comerciales reales.

La revisión independiente encontró y se corrigieron escrituras completas que podían perder guardados desde dos dispositivos, y pérdida de la copia visitante al fallar una migración. Las acciones normales usan `PATCH` por ID; las migraciones conservan un respaldo por cuenta hasta confirmación y pueden reintentarse desde Perfil.

Las temporadas presentan el catálogo actual como referencia para comparar, sin atribuirle promociones oficiales del evento. La asociación de promociones reales con eventos queda pendiente de contar con datos que la acrediten. El plazo de 12 meses representa una ventana máxima de consulta; no crea registros históricos que aún no existen.

Decisiones de esta entrega: $79 dentro del rango solicitado de $79–89; anual $790 conservando diez mensualidades; límites gratuitos existentes de tres alertas, 30 días y dos horas; dirección opcional y checkout sin datos bancarios reales. No se activaron servicios externos, no se publicó la web ni se integró esta entrega a main.

## Trabajo posterior

Afiliados y nuevos conectores se investigarán después de esta entrega. Comprobar programas, autorizaciones y condiciones de cada proveedor antes de utilizarlos; las variables o referencias existentes no acreditan aprobación comercial.

Quedan fuera del alcance actual pagos reales, OAuth, canales adicionales de notificaciones y despliegue público. La deuda útil y su seguimiento permanecen en [PENDIENTES.md](../PENDIENTES.md).

## Mejoras añadidas el 5 de noviembre

- Recuperación de contraseña mediante Resend desde «Olvidé mi contraseña»: enlaces de un solo uso, 30 minutos de caducidad y revocación de sesiones. Pendiente configurar `RESEND_API_KEY`, `RECOVERY_FROM` y verificar el remitente; se probó con correo simulado.
- Buscador restaurado a su distribución compacta original, conservando miniaturas y sin mover el encabezado al enfocar.
- Precio objetivo opcional por alerta en «Mis alertas»; persiste por cuenta, se conserva al pausar y filtra los avisos de baja de Telegram. Sin objetivo, conserva los avisos por cualquier baja.
- Tarjeta amarilla por decisión final del usuario, con texto oscuro, chip metálico y mejor lectura en celular.

La suite de 25 pruebas cubre también respuestas tardías, concurrencia entre login y recuperación, tokens reutilizados, revocación de sesiones, objetivos por cuenta y umbrales inclusivos. El recorrido de navegador incluyó guardar un objetivo y recuperar contraseña con Resend interceptado, además de los flujos existentes. No se enviaron correos ni mensajes reales.

## Verificación de correo y simplificación del acceso

Se añadió estado pendiente/verificado en Perfil, envío automático al registrarse si Resend está configurado y opción de reenvío. Los enlaces duran 24 horas, son de un solo uso y sólo verifican la cuenta asociada al token. Las cuentas existentes permanecen pendientes sin perder acceso. Se reutilizan `RESEND_API_KEY`, `RECOVERY_FROM` y `FRONTEND_URL`; el envío real sigue pendiente de configuración.

Se retiró «Mantente conectado» de Inicio y Detalle, junto con su formulario simulado, manejador y estilos exclusivos. El buscador volvió a su disposición compacta: no ocupa una nueva fila en escritorio ni ensancha las sugerencias. Se comprobaron 1280, 1366 y 1440 px antes/después de enfocar, además de los recorridos móviles previos.

Suite al cerrar esa etapa: 26 pruebas aprobadas. El navegador comprobó reenvío de verificación con Resend simulado, confirmación, persistencia del estado verificado, ausencia de suscripción y estabilidad del encabezado. La revisión independiente del flujo de verificación no encontró fallos materiales adicionales.

## Moderación automática, reportes y resumen de entrada

Implementado en la rama Neo_Brutalism. Las cuentas pueden reportar oferta vencida o precio incorrecto desde Detalle, con nota opcional de hasta 300 caracteres. Los reportes persisten en SQLite; se evita duplicar pendientes del mismo usuario, producto y motivo, con cinco creaciones nuevas por hora. El panel permite atender o descartar cada reporte. Una consulta de detalle autorizada se conserva durante 30 días por cuenta para admitir el reporte si la oferta desaparece entre abrirla y enviarlo.

El motor comienza en observación: registra propuestas sin aplicar decisiones nuevas. El modo automático opcional publica validaciones recientes de riesgo bajo, deriva casos sospechosos a revisión y retira sólo ante evidencia explícita de inventario agotado o descuento terminado. Un precio anterior ausente o incoherente produce incertidumbre, no confirma vencimiento. La selección evita precios de un vendedor agotado si existe otro disponible o con inventario desconocido. No se interpreta como agotamiento que falte una oferta en una consulta, que caduque su validación o que alguien la reporte.

Las decisiones manuales prevalecen sobre el motor. Las decisiones y la auditoría de acciones automáticas o reversiones comparten una transacción SQLite. Las decisiones antiguas de JSON se migran una sola vez. «Deshacer» comprueba que la decisión no cambió después y deja una decisión manual protectora. El historial JSON de consultas es secundario.

Al entrar al panel se abre Resumen: última consulta, modo, evaluaciones, acciones aplicadas, propuestas, casos pendientes con motivos y reportes de la comunidad. La primera entrada cubre 24 horas; las siguientes, desde la última entrada en ese navegador. El marcador se guarda sólo después de mostrar correctamente el resumen completo. «Analizar ahora» espera una actualización de Mercado Libre y comunica el fallo cuando no se pudo confirmar una consulta nueva.

Verificación final del 5 de noviembre de 2026: **47 pruebas aprobadas**, sintaxis válida en **78 archivos JavaScript** y `git diff --check` sin errores. El recorrido de Chrome comprobó reporte público, atención administrativa, observación, activación automática, reversión, resumen al entrar y volver a entrar, fallo de carga sin adelantar la última visita, y ancho móvil de 390 px. Conservó las comprobaciones previas de cuenta, verificación, recuperación, precios, permisos, imágenes y planes.

Las pruebas usan SQLite, usuarios y servidores temporales, con Mercado Libre y Resend simulados; no envían correos ni Telegram reales. La revisión independiente detectó y se corrigieron la pérdida de referencias a ofertas desaparecidas, la persistencia separada de decisión/auditoría, el análisis prematuro de caché, el avance prematuro de última visita y la falsa inferencia de descuento terminado desde un precio ausente. Antes de usar habitualmente el modo automático, corresponde evaluar sus propuestas en observación con datos reales.
