/**
 * Dropdown Menu Component
 * Inspired by Watermelon UI
 */

class Dropdown {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.items = options.items || [];
    this.onSelect = options.onSelect || null;
    this.placeholder = options.placeholder || 'Seleccionar';
    this.selectedIndex = options.selectedIndex !== undefined ? options.selectedIndex : -1;

    if (!this.container) {
      console.error(`Container with id "${containerId}" not found`);
      return;
    }

    this.isOpen = false;
    this.render();
    this.setupEventListeners();
  }

  render() {
    const selectedLabel = this.selectedIndex >= 0 && this.items[this.selectedIndex]
      ? this.items[this.selectedIndex].label
      : this.placeholder;

    this.container.innerHTML = `
      <div class="dropdown-container">
        <button class="dropdown-trigger" aria-haspopup="listbox" aria-expanded="false">
          <span>${selectedLabel}</span>
          <div class="dropdown-arrow">
            <svg viewBox="0 0 256 256" fill="currentColor" width="16" height="16">
              <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,58.34,90.34L128,160l69.66-69.66a8,8,0,0,1,11.32,11.32Z"/>
            </svg>
          </div>
        </button>
        <div class="dropdown-menu" role="listbox">
          ${this.items.map((item, index) => `
            <button
              class="dropdown-item ${index === this.selectedIndex ? 'is-selected' : ''}"
              role="option"
              aria-selected="${index === this.selectedIndex}"
              data-index="${index}"
            >
              <span>${item.label}</span>
              ${index === this.selectedIndex ? `
                <span class="dropdown-item-checkmark">
                  <svg viewBox="0 0 256 256" fill="currentColor" width="16" height="16">
                    <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-64-64a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/>
                  </svg>
                </span>
              ` : ''}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    this.trigger = this.container.querySelector('.dropdown-trigger');
    this.menu = this.container.querySelector('.dropdown-menu');
  }

  setupEventListeners() {
    this.trigger.addEventListener('click', () => this.toggle());

    const items = this.container.querySelectorAll('.dropdown-item');
    items.forEach((item, index) => {
      item.addEventListener('click', () => this.selectItem(index));
      item.addEventListener('keydown', (e) => this.handleKeydown(e, index));
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        this.close();
      }
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
        this.trigger.focus();
      }
    });
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.isOpen = true;
    this.menu.classList.add('is-open');
    this.trigger.classList.add('is-open');
    this.trigger.setAttribute('aria-expanded', 'true');

    // Focus first item
    const firstItem = this.container.querySelector('.dropdown-item');
    if (firstItem) {
      setTimeout(() => firstItem.focus(), 50);
    }
  }

  close() {
    this.isOpen = false;
    this.menu.classList.remove('is-open');
    this.trigger.classList.remove('is-open');
    this.trigger.setAttribute('aria-expanded', 'false');
  }

  selectItem(index) {
    this.selectedIndex = index;
    this.render();
    this.setupEventListeners();
    this.close();

    if (this.onSelect) {
      this.onSelect({
        index,
        item: this.items[index]
      });
    }
  }

  handleKeydown(e, index) {
    const itemsCount = this.items.length;
    let nextIndex = null;

    switch (e.key) {
      case 'ArrowDown':
        nextIndex = (index + 1) % itemsCount;
        e.preventDefault();
        break;
      case 'ArrowUp':
        nextIndex = index === 0 ? itemsCount - 1 : index - 1;
        e.preventDefault();
        break;
      case 'Home':
        nextIndex = 0;
        e.preventDefault();
        break;
      case 'End':
        nextIndex = itemsCount - 1;
        e.preventDefault();
        break;
      case 'Enter':
      case ' ':
        this.selectItem(index);
        e.preventDefault();
        return;
    }

    if (nextIndex !== null) {
      const items = this.container.querySelectorAll('.dropdown-item');
      items[nextIndex].focus();
    }
  }

  setItems(items) {
    this.items = items;
    this.selectedIndex = -1;
    this.render();
    this.setupEventListeners();
  }

  getSelected() {
    if (this.selectedIndex >= 0) {
      return {
        index: this.selectedIndex,
        item: this.items[this.selectedIndex]
      };
    }
    return null;
  }
}

export { Dropdown };
