# Precionauta

Rastreador de ofertas en México. Proyecto académico de Universidad Modelo — Proyectos V, en desarrollo sobre la rama `Neo_Brutalism`.

El conector actual es Mercado Libre. El sitio combina catálogo, filtros, detalle, historial disponible, guardados y alertas. Cuando no hay datos del backend puede usar un catálogo de ejemplo identificado como tal. Afiliados y tiendas nuevas están pospuestos; no se presupone ninguna cuenta comercial autorizada.

## Ejecutar

Requiere Node.js 22.21 o posterior, con las APIs de SQLite utilizadas por el backend.

```bash
npm install
npm run dev
```

Frontend: `http://localhost:4173`. Backend: `http://localhost:3001`. Configura `backend/.env` a partir de `backend/.env.example` con tus credenciales de desarrollo. Los secretos permanecen en el backend y fuera de Git.

```bash
npm run server      # Solo backend
npm run serve       # Solo frontend, puerto 4173
npm test            # node --test tests/*.test.js
```

Servir solo el frontend permite explorar la interfaz, pero no proporciona una sesión ni habilita funciones de cuenta. El catálogo real depende de la configuración y disponibilidad de Mercado Libre.

## Cuenta, acceso y Plus

Visitante puede explorar sin registrarse. La entrega incorpora registro e inicio de sesión con correo y contraseña de 12 a 128 caracteres, sesión mediante cookie y datos en SQLite. El perfil presenta nombre, correo, dirección opcional y plan. El backend confirma los permisos; localStorage no concede Plus.

| Capacidad | Visitante | Cuenta gratuita | Plus |
|---|---|---|---|
| Guardados | Locales | En cuenta | En cuenta |
| Alertas de precio | Ninguna | Hasta 3 activas | Ilimitadas |
| Historial | Sin acceso | Hasta 30 días | Hasta 365 días |
| Ofertas posteriores a la primera carga | Espera de 2 horas | Espera de 2 horas | Al instante |
| Temporadas | 3 ofertas en total por evento | 3 ofertas en total por evento | Todas las disponibles |

Hay dos planes comerciales: Cuenta gratuita y Plus; Cazador se fusionó con Plus. Plus cuesta **$79 MXN/mes o $790 MXN/año, IVA incluido**. El anual ahorra $158 frente a 12 mensualidades. Al volver a Cuenta gratuita se conservan guardados y alertas; las excedentes quedan pausadas. La ventana de historial no garantiza observaciones de todos los días.

El checkout es una **demostración sin cobro**, con ejemplos visuales y sin captura de tarjeta real. Requiere una cuenta y confirmación del servidor para activar Plus. Si la prueba está deshabilitada o falla, se muestra un error y el plan previo permanece. Google/Facebook siguen pendientes. La recuperación por correo ya está implementada con Resend; necesita configurar el remitente y las credenciales.

La demo está habilitada fuera de producción. En producción requiere `ACCOUNT_DEMO_PLANS=true`; si no se habilita expresamente, la API rechaza la activación.

## Datos e integraciones

SQLite guarda historial y datos de cuenta en el directorio de datos del backend, fuera de Git. La configuración de cada entorno determina qué integraciones están disponibles:

- Mercado Libre aporta las ofertas del conector actual; la actualización y la caché están en el backend.
- El historial muestra observaciones reales disponibles para los datos del conector. Los ejemplos deben distinguirse de esos datos.
- Las redirecciones `/go/:id` permiten registrar clics hacia la tienda. Un clic registrado no acredita una comisión ni aprobación de afiliados.
- Telegram requiere un bot y su configuración; su presencia en el repositorio no demuestra entrega de avisos en un entorno.
- La PWA permite instalación. Las notificaciones push son un alcance distinto y pendiente.

`MELI_AFFILIATE_PARAMS`, `TELEGRAM_BOT_TOKEN` y `PUBLIC_URL` son puntos de configuración existentes. No constituyen prueba de cuentas, permisos comerciales o servicios activos.

## Panel de administración

