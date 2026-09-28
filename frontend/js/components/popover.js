/**
 * Popover Component
 * Inspired by Watermelon UI - Floating disclosure with smart positioning
 */

class Popover {
  constructor(triggerId, options = {}) {
    this.trigger = document.getElementById(triggerId);
    this.content = options.content || '';
    this.position = options.position || 'bottom'; // 'top', 'bottom', 'left', 'right'
    this.dismissOnClickOutside = options.dismissOnClickOutside !== undefined
      ? options.dismissOnClickOutside
      : true;
    this.dismissOnEscape = options.dismissOnEscape !== undefined
      ? options.dismissOnEscape
      : true;

    if (!this.trigger) {
      console.error(`Trigger with id "${triggerId}" not found`);
      return;
    }

    this.isOpen = false;
    this.popover = null;
    this.createPopover();
    this.setupEventListeners();
  }

  createPopover() {
    this.popover = document.createElement('div');
    this.popover.className = 'popover';
    this.popover.innerHTML = `
      <div class="popover-arrow"></div>
      <div class="popover-content">${this.content}</div>
    `;
    document.body.appendChild(this.popover);
  }

  setupEventListeners() {
    this.trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    this.trigger.addEventListener('mouseenter', () => {
      if (this.trigger.dataset.popoverTrigger === 'hover') {
        this.open();
      }
    });

    this.trigger.addEventListener('mouseleave', () => {
      if (this.trigger.dataset.popoverTrigger === 'hover') {
        setTimeout(() => {
          if (!this.popover.matches(':hover')) {
            this.close();
          }
        }, 100);
      }
    });

    if (this.dismissOnClickOutside) {
      document.addEventListener('click', (e) => {
        if (this.isOpen &&
            !this.trigger.contains(e.target) &&
            !this.popover.contains(e.target)) {
          this.close();
        }
      });
    }

    if (this.dismissOnEscape) {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.close();
          this.trigger.focus();
        }
      });
    }

    this.popover.addEventListener('mouseleave', () => {
      if (this.trigger.dataset.popoverTrigger === 'hover') {
        this.close();
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
    if (this.isOpen) return;

    this.isOpen = true;
    this.popover.classList.add('is-open');
    this.trigger.setAttribute('aria-expanded', 'true');
    this.position();
  }

  close() {
    if (!this.isOpen) return;

    this.isOpen = false;
    this.popover.classList.remove('is-open');
    this.trigger.setAttribute('aria-expanded', 'false');
  }

  position() {
    const triggerRect = this.trigger.getBoundingClientRect();
    const popoverRect = this.popover.getBoundingClientRect();

    const positions = {
      top: {
        top: triggerRect.top - popoverRect.height - 12,
        left: triggerRect.left + (triggerRect.width - popoverRect.width) / 2
      },
      bottom: {
        top: triggerRect.bottom + 12,
        left: triggerRect.left + (triggerRect.width - popoverRect.width) / 2
      },
      left: {
        top: triggerRect.top + (triggerRect.height - popoverRect.height) / 2,
        left: triggerRect.left - popoverRect.width - 12
      },
      right: {
        top: triggerRect.top + (triggerRect.height - popoverRect.height) / 2,
        left: triggerRect.right + 12
      }
    };

    let pos = positions[this.position];

    // Adjust for viewport boundaries
    const padding = 16;
    if (pos.left < padding) {
      pos.left = padding;
    } else if (pos.left + popoverRect.width > window.innerWidth - padding) {
      pos.left = window.innerWidth - popoverRect.width - padding;
    }

    if (pos.top < padding) {
      pos.top = padding;
    } else if (pos.top + popoverRect.height > window.innerHeight - padding) {
      pos.top = window.innerHeight - popoverRect.height - padding;
    }

    this.popover.style.top = `${pos.top}px`;
    this.popover.style.left = `${pos.left}px`;
  }

  setContent(content) {
    const contentEl = this.popover.querySelector('.popover-content');
    if (contentEl) {
      contentEl.innerHTML = content;
    }
    this.content = content;
  }

  destroy() {
    this.popover.remove();
    this.isOpen = false;
  }
}

export { Popover };
