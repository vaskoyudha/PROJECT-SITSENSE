/*
  SitSense — user-context.js
  ---------------------------
  Helper functions untuk user authentication dan user-specific data paths
*/

(function() {
  'use strict';

  /**
   * Mendapatkan current user UID dari Firebase Auth atau SitSenseAuth
   * @returns {string|null} User UID atau null jika tidak login
   */
  function getCurrentUserId() {
    try {
      // Prioritas 1: Firebase Auth langsung (paling reliable untuk mendapatkan UID)
      if (window.firebaseAuth && window.firebaseAuth.currentUser) {
        return window.firebaseAuth.currentUser.uid;
      }

      // Prioritas 2: Cek dari firebase global
      if (typeof firebase !== 'undefined' && firebase.auth) {
        const auth = firebase.auth();
        if (auth && auth.currentUser) {
          return auth.currentUser.uid;
        }
      }

      // Prioritas 3: Cek dari SitSenseAuth (tapi getCurrentUser() tidak return uid)
      // Jadi kita perlu akses currentUser internal jika memungkinkan
      // Note: getCurrentUser() hanya return {email, name}, tidak ada uid
      // Kita skip ini karena tidak reliable
    } catch (err) {
      console.warn('[UserContext] Failed to get current user ID:', err);
    }
    return null;
  }

  /**
   * Memastikan user sudah login, throw error jika tidak
   * @throws {Error} Jika user tidak login
   */
  function requireAuth() {
    const uid = getCurrentUserId();
    if (!uid) {
      throw new Error('User harus login untuk mengakses data ini.');
    }
    return uid;
  }

  /**
   * Membangun user-specific Firebase path
   * @param {string} subPath - Sub path setelah /users/{uid}/
   * @returns {string} Full path seperti /users/{uid}/{subPath}
   */
  function getUserPath(subPath) {
    const uid = requireAuth();
    const cleanSubPath = subPath.startsWith('/') ? subPath.slice(1) : subPath;
    return `/users/${uid}/${cleanSubPath}`;
  }

  /**
   * Membangun user-specific localStorage key
   * @param {string} key - Base key name
   * @returns {string} User-specific key seperti 'sitsense_{key}_{uid}'
   */
  function getUserStorageKey(key) {
    const uid = getCurrentUserId();
    if (!uid) {
      // Jika tidak ada user, gunakan key asli (untuk backward compatibility atau anonymous)
      return `sitsense_${key}`;
    }
    return `sitsense_${key}_${uid}`;
  }

  /**
   * Clear semua user-specific data dari localStorage
   * @param {string} uid - User UID yang datanya akan di-clear
   */
  function clearUserData(uid) {
    if (!uid) return;
    
    try {
      // Clear semua localStorage keys yang mengandung UID ini
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes(`_${uid}`) || key.includes(`_${uid}_`))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      console.log(`[UserContext] Cleared ${keysToRemove.length} user-specific localStorage items for user ${uid}`);
    } catch (err) {
      console.warn('[UserContext] Failed to clear user data:', err);
    }
  }

  /**
   * Check apakah user sudah login
   * @returns {boolean}
   */
  function isAuthenticated() {
    return getCurrentUserId() !== null;
  }

  /**
   * Wait for authentication state (untuk async initialization)
   * @param {number} timeout - Timeout dalam ms (default 5000ms)
   * @returns {Promise<string|null>} User UID atau null jika timeout
   */
  function waitForAuth(timeout = 5000) {
    return new Promise((resolve) => {
      const uid = getCurrentUserId();
      if (uid) {
        resolve(uid);
        return;
      }

      // Listen untuk auth state changes
      let unsubscribe = null;
      const timeoutId = setTimeout(() => {
        if (unsubscribe && typeof unsubscribe === 'function') {
          unsubscribe();
        }
        resolve(null);
      }, timeout);

      try {
        // Coba dari window.firebaseAuth terlebih dahulu
        if (window.firebaseAuth) {
          unsubscribe = window.firebaseAuth.onAuthStateChanged((user) => {
            if (user && user.uid) {
              clearTimeout(timeoutId);
              if (unsubscribe && typeof unsubscribe === 'function') {
                unsubscribe();
              }
              resolve(user.uid);
            }
          });
        } else if (typeof firebase !== 'undefined' && firebase.auth) {
          // Fallback ke firebase global
          const auth = firebase.auth();
          unsubscribe = auth.onAuthStateChanged((user) => {
            if (user && user.uid) {
              clearTimeout(timeoutId);
              if (unsubscribe && typeof unsubscribe === 'function') {
                unsubscribe();
              }
              resolve(user.uid);
            }
          });
        } else {
          clearTimeout(timeoutId);
          resolve(null);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        console.warn('[UserContext] Failed to wait for auth:', err);
        resolve(null);
      }
    });
  }

  // Export public API
  window.UserContext = {
    getCurrentUserId,
    requireAuth,
    getUserPath,
    getUserStorageKey,
    clearUserData,
    isAuthenticated,
    waitForAuth
  };

  console.log('[UserContext] Module initialized');
})();