El backend sirve `http://localhost:3001/admin`. Configura `ADMIN_PASSWORD` y, si corresponde, `ADMIN_SECRET` en `backend/.env`. La tienda no enlaza al panel. Incluye resumen, moderación de ofertas y reportes; el acceso administrativo de producción queda en la deuda pendiente.

## Organización

```text
frontend/       HTML, CSS, módulos JavaScript y recursos del sitio
backend/        Express, conectores, acceso a datos y servicios
admin/          Interfaz de administración
scripts/        Utilidades de desarrollo
tests/          Pruebas Node del backend y cliente
docs/           Protopersona y plan de implementación
```

El frontend no requiere compilación. La identidad visual vigente es neobrutalista, con temas claro y oscuro; consulta [DESIGN.md](DESIGN.md). Los antecedentes Watermelon/Scandinavian no definen el diseño actual.

## Documentación y validación

- [Producto y matriz de acceso](PRODUCT.md).
- [Contexto de la entrega](PROJECT_CONTEXT.md).
- [Pendientes y trabajo posterior](PENDIENTES.md).
- [Protopersona: hipótesis por validar](docs/PROTOPERSONA.md).
- [Plan de implementación y criterios de aceptación](docs/PLAN_IMPLEMENTACION.md).
- [Guía del frontend](frontend/README.md).

La integración actual requiere cierre de pruebas y revisión en navegador. Los resultados de escritorio, móvil, teclado y temas se registrarán al verificarlos; no se asumen aprobados.

## Equipo

- Pedro José Narváez Flores — Backend y API.
- Ernesto Guillermo Hernández Ocón — Frontend y UX.
- Dylan Ernesto Mollinedo Sánchez — Base de datos y QA.

### Recuperar contraseña con Resend

Configura en `backend/.env`: `RESEND_API_KEY`, `RECOVERY_FROM` (remitente autorizado en Resend) y `FRONTEND_URL`. Sin configuración, el formulario informa que el servicio no está disponible. Los enlaces caducan en 30 minutos, son de un solo uso y el cambio revoca sesiones anteriores. Las pruebas usan un remitente simulado y no envían correos reales.

### Alertas con precio objetivo

En «Mis alertas», abre «Definir precio objetivo» e indica un importe en MXN. Puedes editarlo o quitarlo para volver a avisos por cualquier baja. Se guarda en la cuenta; las alertas que exceden el cupo gratuito permanecen pausadas. Telegram requiere Plus y un bot configurado.

### Verificación de correo

Perfil permite consultar el estado pendiente/verificado y reenviar el enlace cuando Resend está configurado.

### Moderador automático y reportes de ofertas

El panel `/admin` abre el resumen de actividad al entrar: evaluaciones, publicaciones, revisiones, retiros, propuestas, motivos y reportes pendientes. La primera entrada muestra 24 horas; las siguientes, desde la última entrada en ese navegador. La actividad y las decisiones se conservan en SQLite.

Empieza en **observación**, sin cambiar la publicación. Desde el resumen puedes activar el modo automático: publica datos recientes con riesgo bajo, oculta casos que requieren revisión y retira sólo ante evidencia reciente de inventario agotado o descuento desaparecido. Las decisiones manuales prevalecen. «Deshacer» revierte una acción automática siempre que no exista una decisión posterior. «Analizar ahora» espera una consulta confirmada a Mercado Libre y avisa si falla.

Desde Detalle, las cuentas pueden reportar una oferta vencida o un precio incorrecto, con nota opcional. El reporte no retira la oferta por sí solo. Se limita a cinco reportes nuevos por hora y cuenta; los duplicados pendientes no crean otra entrada. Una oferta vista con sesión puede reportarse durante 30 días aunque desaparezca antes de enviar. El análisis usa reglas e historial local y no requiere un servicio de IA externo; los casos sospechosos necesitan tu criterio.

### Configuración de verificación

Perfil muestra «Correo pendiente de verificación» o «Correo verificado». Si Resend está configurado, se envía un enlace al registrar la cuenta; puede reenviarse desde Perfil. El enlace caduca en 24 horas y se utiliza una sola vez. Reutiliza las variables de recuperación anteriores. Sin configurar el remitente, las cuentas conservan acceso y la interfaz informa que el envío no está disponible.
