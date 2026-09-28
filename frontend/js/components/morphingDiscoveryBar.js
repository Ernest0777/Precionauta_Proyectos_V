/**
 * Morphing Discovery Bar Component
 * Inspired by Watermelon UI - búsqueda con sugerencias en vivo.
 *
 * suggestions: string[] | { label, meta?, badge?, href?, iconHtml?, tone?, keywords? }[]
 * onSearch(query, { submit }): se llama al escribir (submit:false, con debounce)
 * y al presionar Enter o el botón (submit:true).
 */

class MorphingDiscoveryBar {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.placeholder = options.placeholder || "Buscar productos, tiendas o categorías…";
    this.onSearch = options.onSearch || null;
    this.suggestions = (options.suggestions || []).map((s) => (typeof s === "string" ? { label: s } : s));
    this.searchMinLength = options.searchMinLength ?? 2;
    this.debounceTime = options.debounceTime ?? 180;
    this.maxResults = options.maxResults ?? 6;

    if (!this.container) {
      console.error(`Container with id "${containerId}" not found`);
      return;
    }

    this.debounceTimer = null;
    this.highlighted = -1;
    this.results = [];
    this.render();
    this.setupEventListeners();
  }

  render() {
    this.container.innerHTML = `
      <form class="morphing-discovery-bar" role="search" autocomplete="off">
        <div class="discovery-bar-container">
          <svg class="discovery-bar-icon" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
            <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/>
          </svg>
          <input
            type="search"
            class="discovery-bar-input"
            placeholder="${this.placeholder}"
            aria-label="Buscar en Precionauta"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="false"
            aria-controls="discoverySuggestions"
          />
          <button type="submit" class="discovery-bar-action" aria-label="Buscar">
            <svg viewBox="0 0 256 256" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z"/>
            </svg>
          </button>
        </div>
        <div class="discovery-bar-suggestions" id="discoverySuggestions" role="listbox" aria-label="Sugerencias"></div>
      </form>
    `;

    this.form = this.container.querySelector("form");
    this.input = this.container.querySelector(".discovery-bar-input");
    this.suggestionsContainer = this.container.querySelector(".discovery-bar-suggestions");
  }

  setupEventListeners() {
    this.input.addEventListener("input", () => this.handleInput());
    this.input.addEventListener("focus", () => {
      if (this.getValue().length >= this.searchMinLength) this.showSuggestions();
    });
    this.input.addEventListener("keydown", (e) => this.handleKeydown(e));
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const active = this.results[this.highlighted];
      if (active?.href) {
        window.location.href = active.href;
        return;
      }
      this.hideSuggestions();
      this.onSearch?.(this.getValue(), { submit: true });
    });
    document.addEventListener("pointerdown", (e) => {
      if (!this.container.contains(e.target)) this.hideSuggestions();
    });
  }

  handleInput() {
    const query = this.getValue();
    clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      if (query.length >= this.searchMinLength) {
        this.updateSuggestions(query);
        this.showSuggestions();
      } else {
        this.hideSuggestions();
      }
      this.onSearch?.(query, { submit: false });
    }, this.debounceTime);
  }

  handleKeydown(e) {
    if (!this.isOpen() || this.results.length === 0) {
      if (e.key === "Escape") this.hideSuggestions();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      const count = this.results.length;
      // Posiciones -1 (el input) .. count-1, en ciclo.
      this.setHighlighted(((this.highlighted + 1 + step + count + 1) % (count + 1)) - 1);
    } else if (e.key === "Escape") {
      this.hideSuggestions();
    }
  }

  setHighlighted(index) {
    this.highlighted = index;
    const options = this.suggestionsContainer.querySelectorAll(".discovery-suggestion");
    options.forEach((opt, i) => {
      opt.classList.toggle("is-highlighted", i === index);
      opt.setAttribute("aria-selected", String(i === index));
    });
    if (index >= 0) this.input.setAttribute("aria-activedescendant", options[index].id);
    else this.input.removeAttribute("aria-activedescendant");
  }

  matches(suggestion, query) {
    const haystack = `${suggestion.label} ${suggestion.keywords ?? ""}`;
    return normalize(haystack).includes(normalize(query));
  }

  updateSuggestions(query) {
    this.results = this.suggestions.filter((s) => this.matches(s, query)).slice(0, this.maxResults);
    this.highlighted = -1;

    if (this.results.length === 0) {
      this.suggestionsContainer.innerHTML = `
        <div class="discovery-suggestions__empty">
          <strong>Sin coincidencias para «${escapeHtml(query)}»</strong>
          Prueba con «audífonos», «hogar» o «Liverpool».
        </div>
      `;
      return;
    }

    this.suggestionsContainer.innerHTML = `
      <p class="discovery-suggestions__head">Ofertas que coinciden</p>
      ${this.results
        .map(
          (s, i) => `
        <a
          class="discovery-suggestion"
          id="discovery-option-${i}"
          role="option"
          aria-selected="false"
          href="${s.href ?? "#"}"
          ${s.tone ? `data-tone="${s.tone}"` : ""}
          data-index="${i}"
        >
          ${s.iconHtml ? `<span class="discovery-suggestion__icon" aria-hidden="true">${s.iconHtml}</span>` : ""}
          <span class="discovery-suggestion__text">
            <span class="discovery-suggestion__label">${highlight(s.label, query)}</span>
            ${s.meta ? `<span class="discovery-suggestion__meta">${escapeHtml(s.meta)}</span>` : ""}
          </span>
          ${s.badge ? `<span class="discovery-suggestion__discount">${escapeHtml(s.badge)}</span>` : ""}
        </a>
      `
        )
        .join("")}
    `;

    this.suggestionsContainer.querySelectorAll(".discovery-suggestion").forEach((el) => {
      el.addEventListener("click", (e) => {
        const s = this.results[Number(el.dataset.index)];
        if (!s.href) {
          e.preventDefault();
          this.selectSuggestion(s.label);
        }
      });
    });
  }

  selectSuggestion(text) {
    this.input.value = text;
    this.hideSuggestions();
    this.onSearch?.(text, { submit: true });
  }

  isOpen() {
    return this.suggestionsContainer.classList.contains("is-open");
  }

  showSuggestions() {
    if (!this.suggestionsContainer.innerHTML.trim()) return;
    this.suggestionsContainer.classList.add("is-open");
    this.input.setAttribute("aria-expanded", "true");
  }

  hideSuggestions() {
    this.suggestionsContainer.classList.remove("is-open");
    this.input.setAttribute("aria-expanded", "false");
    this.setHighlighted(-1);
  }

  setSuggestions(suggestions) {
    this.suggestions = suggestions.map((s) => (typeof s === "string" ? { label: s } : s));
  }

  setValue(value) {
    this.input.value = value;
  }

  clear() {
    this.input.value = "";
    this.hideSuggestions();
  }

  getValue() {
    return this.input.value.trim();
  }
}

function normalize(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** Resalta la coincidencia sin romper acentos: busca sobre el texto normalizado, corta sobre el original. */
function highlight(label, query) {
  const start = normalize(label).indexOf(normalize(query));
  if (start === -1 || !query) return escapeHtml(label);
  const end = start + query.length;
  return `${escapeHtml(label.slice(0, start))}<mark>${escapeHtml(label.slice(start, end))}</mark>${escapeHtml(label.slice(end))}`;
}

export { MorphingDiscoveryBar, normalize };
