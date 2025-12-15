(function() {
  const SESSION_KEY = 'sitsense-auth-cache';
  const PROFILE_CACHE_KEY = 'sitsense-profile-cache';
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

  function cacheProfile(profile) {
    try {
      if (!window.localStorage) return;
    } catch (_) {
      return;
    }
    try {
      if (profile) {
        localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
      } else {
        localStorage.removeItem(PROFILE_CACHE_KEY);
      }
      window.SitSenseProfile = profile || null;
      document.dispatchEvent(new CustomEvent('sitsense:profile', { detail: profile || null }));
    } catch (err) {
      console.warn('[Profile] Failed to cache profile:', err);
    }
  }

  function getCachedProfile() {
    try {
      if (!window.localStorage) return null;
    } catch (_) {
      return null;
    }
    try {
      const raw = localStorage.getItem(PROFILE_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn('[Profile] Failed to read cached profile:', err);
      return null;
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

  async function getDatabaseRef(path) {
    if (typeof firebase === 'undefined' || typeof firebase.database !== 'function') {
      throw new Error('Firebase database belum siap.');
    }
    return firebase.database().ref(path);
  }

  async function readProfile(uid, fallbackName) {
    if (!uid) return null;
    try {
      const ref = await getDatabaseRef('profiles/' + uid);
      const snap = await ref.get();
      if (snap.exists()) {
        return snap.val();
      }
      const profile = {
        displayName: fallbackName || 'Pengguna',
        dateOfBirth: null,
        needsSetup: true,
        createdAt: Date.now()
      };
      await ref.set(profile);
      return profile;
    } catch (err) {
      console.warn('[Profile] Failed to read profile:', err);
      return null;
    }
  }

  async function writeProfile(uid, data) {
    if (!uid) return null;
    try {
      const ref = await getDatabaseRef('profiles/' + uid);
      await ref.update(data);
      const snap = await ref.get();
      return snap.exists() ? snap.val() : data;
    } catch (err) {
      console.warn('[Profile] Failed to write profile:', err);
      throw err;
    }
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
      handleProfileState(user || null);
    });
  }

  async function handleProfileState(user) {
    if (!user) {
      cacheProfile(null);
      return;
    }
    try {
      const profile = await readProfile(user.uid, user.displayName || user.email);
      cacheProfile(profile);
      const isSetupPage = window.location.pathname.endsWith('/profile-setup.html');
      if (profile?.needsSetup && !isSetupPage) {
        window.location.href = '/profile-setup.html';
        return;
      }
      if (!profile?.needsSetup && isSetupPage) {
        window.location.href = '/profile.html';
      }
    } catch (err) {
      console.warn('[Profile] Unable to load profile:', err);
    }
  }

  const Auth = {
    getCurrentUser() {
      return normalizeUser(currentUser) || getCachedSession();
    },
    isLoggedIn() {
      return !!(currentUser || getCachedSession());
    },
    getProfile() {
      return getCachedProfile();
    },
    async reloadProfile() {
      if (!currentUser) {
        return getCachedProfile();
      }
      const profile = await readProfile(currentUser.uid, currentUser.displayName || currentUser.email);
      cacheProfile(profile);
      return profile;
    },
    async completeProfile({ displayName, dateOfBirth }) {
      if (!currentUser) {
        throw new Error('Pengguna belum login.');
      }
      const trimmed = displayName ? displayName.trim() : '';
      if (!trimmed) {
        return { ok: false, message: 'Nama tidak boleh kosong.' };
      }
      try {
        await ensureDisplayName(currentUser, trimmed);
        const profile = await writeProfile(currentUser.uid, {
          displayName: trimmed,
          dateOfBirth: dateOfBirth || null,
          needsSetup: false,
          updatedAt: Date.now()
        });
        cacheProfile(profile);
        return { ok: true, profile };
      } catch (err) {
        return { ok: false, message: err?.message || 'Gagal menyimpan profil.', error: err };
      }
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
          await writeProfile(credential.user.uid, {
            displayName: name.trim(),
            dateOfBirth: null,
            needsSetup: true,
            createdAt: Date.now()
          });
          cacheProfile({ displayName: name.trim(), dateOfBirth: null, needsSetup: true });
          updateAuthUI(credential.user);
          window.location.href = '/profile-setup.html';
        }
        return { ok: true, message: 'Registrasi berhasil.', user: credential?.user || null, needsSetup: true };
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
        // Clear data dari user sebelumnya sebelum login
        const previousUid = currentUser?.uid;
        if (previousUid && window.UserContext) {
          window.UserContext.clearUserData(previousUid);
        }
        
        // Clear semua sitsense localStorage untuk memastikan isolasi data
        // TAPI jangan hapus preference global seperti sitsense_mode dan sitsense_settings_v1
        try {
          const sitsenseKeys = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (
              key.startsWith('sitsense_history_') || 
              key.startsWith('sitsense_device') ||
              key === 'sitsense_history_v1' || // Clear key lama (non-user-specific)
              key === 'sitsense_device' // Clear key lama (non-user-specific)
            )) {
              // Jangan hapus preference global
              if (key !== 'sitsense_mode' && key !== 'sitsense_settings_v1') {
                sitsenseKeys.push(key);
              }
            }
          }
          sitsenseKeys.forEach(key => localStorage.removeItem(key));
          console.log('[Auth] Cleared previous user data before login (preserved preferences):', sitsenseKeys.length, 'keys');
        } catch (err) {
          console.warn('[Auth] Failed to clear previous user data:', err);
        }
        
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
      const uid = currentUser?.uid;
      
      // Clear user-specific localStorage
      if (uid) {
        try {
          // Clear user-specific data menggunakan UserContext jika tersedia
          if (window.UserContext && typeof window.UserContext.clearUserData === 'function') {
            window.UserContext.clearUserData(uid);
          } else {
            // Manual cleanup jika UserContext tidak tersedia
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && (key.includes(`_${uid}`) || key.includes(`_${uid}_`))) {
                keysToRemove.push(key);
              }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
          }
          
          // Clear device ID
          localStorage.removeItem(`sitsense_device_${uid}`);
          
          // Clear history storage untuk user ini
          const historyStorageKey = `sitsense_history_v1_${uid}`;
          localStorage.removeItem(historyStorageKey);
          
          // Clear base history storage juga (jika ada)
          localStorage.removeItem('sitsense_history_v1');
          
          console.log('[Auth] Cleared user-specific data for user:', uid);
        } catch (err) {
          console.warn('[Auth] Failed to clear user data:', err);
        }
      }
      
      // Clear all sitsense-related localStorage untuk memastikan tidak ada data leakage
      // TAPI jangan hapus preference global seperti sitsense_mode dan sitsense_settings_v1
      try {
        const sitsenseKeys = [];
        const preserveKeys = ['sitsense_mode', 'sitsense_settings_v1']; // Preference global, jangan dihapus
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('sitsense_') && !preserveKeys.includes(key)) {
            sitsenseKeys.push(key);
          }
        }
        sitsenseKeys.forEach(key => localStorage.removeItem(key));
        console.log('[Auth] Cleared sitsense-related localStorage (preserved preferences):', sitsenseKeys.length, 'keys');
      } catch (err) {
        console.warn('[Auth] Failed to clear sitsense localStorage:', err);
      }
      
      // Clear session cache
      cacheSession(null);
      cacheProfile(null);
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
        // Clear data dari user sebelumnya sebelum login
        const previousUid = currentUser?.uid;
        if (previousUid && window.UserContext) {
          window.UserContext.clearUserData(previousUid);
        }
        
        // Clear semua sitsense localStorage untuk memastikan isolasi data
        // TAPI jangan hapus preference global seperti sitsense_mode dan sitsense_settings_v1
        try {
          const sitsenseKeys = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (
              key.startsWith('sitsense_history_') || 
              key.startsWith('sitsense_device') ||
              key === 'sitsense_history_v1' || // Clear key lama (non-user-specific)
              key === 'sitsense_device' // Clear key lama (non-user-specific)
            )) {
              // Jangan hapus preference global
              if (key !== 'sitsense_mode' && key !== 'sitsense_settings_v1') {
                sitsenseKeys.push(key);
              }
            }
          }
          sitsenseKeys.forEach(key => localStorage.removeItem(key));
          console.log('[Auth] Cleared previous user data before Google login (preserved preferences):', sitsenseKeys.length, 'keys');
        } catch (err) {
          console.warn('[Auth] Failed to clear previous user data:', err);
        }
        
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
      if (currentUser) {
        handleProfileState(currentUser);
      }
    }
  };

  window.SitSenseAuth = Auth;

  document.addEventListener('DOMContentLoaded', () => {
    Auth.initUI();
  });

  window.SitSenseProfile = getCachedProfile();
})();
