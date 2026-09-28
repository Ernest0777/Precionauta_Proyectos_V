# Precionauta - Frontend

HTML/CSS/JS estático, sin build ni dependencias de npm. Identidad Scandinavian
(terracota `#c1602e` + crema + charcoal, Cormorant Garamond + Inter) - ver
`PRODUCT.md` en la raíz del repo para el porqué y el historial de decisiones.

## Cómo abrir

**Opción rápida:** doble clic en `index.html`. Puede fallar: los navegadores
basados en Chromium bloquean los módulos ES (`<script type="module">`) cargados
por `file://` (política CORS). Si el catálogo no aparece, sirve la carpeta con
cualquier servidor estático:

```bash
python -m http.server 4173 --directory frontend
```

y abre `http://localhost:4173/index.html`. (`.claude/launch.json` ya trae esto
configurado para levantarlo automático dentro de Claude Code / Codex).

**Si editas un `.js` y no ves el cambio:** el navegador puede quedarse con una
copia en caché del módulo incluso cerrando y reabriendo la pestaña. Antes de
asumir que algo no funciona, fuerza una recarga completa (`Ctrl+Shift+R` /
`Cmd+Shift+R`), o abre en una ventana de incógnito nueva.

Al desplegar en Vercel (o cualquier host estático), apunta el proyecto a esta
carpeta `frontend/` como raíz publicada; no hay paso de build.

## Páginas

- `index.html` - Inicio: nav, hero, categorías, catálogo (filtros por
  categoría/tienda/% de descuento, orden), "Mantente conectado".
- `producto.html?id=<id>` - Detalle de un producto (galería, specs, historial
  de precio, relacionados). Sin `?id`, cae al primer producto por defecto -
  la forma normal de llegar es dando clic en una tarjeta desde Inicio.
- `aviso-privacidad.html`, `terminos.html`, `politica-cookies.html`,
  `politica-reembolsos.html` - páginas legales, enlazadas desde el footer.

## Estructura

```
frontend/
  index.html / producto.html / *.html (legales)
  css/
    tokens.css       Paleta, radios, sombras, tipografía, espaciado (fuente de verdad)
    base.css         Reset, fuentes autohospedadas, foco, selección, scrollbar
    layout.css       Estructura de secciones y breakpoints (640/768/1024)
    components.css   Botones, chips, tarjetas, tiles, formularios
    detail.css       Layout específico de producto.html (galería, specs, gráfico)
    legal.css        Tipografía de las páginas legales
  js/
    data/
      products.js      Los 10 productos de prueba (precios, specs, historial)
      categories.js     Las 7 categorías
    components/
      productCard.js      Tarjeta de producto (estándar y destacada)
      categoryTile.js      Loseta del menú de categorías (bento)
      categoryTabs.js       Franja compacta de filtro por categoría
      priceChart.js          Gráfico SVG de historial de precio (sin librería)
    utils/
      format.js         Precio MXN, % de descuento, ahorro, fechas relativas
      icons.js          Set de íconos Phosphor (paths vendorizados, sin CDN)
      priceHistory.js   Genera la serie de 90 días para el gráfico (determinista)
    shared.js       Menú móvil, header, "Mantente conectado", resumen de ahorro
                    - usado por main.js, detail.js y legal.js
    main.js         Controlador de index.html
    detail.js       Controlador de producto.html
    legal.js        Controlador de las páginas legales (solo header/footer)
  assets/
    fonts/          Cormorant Garamond + Inter autohospedadas
    icons/          SVG de referencia de cada ícono (Phosphor, MIT)
    favicon.svg
```

## Notas de contenido

- Los 10 productos, precios, tiendas, specs e historial de precio son **datos
  de prueba** (ver `PRODUCT.md`). El primer producto ("Auriculares
  inalámbricos XR-Pro") es el mismo en Home y Detalle a propósito.
- El % de descuento y el ahorro **siempre se calculan** desde `previousPrice`/
  `currentPrice` (`js/utils/format.js`), nunca se escriben a mano.
- Guardado de favoritos y alertas de precio: `localStorage`, compartido entre
  todas las páginas (mismo navegador). No hay backend ni cuentas todavía - ver
  `PENDIENTES.md` en la raíz para lo que falta.
- No hay fotos de producto reales: cada categoría usa un glifo ilustrado
  (ícono + círculo de acento) como marcador de posición intencional.
