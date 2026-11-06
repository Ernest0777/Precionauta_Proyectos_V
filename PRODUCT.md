# Precionauta — Documento de producto

Actualizado: 2026-11-04. Rama de trabajo: `Neo_Brutalism`.

## Propósito

Ayudar a encontrar y comparar ofertas en México con precios claros, historial disponible y seguimiento de productos. El precio publicado por una tienda y el historial observado permiten evaluar una oferta; no garantizan disponibilidad, un descuento auténtico ni el precio futuro.

El conector actual es Mercado Libre. El catálogo de ejemplo permite explorar la interfaz cuando no hay datos del backend y debe distinguirse del catálogo real. Amazon, Liverpool y otras tiendas no forman parte de esta entrega.

## Problema e hipótesis

La propuesta parte de hipótesis: comparar ofertas toma tiempo, el precio de referencia puede confundir y las oportunidades pueden agotarse antes de revisarlas. No se presentan porcentajes de mercado ni resultados de investigación sin fuentes. La [protopersona](docs/PROTOPERSONA.md) describe supuestos para validar con usuarios.

## Acceso y planes

Visitante es un estado de acceso, no un tercer plan comercial. Cazador se fusiona con Plus.

| Capacidad | Visitante | Cuenta gratuita | Plus |
|---|---|---|---|
| Explorar catálogo liberado | Muestra de 6 ofertas | Completo | Completo |
| Guardados | Requiere registro gratuito | Asociados a la cuenta | Asociados a la cuenta |
| Alertas activas de precio y reposición | Ninguna | Hasta 3 en total | Ilimitadas |
| Historial disponible | Sin acceso | Hasta 30 días | Hasta 365 días |
| Ofertas posteriores a la primera carga | Registro para ampliar el catálogo | Espera de 2 horas | Acceso inmediato |
| Ofertas de temporada | Requiere registro gratuito | 3 en total por evento | Todas las disponibles |
| Valoraciones de la comunidad | Consultar en la muestra | Votar, cambiar y retirar voto | Votar, cambiar y retirar voto |
| Recomendaciones personales | Requiere registro gratuito | Por actividad de la cuenta | Por actividad de la cuenta |
| Precio | Sin cuenta | $0 MXN | $79 MXN/mes o $790 MXN/año |

Los precios incluyen IVA y son el total final. El anual cuesta 10 mensualidades: ahorro de $158 MXN frente a 12 meses. La ventana de historial es un permiso máximo; solo se muestran observaciones existentes, sin inventar una serie de precios.

Al volver de Plus a Cuenta gratuita se conservan los guardados y las alertas. Solo hasta 3 alertas permanecen activas; las excedentes quedan pausadas, sin borrarse.

El seguimiento consulta productos guardados o con avisos aunque termine su descuento. Conserva el ciclo de precio normal y descuentos posteriores por ID, con datos reales y sin completar huecos. Las reposiciones se muestran en Perfil cuando una consulta reciente confirma agotado → disponible. Gratis comparte tres avisos entre precio y reposición; Plus puede recibirlos también por Telegram vinculado. Las tarjetas de Detalle se descargan como PNG con foto disponible, precio observado y enlace.

## Cuenta y perfil

La entrega incorpora registro e inicio de sesión con correo y contraseña, sesión mediante cookie y persistencia SQLite. El perfil presenta nombre, correo, dirección opcional y plan. El backend decide los permisos; editar el almacenamiento del navegador no concede Plus.

Google y Facebook no tienen OAuth funcional y no se anuncian como métodos activos. La recuperación por correo está implementada con Resend y requiere credenciales y un remitente autorizado antes de enviar correos reales.

## Demostración de Plus

El checkout es una demostración explícita sin cobros. Requiere una cuenta y una confirmación del backend antes de mostrar Plus activo. Los ejemplos visuales de tarjeta, OXXO y SPEI no procesan pagos ni admiten datos bancarios reales. La prueba puede estar deshabilitada; un fallo conserva el plan previo y muestra un error.

Esta entrega no es una suscripción comercial con una pasarela conectada. El historial, los guardados y las alertas del usuario dependen de los datos y permisos confirmados por el servidor.

## Temporadas

Cada evento tiene su propia identidad y fechas. Temporadas requiere cuenta. Cuenta gratuita accede a 3 ofertas en total por evento, no a 3 por sección; Plus accede a todas las disponibles. Si no hay fechas oficiales anunciadas, la interfaz lo indica y no inventa una cuenta regresiva ni presenta fechas estimadas como confirmadas.

## Alcance técnico y visual

Frontend estático en HTML, CSS y módulos JavaScript; backend Express y SQLite. La identidad vigente es neobrutalista y mantiene temas claro y oscuro. [DESIGN.md](DESIGN.md) documenta el sistema visual. Los cambios de esta entrega refinan la interfaz existente sin sustituir su dirección.

## Después de esta entrega

La moderación incluye reportes de oferta vencida/precio incorrecto, análisis por reglas e historial, y resumen de actividad al entrar al panel. Inicia en observación; el administrador puede activar decisiones automáticas conservadoras y revertirlas. Los posibles precios inflados y los datos inciertos se presentan con motivos para supervisión. Una ausencia del catálogo, la edad de validación o un reporte no confirman agotamiento por sí solos.

Afiliados y tiendas nuevas están pospuestos. El código de redirección o los parámetros de ejemplo no prueban una cuenta de afiliados autorizada, una comisión ni una integración comercial activa. Antes de retomarlos habrá que comprobar acceso a datos, aprobación del programa y términos aplicables.

También quedan para evaluación posterior pagos reales, OAuth, notificaciones adicionales y despliegue público. No se prometen como funciones actuales.

## Criterios de evaluación

Validar que el usuario entiende el precio final, la diferencia entre los estados de acceso y el carácter de demostración del checkout. Comprobar que una sesión nueva recupera guardados, alertas y plan; que un error de activación no concede Plus; y que las restricciones se aplican también desde la API.

La verificación de integración y navegador se cierra en el [plan de implementación](docs/PLAN_IMPLEMENTACION.md). Las pruebas todavía pendientes no se consideran aprobadas.

Proyecto académico: Universidad Modelo — Proyectos V.
