/*
  SitSense — ui.js (Integrasi ringan)
  -----------------------------------
  Peran:
    • Theme manager (dark-only)
    • Toast helper (Toastify fallback ke alert)
    • Render teks rekomendasi (bulletify, sanitasi ringan)
    • Event hooks: alert timer, TTS, welcome → tampilkan toast ringkas

  API global (window.SitSenseUI):
    setTheme('dark'|'light'|'system')
    toggleTheme()
    showAdviceText(text)
    showToast(message, type?) // type: 'info'|'success'|'warn'|'error'
*/
(function () {
    const THEME_KEY = 'sitsense_theme';
    const prefersDark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    // ---------------- Theme ----------------
    function applyTheme() {
        const html = document.documentElement; // <html>
        html.setAttribute('data-theme', 'dark');
        try { localStorage.setItem(THEME_KEY, 'dark'); } catch (_) { }
    }
    function getTheme() { return 'dark'; }
    function setTheme() { applyTheme(); }
    function toggleTheme() { applyTheme(); }

    // ---------------- Toast ----------------
    function showToast(message, type = 'info') {
        const colors = {
            info: 'linear-gradient(90deg, #3b82f6, #06b6d4)',
            success: 'linear-gradient(90deg, #10b981, #34d399)',
            warn: 'linear-gradient(90deg, #f59e0b, #f97316)',
            error: 'linear-gradient(90deg, #ef4444, #f43f5e)'
        };
        if (window.Toastify) {
            window.Toastify({ text: String(message), duration: 3000, gravity: 'top', position: 'right', close: true, style: { background: colors[type] || colors.info } }).showToast();
        } else {
            // Fallback
            console.log('[Toast]', type, message);
            try { alert(message); } catch (_) { }
        }
    }

    // ---------------- Advice rendering ----------------
    function escapeHTML(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

    function formatMarkdown(text) {
        let safe = escapeHTML(text).trim();

        // Bold: **text** -> <strong>text</strong>
        safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Lists: Lines starting with *, -, or numbers
        const lines = safe.split(/\r?\n+/);
        let output = '';
        let inList = false;

        lines.forEach(line => {
            const listMatch = line.match(/^(\*|-|\d+\.)\s+(.*)/);
            if (listMatch) {
                if (!inList) {
                    output += '<ul class="list-disc pl-5 space-y-1 my-2">';
                    inList = true;
                }
                output += `<li>${listMatch[2]}</li>`;
            } else {
                if (inList) {
                    output += '</ul>';
                    inList = false;
                }
                if (line.trim()) {
                    output += `<p class="mb-2">${line}</p>`;
                }
            }
        });

        if (inList) output += '</ul>';
        return output;
    }

    function showAdviceText(text) {
        const el = document.getElementById('adviceText');
        if (!el) {
            console.warn('[SitSense UI] adviceText element not found');
            return;
        }
        const formatted = formatMarkdown(text || '—');

        // Add visual feedback with animation
        el.style.transition = 'opacity 0.2s ease-out, transform 0.2s ease-out';
        el.style.opacity = '0.3';
        el.style.transform = 'translateY(-5px)';

        // Update content
        el.innerHTML = formatted;

        // Fade in with slight bounce
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            });
        });

        console.log('[SitSense UI] Advice text updated, length:', text?.length || 0);
    }

    // ---------------- Event hooks ----------------
    function hookEvents() {
        // Alerts thresholds → pop-up + toast
        document.addEventListener('sitsense:alert', (e) => {
            const { type, elapsed } = e.detail || {}; // soft|hard
            // elapsed = detik nyata timer alerts; untuk context UI/teks gunakan menit logis
            // yang mengikuti time scale (agar cocok dengan ambang & timer yang dipercepat).
            let logicalSec = elapsed || 0;
            try {
                if (window.SitSenseTime && typeof window.SitSenseTime.getScale === 'function') {
                    const scale = window.SitSenseTime.getScale() || 1;
                    logicalSec = Math.floor((elapsed || 0) * scale);
                }
            } catch (_) { }
            const mm = Math.floor(logicalSec / 60);

            if (type === 'hard') {
                // Pop-up merah untuk hard alert
                const message = `Sudah duduk sekitar ${mm} menit di sesi ini. Saatnya berdiri dan peregangan.`;
                if (window.SitSenseUI && window.SitSenseUI.showAlertPopup) {
                    window.SitSenseUI.showAlertPopup('red', 'Peringatan Penting', message, [
                        {
                            text: 'Berdiri Sekarang',
                            action: () => {
                                // Optional: trigger action
                            }
                        }
                    ]);
                } else {
                    showToast(message, 'warn');
                }
            } else if (type === 'soft') {
                // Pop-up kuning untuk soft alert
                const message = `Duduk sekitar ${mm} menit di sesi ini. Istirahat singkat sebentar ya.`;
                if (window.SitSenseUI && window.SitSenseUI.showAlertPopup) {
                    window.SitSenseUI.showAlertPopup('yellow', 'Peringatan', message);
                } else {
                    showToast(message, 'info');
                }
            }
        });

        // Timer lifecycle
        document.addEventListener('sitsense:timer:start', () => showToast('Timer duduk dimulai', 'success'));
        document.addEventListener('sitsense:timer:stop', () => showToast('Timer dijeda', 'info'));
        document.addEventListener('sitsense:timer:reset', () => showToast('Timer direset', 'info'));

        // TTS lifecycle
        document.addEventListener('sitsense:tts:start', () => showToast('Membacakan rekomendasi…', 'info'));
        document.addEventListener('sitsense:tts:end', () => showToast('Selesai dibacakan', 'success'));
        document.addEventListener('sitsense:tts:error', () => showToast('Gagal memutar suara', 'error'));

        // Welcome hidden → cue small toast
        document.addEventListener('sitsense:welcome:hidden', () => showToast('Selamat datang di SitSense!', 'success'));
    }

    // ---------------- NProgress helpers (opsional) ----------------
    function bindAdviceButtons() {
        const btnAsk = document.getElementById('btnRefreshAdvice');
        const loadingInd = document.getElementById('aiLoadingIndicator');
        const adviceBox = document.getElementById('adviceText');

        console.log('[SitSense UI] bindAdviceButtons called');
        if (!btnAsk) { console.error('[SitSense UI] btnRefreshAdvice not found'); return; }
        if (btnAsk.dataset.uiBound === '1') return;
        btnAsk.dataset.uiBound = '1';

        btnAsk.addEventListener('click', async () => {
            console.log('[SitSense UI] ========== Analyze button clicked ==========');

            // Check if function is available
            if (!window.getPostureAdvice) {
                console.error('[SitSense UI] window.getPostureAdvice is missing');
                if (window.SitSenseUI && window.SitSenseUI.showToast) {
                    window.SitSenseUI.showToast('Modul AI belum dimuat. Silakan refresh halaman.', 'error');
                }
                return;
            }

            if (window.NProgress) NProgress.start();

            // UI Loading State - Make it very visible
            if (loadingInd) {
                loadingInd.classList.remove('hidden');
                loadingInd.classList.add('flex');
            }
            btnAsk.disabled = true;
            btnAsk.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Menganalisis...';

            // Show loading in advice box
            const adviceEl = document.getElementById('adviceText');
            if (adviceEl) {
                adviceEl.innerHTML = '<p class="text-center text-slate-400 italic">Menganalisis postur Anda...</p>';
            }

            try {

                console.log('[SitSense UI] Calling getPostureAdvice...');
                // Gather Context Data
                // Hitung durasi duduk logis (mengikuti time scale) untuk konteks AI
                let logicalSec = window.SitSenseAlerts?.getElapsedSeconds?.() || 0;
                try {
                    if (window.SitSenseTime && typeof window.SitSenseTime.getScale === 'function') {
                        const scale = window.SitSenseTime.getScale() || 1;
                        logicalSec = Math.floor(logicalSec * scale);
                    }
                } catch (_) { }

                const inputData = {
                    score: window.__postureScore || 0,
                    imbalance: window.__imbalance || { lr: 0, fb: 0 },
                    durationSec: logicalSec,
                    lastAlerts: '-', // Bisa diambil dari log alert jika ada
                    trend: window.sessionData?.scores?.length > 5 ? 'Stabil' : 'Data baru', // Placeholder trend logic
                    historyContext: window.SitSenseHistory?.buildAIContext?.(),
                    historyStats: window.SitSenseHistory?.getAIMetadata?.(),
                    timestamp: Date.now() // Add timestamp to ensure unique requests
                };

                console.log('[SitSense UI] Input data for AI:', inputData);
                console.log('[SitSense UI] Current posture score:', window.__postureScore);
                console.log('[SitSense UI] Current imbalance:', window.__imbalance);

                const advice = await window.getPostureAdvice(inputData);

                console.log('[SitSense UI] Received advice:', advice);
                console.log('[SitSense UI] Advice text length:', advice?.text?.length || 0);

                // Render Result with Typing Effect (Simulated by direct insert for now, can be enhanced)
                if (advice && advice.text) {
                    console.log('[SitSense UI] Updating UI with advice text');

                    // Use Chat Interface if available
                    if (window.addSystemMessage) {
                        window.addSystemMessage(advice.text);
                    } else {
                        // Fallback to old method (might fail if element removed)
                        showAdviceText(advice.text);
                    }

                    // Show appropriate message based on advice source
                    if (advice.rationale === 'fallback' || advice.rationale === 'fallback-error') {
                        // Using fallback advice - show warning
                        if (window.SitSenseUI && window.SitSenseUI.showToast) {
                            window.SitSenseUI.showToast('Menggunakan saran lokal (AI tidak terhubung). Periksa konfigurasi API key di Pengaturan.', 'warn');
                        }
                        console.warn('[SitSense UI] Using fallback advice. Check API configuration.');
                    } else {
                        // AI advice received - show success
                        if (window.SitSenseUI && window.SitSenseUI.showToast) {
                            window.SitSenseUI.showToast('Analisis selesai!', 'success');
                        }
                    }
                } else {
                    console.error('[SitSense UI] Invalid advice response:', advice);
                    throw new Error('Invalid advice response');
                }

            } catch (e) {
                console.error(e);
                if (window.addSystemMessage) {
                    window.addSystemMessage("Maaf, gagal menghubungi Coach AI. Coba lagi nanti.");
                } else {
                    showAdviceText("Maaf, gagal menghubungi Coach AI. Coba lagi nanti.");
                }
            } finally {
                if (window.NProgress) NProgress.done();

                // Reset UI State
                if (loadingInd) loadingInd.classList.add('hidden');
                if (loadingInd) loadingInd.classList.remove('flex');
                btnAsk.disabled = false;
                btnAsk.innerHTML = '<i data-lucide="sparkles" class="h-4 w-4"></i> Analisis Sekarang';
                if (window.lucide) window.lucide.createIcons();
            }
        });

        const btnListen = document.getElementById('btnListenAdvice');
        if (btnListen && btnListen.dataset.uiBound !== '1') {
            btnListen.dataset.uiBound = '1';
            btnListen.addEventListener('click', async () => {
                if (!window.speakText) { showToast('TTS belum siap.', 'error'); return; }

                // Ambil text bersih tanpa HTML tags untuk dibaca
                const rawHtml = document.getElementById('adviceText')?.innerHTML || '';
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = rawHtml;
                const text = tempDiv.textContent || tempDiv.innerText || '';

                if (!text.trim() || text.includes("Klik 'Analisis Sekarang'")) { showToast('Belum ada rekomendasi untuk dibacakan.', 'warn'); return; }

                if (window.NProgress) NProgress.start();
                try { await window.speakText(text, { voice: 'id-ID-Standard-A' }); }
                finally { if (window.NProgress) NProgress.done(); }
            });
        }
    }

    // ---------------- Boot ----------------
    document.addEventListener('DOMContentLoaded', () => {
        applyTheme(getTheme());
        hookEvents();
        bindAdviceButtons();
    });

    // ---------------- Session UI ----------------
    function showSessionConfirm() {
        return new Promise((resolve) => {
            // Cek apakah modal sudah ada, jika belum inject
            let modal = document.getElementById('sessionConfirmModal');
            if (!modal) {
                // Fallback simple confirm jika modal HTML belum siap
                const choice = confirm("🎯 Mulai Sesi Monitoring?\n\nSistem akan merekam data postur Anda dan memberikan rekomendasi personal.");
                resolve(choice);
                return;
            }

            // Jika pakai DaisyUI modal (checkbox toggle)
            const toggle = document.getElementById('session_modal_toggle');
            if (toggle) {
                toggle.checked = true;

                const btnStart = document.getElementById('btnStartSession');
                const btnCancel = document.getElementById('btnCancelSession');

                if (!btnStart || !btnCancel) {
                    // Fallback jika elemen belum tersedia
                    resolve(confirm("Mulai Sesi?"));
                    return;
                }

                let resolved = false; // Flag untuk prevent double resolve

                const closeModal = () => {
                    if (toggle) {
                        toggle.checked = false;
                    }
                };

                const cleanup = () => {
                    if (resolved) return; // Prevent double execution
                    resolved = true;
                    closeModal();
                };

                const onStart = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (resolved) return;
                    cleanup();
                    resolve(true);
                };

                const onCancel = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (resolved) return;
                    cleanup();
                    resolve(false);
                };

                // Remove existing listeners dengan clone dan replace (clean slate)
                const clonedStart = btnStart.cloneNode(true);
                const clonedCancel = btnCancel.cloneNode(true);
                btnStart.parentNode.replaceChild(clonedStart, btnStart);
                btnCancel.parentNode.replaceChild(clonedCancel, btnCancel);

                // Add fresh listeners
                clonedStart.addEventListener('click', onStart, { once: true });
                clonedCancel.addEventListener('click', onCancel, { once: true });

                // Handle backdrop click untuk close
                const backdrop = modal.querySelector('.modal-backdrop');
                if (backdrop) {
                    const onBackdropClick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!resolved) {
                            cleanup();
                            resolve(false);
                        }
                    };
                    // Remove old handler if exists
                    if (backdrop.__cleanupHandler) {
                        backdrop.removeEventListener('click', backdrop.__cleanupHandler);
                    }
                    backdrop.addEventListener('click', onBackdropClick, { once: true });
                    backdrop.__cleanupHandler = onBackdropClick;
                }
            } else {
                // Fallback again
                resolve(confirm("Mulai Sesi?"));
            }
        });
    }

    function updateSessionUI(status, data) {
        // Status di header (optional, bisa di-hide jika tidak digunakan)
        const statusEl = document.getElementById('sessionStatus');
        const durationEl = document.getElementById('sessionDuration');
        const btnStop = document.getElementById('btnStopSession');

        // Status di hero section (akan menggantikan tombol "Mulai Monitoring")
        const statusHero = document.getElementById('sessionStatusHero');
        const durationHero = document.getElementById('sessionDurationHero');
        const btnStopHero = document.getElementById('btnStopSessionHero');
        const btnStartHero = document.getElementById('btnStartMonitoringHero');

        // Hide header status (karena sekarang di hero section)
        if (statusEl) {
            statusEl.classList.add('hidden');
        }

        if (status === 'ACTIVE') {
            // Show hero status, hide start button
            if (statusHero) {
                statusHero.classList.remove('hidden');
                statusHero.classList.add('flex');
            }
            if (btnStartHero) {
                btnStartHero.classList.add('hidden');
            }

            // Start local timer for UI
            if (window._sessionUiTimer) clearInterval(window._sessionUiTimer);
            const start = data?.startTime || Date.now();

            window._sessionUiTimer = setInterval(() => {
                // Durasi sesi nyata
                const diff = Math.floor((Date.now() - start) / 1000);
                // Untuk tampilan di navbar, gunakan menit \"logis\" yang mengikuti time scale,
                // agar selaras dengan kartu Durasi Duduk & ambang alert saat mode admin.
                let scaled = diff;
                try {
                    if (window.SitSenseTime && typeof window.SitSenseTime.getScale === 'function') {
                        const scale = window.SitSenseTime.getScale() || 1;
                        scaled = Math.floor(diff * scale);
                    }
                } catch (_) { }
                const m = Math.floor(scaled / 60);
                const s = scaled % 60;
                const timeStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                if (durationEl) durationEl.textContent = timeStr;
                if (durationHero) durationHero.textContent = timeStr;
            }, 1000);

            // Setup stop button handlers
            if (btnStop) {
                btnStop.onclick = () => {
                    if (window.SessionManager) {
                        window.SessionManager.stopSession();
                    }
                };
            }
            if (btnStopHero) {
                btnStopHero.onclick = () => {
                    if (window.SessionManager) {
                        window.SessionManager.stopSession();
                    }
                };
            }

            // Refresh icons after showing
            if (window.lucide) {
                setTimeout(() => window.lucide.createIcons(), 100);
            }

        } else {
            // Hide hero status, show start button
            if (statusHero) {
                statusHero.classList.add('hidden');
                statusHero.classList.remove('flex');
            }
            if (btnStartHero) {
                btnStartHero.classList.remove('hidden');
            }

            // Also update header status for consistency
            if (statusEl) {
                statusEl.classList.add('hidden');
                statusEl.classList.remove('flex');
            }
            if (window._sessionUiTimer) clearInterval(window._sessionUiTimer);
        }
    }

    // Alert Pop-up integration
    function showAlertPopup(level, title, message, actions) {
        if (window.SitSenseAlertPopup && window.SitSenseAlertPopup.show) {
            window.SitSenseAlertPopup.show(level, title, message, actions);
        } else {
            // Fallback to toast if pop-up not available
            showToast(message || title, level === 'red' ? 'error' : level === 'orange' ? 'warn' : 'info');
        }
    }

    function hideAlertPopup() {
        if (window.SitSenseAlertPopup && window.SitSenseAlertPopup.hide) {
            window.SitSenseAlertPopup.hide();
        }
    }

    // Public API
    window.SitSenseUI = {
        setTheme,
        toggleTheme,
        showAdviceText,
        showToast,
        showSessionConfirm,
        updateSessionUI,
        showAlertPopup,
        hideAlertPopup
    };
    window.showAdviceText = window.showAdviceText || showAdviceText;
})();
