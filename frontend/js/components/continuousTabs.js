/**
 * Continuous Tabs Component
 * Inspired by Watermelon UI - una píldora indicadora que se desliza detrás
 * de la pestaña activa (y toma el tono de su categoría vía data-tone).
 *
 * tab: { name, label?, slug?, tone?, iconHtml?, icon?, badge? }
 */

class ContinuousTabs {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.tabs = options.tabs || [];
    this.activeIndex = options.activeIndex || 0;
    this.onTabChange = options.onTabChange || null;
    this.ariaLabel = options.ariaLabel || "Categorías de productos";
    this.controls = options.controls || null;

    if (!this.container) {
      console.error(`Container with id "${containerId}" not found`);
      return;
    }

    this.render();
    this.setupEventListeners();
  }

  render() {
    const tabsHTML = this.tabs
      .map((tab, index) => {
        const isActive = index === this.activeIndex;
        const iconMarkup = tab.iconHtml ?? tab.icon ?? "";
        return `
        <button
          type="button"
          role="tab"
          class="continuous-tab ${isActive ? "is-active" : ""}"
          data-tab-index="${index}"
          ${tab.tone ? `data-tone="${tab.tone}"` : ""}
          aria-selected="${isActive}"
          tabindex="${isActive ? 0 : -1}"
          ${this.controls ? `aria-controls="${this.controls}"` : ""}
        >
          ${iconMarkup ? `<span class="tab-icon" aria-hidden="true">${iconMarkup}</span>` : ""}
          <span class="tab-label">${tab.label || tab.name}</span>
          ${tab.badge != null ? `<span class="tab-badge" aria-label="${tab.badge} ofertas">${tab.badge}</span>` : ""}
        </button>
      `;
      })
      .join("");

    this.container.innerHTML = `
      <div class="continuous-tabs-wrapper">
        <div class="continuous-tabs-scroll" role="tablist" aria-label="${this.ariaLabel}">
          <span class="continuous-tabs-indicator is-instant" aria-hidden="true"></span>
          ${tabsHTML}
        </div>
      </div>
    `;

    this.scrollContainer = this.container.querySelector(".continuous-tabs-scroll");
    this.indicator = this.container.querySelector(".continuous-tabs-indicator");
    this.buttons = [...this.container.querySelectorAll(".continuous-tab")];
    this.updateIndicator();
    // Primer posicionamiento sin animación; a partir de ahí, se desliza.
    requestAnimationFrame(() => this.indicator?.classList.remove("is-instant"));
  }

  setupEventListeners() {
    this.buttons.forEach((button, index) => {
      button.addEventListener("click", () => this.setActive(index));
      button.addEventListener("keydown", (e) => this.handleKeydown(e, index));
    });

    // Las fuentes web cambian el ancho de las pestañas al cargar.
    document.fonts?.ready.then(() => this.updateIndicator());
    if ("ResizeObserver" in window) {
      new ResizeObserver(() => this.updateIndicator()).observe(this.scrollContainer);
    }
  }

  /** @param {{ silent?: boolean, focus?: boolean }} [opts] silent: no dispara onTabChange (sincronía externa). */
  setActive(index, { silent = false, focus = false } = {}) {
    if (index < 0 || index >= this.tabs.length) return;

    const previousIndex = this.activeIndex;
    this.activeIndex = index;

    this.buttons.forEach((btn, i) => {
      const isActive = i === index;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
      btn.tabIndex = isActive ? 0 : -1;
    });

    const activeButton = this.buttons[index];
    if (focus) activeButton.focus();

    // Solo desplaza la fila de pestañas, nunca la página.
    const target = activeButton.offsetLeft - (this.scrollContainer.clientWidth - activeButton.offsetWidth) / 2;
    this.scrollContainer.scrollTo({ left: Math.max(target, 0), behavior: "smooth" });

    this.updateIndicator();

    if (!silent && this.onTabChange && index !== previousIndex) {
      this.onTabChange({ index, previousIndex, tab: this.tabs[index] });
    }
  }

  setActiveBy(predicate, opts) {
    const index = this.tabs.findIndex(predicate);
    if (index !== -1) this.setActive(index, opts);
  }

  updateIndicator() {
    const activeButton = this.buttons?.[this.activeIndex];
    if (!activeButton || !this.indicator) return;
    this.indicator.style.width = `${activeButton.offsetWidth}px`;
    this.indicator.style.transform = `translateX(${activeButton.offsetLeft}px)`;
    const tone = activeButton.dataset.tone;
    if (tone) this.indicator.dataset.tone = tone;
    else delete this.indicator.dataset.tone;
  }

  handleKeydown(e, index) {
    const last = this.tabs.length - 1;
    const map = {
      ArrowRight: Math.min(index + 1, last),
      ArrowLeft: Math.max(index - 1, 0),
      Home: 0,
      End: last,
    };
    if (map[e.key] === undefined) return;
    e.preventDefault();
    this.setActive(map[e.key], { focus: true });
  }

  getActive() {
    return { index: this.activeIndex, tab: this.tabs[this.activeIndex] };
  }
}

export { ContinuousTabs };
