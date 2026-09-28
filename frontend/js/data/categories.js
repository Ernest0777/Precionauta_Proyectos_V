/**
 * Categorias del catalogo. Mismo set que la barra de categorias de la
 * pantalla de Detalle (incumbente), para que Inicio y Detalle compartan
 * taxonomia. `tileSize` decide que categorias reciben la loseta grande en
 * el menu bento (las que hoy tienen mas ofertas activas).
 */

/**
 * `treatment` fija el tratamiento visual de la loseta bento (una sola
 * variación de tono del acento de marca, nunca un color nuevo):
 * "solid" = relleno azul solido, "tint" = azul suave, "outline" = blanca con borde.
 */
export const CATEGORIES = [
  { slug: "tecnologia", label: "Tecnología", tileSize: "lg", treatment: "solid" },
  { slug: "hogar", label: "Hogar", tileSize: "lg", treatment: "tint" },
  { slug: "moda", label: "Moda", tileSize: "sm", treatment: "outline" },
  { slug: "deportes", label: "Deportes", tileSize: "sm", treatment: "outline" },
  { slug: "juguetes", label: "Juguetes", tileSize: "sm", treatment: "outline" },
  { slug: "autos", label: "Autos", tileSize: "sm", treatment: "outline" },
  { slug: "supermercado", label: "Supermercado", tileSize: "sm", treatment: "outline" },
];

export const ALL_CATEGORIES_SLUG = "todas";
