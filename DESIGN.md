# Precionauta — Diseño visual

Actualizado el 28 de octubre de 2026.

La justificación de colores, tipografía y contrastes para la evaluación está en
[JUSTIFICACION_DISENO.md](JUSTIFICACION_DISENO.md).

## Dirección

Neobrutalismo aplicado al sitio público: tipografía Inter con títulos fuertes, retícula clara, bordes negros de 2 px, esquinas discretas y sombras sólidas sin desenfoque. El precio y la acción de cada oferta tienen prioridad sobre la decoración.

## Colores y componentes

| Uso | Color |
| --- | --- |
| Fondo claro | Crema `#f8f5eb` |
| Superficies claras | Papel `#fffdf6` |
| Texto y bordes | Negro `#171717` |
| Acciones principales y destacados | Amarillo `#ffe638` con texto negro |
| Plan Plus y secciones secundarias | Lavanda `#cdb6f3` con texto negro |
| Descuentos | Rojo `#c92433` con texto blanco |
| Fondo oscuro | `#252329` |

Los botones principales tienen fondo amarillo, borde negro y sombra desplazada. Los secundarios conservan un contorno visible. Las selecciones cambian también de borde o sombra; el foco de teclado permanece visible. Las tarjetas usan fotos completas, precios alineados y botones de guardar/alertar independientes.

## Organización del CSS

- `frontend/css/neobrutalism.css`: tokens del sitio público, encabezado, botones, tarjetas, formularios, menús, alertas, guardados, acceso, bienvenida, pie y modo oscuro.
- `frontend/css/home-neobrutalism.css`: composición del inicio y catálogo.
- `frontend/css/detail-neobrutalism.css`: galería, precio, historial, especificaciones, calculadora y relacionados.
- `frontend/css/plans-neobrutalism.css`: planes, selector de periodo y checkout de demostración.
- `frontend/css/content-neobrutalism.css`: temporada, documentos informativos e índices de lectura.

Las hojas originales siguen proporcionando estructura y estados. Cada página carga primero su CSS original, después el sistema compartido y al final su composición específica. `neo-site` identifica el sitio público; el panel de administración mantiene su diseño propio.

## Adaptación y límites

En celular, el buscador se muestra bajo la marca y los controles principales. Las columnas se apilan y los paneles permiten desplazamiento vertical. El diseño admite tema claro, oscuro y preferencia de movimiento reducido.

El retoque visual conserva las funciones y las restricciones de planes: la primera carga real es visible en Gratis; las ofertas posteriores esperan dos horas. El acceso social y el cobro siguen siendo demostraciones y se identifican como tales.

## Comprobaciones realizadas

Revisión visual de inicio, detalle, planes, checkout, temporada y documentos; comprobación de búsqueda, categorías, guardados y selector de periodo. Las nueve páginas públicas se revisaron a 390 px sin desbordamiento horizontal. Se verificaron referencias a estilos, scripts, IDs y anclas. Esto no sustituye una prueba de usabilidad con usuarios ni una auditoría completa de accesibilidad.
