# Pendientes - Precionauta

## Phase 1: Navigation ✅ (COMPLETADO)
- [x] Continuous Tabs integrados (ahora como filtro de categoría dentro del catálogo)
- [x] Morphing Discovery Bar integrado (busca en vivo sobre los productos reales)
- [x] CSS Scandinavian aplicado

## Rediseño "más vida" ✅ (COMPLETADO - 2026-09-22, merge a main en PR #1)
- [x] Menú "Categorías" desplegable (hover/clic/teclado) con conteos reales y mejor oferta por categoría — `js/components/headerMenus.js`
- [x] Fila fija de categorías bajo el buscador eliminada (decisión del equipo: pasarla al menú)
- [x] "Mis alertas" funcional: panel con lista, contador en el header, quitar alerta y estado vacío "Aún no tienes alertas" (localStorage, sin backend)
- [x] Panel de alertas sincronizado con el botón "Avisarme si baja más" de Detalle
- [x] Menús del header en todas las páginas (index, producto y las 5 legales)
- [x] `?categoria=slug` y `?q=texto` en index.html para llegar filtrado desde otras páginas
- [x] Tonos por categoría (salvia, ocre, azul tenue, etc.) en `css/tokens.css`; el terracota sigue siendo el único color de acción
- [x] Hero: animación de caída de precio, mazo de ofertas detrás, chips de tiendas que filtran
- [x] Cinta de ofertas color azafrán (referencia: The Mainstays en lapa.ninja)
- [x] Banda "Mantente conectado" en terracota
- [x] Bugs: pastilla blanca vacía (savings-pill ignoraba `hidden`), hamburguesa visible en escritorio, mancha gris del hero en modo oscuro, desborde horizontal del footer en celular
- [x] CSS original de Watermelon pisaba la paleta (acento naranja); movido a `css/watermelon-demo.css` solo para la demo

## Minimal B/N + Plus ✅ (COMPLETADO - 2026-10-05, sin commit todavía)
- [x] Paleta blanco y negro (tokens.css), estructura inspirada en Amazon; único color: rojo en descuentos (`--color-deal`)
- [x] Tipografía: todo Inter (Cormorant ya no se usa)
- [x] "Tiendas" del header como desplegable (Amazon / Mercado Libre / Liverpool) + `?tienda=` en index
- [x] Campana en las tarjetas para crear alertas sin entrar a Detalle (también en "relacionados")
- [x] Corazón de las tarjetas relacionadas en Detalle ya funciona (antes no hacía nada)
- [x] Plan gratis con límite de 3 alertas; aviso (toast) con enlace a Plus al llegar al límite
- [x] `planes.html`: Gratis $0 / Plus $49 mes - $490 año / Cazador $99 (próximamente) + FAQ
- [x] Checkout de DEMOSTRACIÓN: resumen, IVA, métodos (tarjeta, OXXO, Mercado Pago, SPEI). No pide datos de tarjeta; activa Plus solo en localStorage
- [x] Login con Google / Facebook (botones de vista previa, mensaje honesto: falta OAuth/backend)
- [x] Enlace "Plus" en header, menú móvil y footer de todas las páginas
- [x] Código muerto borrado (categoryTile.js, categoryTabs.js, estilos bento) y `.playwright-cli/` fuera de git

## Recomendaciones + catálogo grande ✅ (COMPLETADO - 2026-10-05, sin commit todavía)
- [x] 110 productos (10 base + 100 generados con marcas ficticias) — `js/data/generatedProducts.js`, se regeneran con `python scripts/gen_products.py`
- [x] Catálogo paginado: 12 por vez con "Mostrar más" y barra de progreso
- [x] Recomendador local (`js/utils/recommender.js`): aprende de búsquedas, categorías/tiendas filtradas, productos vistos, guardados y alertas; decaimiento de 7 días; cada recomendación dice su "porqué"
- [x] Sección "Recomendado para ti" en Inicio + chips de intereses + "Editar intereses" / "Borrar historial"
- [x] Buscador vacío sugiere búsquedas recientes y recomendaciones
- [x] Bienvenida de primera visita "¿Qué te interesa?" (categorías y tiendas) — `js/components/onboarding.js`
- [x] Panel "Mis guardados" (corazón del header) con ahorro total; guardar sincronizado en todas las páginas
- [x] Compartir por WhatsApp y copiar enlace en Detalle
- [x] Calculadora de meses sin intereses (3/6/9/12/18) en Detalle
- [x] `temporada.html` (Buen Fin 2026): cuenta regresiva, mínimos históricos, +50%, guía con checklist, calendario de temporadas
- [x] Barra superior del Buen Fin en todas las páginas (se puede cerrar) — fechas en `js/data/season.js` (marcadas como estimadas)

## Ideas para lo siguiente 💡
- [ ] Termómetro de ofertas estilo Promodescuentos (votar 🔥/❄️)
- [ ] PWA instalable + notificaciones del navegador para las alertas
- [ ] Comparador lado a lado de 2-3 productos
- [ ] Elegir tipografía propia (el detector marca Inter como muy usada)
- [ ] Generar `DESIGN.md` con `/impeccable document` cuando la paleta B/N quede aprobada
- [ ] Actualizar `PRODUCT.md` con `/impeccable init`
- [ ] Confirmar fechas oficiales del Buen Fin 2026 y quitar `estimated` en `js/data/season.js`

## Backend (cuando exista) 🔌
- [ ] Pagos reales: Stripe Checkout o Mercado Pago (el punto de conexión es `confirmCheckout` en `js/plans.js`)
- [ ] Login real con Google/Facebook: Firebase Auth o Supabase Auth (botones en el modal de todas las páginas)
- [ ] Alertas por correo/WhatsApp

## Phase 2: Deal Grid & Alerts 🔄 (EN PROGRESO)
- [ ] Integración con API de ofertas
- [ ] Sistema de paginación
- [ ] Alertas en tiempo real (hoy solo se guardan en el navegador)
- [ ] Cards con datos reales

## Phase 3: Filtros 📋 (PRÓXIMO)
- [x] Filtros de descuento mínimo y tienda (chips)
- [ ] Switch para stock
- [ ] Disclosure para filtros avanzados

## Phase 4: Details & Polish ✨ (FUTURO)
- [x] Página de detalles
- [ ] Accordion con historial
- [ ] Popovers explicativos
- [x] Dark mode completo

## Deployment 🚀 (DESPUÉS)
- [ ] Build optimizado
- [ ] Deploy en hosting
- [ ] SSL/HTTPS
- [ ] Monitoreo

---

**Última actualización:** 2026-10-05
