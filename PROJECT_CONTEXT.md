# Contexto del proyecto — Precionauta

Actualizado: 2026-11-04. Rama actual: `Neo_Brutalism`.

## Objetivo de la entrega

Consolidar Cuenta gratuita y Plus, conectar la cuenta real al backend y conservar el diseño neobrutalista actual. Cazador queda fusionado con Plus. Afiliados y tiendas nuevas se retoman después; el conector actual sigue siendo Mercado Libre.

## Decisiones vigentes

| Estado | Guardados | Alertas | Historial | Ofertas nuevas | Temporadas |
|---|---|---|---|---|---|
| Visitante | Requiere registro | Ninguna | Ninguno | Muestra de 6 ofertas liberadas; registro para ver más | Requiere registro |
| Cuenta gratuita | En cuenta | 3 activas | Hasta 30 días | 2 horas de espera después de la primera carga | 3 en total por evento |
| Plus | En cuenta | Ilimitadas | Hasta 365 días | Inmediatas | Todas las disponibles |

Plus cuesta $79 MXN/mes o $790 MXN/año, IVA incluido. El anual ahorra $158, equivalentes a 2 mensualidades. El número de días determina la ventana accesible, no garantiza que exista toda esa historia para cada producto.

Visitante no es un plan comercial. Puede explorar seis ofertas sin registrarse; no puede guardar ni acceder a Temporadas. La cuenta gratuita también incorpora valoraciones y recomendaciones personales por su actividad. Al bajar de Plus se conservan guardados y alertas; las excedentes del límite gratuito quedan pausadas.

## Integración actual

- Frontend HTML/CSS/JavaScript con módulos ES, sin compilación obligatoria.
- Backend Express; datos de cuenta e historial en SQLite. Requisito local: Node.js 22.21 o posterior.
- Autenticación de esta entrega: correo y contraseña, con sesión mediante cookie. El servidor determina el acceso.
- Perfil: nombre, correo, dirección opcional y plan.
- Checkout de demostración: sin cobro ni captura de tarjeta real. La activación requiere cuenta y respuesta satisfactoria del backend; un error no cambia el plan.
- Catálogo: Mercado Libre cuando hay datos; ejemplos identificables como respaldo cuando el backend no está disponible.
- Temporadas: fechas oficiales cuando estén anunciadas; estado pendiente cuando no lo estén. El límite gratuito es por evento completo.

La integración de cuentas, permisos, comunidad, recomendaciones, moderación, seguimiento y reposición está verificada localmente: 94 pruebas automatizadas y recorrido de navegador con datos temporales y servicios simulados. Las tres alertas gratuitas se comparten entre precio y reposición. El seguimiento conserva precios fuera de ofertas y las tarjetas se descargan como PNG. Las páginas ya no bloquean sus controles esperando el catálogo; el historial admite consulta de precio y fecha mediante mouse, tacto y teclado. Hay configuración de backend continuo y respaldo, sin despliegue ni prueba de ejecución Docker. Los detalles constan en los planes, docs/RENDIMIENTO.md y docs/BACKEND_CONTINUO.md.

## Límites explícitos

No hay pagos reales ni OAuth de Google/Facebook. La recuperación por Resend ya está implementada, pendiente de credenciales y remitente autorizado. Las referencias a afiliados no acreditan cuentas aprobadas. La existencia de una integración de Telegram en el repositorio no demuestra que haya un bot configurado ni entrega de avisos comprobada en este entorno.

## Diseño

La identidad vigente es neobrutalista: bordes marcados, contraste, crema, amarillo y lavanda, con temas claro y oscuro. [DESIGN.md](DESIGN.md) describe el sistema. Las notas antiguas sobre Scandinavian, Watermelon o blanco y negro son antecedentes y no definen la entrega actual.

## Desarrollo y validación

El panel administrativo abre un resumen de moderación automática al entrar. El motor empieza en observación y persiste modo, propuestas, acciones y reversiones en SQLite; se ejecuta tras cada consulta real y registro de precios, antes de Telegram. Las decisiones manuales prevalecen. Los reportes de la comunidad se atienden desde ese resumen y no retiran ofertas por sí solos. Detalle registra las consultas autorizadas para permitir reportar una oferta vista si desaparece antes de enviar.

Desde la raíz:

```bash
npm install
npm run dev
npm test
```

Frontend: `http://localhost:4173`. Backend: `http://localhost:3001`. `npm run serve` sirve únicamente el frontend; la cuenta requiere el backend. El comando de pruebas es `node --test tests/*.test.js` mediante `npm test`.

Las tareas y la deuda útil se mantienen en [PENDIENTES.md](PENDIENTES.md). El alcance y los criterios de aceptación están en [docs/PLAN_IMPLEMENTACION.md](docs/PLAN_IMPLEMENTACION.md); la hipótesis de usuario, en [docs/PROTOPERSONA.md](docs/PROTOPERSONA.md).
