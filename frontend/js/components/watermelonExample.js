/**
 * Watermelon UI Components - Integration Example
 * Shows how to use all components together
 */

import { ContinuousTabs } from './continuousTabs.js';
import { MorphingDiscoveryBar } from './morphingDiscoveryBar.js';
import { AlertSystem } from './alerts.js';
import { Dropdown } from './dropdown.js';
import { Disclosure } from './disclosure.js';
import { Popover } from './popover.js';

class PrecionautaWatermelon {
  constructor() {
    this.alerts = new AlertSystem({
      duration: 4000,
      maxAlerts: 5,
      position: 'top-right'
    });

    this.initializeTabs();
    this.initializeSearchBar();
    this.initializeFilters();
    this.initializeAccordions();
    this.initializePopovers();
  }

  // ============================================================================
  // 1. CONTINUOUS TABS - Category Navigation
  // ============================================================================
  initializeTabs() {
    const categories = [
      { name: 'Electrónica', label: '💻 Tecnología', badge: 42 },
      { name: 'Hogar', label: '🏠 Hogar', badge: 28 },
      { name: 'Moda', label: '👕 Moda', badge: 15 },
      { name: 'Deporte', label: '⚽ Deporte', badge: 8 },
      { name: 'Libros', label: '📚 Libros', badge: 12 },
      { name: 'Mascotas', label: '🐾 Mascotas', badge: 5 },
    ];

    const tabs = new ContinuousTabs('category-tabs', {
      tabs: categories,
      activeIndex: 0,
      onTabChange: (data) => {
        console.log('Category changed:', data.tab.name);
        this.alerts.info(`Mostrando ofertas de ${data.tab.label}`);
        this.loadDeals(data.tab.name);
      }
    });

    window.categoryTabs = tabs;
  }

  // ============================================================================
  // 2. MORPHING DISCOVERY BAR - Advanced Search
  // ============================================================================
  initializeSearchBar() {
    const suggestions = [
      'iPhone 15 Pro',
      'MacBook Air',
      'Samsung TV 55"',
      'Laptop Gamer',
      'Auriculares Bluetooth',
      'Tablet',
      'Cámara Digital',
      'Monitor 4K',
      'Teclado Mecánico',
      'Mouse Inalámbrico'
    ];

    const searchBar = new MorphingDiscoveryBar('search-container', {
      placeholder: 'Buscar productos, tiendas o categorías…',
      suggestions: suggestions,
      onSearch: (query) => {
        console.log('Search query:', query);
        this.searchProducts(query);
      }
    });

    // Listen for filter toggle
    document.getElementById('search-container')?.addEventListener('filters-toggle', (e) => {
      console.log('Filters toggled:', e.detail);
      this.toggleFiltersPanel();
    });

    window.searchBar = searchBar;
  }

  // ============================================================================
  // 3. DROPDOWN FILTERS
  // ============================================================================
  initializeFilters() {
    // Category Dropdown
    const categoryDropdown = new Dropdown('category-dropdown', {
      placeholder: 'Todas las categorías',
      items: [
        { label: '📱 Tecnología' },
        { label: '🏠 Hogar' },
        { label: '👕 Moda' },
        { label: '⚽ Deporte' },
        { label: '📚 Libros' },
      ],
      onSelect: (data) => {
        console.log('Category selected:', data.item);
        this.alerts.info(`Filtrando por: ${data.item.label}`);
      }
    });

    // Store Dropdown
    const storeDropdown = new Dropdown('store-dropdown', {
      placeholder: 'Todas las tiendas',
      items: [
        { label: 'Amazon México' },
        { label: 'Mercado Libre' },
        { label: 'Liverpool' },
        { label: 'Walmart' },
      ],
      onSelect: (data) => {
        console.log('Store selected:', data.item);
        this.alerts.info(`Filtrando por: ${data.item.label}`);
      }
    });

    // Sort Dropdown
    const sortDropdown = new Dropdown('sort-dropdown', {
      placeholder: 'Ordenar por',
      items: [
        { label: 'Mayor descuento' },
        { label: 'Más recientes' },
        { label: 'Precio: menor a mayor' },
        { label: 'Precio: mayor a menor' },
        { label: 'Mejor calificación' },
      ],
      selectedIndex: 0,
      onSelect: (data) => {
        console.log('Sort selected:', data.item);
      }
    });

    // Discount Filter Checkboxes
    this.setupCheckboxFilters();

    // Stock Toggle Switch
    this.setupStockToggle();

    window.filterDropdowns = {
      category: categoryDropdown,
      store: storeDropdown,
      sort: sortDropdown
    };
  }

