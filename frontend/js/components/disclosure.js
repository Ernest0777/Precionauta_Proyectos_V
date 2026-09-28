/**
 * Disclosure / Accordion Component
 * Inspired by Watermelon UI
 */

class Disclosure {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.items = options.items || [];
    this.allowMultiple = options.allowMultiple !== undefined ? options.allowMultiple : false;
    this.onToggle = options.onToggle || null;

    if (!this.container) {
      console.error(`Container with id "${containerId}" not found`);
      return;
    }

    this.openItems = new Set();
    this.render();
    this.setupEventListeners();
  }

  render() {
    const itemsHTML = this.items
      .map((item, index) => `
        <div class="disclosure-item" data-disclosure-index="${index}">
          <button
            class="disclosure-trigger ${this.openItems.has(index) ? 'is-open' : ''}"
            aria-expanded="${this.openItems.has(index)}"
            aria-controls="disclosure-${index}"
          >
            <span>${item.title}</span>
            <div class="disclosure-icon" aria-hidden="true">
              <svg viewBox="0 0 256 256" fill="currentColor" width="20" height="20">
                <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,58.34,90.34L128,160l69.66-69.66a8,8,0,0,1,11.32,11.32Z"/>
              </svg>
            </div>
          </button>
          <div
            class="disclosure-content ${this.openItems.has(index) ? 'is-open' : ''}"
            id="disclosure-${index}"
            role="region"
            aria-labelledby="disclosure-${index}-trigger"
          >
            <div class="disclosure-text">${item.content}</div>
          </div>
        </div>
      `)
      .join('');

    this.container.innerHTML = `<div class="disclosure-container">${itemsHTML}</div>`;
  }

  setupEventListeners() {
    const triggers = this.container.querySelectorAll('.disclosure-trigger');

    triggers.forEach((trigger, index) => {
      trigger.addEventListener('click', () => this.toggle(index));
      trigger.addEventListener('keydown', (e) => this.handleKeydown(e, index));
    });
  }

  toggle(index) {
    if (this.openItems.has(index)) {
      this.close(index);
    } else {
      if (!this.allowMultiple) {
        this.openItems.forEach(i => this.close(i));
      }
      this.open(index);
    }
  }

  open(index) {
    this.openItems.add(index);
    this.updateUI(index);

    if (this.onToggle) {
      this.onToggle({
        index,
        isOpen: true,
        item: this.items[index]
      });
    }
  }

  close(index) {
    this.openItems.delete(index);
    this.updateUI(index);

    if (this.onToggle) {
      this.onToggle({
        index,
        isOpen: false,
        item: this.items[index]
      });
    }
  }

  updateUI(index) {
    const item = this.container.querySelector(`[data-disclosure-index="${index}"]`);
    if (!item) return;

    const trigger = item.querySelector('.disclosure-trigger');
    const content = item.querySelector('.disclosure-content');
    const isOpen = this.openItems.has(index);

    trigger.classList.toggle('is-open', isOpen);
    trigger.setAttribute('aria-expanded', isOpen);
    content.classList.toggle('is-open', isOpen);
  }

  handleKeydown(e, index) {
    const triggersCount = this.items.length;
    let nextIndex = null;

    switch (e.key) {
      case 'ArrowDown':
        nextIndex = (index + 1) % triggersCount;
        e.preventDefault();
        break;
      case 'ArrowUp':
        nextIndex = index === 0 ? triggersCount - 1 : index - 1;
        e.preventDefault();
        break;
      case 'Home':
        nextIndex = 0;
        e.preventDefault();
        break;
      case 'End':
        nextIndex = triggersCount - 1;
        e.preventDefault();
        break;
    }

    if (nextIndex !== null) {
      const triggers = this.container.querySelectorAll('.disclosure-trigger');
      triggers[nextIndex].focus();
    }
  }

  openAll() {
    if (this.allowMultiple) {
      this.items.forEach((_, index) => this.open(index));
    }
  }

  closeAll() {
    this.items.forEach((_, index) => this.close(index));
  }

  getOpenItems() {
    return Array.from(this.openItems).map(index => ({
      index,
      item: this.items[index]
    }));
  }

  addItem(item) {
    this.items.push(item);
    this.render();
    this.setupEventListeners();
  }

  removeItem(index) {
    if (index >= 0 && index < this.items.length) {
      this.items.splice(index, 1);
      this.openItems.delete(index);
      this.render();
      this.setupEventListeners();
    }
  }
}

export { Disclosure };
