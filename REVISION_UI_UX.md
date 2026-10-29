# Precionauta — Revisión y retoque de UI/UX

Fecha: 28 de octubre de 2026.

## Contexto y objetivo

El proyecto se desarrolló inicialmente para una evaluación de funcionalidad. Ahora también será evaluado por el profesor de UI/UX. La prioridad es mejorar la presentación y la experiencia de uso conservando los flujos existentes.

Este documento es una lista de trabajo, no una auditoría visual terminada. Los hallazgos técnicos vienen de la lectura del código; los aspectos de presentación deben comprobarse en el navegador. La rúbrica del profesor todavía no está disponible.

## Dirección propuesta

Una herramienta de ofertas clara, confiable y con identidad propia. Mantener inicialmente la base neutra y la tipografía Inter existentes; evaluar un acento de marca consistente y reservar el rojo para descuentos y avisos según su contexto. La paleta final se decidirá con una vista real del inicio.

La primera pantalla debe permitir entender qué hace Precionauta, buscar un producto y llegar a las ofertas sin competir con demasiados mensajes. El precio actual y la acción principal deben dominar cada tarjeta. Las animaciones deben apoyar la comprensión y respetar la preferencia de movimiento reducido.

No hace falta cambiar de framework ni rehacer el backend para este retoque.

## Prioridad 1 — Inicio y catálogo

- [ ] Revisar el sitio en navegador y guardar capturas del antes en escritorio y celular.
- [ ] Identificar qué compite por atención: barra de temporada, header, hero, cinta, recomendaciones y ofertas bloqueadas.
- [ ] Dar al hero una propuesta de valor breve y una acción principal para explorar ofertas.
- [ ] Mantener el buscador fácil de encontrar y reducir la saturación del header.
- [ ] Ordenar las secciones según el recorrido del usuario, evitando repetir productos y mensajes sin propósito.
- [ ] Unificar tarjetas: proporción de imagen, altura, alineación del precio, descuento, tienda y acciones.
- [ ] Hacer evidente la diferencia entre abrir el detalle, guardar y crear una alerta.
- [ ] Mostrar filtros activos, número de resultados y una acción para limpiar filtros.
- [ ] Revisar el estado sin resultados y ofrecer una salida útil.
- [ ] Evitar que Plus o los bloqueos desplacen el objetivo principal de encontrar ofertas.

## Prioridad 2 — Consistencia visual

- [ ] Consolidar colores, tamaños, espaciado, radios y sombras en `frontend/css/tokens.css`.
- [ ] Definir una jerarquía corta de títulos, texto, metadatos y precios.
- [ ] Unificar botones primarios, secundarios y acciones con iconos.
- [ ] Revisar contraste y legibilidad de precios anteriores, etiquetas y texto secundario.
- [ ] Usar iconos con tamaño, grosor y alineación consistentes.
- [ ] Comprobar estados normal, hover, foco, activo y deshabilitado.
- [ ] Revisar coherencia entre Inicio, Detalle, Planes, paneles y páginas legales.
- [ ] Validar modo oscuro después de los cambios al modo claro.

## Prioridad 3 — Flujos y accesibilidad

- [ ] Recorrer: buscar → filtrar → abrir detalle → visitar la tienda.
- [ ] Recorrer: guardar → consultar guardados → quitar un producto.
- [ ] Recorrer: crear alerta → consultar alertas → eliminarla.
- [ ] Dar confirmación visible al guardar o crear una alerta, sin depender solo del color.
- [ ] Explicar el límite del plan gratis antes de que resulte confuso.
- [ ] En Detalle, priorizar imagen, precio, tienda y botón “Ver oferta”.
- [ ] Explicar qué representa el historial y desde cuándo se observa el precio.
- [ ] Identificar claramente el checkout y el acceso social como demostraciones mientras lo sean.
- [ ] Revisar navegación completa con teclado y foco visible.
- [ ] En modales y paneles: foco inicial, cierre con Escape y devolución del foco al control que los abrió.
- [ ] Comprobar etiquetas accesibles de botones con iconos y campos de formulario.
- [ ] Respetar `prefers-reduced-motion` en animaciones y contadores.
- [ ] Verificar que carga, error, catálogo vacío y modo demo tengan mensajes distintos.