  setupCheckboxFilters() {
    const discountFilters = document.querySelectorAll('[data-discount-filter]');

    discountFilters.forEach(filter => {
      filter.addEventListener('change', (e) => {
        const discount = e.target.dataset.discountFilter;
        if (e.target.checked) {
          this.alerts.info(`Mostrando ofertas con +${discount}% descuento`);
        }
      });
    });
  }

  setupStockToggle() {
    const stockToggle = document.querySelector('[data-stock-toggle]');
    if (stockToggle) {
      stockToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.alerts.success('Mostrando solo productos en stock');
        }
      });
    }
  }

  // ============================================================================
  // 4. ACCORDION / DISCLOSURE - Policies & Details
  // ============================================================================
  initializeAccordions() {
    // Footer Accordion - Policies
    const policyAccordion = new Disclosure('policy-accordion', {
      allowMultiple: true,
      items: [
        {
          title: '📋 Política de Privacidad',
          content: 'Precionauta respeta tu privacidad. Tus datos personales se procesan únicamente para mejorar tu experiencia...'
        },
        {
          title: '🍪 Política de Cookies',
          content: 'Utilizamos cookies para personalizar contenido, analizar tráfico y mejorar tu experiencia en el sitio. Puedes controlar tus preferencias en cualquier momento...'
        },
        {
          title: '↩️ Política de Reembolsos',
          content: 'Los reembolsos se procesan según las políticas de cada tienda (Amazon, Mercado Libre, etc.). Precionauta no es responsable directo por las transacciones...'
        },
        {
          title: '📞 Términos de Servicio',
          content: 'Al usar Precionauta, aceptas nuestros términos y condiciones. El servicio es gratuito y se proporciona "tal cual"...'
        },
      ],
      onToggle: (data) => {
        console.log('Accordion toggled:', data);
      }
    });

    // Deal Details Accordion
    const detailAccordion = new Disclosure('deal-details-accordion', {
      allowMultiple: true,
      items: [
        {
          title: '📊 Historial de Precio',
          content: '<canvas id="price-history-chart" width="300" height="150"></canvas>'
        },
        {
          title: '🔍 Detalles de la Oferta',
          content: '<ul><li>Precio original: $1,299.99</li><li>Precio actual: $299.99</li><li>Descuento: 77%</li><li>Vendedor: Amazon Directo</li></ul>'
        },
        {
          title: '⭐ Opiniones',
          content: 'Este producto tiene 4.5 estrellas en 1,250 reseñas. Los usuarios lo recomiendan altamente por su relación precio-calidad.'
        },
      ]
    });

    window.disclosures = {
      policies: policyAccordion,
      details: detailAccordion
    };
  }

  // ============================================================================
  // 5. POPOVERS - Explanatory Tooltips
  // ============================================================================
  initializePopovers() {
    // Discount Percentage Popover
    const discountPopover = new Popover('discount-info', {
      position: 'top',
      content: `
        <strong>¿Cómo calculamos el descuento?</strong>
        <p>El porcentaje de descuento se calcula como:</p>
        <code>(Original - Actual) / Original × 100</code>
        <p>Comparamos con el historial de precio para detectar "ofertas falsas".</p>
      `
    });

    // Price History Popover
    const historyPopover = new Popover('price-history-info', {
      position: 'top',
      content: 'Mostramos los últimos 90 días del historial de precio para que verifiques si esta es realmente una buena oferta.'
    });

    window.popovers = {
      discount: discountPopover,
      history: historyPopover
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  loadDeals(category) {
    console.log(`Loading deals for ${category}`);
    // This would fetch deals from your API
  }

  searchProducts(query) {
    console.log(`Searching for: ${query}`);
    // This would search your API
  }

  toggleFiltersPanel() {
    const panel = document.querySelector('[data-filters-panel]');
    if (panel) {
      panel.classList.toggle('is-open');
      this.alerts.info('Filtros avanzados');
    }
  }

  // Alert demo methods
  showSuccessExample() {
    this.alerts.success('¡Oferta agregada a favoritos!', '¡Éxito!');
  }

  showErrorExample() {
    this.alerts.error('No pudimos obtener el precio actualizado', 'Error');
  }

  showWarningExample() {
    this.alerts.warning('Solo quedan 2 items en stock', 'Advertencia');
  }

  showInfoExample() {
    this.alerts.info('Esta oferta expira en 2 horas', 'Información');
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.precionauta = new PrecionautaWatermelon();
  });
} else {
  window.precionauta = new PrecionautaWatermelon();
}

export { PrecionautaWatermelon };
