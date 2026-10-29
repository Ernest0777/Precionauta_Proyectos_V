# Precionauta — Justificación de paleta y tipografía

Documento de apoyo para la evaluación de UI/UX. Fecha: 28 de octubre de 2026.

## 1. Objetivo del diseño

Precionauta ayuda a explorar ofertas, comparar precios, consultar su historial y guardar productos o crear alertas. El diseño debe permitir reconocer con rapidez el producto, su precio actual y la siguiente acción disponible.

Se eligió una dirección neobrutalista con títulos fuertes, bordes visibles y sombras sólidas. Estos recursos construyen una identidad reconocible y distinguen controles y bloques de contenido. Las fotos y los precios conservan el protagonismo mediante una retícula consistente y superficies mayormente neutras.

La intención es que la interfaz resulte directa y enérgica. Su facilidad de uso debe comprobarse con personas realizando tareas concretas; todavía no hay resultados de una prueba formal de usabilidad.

## 2. Paleta de colores

La composición usa una base neutra con dos acentos cromáticos —amarillo y lavanda— y un rojo funcional para destacar porcentajes de descuento en las tarjetas.

| Color | Código | Aplicación real | Justificación |
| --- | --- | --- | --- |
| Crema | `#f8f5eb` | Fondo general del modo claro | Establece una superficie de lectura discreta sobre la que sobresalen fotos, precios y controles. Su tono distingue la marca de una interfaz completamente blanca. |
| Papel | `#fffdf6` | Tarjetas y superficies de contenido | Separa los bloques del fondo manteniendo continuidad visual. Las fotografías de producto conservan fondo blanco cuando lo necesitan. |
| Negro | `#171717` | Texto principal, bordes, iconos y sombras | Define la estructura y proporciona alto contraste. Los contornos hacen explícita la forma de botones, campos y tarjetas. |
| Amarillo | `#ffe638` | Acciones principales, selecciones, marca y destacados | Da énfasis a puntos relevantes del recorrido, como “Explorar ofertas” y “Ver oferta”. La repetición crea una pauta reconocible entre páginas. Se acompaña de texto negro. |
| Lavanda | `#cdb6f3` | Oferta destacada, plan Plus, contador y bloques secundarios | Diferencia grupos de información y complementa el amarillo sin convertir toda la página en un área de énfasis. Se acompaña de texto oscuro. |
| Rojo | `#c92433` | Insignias de descuento de las tarjetas | Hace localizable el porcentaje de ahorro dentro del catálogo. El porcentaje escrito comunica el dato incluso si no se distingue el color. El detalle del producto también utiliza una insignia negra. |
| Oscuro | `#252329` | Fondo del modo oscuro | Mantiene una alternativa visual consistente. El texto pasa a claro y los bloques amarillos y lavanda conservan tinta oscura. |

El amarillo se usa tanto en acciones como en destacados; la forma, el borde, el texto y la ubicación permiten distinguir un botón de una etiqueta. El lavanda agrupa contenido y no representa por sí solo una acción ni una validación.

Estas asociaciones son decisiones de diseño para este producto. Su justificación se basa en jerarquía, consistencia y contraste; los efectos emocionales se plantean como intención de marca, sin atribuir una respuesta universal a cada color.

## 3. Contraste y uso accesible del color

Se calcularon las siguientes relaciones a partir de los valores hexadecimales del CSS, convirtiendo sRGB a luminancia relativa y aplicando `(L mayor + 0.05) / (L menor + 0.05)`. Los resultados se muestran redondeados a dos decimales.

| Texto / fondo | Relación |
| --- | --- |
| Negro `#171717` / crema `#f8f5eb` | 16.44:1 |
| Negro `#171717` / papel `#fffdf6` | 17.61:1 |
| Negro `#171717` / amarillo `#ffe638` | 14.20:1 |
| Negro `#171717` / lavanda `#cdb6f3` | 9.89:1 |
| Blanco `#ffffff` / rojo `#c92433` | 5.55:1 |
| Texto secundario `#5b584f` / crema `#f8f5eb` | 6.52:1 |
| Texto claro `#fffdf6` / oscuro `#252329` | 15.27:1 |

Los pares anteriores superan el mínimo de 4.5:1 para texto normal establecido por WCAG AA. Para texto grande, el criterio permite 3:1. Estos cálculos verifican combinaciones concretas; no certifican la accesibilidad completa del sitio. [W3C: contraste mínimo](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum).

