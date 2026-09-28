/**
 * Alert/Toast System
 * Inspired by Watermelon UI - Toast notifications
 */

class AlertSystem {
  constructor(options = {}) {
    this.container = this.createContainer();
    this.duration = options.duration || 4000;
    this.maxAlerts = options.maxAlerts || 5;
    this.position = options.position || 'top-right';
    this.alerts = [];

    this.applyPosition();
  }

  createContainer() {
    let container = document.querySelector('.alert-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'alert-container';
      document.body.appendChild(container);
    }
    return container;
  }

  applyPosition() {
    const classMap = {
      'top-right': 'alert-container--top-right',
      'top-left': 'alert-container--top-left',
      'bottom-right': 'alert-container--bottom-right',
      'bottom-left': 'alert-container--bottom-left',
      'top-center': 'alert-container--top-center',
    };

    if (classMap[this.position]) {
      this.container.classList.add(classMap[this.position]);
    }
  }

  show(message, type = 'info', title = null) {
    if (this.alerts.length >= this.maxAlerts) {
      this.alerts.shift()?.remove?.();
    }

    const alert = this.createAlert(message, type, title);
    this.container.appendChild(alert);
    this.alerts.push(alert);

    // Auto remove
    setTimeout(() => {
      this.remove(alert);
    }, this.duration);

    return alert;
  }

  createAlert(message, type, title) {
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.setAttribute('role', 'alert');

    alert.innerHTML = `
      <div class="alert-icon">${icons[type] || icons.info}</div>
      <div class="alert-content">
        ${title ? `<div class="alert-title">${title}</div>` : ''}
        <div class="alert-message">${message}</div>
      </div>
      <button class="alert-close" aria-label="Cerrar notificación">
        <svg viewBox="0 0 256 256" fill="currentColor" width="16" height="16">
          <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/>
        </svg>
      </button>
    `;

    const closeBtn = alert.querySelector('.alert-close');
    closeBtn.addEventListener('click', () => this.remove(alert));

    return alert;
  }

  remove(alert) {
    alert.style.animation = 'slideOutAlert 200ms ease-in forwards';
    setTimeout(() => {
      alert.remove();
      this.alerts = this.alerts.filter(a => a !== alert);
    }, 200);
  }

  success(message, title = '¡Éxito!') {
    return this.show(message, 'success', title);
  }

  error(message, title = 'Error') {
    return this.show(message, 'error', title);
  }

  warning(message, title = 'Advertencia') {
    return this.show(message, 'warning', title);
  }

  info(message, title = 'Información') {
    return this.show(message, 'info', title);
  }

  clear() {
    this.alerts.forEach(alert => alert.remove());
    this.alerts = [];
  }
}

// CSS Animation for slide out
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes slideOutAlert {
    to {
      opacity: 0;
      transform: translateX(100%);
    }
  }
`;
document.head.appendChild(styleSheet);

export { AlertSystem };
