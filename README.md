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
