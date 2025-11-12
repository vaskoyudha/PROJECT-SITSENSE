// =================================================================
// SIDEBAR MANAGER - Mengelola toggle collapse/expand sidebar
// VERSI DIPERBAIKI - Dengan mekanisme toggle yang lebih reliable
// =================================================================

window.SidebarManager = {
    sidebar: null,
    overlay: null,
    hamburger: null,
    closeBtn: null,
    isCollapsed: false,
    isMobileOpen: false,
    
    init: function() {
      console.log('[Sidebar] Initializing sidebar manager...');
      this.sidebar = document.getElementById('sidebar');
      this.overlay = document.getElementById('sidebarOverlay');
      this.hamburger = document.getElementById('hamburgerMenu');
      this.closeBtn = document.getElementById('closeSidebar');
  
      // Cache header/main for class toggling
      this.headerEl = document.querySelector('header');
      this.mainEl = document.querySelector('main');
  
      if (!this.sidebar) {
        console.warn('[Sidebar] Sidebar element not found, retrying...');
        setTimeout(() => this.init(), 100);
        return;
      }
  
      console.log('[Sidebar] Sidebar element found');
  
      // Ensure header and main are available
      if (!this.headerEl || !this.mainEl) {
        console.warn('[Sidebar] Header or main not found, retrying...');
        setTimeout(() => this.init(), 100);
        return;
      }
  
      // Load collapsed state from localStorage IMMEDIATELY (before any transitions)
      // This prevents the "flash" of expanded sidebar before collapsing
      const savedState = localStorage.getItem('sidebar-collapsed');
      if (savedState === 'true') {
        // Apply collapsed state immediately without animation
        this.sidebar.classList.add('collapsed', 'sidebar-initializing');
        this.isCollapsed = true;
        
        // Apply to header/main immediately
        if (this.headerEl) {
          this.headerEl.classList.add('sidebar-collapsed');
        }
        if (this.mainEl) {
          this.mainEl.classList.add('sidebar-collapsed');
        }
        
        // Hide texts immediately
        this.sidebar.querySelectorAll('.sidebar-title, .sidebar-subtitle, .sidebar-nav-text').forEach(el => {
          el.classList.add('hidden');
        });
        
        // Center nav items immediately
        this.sidebar.querySelectorAll('a.nav-item').forEach(el => {
          el.classList.add('justify-center');
        });
        
        // Update icon immediately
        this.updateToggleIcon();
        
        // Remove initializing class after a short delay to allow smooth transitions for future changes
        setTimeout(() => {
          this.sidebar.classList.remove('sidebar-initializing');
        }, 100);
      } else {
        // Ensure expanded state is set
        this.isCollapsed = false;
        this.sidebar.classList.remove('collapsed', 'sidebar-initializing');
      }
  
      // Bind toggle button di sidebar
      this.bindToggleButton();
      
      // Bind hamburger menu (mobile)
      this.bindHamburger();

      // Custom scroll wheel indicator
      this.initScrollWheel();
      
      // Bind close button
      if (this.closeBtn) {
        this.closeBtn.addEventListener('click', () => this.closeMobile());
      }
      
      // Bind overlay click
      if (this.overlay) {
        this.overlay.addEventListener('click', () => this.closeMobile());
      }
      
      // Close on escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isMobileOpen) {
          this.closeMobile();
        }
      });
      
      // Close sidebar when clicking nav links on mobile
      const navLinks = this.sidebar.querySelectorAll('a[data-nav]');
      navLinks.forEach(link => {
        link.addEventListener('click', () => {
          if (window.innerWidth < 768) {
            setTimeout(() => this.closeMobile(), 100);
          }
        });
      });
      
      // Mark active nav item (with delay to ensure DOM is ready)
      setTimeout(() => {
        this.markActiveNav();
      }, 100);
      
      // Also mark active nav after a longer delay to catch async loaded content
      setTimeout(() => {
        this.markActiveNav();
      }, 500);
      
      // Handle window resize
      this.handleResize();
      
      // Render icons
      if (window.lucide) {
        window.lucide.createIcons();
      }
      
      console.log('[Sidebar] Initialization complete');
    },
    
    bindToggleButton: function() {
      const toggleBtn = this.sidebar?.querySelector('.sidebar-toggle-btn');
      
      if (!toggleBtn) {
        console.warn('[Sidebar] Toggle button not found, retrying...');
        setTimeout(() => this.bindToggleButton(), 100);
        return;
      }
      
      // Remove previous listener if exists
      if (toggleBtn.dataset.bound === 'true') {
        return;
      }
      
      // Click handler
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[Sidebar] Toggle button clicked');
        this.toggleCollapse();
      });
      
      toggleBtn.dataset.bound = 'true';
      toggleBtn.style.pointerEvents = 'auto';
      toggleBtn.style.cursor = 'pointer';
      console.log('[Sidebar] Toggle button bound successfully');
      
      // Event delegation fallback
      this.sidebar?.addEventListener('click', (e) => {
        if (e.target.closest('.sidebar-toggle-btn')) {
          e.preventDefault();
          e.stopPropagation();
          console.log('[Sidebar] Toggle via delegation');
          this.toggleCollapse();
        }
      });
    },
    
    bindHamburger: function() {
      const bindFunc = () => {
        const hamburger = document.getElementById('hamburgerMenu');
        if (hamburger && !hamburger.dataset.sidebarBound) {
          hamburger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[Sidebar] Hamburger clicked');
            this.toggleMobile();
          });
          hamburger.dataset.sidebarBound = 'true';
          console.log('[Sidebar] Hamburger bound');
        }
      };
      
      bindFunc();
      setTimeout(bindFunc, 100);
      setTimeout(bindFunc, 500);
    },

    initScrollWheel: function() {
      const region = this.sidebar?.querySelector('[data-sidebar-scroll-region]');
      const scrollArea = this.sidebar?.querySelector('[data-sidebar-scroll]');
      const thumb = this.sidebar?.querySelector('[data-sidebar-scroll-thumb]');
      if (!region || !scrollArea || !thumb) {
        return;
      }

      let ticking = false;

      const applyState = () => {
        ticking = false;
        const maxScroll = Math.max(scrollArea.scrollHeight - scrollArea.clientHeight, 0);
        const progress = maxScroll > 0 ? scrollArea.scrollTop / maxScroll : 0;
        thumb.style.setProperty('--thumb-progress', progress || 0);

        const canScrollUp = scrollArea.scrollTop > 4;
        const canScrollDown = scrollArea.scrollTop < (maxScroll - 4);
        const isScrollable = maxScroll > 2;

        region.classList.toggle('is-scrollable', isScrollable);
        region.classList.toggle('scrollable-up', isScrollable && canScrollUp);
        region.classList.toggle('scrollable-down', isScrollable && canScrollDown);
      };

      const requestState = () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(applyState);
        }
      };

      scrollArea.addEventListener('scroll', requestState, { passive: true });
      window.addEventListener('resize', requestState);
      requestState();
      setTimeout(requestState, 150);
    },
    
    toggleCollapse: function() {
      console.log('[Sidebar] toggleCollapse - current:', this.isCollapsed);
      if (this.isCollapsed) {
        this.expand();
      } else {
        this.collapse();
      }
    },
    
    collapse: function() {
      if (!this.sidebar) return;
      console.log('[Sidebar] Collapsing...');
      
      this.isCollapsed = true;
  
      // Remove initializing class if present (to allow smooth transition)
      this.sidebar.classList.remove('sidebar-initializing');
  
      // Sidebar: add collapsed class (CSS handles width)
      this.sidebar.classList.add('collapsed');
  
      // Hide texts (CSS handles this, but we keep for compatibility)
      this.sidebar.querySelectorAll('.sidebar-title, .sidebar-subtitle, .sidebar-nav-text').forEach(el => {
        el.classList.add('hidden');
      });
      
      // Center nav items (CSS handles this, but we keep for compatibility)
      this.sidebar.querySelectorAll('a.nav-item').forEach(el => {
        el.classList.add('justify-center');
      });
  
      // Header/Main: add collapsed class (CSS handles margin)
      if (this.headerEl) {
        this.headerEl.classList.add('sidebar-collapsed');
      }
      if (this.mainEl) {
        this.mainEl.classList.add('sidebar-collapsed');
      }
  
      // Update icon
      this.updateToggleIcon();
  
      // Save state
      localStorage.setItem('sidebar-collapsed', 'true');
  
      console.log('[Sidebar] Collapsed');
    },
    
    expand: function() {
      if (!this.sidebar) return;
      console.log('[Sidebar] Expanding...');
      
      this.isCollapsed = false;
  
      // Remove initializing class if present (to allow smooth transition)
      this.sidebar.classList.remove('sidebar-initializing');
  
      // Sidebar: remove collapsed class (CSS handles width)
      this.sidebar.classList.remove('collapsed');
  
      // Show texts (CSS handles this, but we keep for compatibility)
      this.sidebar.querySelectorAll('.sidebar-title, .sidebar-subtitle, .sidebar-nav-text').forEach(el => {
        el.classList.remove('hidden');
      });
      
      // Reset nav items (CSS handles this, but we keep for compatibility)
      this.sidebar.querySelectorAll('a.nav-item').forEach(el => {
        el.classList.remove('justify-center');
      });
  
      // Header/Main: remove collapsed class (CSS handles margin)
      if (this.headerEl) {
        this.headerEl.classList.remove('sidebar-collapsed');
      }
      if (this.mainEl) {
        this.mainEl.classList.remove('sidebar-collapsed');
      }
  
      // Update icon
      this.updateToggleIcon();
  
      // Save state
      localStorage.setItem('sidebar-collapsed', 'false');
  
      console.log('[Sidebar] Expanded');
    },
    
    updateToggleIcon: function() {
      const icon = this.sidebar?.querySelector('.sidebar-toggle-icon');
      if (icon) {
        // Collapsed: show "open" icon (panel-left-open)
        // Expanded: show "close" icon (panel-left-close)
        if (this.isCollapsed) {
          icon.setAttribute('data-lucide', 'panel-left-open');
        } else {
          icon.setAttribute('data-lucide', 'panel-left-close');
        }
        if (window.lucide) {
          window.lucide.createIcons();
        }
      }
    },
    
    // Mobile specific methods
    toggleMobile: function() {
      if (this.isMobileOpen) {
        this.closeMobile();
      } else {
        this.openMobile();
      }
    },
    
    openMobile: function() {
      if (!this.sidebar || window.innerWidth >= 768) return;
      
      console.log('[Sidebar] Opening mobile sidebar');
      this.isMobileOpen = true;
      
      this.sidebar.classList.remove('-translate-x-full');
      
      if (this.overlay) {
        this.overlay.classList.remove('opacity-0', 'pointer-events-none');
        this.overlay.classList.add('opacity-100', 'pointer-events-auto');
      }
      
      document.body.style.overflow = 'hidden';
    },
    
    closeMobile: function() {
      if (!this.sidebar || window.innerWidth >= 768) return;
      
      console.log('[Sidebar] Closing mobile sidebar');
      this.isMobileOpen = false;
      
      this.sidebar.classList.add('-translate-x-full');
      
      if (this.overlay) {
        this.overlay.classList.remove('opacity-100', 'pointer-events-auto');
        this.overlay.classList.add('opacity-0', 'pointer-events-none');
      }
      
      document.body.style.overflow = '';
    },
    
    handleResize: function() {
      let resizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          // Desktop: ensure sidebar is visible, close mobile overlay
          if (window.innerWidth >= 768) {
            if (this.sidebar) {
              this.sidebar.classList.remove('-translate-x-full');
            }
            if (this.overlay) {
              this.overlay.classList.add('opacity-0', 'pointer-events-none');
              this.overlay.classList.remove('opacity-100', 'pointer-events-auto');
            }
            document.body.style.overflow = '';
            this.isMobileOpen = false;
          }
        }, 250);
      });
    },
    
    markActiveNav: function() {
      // Get current path and filename
      const path = window.location.pathname.toLowerCase();
      const file = path.split('/').pop() || 'index.html';
      const href = window.location.href.toLowerCase();
      
      console.log('[Sidebar] Marking active nav - path:', path, 'file:', file, 'href:', href);
      
      // Find all nav items
      const navItems = document.querySelectorAll('a[data-nav]');
      
      if (navItems.length === 0) {
        console.warn('[Sidebar] No nav items found, retrying...');
        setTimeout(() => this.markActiveNav(), 100);
        return;
      }
      
      navItems.forEach(a => {
        // Remove all active classes
        a.classList.remove('bg-cyan-500/10', 'text-cyan-300', 'border-l-2', 'border-cyan-400', 'active');
        
        const navKey = a.getAttribute('data-nav');
        if (!navKey) return;
        
        // Get the href from the nav item to compare
        const navHref = a.getAttribute('href') || '';
        const navFile = navHref.split('/').pop() || '';
        
        // Check if this nav item is active
        let isActive = false;
        
        // Simple method: Check by filename match
        if (navFile && file) {
          // Direct filename match
          if (navFile === file) {
            isActive = true;
          }
          // Also check if current file matches the nav key's expected file
          else {
            switch(navKey) {
              case 'home':
                isActive = file === 'home.html';
                break;
              case 'dashboard':
                isActive = file === 'index.html' || file === '' || path.endsWith('/');
                break;
            case 'history':
              isActive = file === 'history.html';
              break;
            case 'profile':
              isActive = file === 'profile.html';
              break;
              case 'reports':
                isActive = file === 'reports.html';
                break;
              case 'settings':
                isActive = file === 'settings.html';
                break;
              case 'about':
                isActive = file === 'about.html';
                break;
              case 'help':
                isActive = file === 'help.html';
                break;
            }
          }
        } else {
          // Fallback: check by nav key
          switch(navKey) {
            case 'home':
              isActive = file === 'home.html' || href.includes('home.html');
              break;
            case 'dashboard':
              isActive = (file === 'index.html' || file === '' || path.endsWith('/')) && 
                        !href.includes('home.html') && !href.includes('history.html') && 
                        !href.includes('settings.html') && !href.includes('reports.html');
              break;
            case 'history':
              isActive = file === 'history.html' || href.includes('history.html');
              break;
            case 'profile':
              isActive = file === 'profile.html' || href.includes('profile.html');
              break;
            case 'reports':
              isActive = file === 'reports.html' || href.includes('reports.html');
              break;
            case 'settings':
              isActive = file === 'settings.html' || href.includes('settings.html');
              break;
            case 'about':
              isActive = file === 'about.html' || href.includes('about.html');
              break;
            case 'help':
              isActive = file === 'help.html' || href.includes('help.html');
              break;
          }
        }
        
        if (isActive) {
          a.classList.add('bg-cyan-500/10', 'text-cyan-300', 'border-l-2', 'border-cyan-400', 'active');
          console.log('[Sidebar] Active nav item:', navKey, 'file:', file);
        }
      });
    }
  };
  
  // Initialize dengan retry mechanism
  function initializeSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) {
      console.log('[Sidebar] Not found, retrying in 100ms...');
      setTimeout(initializeSidebar, 100);
      return;
    }
    
    if (window.SidebarManager && typeof window.SidebarManager.init === 'function') {
      window.SidebarManager.init();
    }
  }
  
  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSidebar);
  } else {
    setTimeout(initializeSidebar, 50);
  }
  
  // Re-render icons after delay
  setTimeout(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }, 200);
  
  // Mark active nav when page loads (fallback)
  if (document.readyState === 'complete') {
    setTimeout(() => {
      if (window.SidebarManager && window.SidebarManager.markActiveNav) {
        window.SidebarManager.markActiveNav();
      }
    }, 500);
  } else {
    window.addEventListener('load', () => {
      setTimeout(() => {
        if (window.SidebarManager && window.SidebarManager.markActiveNav) {
          window.SidebarManager.markActiveNav();
        }
      }, 500);
    });
  }
  
  // Mark active nav when navigation occurs (for SPA-like behavior)
  window.addEventListener('popstate', () => {
    setTimeout(() => {
      if (window.SidebarManager && window.SidebarManager.markActiveNav) {
        window.SidebarManager.markActiveNav();
      }
    }, 100);
  });
  
  console.log('[Sidebar] sidebar.js loaded');
