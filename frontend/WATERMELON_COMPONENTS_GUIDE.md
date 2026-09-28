# 🍉 Watermelon UI Components Integration Guide

## Overview

Este documento explica cómo integrar los componentes de Watermelon UI adaptados a tu proyecto Precionauta.

**Archivos creados:**
- `css/components-watermelon.css` - Todos los estilos (1400+ líneas)
- `js/components/continuousTabs.js` - Tabs con indicador animado
- `js/components/morphingDiscoveryBar.js` - Búsqueda avanzada con sugerencias
- `js/components/alerts.js` - Sistema de notificaciones Toast
- `js/components/dropdown.js` - Menú desplegable accesible
- `js/components/disclosure.js` - Accordion/Disclosure
- `js/components/popover.js` - Popovers flotantes
- `js/components/watermelonExample.js` - Ejemplo de integración completa

---

## 📋 Paso 1: Incluir CSS

En tu HTML (en `<head>`), después de tus CSS actuales:

```html
<link rel="stylesheet" href="css/components-watermelon.css" />
```

---

## 📦 Paso 2: Importar Componentes

Cada componente es un módulo ES6. Hay dos formas de usar:

### Opción A: Con tipo="module" en el HTML

```html
<script type="module" src="js/components/watermelonExample.js"></script>
```

### Opción B: Importar en tu main.js

```javascript
// frontend/js/main.js
import { ContinuousTabs } from './components/continuousTabs.js';
import { MorphingDiscoveryBar } from './components/morphingDiscoveryBar.js';
import { AlertSystem } from './components/alerts.js';
import { Dropdown } from './components/dropdown.js';
import { Disclosure } from './components/disclosure.js';
import { Popover } from './components/popover.js';
```

---

## 🎯 Paso 3: Uso Individual de Componentes

### 1. **Continuous Tabs** (Navegación de Categorías)

**HTML:**
```html
<div id="category-tabs"></div>
```

**JavaScript:**
```javascript
import { ContinuousTabs } from './components/continuousTabs.js';

const tabs = new ContinuousTabs('category-tabs', {
  tabs: [
    { name: 'Tecnología', label: '💻 Tecnología', badge: 42 },
    { name: 'Hogar', label: '🏠 Hogar', badge: 28 },
    { name: 'Moda', label: '👕 Moda' },
  ],
  activeIndex: 0,
  onTabChange: (data) => {
    console.log('Tab changed:', data.tab.name);
    loadDeals(data.tab.name);
  }
});

// Métodos disponibles:
tabs.setActive(1);
tabs.getActive(); // { index: 1, tab: {...} }
tabs.addTab({ name: 'Nueva', label: 'Nueva Categoría' });
```

---

### 2. **Morphing Discovery Bar** (Búsqueda)

**HTML:**
```html
<div id="search-container"></div>
```

**JavaScript:**
```javascript
import { MorphingDiscoveryBar } from './components/morphingDiscoveryBar.js';

const searchBar = new MorphingDiscoveryBar('search-container', {
  placeholder: 'Buscar productos...',
  suggestions: [
    'iPhone 15 Pro',
    'MacBook Air',
    'Samsung TV'
  ],
  onSearch: (query) => {
    console.log('Search:', query);
    searchAPI(query);
  }
});

// Métodos:
searchBar.getValue(); // "texto actual"
searchBar.clear();
searchBar.setSuggestions(['nuevas', 'sugerencias']);
```

---

### 3. **Alert System** (Notificaciones)

**JavaScript:**
```javascript
import { AlertSystem } from './components/alerts.js';

const alerts = new AlertSystem({
  duration: 4000, // ms
  position: 'top-right' // 'top-left', 'bottom-right', etc.
});

// Mostrar alertas:
alerts.success('¡Guardado!', 'Éxito');
alerts.error('Ocurrió un error', 'Error');
alerts.warning('Advertencia importante', 'Advertencia');
alerts.info('Información', 'Info');

// O genérico:
alerts.show('Mensaje', 'success', 'Título');
```

---

