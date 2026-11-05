# Precionauta — Frontend

Sitio estático en HTML, CSS y módulos JavaScript, sin compilación obligatoria. Usa la identidad neobrutalista vigente, con temas claro y oscuro. Consulta [DESIGN.md](../DESIGN.md) para el sistema visual.

## Desarrollo

Desde la raíz del repositorio, con Node.js 22.21 o posterior:

```bash
npm install
npm run dev
```

Abre `http://localhost:4173`; el backend corre en `http://localhost:3001`. `npm run serve` sirve únicamente el frontend. No abras HTML mediante `file://`: los módulos requieren un servidor HTTP.

La API se configura mediante `window.PRECIONAUTA_API` antes de cargar los módulos, con el backend local como valor predeterminado. El servidor de API es necesario para cuentas, persistencia y permisos. El respaldo de datos de ejemplo permite explorar el sitio sin sustituir esa autorización.

## Páginas y módulos

| Área | Archivos principales |
|---|---|
| Inicio y catálogo | `index.html`, `js/main.js`, `js/data/products.js` |
| Detalle | `producto.html`, `js/detail.js` |
| Planes y demo | `planes.html`, `js/plans.js`, `js/components/checkout.js` |
| Temporadas | `temporada.html`, `js/season.js`, `js/data/season.js` |
| Cuenta y permisos | `js/utils/account.js`, `js/utils/plan.js`, `js/shared.js` |
| Perfil | `perfil.html`, `js/profile.js`, `css/profile.css` |
| Componentes | `js/components/`, incluyendo tarjetas, menús y gráfico de historial |
| Estilos | `css/tokens.css`, bases, estilos de cada página y capas neobrutalistas |
| Instalación | `manifest.webmanifest`, `sw.js`, `js/pwa.js` |

Los iconos y fuentes se sirven desde recursos locales. El detalle usa historial disponible y no debe completar observaciones reales con una gráfica ficticia.

## Contrato de cuenta y planes

`js/utils/account.js` mantiene el estado confirmado por el servidor. La sesión usa cookie; las mutaciones deben esperar la respuesta de la API y mostrar el error si falla. La identidad o el plan guardado localmente no autorizan funciones.

`js/utils/plan.js` concentra los precios y ventanas de historial: Plus $79 MXN/mes o $790 MXN/año con IVA incluido; Cuenta gratuita hasta 30 días y Plus hasta 365 días. Evita duplicar constantes en tarjetas o checkout.

- Visitante: catálogo liberado y guardados locales; sin historial ni alertas.
- Cuenta gratuita: guardados de cuenta, hasta 3 alertas activas y ofertas nuevas con espera de 2 horas después de la primera carga.
- Plus: alertas ilimitadas, historial ampliado y ofertas nuevas al instante.
- Temporadas: visitante y cuenta gratuita ven 3 ofertas en total por evento; Plus ve todas las disponibles.

Visitante no aparece como plan comercial. Cazador se fusiona con Plus. Un downgrade conserva guardados y alertas; las excedentes del límite gratuito se pausan.

El checkout sigue siendo una demostración sin cobros: tarjeta ficticia de solo lectura, ejemplos OXXO/SPEI sin referencia pagable y activación mediante backend. No captura, envía ni persiste PAN/CVC reales. No debe mostrar éxito antes de la confirmación del servidor.

## Contenido y estados

Distingue datos de ejemplo de ofertas del conector actual, Mercado Libre. No anuncia otras tiendas como integradas ni afiliaciones como aprobadas. No hay OAuth activo de Google/Facebook ni recuperación operativa de contraseña por correo. El perfil incluye nombre, correo, dirección opcional y plan.

Las temporadas sin fechas anunciadas se presentan como pendientes; no inventes fechas ni temporizadores. Los 3 elementos gratuitos se cuentan por evento completo, no por sección o carrusel.

## Verificación

```bash
npm test
```

El script ejecuta `node --test tests/*.test.js` desde la raíz. Complementa las pruebas con revisión en navegador de autenticación, persistencia, permisos, errores de demo, downgrade y temporadas, en escritorio y móvil, con teclado y ambos temas. La verificación final de esta entrega se registra en [el plan de implementación](../docs/PLAN_IMPLEMENTACION.md); todavía no se declara aprobada.

Si no aparecen cambios durante desarrollo, fuerza una recarga y revisa la caché de la PWA. Para publicar, el frontend puede servirse como archivos estáticos; la cuenta requiere configurar también el backend, la persistencia y los orígenes permitidos.
