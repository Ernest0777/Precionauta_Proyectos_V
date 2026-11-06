# Pendientes — Precionauta

Actualizado: 2026-11-05. Trabajo actual en `Neo_Brutalism`.

## Alcance decidido para esta entrega

- [x] Mantener el diseño neobrutalista actual y sus temas claro/oscuro.
- [x] Fusionar Cazador con Plus; mostrar Cuenta gratuita y Plus como los dos planes comerciales.
- [x] Fijar Plus en $79 MXN/mes o $790 MXN/año con IVA incluido; ahorro anual de $158.
- [x] Definir visitante como muestra de seis ofertas, sin guardados, historial, alertas ni Temporadas; registro gratuito para ampliar acceso.
- [x] Definir Cuenta gratuita: 3 alertas activas, hasta 30 días de historial y 2 horas de espera para ofertas posteriores a la primera carga.
- [x] Definir Plus: alertas ilimitadas, hasta 365 días de historial y acceso inmediato a ofertas nuevas.
- [x] Definir temporadas gratuitas como 3 ofertas en total por evento; Plus accede a todas las disponibles.
- [x] Posponer afiliados y tiendas nuevas; conservar Mercado Libre como conector actual.

## Cierre de integración y verificación

- [x] Completar la revisión de registro, login, persistencia de sesión, perfil y cierre de sesión con correo/contraseña y SQLite.
- [x] Verificar que cambiar localStorage no activa Plus ni permite consultar datos fuera del permiso de la cuenta.
- [x] Probar migración de guardados locales a cuenta, recuperación al volver a entrar y separación entre usuarios.
- [x] Probar activación Plus demo con backend, rechazo o fallo del servidor y reintento sin éxito falso ni cobro.
- [x] Probar downgrade: conservar guardados y alertas, mantener hasta 3 activas y pausar las excedentes.
- [x] Probar temporadas: 3 en total por evento gratuito, no por sección; verificar fechas no anunciadas sin cuenta regresiva inventada.
- [x] Ejecutar `npm test` con Node.js 22.21+ y registrar el resultado final.
- [x] Completar verificación en navegador de Inicio, Detalle, Planes, Perfil y Temporada en escritorio y móvil, con teclado, tema claro y oscuro.
- [ ] Revisar textos legales y de privacidad frente a los datos de cuenta que se almacenan, incluida la dirección opcional.

Las casillas anteriores corresponden al cierre de la entrega y no significan que falte toda la implementación. El resultado de navegador se registra al comprobarlo, no por anticipado.

## Deuda técnica útil

- [ ] Validar calidad del historial real y casos con pocas observaciones; no fabricar historial para cubrir 30 o 365 días.
- [ ] Revisar disponibilidad de stock por oferta en los datos de Mercado Libre antes de mostrar cantidades o filtros de stock.
- [ ] Comprobar configuración y entrega del bot de Telegram antes de anunciar avisos operativos en el entorno publicado.
- [ ] Para producción, sustituir la contraseña administrativa compartida por acceso individual acorde al uso previsto.
- [ ] Definir despliegue con HTTPS, persistencia y respaldo de SQLite; configurar URL pública, origen del frontend y política de cookies.
- [ ] Revisar caché y actualización de la PWA en despliegue; instalarla no equivale a tener notificaciones push.
- [ ] Verificar rendimiento y accesibilidad con datos reales y registrar los problemas encontrados.

## Después: afiliados y tiendas nuevas — pospuesto

Estas tareas no bloquean la entrega actual. No hay cuentas autorizadas o aprobaciones comprobadas por el hecho de que existan variables de configuración.

- [ ] Verificar el estado del programa de Mercado Libre Afiliados y los permisos de la cuenta antes de utilizar parámetros comerciales.
- [ ] Investigar acceso permitido a datos, términos, aprobación y formato de enlace de cada tienda candidata.
- [ ] Evaluar G2A, Amazon México, Liverpool u otras opciones solo después de confirmar las condiciones de cada proveedor.
- [ ] Diseñar un conector por tienda y normalización de datos cuando se retome ese alcance.
- [ ] Revisar atribución, avisos y medición de clics sin confundir redirecciones con comisiones confirmadas.

## Investigación y funciones futuras

- [x] Reportar oferta vencida o precio incorrecto desde Detalle, con cola administrativa y límites por cuenta.
- [x] Moderador por reglas e historial, modo observación inicial, modo automático opcional, decisiones reversibles y resumen al entrar al panel.
- [x] Valoraciones de comunidad por cuenta y recomendaciones personales persistentes, con aislamiento entre pestañas.
- [ ] Configurar respaldo periódico de SQLite para proteger cuentas, historial, votos y actividad acumulada.
- [x] Preparar recolección de productos seguidos fuera de ofertas, reposición confirmada y tarjetas PNG.
- [x] Preparar respaldo SQLite verificable y configuración Docker con almacenamiento persistente.
- [ ] Elegir servidor sin suspensión, desplegar con HTTPS y validar el contenedor; Docker Engine no estaba iniciado en desarrollo.
- [ ] Investigar fuentes autorizadas de precios históricos antes de plantear importaciones; conservar procedencia y fechas reales.
- [ ] Evaluar las propuestas de observación con datos reales antes de usar el modo automático de forma habitual; ajustar falsos positivos con evidencia.

- [ ] Validar las hipótesis de la [protopersona](docs/PROTOPERSONA.md) con entrevistas y observación de tareas.
- [ ] Medir comprensión del precio final, de los límites gratuitos y de los estados sin datos o sin cuenta.
- [ ] Evaluar una pasarela real y confirmación de pago en servidor antes de convertir la demo en una suscripción comercial.
- [x] Implementar recuperación por Resend, alertas con objetivo y buscador compacto con miniaturas.
- [x] Implementar verificación de correo y retirar el formulario de suscripción simulado.
- [ ] Configurar RESEND_API_KEY y RECOVERY_FROM y verificar el remitente para activar correos reales.
- [ ] Evaluar OAuth; Google/Facebook no están operativos.
- [ ] Evaluar notificaciones del navegador, correo o WhatsApp, comparador y votaciones sin anunciarlos como disponibles.
- [ ] Incorporar fechas oficiales de temporadas cuando estén anunciadas y verificadas.

Plan de trabajo y aceptación: [docs/PLAN_IMPLEMENTACION.md](docs/PLAN_IMPLEMENTACION.md).
