// Simple front-end auth using localStorage (email + password, not for production use)
// Exposes global Auth object
(function() {
  const STORAGE_KEYS = {
    users: 'sitsense-users',
    session: 'sitsense-current-user'
  };

  function readUsers() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.users);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn('[Auth] Failed to read users', e);
      return [];
    }
  }

  function writeUsers(users) {
    localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
  }

  function setSession(user) {
    if (!user) {
      localStorage.removeItem(STORAGE_KEYS.session);
      return;
    }
    localStorage.setItem(STORAGE_KEYS.session, JSON.stringify({
      email: user.email,
      name: user.name || user.email.split('@')[0]
    }));
  }

  function getSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.session);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  const Auth = {
    getCurrentUser() {
      return getSession();
    },
    isLoggedIn() {
      return !!getSession();
    },
    register({ name, email, password, confirmPassword }) {
      if (!name || name.trim().length < 2) {
        return { ok: false, message: 'Nama minimal 2 karakter' };
      }
      if (!isValidEmail(email)) {
        return { ok: false, message: 'Email tidak valid' };
      }
      if (!password || password.length < 6) {
        return { ok: false, message: 'Password minimal 6 karakter' };
      }
      if (password !== confirmPassword) {
        return { ok: false, message: 'Konfirmasi password tidak sama' };
      }
      const users = readUsers();
      const exists = users.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (exists) {
        return { ok: false, message: 'Email sudah terdaftar' };
      }
      users.push({
        name: name.trim(),
        email: email.toLowerCase(),
        // Note: disimpan plain untuk demo. Jangan lakukan ini di produksi.
        password
      });
      writeUsers(users);
      setSession({ name, email });
      return { ok: true, message: 'Registrasi berhasil' };
    },
    login({ email, password }) {
      if (!isValidEmail(email)) {
        return { ok: false, message: 'Email tidak valid' };
      }
      const users = readUsers();
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (!user || user.password !== password) {
        return { ok: false, message: 'Email atau password salah' };
      }
      setSession(user);
      return { ok: true, message: 'Login berhasil' };
    },
    logout() {
      setSession(null);
    },
    requireAuth({ redirectTo = '/auth/masuk/' } = {}) {
      if (!Auth.isLoggedIn()) {
        window.location.href = redirectTo + '?next=' + encodeURIComponent(window.location.pathname);
      }
    },
    initUI() {
      // Update chip Auth status on index.html if exists
      const authStatus = document.getElementById('authStatus');
      const session = getSession();
      if (authStatus && authStatus.querySelector('span:last-child')) {
        authStatus.querySelector('span:last-child').textContent = session ? (session.email || 'masuk') : 'tamu';
      }

      // Navbar auth on home.html
      const authNav = document.getElementById('authNav');
      if (authNav) {
        if (session) {
          authNav.innerHTML = '' +
            '<div class="flex items-center gap-3">' +
              '<span class="text-slate-300 text-sm hidden sm:inline">Halo, ' + (session.name || session.email) + '</span>' +
              '<button id="btnLogout" class="btn btn-ghost btn-sm normal-case">Keluar</button>' +
            '</div>';
          const btnLogout = document.getElementById('btnLogout');
          if (btnLogout) {
            btnLogout.addEventListener('click', function() {
              Auth.logout();
              // Re-render
              Auth.initUI();
            });
          }
        } else {
          authNav.innerHTML = '' +
            '<div class="flex items-center gap-3">' +
              '<a href="/auth/masuk/" class="text-slate-300 hover:text-cyan-300 text-sm">Masuk</a>' +
              '<a href="/auth/daftar/" class="btn btn-ghost btn-sm normal-case">Daftar</a>' +
            '</div>';
        }
      }
    }
  };

  window.SitSenseAuth = Auth;

  document.addEventListener('DOMContentLoaded', function() {
    Auth.initUI();
  });
})();


