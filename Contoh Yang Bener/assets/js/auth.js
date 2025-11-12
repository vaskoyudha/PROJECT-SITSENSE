(function() {
  const SESSION_KEY = 'sitsense-auth-cache';
  let currentUser = null;
  let googleProvider = null;

  function getAuthInstance() {
    if (window.firebaseAuth) return window.firebaseAuth;
    if (typeof firebase !== 'undefined' && typeof firebase.auth === 'function') {
      window.firebaseAuth = firebase.auth();
      return window.firebaseAuth;
    }
    return null;
  }

  function cacheSession(user) {
    try {
      if (!window.localStorage) return;
    } catch (_) {
      return;
    }
    try {
      if (user) {
        const snapshot = {
          email: user.email || null,
          name: user.displayName || user.name || (user.email ? user.email.split('@')[0] : null)
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    } catch (err) {
      console.warn('[Auth] Failed to cache session:', err);
    }
  }

  function getCachedSession() {
    try {
      if (!window.localStorage) return null;
    } catch (_) {
      return null;
    }
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn('[Auth] Failed to read cached session:', err);
      return null;
    }
  }

  function normalizeUser(user) {
    if (!user) return null;
    const email = user.email || null;
    const name = user.displayName || user.name || (email ? email.split('@')[0] : null);
    if (!email && !name) return null;
    return { email, name };
  }

  function mapFirebaseError(error) {
    if (!error) return 'Terjadi kesalahan tak terduga.';
    const map = {
      'auth/email-already-in-use': 'Email sudah terdaftar.',
      'auth/invalid-email': 'Format email tidak valid.',
      'auth/user-not-found': 'Akun tidak ditemukan.',
      'auth/wrong-password': 'Email atau password salah.',
      'auth/weak-password': 'Password minimal 6 karakter.',
      'auth/network-request-failed': 'Tidak dapat terhubung ke server. Coba lagi.',
      'auth/too-many-requests': 'Terlalu banyak percobaan. Silakan coba beberapa saat lagi.'
    };
    return map[error.code] || error.message || 'Terjadi kesalahan tak terduga.';
  }

  function emitAuthChange(userLike) {
    try {
      const detail = normalizeUser(userLike) || getCachedSession();
      document.dispatchEvent(new CustomEvent('sitsense:auth:change', { detail }));
    } catch (_) {}
  }

  function getGoogleProvider() {
    if (googleProvider) return googleProvider;
    if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') {
      return null;
    }
    googleProvider = new firebase.auth.GoogleAuthProvider();
    return googleProvider;
  }

  async function ensureDisplayName(user, name) {
    if (!user || !name || user.displayName === name) return;
    try {
      await user.updateProfile({ displayName: name });
    } catch (err) {
      console.warn('[Auth] Failed to update display name:', err);
    }
  }

  function updateAuthUI(userLike) {
    const normalized = normalizeUser(userLike) || getCachedSession();
    emitAuthChange(normalized);

    const authStatusContainer = document.getElementById('authStatusContainer');
    if (authStatusContainer) {
      if (normalized) {
        const displayName = normalized.name || normalized.email || 'User';
        authStatusContainer.innerHTML = `
          <div class="dropdown dropdown-end">
            <label tabindex="0" class="btn btn-ghost btn-xs normal-case">
              <div class="avatar avatar-xs mr-2">
                <div class="w-4 rounded-full">
                  <img src="https://i.pravatar.cc/40?u=${normalized.email}" />
                </div>
              </div>
              ${displayName}
              <i data-lucide="chevron-down" class="h-3 w-3"></i>
            </label>
            <ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">
              <li><a href="./profile.html"><i data-lucide="user-circle" class="h-4 w-4"></i> Profil</a></li>
              <li><a id="header-logout-button"><i data-lucide="log-out" class="h-4 w-4"></i> Keluar</a></li>
            </ul>
          </div>
        `;
        const logoutButton = authStatusContainer.querySelector('#header-logout-button');
        if (logoutButton) {
          logoutButton.addEventListener('click', async () => {
            await Auth.logout();
          });
        }
      } else {
        authStatusContainer.innerHTML = `
          <span id="authStatus" class="badge inline-flex items-center gap-1 bg-white/5 border border-white/10">
            <i data-lucide="user" class="h-3.5 w-3.5"></i>
            <span>Auth: tamu</span>
          </span>
        `;
      }
    }

    const authNavTargets = document.querySelectorAll('[data-auth-nav]');
    if (!authNavTargets.length) return;

    const displayName = normalized ? (normalized.name || normalized.email || 'pengguna') : 'pengguna';
    const loggedMarkup =
      '<span class="text-slate-300 text-sm flex-1 md:flex-none">Halo, ' + displayName + '</span>' +
      '<button data-auth-action="logout" class="btn btn-ghost btn-sm normal-case border border-white/10 text-slate-100 w-full md:w-auto">Keluar</button>';

    const guestMarkup =
      '<a href="/auth/masuk.html" class="btn btn-gradient-outline normal-case gap-2 px-5 py-2 text-sm w-full md:w-auto justify-center">' +
        '<i data-lucide="log-in" class="h-4 w-4"></i>' +
        '<span>Masuk</span>' +
      '</a>' +
      '<a href="/auth/daftar.html" class="btn btn-gradient-outline normal-case gap-2 px-5 py-2 text-sm w-full md:w-auto justify-center">' +
        '<i data-lucide="user-plus" class="h-4 w-4"></i>' +
        '<span>Daftar</span>' +
      '</a>';

    authNavTargets.forEach((target) => {
      target.innerHTML = normalized ? loggedMarkup : guestMarkup;
      const logoutBtn = target.querySelector('[data-auth-action="logout"]');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', async function() {
          logoutBtn.disabled = true;
          try {
            await Auth.logout();
          } finally {
            logoutBtn.disabled = false;
          }
        });
      }
    });

    if (window.lucide) {
      try { window.lucide.createIcons(); } catch (_) {}
    }

  }

  function initAuthListener() {
    const auth = getAuthInstance();
    if (!auth) {
      updateAuthUI(getCachedSession());
      return;
    }
    if (auth.__sitsenseListenerAttached) {
      return;
    }
    auth.__sitsenseListenerAttached = true;
    auth.onAuthStateChanged((user) => {
      currentUser = user || null;
      cacheSession(user || null);
      updateAuthUI(user || null);
    });
  }

  const Auth = {
    getCurrentUser() {
      return normalizeUser(currentUser) || getCachedSession();
    },
    isLoggedIn() {
      return !!(currentUser || getCachedSession());
    },
    async register({ name, email, password, confirmPassword }) {
      if (!name || name.trim().length < 2) {
        return { ok: false, message: 'Nama minimal 2 karakter.' };
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, message: 'Email tidak valid.' };
      }
      if (!password || password.length < 6) {
        return { ok: false, message: 'Password minimal 6 karakter.' };
      }
      if (password !== confirmPassword) {
        return { ok: false, message: 'Konfirmasi password tidak sama.' };
      }

      const auth = getAuthInstance();
      if (!auth) {
        return { ok: false, message: 'Firebase belum siap. Muat ulang halaman.' };
      }

      try {
        const credential = await auth.createUserWithEmailAndPassword(email, password);
        if (credential?.user) {
          await ensureDisplayName(credential.user, name.trim());
          currentUser = credential.user;
          cacheSession(credential.user);
          updateAuthUI(credential.user);
        }
        return { ok: true, message: 'Registrasi berhasil.', user: credential?.user || null };
      } catch (error) {
        return { ok: false, message: mapFirebaseError(error), error };
      }
    },
    async login({ email, password }) {
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, message: 'Email tidak valid.' };
      }
      if (!password) {
        return { ok: false, message: 'Password wajib diisi.' };
      }

      const auth = getAuthInstance();
      if (!auth) {
        return { ok: false, message: 'Firebase belum siap. Muat ulang halaman.' };
      }

      try {
        const credential = await auth.signInWithEmailAndPassword(email, password);
        currentUser = credential?.user || null;
        cacheSession(currentUser);
        updateAuthUI(currentUser);
        return { ok: true, message: 'Login berhasil.', user: credential?.user || null };
      } catch (error) {
        return { ok: false, message: mapFirebaseError(error), error };
      }
    },
    async logout() {
      const auth = getAuthInstance();
      cacheSession(null);
      currentUser = null;
      updateAuthUI(null);
      if (!auth) {
        return { ok: true };
      }
      try {
        await auth.signOut();
        return { ok: true };
      } catch (error) {
        return { ok: false, message: mapFirebaseError(error), error };
      }
    },
    async loginWithGoogle() {
      const auth = getAuthInstance();
      const provider = getGoogleProvider();
      if (!auth || !provider) {
        return { ok: false, message: 'Google Sign-In belum siap. Muat ulang halaman.' };
      }
      if (provider.setCustomParameters) {
        provider.setCustomParameters({ prompt: 'select_account' });
      }
      try {
        const credential = await auth.signInWithPopup(provider);
        currentUser = credential?.user || null;
        cacheSession(currentUser);
        updateAuthUI(currentUser);
        return { ok: true, message: 'Login dengan Google berhasil.', user: currentUser };
      } catch (error) {
        if (error?.code === 'auth/popup-blocked') {
          try {
            await auth.signInWithRedirect(provider);
            return { ok: true, pendingRedirect: true };
          } catch (redirectError) {
            return { ok: false, message: mapFirebaseError(redirectError), error: redirectError };
          }
        }
        if (error?.code === 'auth/popup-closed-by-user') {
          return { ok: false, message: 'Jendela Google ditutup sebelum selesai.' };
        }
        return { ok: false, message: mapFirebaseError(error), error };
      }
    },
    requireAuth({ redirectTo = '/auth/masuk.html' } = {}) {
      const auth = getAuthInstance();
      const cached = getCachedSession();
      if ((auth && auth.currentUser) || cached) {
        return;
      }
      const target = redirectTo + '?next=' + encodeURIComponent(window.location.pathname + window.location.search);
      if (!auth) {
        window.location.href = target;
        return;
      }
      const unsubscribe = auth.onAuthStateChanged((user) => {
        if (!user) {
          window.location.href = target;
        }
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      });
    },
    initUI() {
      updateAuthUI(currentUser || getCachedSession());
      initAuthListener();
    }
  };

  window.SitSenseAuth = Auth;

  document.addEventListener('DOMContentLoaded', () => {
    Auth.initUI();
  });
})();