### 4. **Dropdown Menu** (Filtros)

**HTML:**
```html
<div id="category-dropdown"></div>
```

**JavaScript:**
```javascript
import { Dropdown } from './components/dropdown.js';

const dropdown = new Dropdown('category-dropdown', {
  placeholder: 'Seleccionar categoría',
  items: [
    { label: 'Tecnología' },
    { label: 'Hogar' },
    { label: 'Moda' },
  ],
  selectedIndex: 0,
  onSelect: (data) => {
    console.log('Selected:', data.item);
  }
});

// Métodos:
dropdown.getSelected(); // { index: 0, item: {...} }
dropdown.setItems([...]); // Reemplazar items
```

---

### 5. **Disclosure / Accordion** (Políticas, Detalles)

**HTML:**
```html
<div id="policy-accordion"></div>
```

**JavaScript:**
```javascript
import { Disclosure } from './components/disclosure.js';

const accordion = new Disclosure('policy-accordion', {
  allowMultiple: true, // Si false, solo uno abierto
  items: [
    {
      title: '📋 Política de Privacidad',
      content: 'Contenido de la política...'
    },
    {
      title: '🍪 Cookies',
      content: 'Información sobre cookies...'
    },
  ],
  onToggle: (data) => {
    console.log('Item toggled:', data.index, data.isOpen);
  }
});

// Métodos:
accordion.openAll();
accordion.closeAll();
accordion.toggle(0);
accordion.getOpenItems(); // Array de items abiertos
accordion.addItem({ title: 'Nuevo', content: 'Contenido' });
```

---

### 6. **Popover** (Tooltips Flotantes)

**HTML:**
```html
<button id="discount-info">¿Cómo calculamos descuentos?</button>
```

**JavaScript:**
```javascript
import { Popover } from './components/popover.js';

const popover = new Popover('discount-info', {
  position: 'top', // 'top', 'bottom', 'left', 'right'
  content: `
    <strong>Descuento</strong>
    <p>Fórmula: (Original - Actual) / Original × 100</p>
  `,
  dismissOnClickOutside: true,
  dismissOnEscape: true
});

// Métodos:
popover.toggle();
popover.open();
popover.close();
popover.setContent('Nuevo contenido');
popover.destroy();
```

---

## 🎨 HTML de Integración Completa

```html
<!DOCTYPE html>
<html lang="es-MX">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Precionauta - Watermelon UI</title>
  
  <!-- CSS Base -->
  <link rel="stylesheet" href="css/tokens.css" />
  <link rel="stylesheet" href="css/base.css" />
  <link rel="stylesheet" href="css/layout.css" />
  <link rel="stylesheet" href="css/components.css" />
  
  <!-- CSS Watermelon -->
  <link rel="stylesheet" href="css/components-watermelon.css" />
</head>
<body>
  <!-- HEADER CON SEARCH Y TABS -->
  <header>
    <div class="container">
      <h1>Precionauta</h1>
      
      <!-- Morphing Discovery Bar -->
      <div id="search-container"></div>
    </div>
  </header>

  <!-- CONTINUOUS TABS -->
  <nav class="categories-nav">
    <div id="category-tabs"></div>
  </nav>

  <!-- FILTERS SECTION -->
  <aside data-filters-panel class="filters-panel">
    <h3>Filtros</h3>
    
    <!-- Dropdowns -->
    <div class="filter-group">
      <label>Categoría</label>
      <div id="category-dropdown"></div>
    </div>

    <div class="filter-group">
      <label>Tienda</label>
      <div id="store-dropdown"></div>
    </div>

    <!-- Checkboxes for Discount -->
    <div class="filter-group">
      <label>Rango de Descuento</label>
      <label class="checkbox-container">
        <input type="checkbox" data-discount-filter="70" class="checkbox-input" />
        <span class="checkbox-label">Más de 70%</span>
      </label>
      <label class="checkbox-container">
        <input type="checkbox" data-discount-filter="80" class="checkbox-input" />
        <span class="checkbox-label">Más de 80%</span>
      </label>
      <label class="checkbox-container">
        <input type="checkbox" data-discount-filter="90" class="checkbox-input" />
        <span class="checkbox-label">Más de 90%</span>
      </label>
    </div>

    <!-- Toggle for Stock -->
    <div class="filter-group">
      <label class="switch-container">
        <button class="switch-toggle" data-stock-toggle aria-label="Mostrar solo en stock"></button>
        <span class="switch-label">Solo en stock</span>
      </label>
    </div>

    <!-- Sort -->
    <div class="filter-group">
      <label>Ordenar por</label>
      <div id="sort-dropdown"></div>
    </div>
  </aside>

  <!-- MAIN CONTENT -->
  <main id="catalogo">
    <!-- Deal Cards Grid -->
    <div class="deals-grid">
      <!-- Cards aquí -->
    </div>
  </main>

  <!-- FOOTER CON ACCORDION -->
  <footer>
    <div id="policy-accordion"></div>
  </footer>

  <!-- Scripts -->
  <script type="module" src="js/components/watermelonExample.js"></script>
</body>
</html>
```