## Prioridad 4 — Celular

- [ ] Revisar anchos de 360, 390, 768 y 1440 px, además de tamaños intermedios.
- [ ] Evitar desbordamiento horizontal y textos cortados con nombres largos.
- [ ] Mantener objetivos táctiles cómodos; usar 44 × 44 px como meta para controles principales.
- [ ] Comprobar buscador, filtros, menús y paneles con teclado virtual abierto.
- [ ] Evitar controles que solo aparecen con hover.
- [ ] Verificar que barras fijas y avisos no tapen contenido o acciones.
- [ ] Comprobar ampliación al 200 % sin pérdida de información esencial.

## Confianza y funcionalidad — Hallazgos que afectan la UX

Estos puntos ya se identificaron en el código y conviene resolverlos antes de presentar el producto como servicio público:

- [ ] **Moderación:** `backend/admin/moderation.js` publica las ofertas en revisión; solo excluye las rechazadas. Definir si una oferta sospechosa debe ocultarse o mostrar una advertencia explícita.
- [ ] **Verificación:** `frontend/js/data/products.js` asigna `verified: true` a todas las ofertas reales. Vincular el sello a una validación definida y explicar su alcance.
- [ ] **Modo demo:** el catálogo cambia a productos ficticios cuando falla el backend, llega una fuente demo o la lista está vacía. No sustituir silenciosamente una lista legítimamente vacía por ejemplos; identificar el modo demo en pantalla.
- [ ] **Datos antiguos:** la caché mantiene las últimas ofertas si falla Mercado Libre. Mostrar la antigüedad y tratar las ofertas vencidas.
- [ ] **Historial:** se guardan precios después de filtrar por descuento. Seguir observando productos fuera de promoción para ampliar la evidencia histórica.
- [ ] **Plus:** las restricciones viven en `localStorage`; autenticación, pagos y permisos del servidor quedan pendientes para monetizar.
- [ ] **Alertas por correo:** el endpoint de suscripción responde con éxito, pero no persiste ni envía el correo. Presentarlo como pendiente o completarlo antes de ofrecerlo.
- [ ] **Despliegue:** configurar la URL pública del backend; el frontend usa localhost como valor predeterminado.
- [ ] **Verificación técnica:** agregar comprobaciones útiles para moderación, catálogo vacío, fallos del proveedor y cálculo de descuentos. Actualmente no hay script de pruebas en `package.json`.
- [ ] **Documentación:** actualizar README, PRODUCT, PROJECT_CONTEXT y PENDIENTES para que describan el mismo estado. El README del frontend todavía describe una paleta anterior.

## Orden de ejecución

1. Capturar el estado actual y confirmar la rúbrica si está disponible.
2. Retocar Inicio y una tarjeta como referencia visual para el resto.
3. Extender las reglas aprobadas a catálogo, detalle y paneles.
4. Completar estados, accesibilidad y adaptación a celular.
5. Corregir los mensajes y comportamientos que afectan la confianza.
6. Probar los recorridos y preparar evidencia del antes y después.

## Evidencia para la evaluación

- [ ] Comparativas del antes y después de Inicio y Detalle en escritorio y celular.
- [ ] Resumen de reglas visuales: colores, tipografía, espaciado, botones y tarjetas.
- [ ] Explicación breve de cada cambio: problema observado, decisión y beneficio para el usuario.
- [ ] Prueba con 3–5 personas: encontrar una oferta, filtrar por categoría y guardarla o crear una alerta.
- [ ] Registrar si completan cada tarea, dónde se traban y qué cambiar; no inventar resultados.
- [ ] Declarar qué integraciones son reales y cuáles siguen en demostración.

## Criterio de cierre

El retoque estará listo cuando el recorrido principal sea claro en escritorio y celular, los componentes sean consistentes, los estados expliquen lo que ocurre y las funciones existentes sigan operando. Las afirmaciones de accesibilidad y facilidad de uso deben respaldarse con comprobaciones, no solo con etiquetas en la documentación.
