/*
  SitSense — alert-popup.js
  --------------------------
  Sistem pop-up peringatan dengan 3 level warna (kuning, oranye, merah).
  
  API:
    showAlertPopup(level, title, message, actions?)
    hideAlertPopup()
    queueAlert(level, title, message, actions?)
*/

(function() {
  'use strict';

  const STATE = {
    isVisible: false,
    queue: [],
    currentPopup: null
  };

  const COLORS = {
    yellow: {
      name: 'yellow',
      class: 'alert-popup-yellow',
      icon: 'alert-triangle',
      gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
      bg: 'rgba(251, 191, 36, 0.1)',
      border: 'rgba(251, 191, 36, 0.3)',
      text: 'text-yellow-200'
    },
    orange: {
      name: 'orange',
      class: 'alert-popup-orange',
      icon: 'alert-circle',
      gradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
      bg: 'rgba(249, 115, 22, 0.1)',
      border: 'rgba(249, 115, 22, 0.3)',
      text: 'text-orange-200'
    },
    red: {
      name: 'red',
      class: 'alert-popup-red',
      icon: 'alert-octagon',
      gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
      bg: 'rgba(239, 68, 68, 0.1)',
      border: 'rgba(239, 68, 68, 0.3)',
      text: 'text-red-200'
    }
  };

  function getModal() {
    return document.getElementById('alertPopupModal');
  }

  function getContainer() {
    const modal = getModal();
    return modal ? modal.querySelector('.alert-popup-container') : null;
  }

  function applyColorScheme(level) {
    const color = COLORS[level] || COLORS.yellow;
    const container = getContainer();
    if (!container) return;

    // Remove all color classes
    container.classList.remove('alert-popup-yellow', 'alert-popup-orange', 'alert-popup-red');
    // Add current color class
    container.classList.add(color.class);

    // Update icon
    const iconEl = container.querySelector('.alert-popup-icon');
    if (iconEl) {
      iconEl.setAttribute('data-lucide', color.icon);
      if (window.lucide) window.lucide.createIcons();
    }

    // Update gradient background via style
    container.style.background = color.gradient;
    container.style.borderColor = color.border;
  }

  function showAlertPopup(level, title, message, actions) {
    const modal = getModal();
    if (!modal) {
      console.warn('[AlertPopup] Modal element not found');
      return;
    }

    // Validate level
    if (!COLORS[level]) {
      level = 'yellow';
    }

    // Update content
    const titleEl = document.getElementById('alertPopupTitle');
    const messageEl = document.getElementById('alertPopupMessage');
    const actionsEl = document.getElementById('alertPopupActions');

    if (titleEl) titleEl.textContent = title || 'Peringatan';
    if (messageEl) messageEl.textContent = message || '';

    // Apply color scheme
    applyColorScheme(level);

    // Setup actions
    if (actionsEl) {
      actionsEl.innerHTML = '';
      
      if (actions && Array.isArray(actions) && actions.length > 0) {
        actions.forEach((action, index) => {
          const btn = document.createElement('button');
          btn.className = index === 0 
            ? 'alert-popup-action-primary' 
            : 'alert-popup-action-secondary';
          btn.textContent = action.text || 'OK';
          btn.onclick = () => {
            if (typeof action.action === 'function') {
              action.action();
            }
            hideAlertPopup();
          };
          actionsEl.appendChild(btn);
        });
      } else {
        // Default action button
        const btn = document.createElement('button');
        btn.className = 'alert-popup-action-primary';
        btn.textContent = 'Mengerti';
        btn.onclick = hideAlertPopup;
        actionsEl.appendChild(btn);
      }
    }

    // Show modal
    STATE.isVisible = true;
    STATE.currentPopup = { level, title, message, actions };
    
    if (modal.showModal) {
      modal.showModal();
    } else {
      // Fallback for browsers without dialog support
      modal.classList.add('alert-popup-visible');
      document.body.style.overflow = 'hidden';
    }

    // Auto-focus on primary button
    setTimeout(() => {
      const primaryBtn = actionsEl?.querySelector('.alert-popup-action-primary');
      if (primaryBtn) primaryBtn.focus();
    }, 100);

    // Dispatch event
    document.dispatchEvent(new CustomEvent('sitsense:alertPopup:shown', {
      detail: { level, title, message }
    }));
  }

  function hideAlertPopup() {
    const modal = getModal();
    if (!modal) return;

    STATE.isVisible = false;
    STATE.currentPopup = null;

    if (modal.close) {
      modal.close();
    } else {
      modal.classList.remove('alert-popup-visible');
      document.body.style.overflow = '';
    }

    // Process queue if any
    processQueue();

    // Dispatch event
    document.dispatchEvent(new CustomEvent('sitsense:alertPopup:hidden'));
  }

  function queueAlert(level, title, message, actions) {
    STATE.queue.push({ level, title, message, actions });
    if (!STATE.isVisible) {
      processQueue();
    }
  }

  function processQueue() {
    if (STATE.isVisible || STATE.queue.length === 0) return;
    
    const next = STATE.queue.shift();
    showAlertPopup(next.level, next.title, next.message, next.actions);
  }

  // Event listeners
  function initEventListeners() {
    const modal = getModal();
    if (!modal) return;

    // Close button
    const closeBtn = document.getElementById('alertPopupClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', hideAlertPopup);
    }

    // Backdrop click
    const backdrop = modal.querySelector('.alert-popup-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          hideAlertPopup();
        }
      });
    }

    // ESC key
    modal.addEventListener('cancel', (e) => {
      e.preventDefault();
      hideAlertPopup();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && STATE.isVisible) {
        hideAlertPopup();
      }
    });
  }

  // Initialize on DOM ready or after component loaded
  function tryInit() {
    const modal = getModal();
    if (modal) {
      initEventListeners();
    } else {
      // Retry after component is loaded
      setTimeout(tryInit, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }

  // Also listen for component loaded event
  window.addEventListener('sitsense:alertPopup:loaded', () => {
    tryInit();
  });

  // Public API
  window.SitSenseAlertPopup = {
    show: showAlertPopup,
    hide: hideAlertPopup,
    queue: queueAlert
  };

  // Also expose via SitSenseUI if available
  if (window.SitSenseUI) {
    window.SitSenseUI.showAlertPopup = showAlertPopup;
    window.SitSenseUI.hideAlertPopup = hideAlertPopup;
  }
})();

