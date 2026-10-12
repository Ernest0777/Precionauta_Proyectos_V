# Precionauta - Rastreador de Ofertas Extremas

**Estado:** En desarrollo - Rama `claude/frontend-scandinavian-redesign`

## 🍉 Descripción Rápida

Precionauta es un agregador en tiempo real de ofertas extremas (80%-99% de descuento) de plataformas de e-commerce mexicanas como Amazon, Mercado Libre y Liverpool.

## 🚀 Quick Start

```bash
# Instalar dependencias
npm install

# Iniciar servidor + abrir navegador
npm run dev

# O solo servir (sin abrir navegador)
npm run serve
```

Accede a: **http://localhost:4173**

### Panel de administración

`npm run dev` también levanta el panel en **http://localhost:3001/admin** (lo sirve el backend, no la tienda, y la tienda no tiene ningún enlace hacia él).

1. Pon una contraseña en `backend/.env`: `ADMIN_PASSWORD=...` (opcional `ADMIN_SECRET=...` para no tener que volver a entrar cuando reinicias el servidor).
2. Entra a `/admin` con esa contraseña. Sin `ADMIN_PASSWORD` el panel no deja entrar.

Secciones:
- **Resumen**: ahorro publicado, cola de moderación, ofertas en riesgo con su motivo, descuentos por rango, estado del sistema y botón para consultar Mercado Libre al momento.
- **Moderación**: tablero Por revisar → Publicada → Destacada → Rechazada. Se arrastra con el mouse, con `Alt + ←/→` o con el menú "⋯" (en celular). Rechazar una oferta la oculta de la tienda; destacarla la pone primero.
- **Reportes**: un control de rango (24 h / 7 días / 30 días / Todo) redibuja la gráfica de consultas, los indicadores y la bitácora de decisiones.

Las decisiones y el historial se guardan en `backend/cache/moderation.json` (fuera de git).

### Base de datos, afiliados y alertas

El backend usa SQLite incluido en Node 22+ (sin instalar nada; Node avisa que es "experimental", no pasa nada). El archivo vive en `backend/data/precionauta.db` (fuera de git) y guarda:

- **Historial de precios**: cada consulta a Mercado Libre (cada 5 min, aunque nadie visite) guarda el precio si cambió. Detalle dibuja la gráfica real y el panel marca "precio anterior inflado" cuando en 7+ días nunca vimos el producto cerca de ese precio.
- **Clics de afiliado**: "Ver oferta" pasa por `http://localhost:3001/go/:id`, que cuenta el clic (se ve en Reportes) y redirige a la tienda con tus parámetros de afiliado.
- **Alertas por Telegram**: quien conecta Telegram desde «Mis alertas» recibe un mensaje cuando baja una oferta que sigue y cuando aparece una de 80%+.

Variables en `backend/.env` (ver `.env.example`):

| Variable | Para qué |
|---|---|
| `MELI_AFFILIATE_PARAMS` | Parámetros que te da Mercado Libre Afiliados, tal cual van en el enlace |
| `TELEGRAM_BOT_TOKEN` | Token del bot (créalo con @BotFather en Telegram). Sin él, el bloque de Telegram no aparece |
| `PUBLIC_URL` | URL del backend ya publicado, para que los enlaces de Telegram cuenten clics |

### App instalable

La tienda es PWA: `manifest.webmanifest` + `sw.js` (siempre pide a la red primero, así no sirve archivos viejos mientras desarrollan). En el celular, "Agregar a pantalla de inicio".

## 📁 Estructura

```
frontend/
├── index.html              # Página principal
├── css/
│   ├── tokens.css
│   ├── base.css
│   ├── layout.css
│   ├── components.css
│   └── components-watermelon.css    # ✨ Watermelon UI
├── js/
│   ├── main.js
│   ├── shared.js
│   └── components/
│       ├── continuousTabs.js         # Tabs animados
│       ├── morphingDiscoveryBar.js   # Búsqueda avanzada
│       ├── alerts.js                 # Notificaciones
│       ├── dropdown.js               # Dropdowns
│       ├── disclosure.js             # Acordeón
│       ├── popover.js                # Tooltips
│       └── watermelonInit.js         # Inicializador
└── assets/
```

## 🎨 Componentes Watermelon UI

- ✅ Continuous Tabs (Navegación de categorías)
- ✅ Morphing Discovery Bar (Búsqueda inteligente)
- ✅ Alert System (Notificaciones Toast)
- ✅ Dropdown Menu (Menús)
- ✅ Disclosure/Accordion (Acordeones)
- ✅ Popover (Tooltips flotantes)

Ver: `frontend/WATERMELON_COMPONENTS_GUIDE.md`

## 🔧 Scripts Disponibles

```bash
npm run dev          # Desarrollo (abre navegador)
npm start            # Alias de dev
npm run serve        # Solo servidor
npm run build        # Info sobre build
```

## 📚 Documentación

- `WATERMELON_IMPLEMENTATION_PLAN.md` - Plan de implementación
- `frontend/WATERMELON_COMPONENTS_GUIDE.md` - API de componentes
- `frontend/watermelon-demo.html` - Demo interactivo

## 👥 Equipo

- Pedro José Narváez Flores - Backend & API
- Ernesto Guillermo Hernández Ocón - Frontend & UX
- Dylan Ernesto Mollinedo Sánchez - Database & QA

## 📅 Timeline

Proyecto Universitario - Semestre 5 (12 semanas)

---

**Diseño Scandinavian | Accesibilidad WCAG AA | Responsive Mobile-First**