---

## 🎨 CSS personalización

Todos los estilos usan variables CSS que puedes override:

```css
:root {
  --color-primary: #1a3a52;       /* Color principal */
  --color-secondary: #4caf50;     /* Color secundario */
  --color-accent: #ff9800;        /* Color acento */
  --space-md: 16px;               /* Espaciado */
  --transition-base: 200ms;       /* Animaciones */
}
```

---

## 🌙 Dark Mode Automático

El CSS soporta dark mode automáticamente via `prefers-color-scheme`:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-white: #1e1e1e;
    --color-bg: #2a2a2a;
    /* ... etc */
  }
}
```

---

## ♿ Accesibilidad

Todos los componentes incluyen:
- ARIA labels y roles
- Navegación por teclado (arrows, Enter, Escape, Tab)
- Focus management
- Semantic HTML

---

## 🚀 Ejemplo Completo en Funcionamiento

Ver: `frontend/js/components/watermelonExample.js`

Este archivo inicializa todos los componentes y muestra cómo integrarlos:

```javascript
class PrecionautaWatermelon {
  constructor() {
    this.alerts = new AlertSystem();
    this.initializeTabs();
    this.initializeSearchBar();
    this.initializeFilters();
    this.initializeAccordions();
    this.initializePopovers();
  }
  // ...
}
```

---

## 📱 Responsive Design

Todos los componentes son responsive:
- Mobile (< 480px): Labels ocultos en tabs, layout apilado
- Tablet (480-768px): Ajustes de padding y font-size
- Desktop (> 768px): Layout completo

---

## 🔧 Troubleshooting

### Componentes no aparecen
1. Verifica que CSS esté incluido: `components-watermelon.css`
2. Verifica que JavaScript está en `<script type="module">`
3. Abre devtools (F12) y busca errores

### Estilos no aplican
- Revisa orden de CSS imports
- Verifica IDs de contenedores coincidan con JavaScript
- Limpia caché del navegador (Ctrl+Shift+Delete)

### Accesibilidad fallando
- Usa navegación por teclado (Tab, Arrows, Enter)
- Verifica con screen reader
- Todos los componentes incluyen ARIA labels

---

## 📚 Próximos Pasos

1. **Integrar en index.html** - Reemplaza search bar actual con MorphingDiscoveryBar
2. **Reemplazar tabs existentes** - Usa ContinuousTabs en lugar de categoryTabs.js
3. **Usar Alert system** - Reemplaza alertas manuales con AlertSystem
4. **Adaptaciones CSS** - Ajusta colores y spacing según diseño Scandinavian
5. **Testing** - Prueba en mobile, tablet, desktop
6. **Dark mode** - Verifica que funciona con `prefers-color-scheme`

---

## 📞 Contacto

Para preguntas sobre implementación, revisa:
- Código de ejemplo en `watermelonExample.js`
- Documentación en comentarios de cada componente
- Plan de implementación en proyecto root