Dos decisiones adicionales:

- El texto blanco sobre el amarillo elegido solo alcanza 1.26:1; por ello se utiliza tinta oscura.
- El amarillo y el crema tienen una relación de 1.16:1 entre sí. Los botones incorporan borde negro, etiqueta y forma reconocible para que su identificación no dependa de distinguir esos fondos.

WCAG exige que las señales visuales necesarias para identificar controles y estados tengan contraste suficiente, y que el color no sea el único medio para comunicar información. Esto respalda acompañar selecciones con contornos, descuentos con porcentajes y acciones con etiquetas. [W3C: contraste no textual](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [W3C: uso del color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).

## 4. Tipografía elegida: Inter

Se mantiene **Inter** como familia principal para títulos, párrafos, navegación, botones y precios.

Su elección responde a tres necesidades del proyecto:

1. **Lectura en pantallas.** Inter fue diseñada para interfaces y pantallas; su altura de x favorece la lectura de minúsculas. Esto resulta pertinente para nombres de productos, filtros y textos de apoyo.
2. **Jerarquía dentro de una sola familia.** Sus pesos variables permiten diferenciar párrafos, controles, títulos y precios sin introducir familias adicionales. Los pesos altos acompañan el carácter contundente del neobrutalismo.
3. **Comparación de cifras.** Sus números tabulares asignan el mismo ancho a los dígitos. Precionauta activa esta característica en precios y contadores para mantener una composición estable.

Estas características están documentadas por sus autores. La utilidad concreta para Precionauta es la aplicación de esas características a sus tareas de lectura y comparación. [Sitio oficial de Inter](https://rsms.me/inter/), [repositorio oficial](https://github.com/rsms/inter).

Usar una familia mantiene continuidad entre páginas. La identidad particular se construye con escala, peso, espaciado y composición, junto con los colores y contornos.

## 5. Jerarquía tipográfica implementada

| Elemento | Tratamiento | Propósito |
| --- | --- | --- |
| Títulos principales | Inter de gran tamaño, pesos 850–900; tamaño adaptable | Establecer el tema de la página y el primer nivel de lectura. |
| Nombres de producto | Peso cercano a 750 y tamaño moderado | Identificar el artículo sin competir con el precio. |
| Precios actuales | Pesos 850–900, escala mayor y cifras tabulares | Facilitar la localización del importe y su comparación. |
| Botones | Peso cercano a 800 y etiqueta breve | Hacer reconocible la acción disponible. |
| Texto general | Base nominal de 16 px, peso regular e interlineado 1.6 | Sostener la lectura de explicaciones y descripciones. |
| Documentos informativos | Interlineado cercano a 1.8 y columna de lectura limitada | Separar líneas y evitar bloques de texto demasiado extensos. |
| Metadatos y etiquetas | Menor tamaño y énfasis que la información principal | Mantener una jerarquía sin desplazar precios y acciones. |

Algunas etiquetas son menores de 16 px. Deben revisarse con ampliación y en celular, especialmente si comunican información necesaria para decidir.

La fuente variable WOFF2 se sirve desde el propio proyecto y usa `font-display: swap`, que permite mostrar texto con una alternativa mientras se carga Inter. Cormorant permanece declarada en el CSS heredado, pero no es una familia activa del diseño actual.

## 6. Explicación breve para exponer

> Elegimos una base crema y superficies claras para que los productos y los precios sean fáciles de localizar. El negro estructura la interfaz con bordes y sombras, mientras que el amarillo destaca acciones y mensajes importantes. El lavanda diferencia bloques secundarios y el rojo destaca porcentajes de descuento. La paleta responde a una jerarquía de información y mantiene contrastes medidos. Elegimos Inter porque está diseñada para pantallas, permite construir una jerarquía con distintos pesos y ofrece cifras tabulares útiles para comparar precios. Así, el neobrutalismo aporta identidad y las decisiones de color y tipografía apoyan las tareas del usuario.

## 7. Evidencia pendiente para completar la defensa

Realizar tareas de búsqueda, comparación y creación de alertas con usuarios; registrar dificultades; comprobar zoom al 200 %, etiquetas pequeñas y estados de foco. Los resultados permitirán sostener con evidencia la facilidad de uso propuesta, además de la justificación visual y los cálculos de contraste.
