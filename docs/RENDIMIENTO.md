# Carga, historial y tarjetas

Verificación local del 5 de noviembre de 2026.

El catálogo esperaba la sesión y la consulta de ofertas desde un módulo compartido. Esto bloqueaba también páginas como Perfil y Planes. Ahora la interfaz se inicializa sin esperar al catálogo; las vistas que necesitan productos esperan sus datos y actualizan buscador y menús cuando llegan. Un cambio de cuenta o plan invalida los datos anteriores y descarta respuestas tardías.

La consulta de avisos de reposición usa los datos disponibles sin iniciar otra consulta al proveedor. Las solicitudes iniciales repetidas se agrupan por sesión. El servidor de desarrollo desactiva la caché HTTP; el service worker revalida HTML, JavaScript y CSS, sin interceptar la API. Las imágenes conservan su caché.

En Chrome, con una demora artificial de 3500 ms para el catálogo, los controles respondieron en 797 ms en Perfil, 459 ms en Planes, 349 ms en Términos, 407 ms en Temporada y 271 ms en Inicio. Son tiempos de una prueba controlada de interacción, no una garantía del tiempo de carga de productos ni de servicios externos. Se ejecuta con `node tests/performance-smoke.cjs` y Playwright disponible.

El historial muestra precio y fecha de la observación al mover el mouse o tocar la gráfica. También admite flechas, Inicio, Fin y Escape mediante teclado. La selección respeta los escalones registrados: no inventa precios intermedios.

Para probar una tarjeta: abrir un producto, ir a **Compartir** y pulsar **Descargar tarjeta PNG**. Genera una imagen de 1200 × 630 con precio, fecha y enlace. Si la fotografía no puede descargarse, genera una versión alternativa. Si aparece una versión antigua de la página, recargar con Ctrl+F5 o cerrar y abrir de nuevo el navegador integrado, con el frontend activo en el puerto 4173.

Validación: 94 pruebas automatizadas aprobadas. El recorrido de Chrome comprueba la gráfica con mouse, teclado y tacto; la descarga PNG con imagen y alternativa; y los cambios de cuenta y plan entre pestañas. Usa servidores y cuentas temporales, sin correos ni mensajes reales.
