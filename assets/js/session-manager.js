/*
  SitSense — session-manager.js
  -----------------------------
  Mengelola siklus hidup sesi monitoring:
  - Start/Stop/Pause
  - Akumulasi data (ticks)
  - Logika eskalasi peringatan (Visual -> Audio -> AI Voice)
  - Penyimpanan ke Firebase History
*/

(function () {
    'use strict';

    function getTimeScale() {
        try {
            return window.SitSenseTime && typeof window.SitSenseTime.getScale === 'function'
                ? window.SitSenseTime.getScale()
                : 1;
        } catch (_) {
            return 1;
        }
    }

    function fromMinutesScaled(min) {
        const ts = getTimeScale() || 1;
        if (window.SitSenseTime && typeof window.SitSenseTime.fromMinutes === 'function') {
            return window.SitSenseTime.fromMinutes(min);
        }
        // Fallback: tanpa modul time-scale, pakai menit nyata
        return (min * 60 * 1000) / ts;
    }

    const STATE = {
        status: 'IDLE', // IDLE, ACTIVE, PAUSED
        sessionId: null,
        startTime: 0,
        data: {
            ticks: [],
            alerts: [],
            badPostureStreak: 0, // menit berturut-turut
            lastWarningTime: 0,
            warningLevel: 0, // 0=none, 1=visual, 2=audio, 3=ai
            audioLevel: 0,
            // State tracking untuk peringatan merah persisten
            hasReachedRedLevel: false, // flag apakah sudah pernah mencapai level merah
            goodPostureStartTime: null, // timestamp kapan postur mulai baik setelah merah
            lastRedAlertTime: 0 // timestamp peringatan merah terakhir (untuk interval 2 menit)
        },
        config: {
            poorThreshold: 60,
            tickInterval: 10000, // rekam setiap 10 detik (boleh di-scale manual jika perlu)
            // Nilai di bawah ini dalam "menit logis". Time scale akan memperpendek durasi nyata.
            escalationIntervalMinutes: 5, // 5 menit antar warning
            aiThresholdStreakMinutes: 15, // 15 menit buruk -> AI Voice
            audioEscalation: [
                { minMinutes: 2, cue: 'gentle' },
                { minMinutes: 5, cue: 'firm' },
                { minMinutes: 10, cue: 'critical' }
            ],
            // Konfigurasi peringatan merah persisten
            goodPostureResetMinutes: 5, // Durasi postur baik untuk reset dari merah
            redAlertRepeatIntervalMinutes: 2 // Interval pengulangan peringatan merah (menit)
        },
        deviceId: null
    };

    // --- Lifecycle ---

    function init(config = {}) {
        if (config.deviceId) STATE.deviceId = config.deviceId;
        // Hook listener jika perlu
        console.log('[SessionManager] Initialized');
    }

    async function requestStart() {
        if (STATE.status === 'ACTIVE') return false;

        // Tampilkan modal konfirmasi via UI
        const confirmed = await window.SitSenseUI.showSessionConfirm();
        if (confirmed) {
            startSession();
            return true;
        }
        return false;
    }

    function startSession() {
        if (!STATE.deviceId) {
            console.warn('[SessionManager] No Device ID, cannot start session');
            window.SitSenseUI.showToast('Error: Perangkat tidak terhubung', 'error');
            return;
        }

        STATE.status = 'ACTIVE';
        STATE.sessionId = generateUUID();
        STATE.startTime = Date.now();
        STATE.data = {
            ticks: [],
            alerts: [],
            badPostureStreak: 0,
            lastWarningTime: 0,
            warningLevel: 0,
            audioLevel: 0,
            // State tracking untuk peringatan merah persisten
            hasReachedRedLevel: false,
            goodPostureStartTime: null,
            lastRedAlertTime: 0
        };
        if (window.SitSenseHistory && window.SitSenseHistory.startSession) {
            try {
                window.SitSenseHistory.startSession({
                    sessionId: STATE.sessionId,
                    deviceId: STATE.deviceId,
                    startTime: STATE.startTime,
                    config: STATE.config
                });
            } catch (err) {
                console.warn('[SessionManager] Failed to initialize history session', err);
            }
        }

        window.SitSenseUI.updateSessionUI('ACTIVE', { startTime: STATE.startTime });
        window.SitSenseUI.showToast('Sesi Monitoring Dimulai', 'success');
        console.log('[SessionManager] Session Started:', STATE.sessionId);
    }

    async function stopSession() {
        if (STATE.status === 'IDLE') return;

        const endTime = Date.now();
        const duration = (endTime - STATE.startTime) / 1000;

        // Rekap sesi untuk riwayat & penyimpanan
        let summary = null;
        if (window.SitSenseHistory && window.SitSenseHistory.finishSession) {
            try {
                summary = window.SitSenseHistory.finishSession({ endTime, config: STATE.config });
            } catch (err) {
                console.warn('[SessionManager] Failed to finalize history session', err);
            }
        }
        if (!summary) {
            summary = buildSessionSummaryFallback(endTime);
        }

        // Simpan ke Firebase
        await saveSessionToFirebase(summary);

        STATE.status = 'IDLE';
        window.SitSenseUI.updateSessionUI('IDLE');
        window.SitSenseUI.showToast(`Sesi Selesai. Durasi: ${Math.floor(duration / 60)} menit`, 'success');

        // Trigger AI Summary generation (async)
        generateSessionSummary(STATE.sessionId, summary);
    }

    // --- Data Recording ---

    function recordTick(packet) {
        // packet: { score, back, neck, pressure, imbalance }
        if (STATE.status !== 'ACTIVE') return;

        const now = Date.now();

        // Rekam data mentah (bisa di-throttle jika perlu hemat memori)
        STATE.data.ticks.push({
            ts: now,
            ...packet
        });
        if (window.SitSenseHistory && window.SitSenseHistory.recordTick) {
            try {
                window.SitSenseHistory.recordTick({ ts: now, ...packet });
            } catch (err) {
                console.warn('[SessionManager] Failed to record tick into history', err);
            }
        }

        // Cek Eskalasi setiap menit (kira-kira setiap 6 tick jika interval 10s)
        // Kita cek setiap tick saja tapi logic di dalam checkEscalation yang filter waktu
        checkEscalation(packet.score);
    }

    function recordAlert(type) {
        if (STATE.status !== 'ACTIVE') return;
        STATE.data.alerts.push({
            ts: Date.now(),
            type: type
        });
        if (window.SitSenseHistory && window.SitSenseHistory.recordAlert) {
            try {
                window.SitSenseHistory.recordAlert({ type });
            } catch (err) {
                console.warn('[SessionManager] Failed to record alert into history', err);
            }
        }
    }

    // --- Escalation Logic ---

    async function checkEscalation(currentScore) {
        const { 
            poorThreshold, 
            escalationIntervalMinutes, 
            aiThresholdStreakMinutes,
            goodPostureResetMinutes,
            redAlertRepeatIntervalMinutes
        } = STATE.config;

        const now = Date.now();
        const baseUnitMs = fromMinutesScaled(1); // 1 menit logis → ms nyata (sudah di-scale)

        // ============================================================
        // A. POSTUR BAIK: Tracking dan Reset Logic
        // ============================================================
        if (currentScore >= poorThreshold) {
            // Jika sudah pernah mencapai level merah, tracking durasi postur baik
            if (STATE.data.hasReachedRedLevel) {
                // Mulai atau lanjutkan tracking postur baik
                if (STATE.data.goodPostureStartTime === null) {
                    STATE.data.goodPostureStartTime = now;
                }

                // Hitung durasi postur baik dalam menit logis
                const goodDurationMs = now - STATE.data.goodPostureStartTime;
                const goodMinutes = baseUnitMs > 0 ? Math.floor(goodDurationMs / baseUnitMs) : 0;

                // Jika postur baik >= 5 menit, reset semua state
                if (goodMinutes >= goodPostureResetMinutes) {
                    STATE.data.hasReachedRedLevel = false;
                    STATE.data.goodPostureStartTime = null;
                    STATE.data.badPostureStreak = 0;
                    STATE.data.warningLevel = 0;
                    STATE.data.audioLevel = 0;
                    STATE.data.lastWarningTime = 0;
                    STATE.data.lastRedAlertTime = 0;
                    // Reset normal, kembali ke logika awal
                } else {
                    // Postur baik tapi belum 5 menit, tetap di level merah (jangan reset)
                    return;
                }
            } else {
                // Belum pernah mencapai merah, reset normal
                STATE.data.badPostureStreak = 0;
                STATE.data.warningLevel = 0;
                STATE.data.audioLevel = 0;
                STATE.data.goodPostureStartTime = null;
                return;
            }
        }

        // ============================================================
        // B. POSTUR BURUK: Escalation Logic
        // ============================================================
        
        // Reset goodPostureStartTime jika postur kembali buruk
        if (STATE.data.hasReachedRedLevel && STATE.data.goodPostureStartTime !== null) {
            STATE.data.goodPostureStartTime = null;
        }

        // Hitung durasi buruk terakhir dalam menit logis
        const badDurationMs = calculateCurrentBadStreakDuration();
        const badMinutes = baseUnitMs > 0 ? Math.floor(badDurationMs / baseUnitMs) : 0;
        STATE.data.badPostureStreak = badMinutes;
        handleAudioEscalation(badMinutes, currentScore);

        const timeSinceLast = now - STATE.data.lastWarningTime;
        const escalationIntervalMs = fromMinutesScaled(
            typeof escalationIntervalMinutes === 'number' ? escalationIntervalMinutes : 5
        );

        // ============================================================
        // C. PERINGATAN MERAH PERSISTEN (jika sudah pernah mencapai merah)
        // ============================================================
        if (STATE.data.hasReachedRedLevel) {
            // Hitung interval untuk peringatan merah berulang (2 menit)
            const redAlertIntervalMs = fromMinutesScaled(redAlertRepeatIntervalMinutes);
            const timeSinceLastRed = now - STATE.data.lastRedAlertTime;

            // Kirim peringatan merah setiap 2 menit jika postur masih buruk
            if (timeSinceLastRed >= redAlertIntervalMs) {
                STATE.data.lastRedAlertTime = now;
                STATE.data.lastWarningTime = now;
                STATE.data.warningLevel = 2; // Tetap di level merah

                const message = `PERINGATAN: Postur buruk masih terdeteksi! Sudah ${badMinutes} menit. Segera perbaiki postur Anda.`;
                if (window.SitSenseUI && window.SitSenseUI.showAlertPopup) {
                    window.SitSenseUI.showAlertPopup('red', 'Peringatan Kritis', message, [
                        {
                            text: 'Perbaiki Postur',
                            action: () => {
                                // Optional: trigger action
                            }
                        }
                    ]);
                } else {
                    window.SitSenseUI?.showToast?.(message, 'error');
                }
                playAudioWarning('hard');
                // Membacakan peringatan dengan TTS
                speakRedAlert(message);
                recordAlert('red_persistent');
            }
            return; // Jangan lanjut ke logika normal
        }

        // ============================================================
        // D. LOGIKA NORMAL: Kuning → Oranye → Merah (belum pernah merah)
        // ============================================================

        // Level 0: Visual (Pop-up Kuning) - Setiap ~5 menit logis, mulai dari 2 menit
        if (badMinutes >= 2 && badMinutes < 5 && timeSinceLast > escalationIntervalMs) {
            STATE.data.warningLevel = 0.5; // Level 0.5 untuk kuning (antara 0 dan 1)
            STATE.data.lastWarningTime = now;
            const message = `Perhatian: Postur Anda perlu diperbaiki. Sudah ${badMinutes} menit membungkuk.`;
            if (window.SitSenseUI && window.SitSenseUI.showAlertPopup) {
                window.SitSenseUI.showAlertPopup('yellow', 'Perhatian', message, [
                    {
                        text: 'Mengerti',
                        action: () => {
                            // Optional: trigger action
                        }
                    }
                ]);
            } else {
                window.SitSenseUI?.showToast?.(message, 'info');
            }
            // Membacakan peringatan dengan TTS
            speakAlert(message, 300);
            recordAlert('visual_escalation_yellow');
        }

        // Level 1: Visual (Pop-up Oranye) - Setiap ~5 menit logis
        if (badMinutes >= 5 && badMinutes < 10 && timeSinceLast > escalationIntervalMs) {
            STATE.data.warningLevel = 1;
            STATE.data.lastWarningTime = now;
            const message = `Perbaiki postur Anda! Sudah ${badMinutes} menit membungkuk.`;
            if (window.SitSenseUI && window.SitSenseUI.showAlertPopup) {
                window.SitSenseUI.showAlertPopup('orange', 'Perbaiki Postur', message, [
                    {
                        text: 'Perbaiki Sekarang',
                        action: () => {
                            // Optional: trigger action
                        }
                    }
                ]);
            } else {
                window.SitSenseUI?.showToast?.(message, 'warn');
            }
            // Membacakan peringatan dengan TTS
            speakAlert(message, 500);
            recordAlert('visual_escalation');
        }

        // Level 2: Audio (Pop-up Merah) - Setiap ~5 menit setelah 10 menit logis
        // INI ADALAH PERTAMA KALI MENCAPAI MERAH
        if (badMinutes >= 10 && badMinutes < 15 && timeSinceLast > escalationIntervalMs) {
            STATE.data.warningLevel = 2;
            STATE.data.lastWarningTime = now;
            STATE.data.lastRedAlertTime = now; // Set untuk tracking interval 2 menit
            STATE.data.hasReachedRedLevel = true; // SET FLAG: sudah mencapai merah
            STATE.data.goodPostureStartTime = null; // Reset tracking postur baik

            const message = `PERINGATAN: Postur buruk terdeteksi selama ${badMinutes} menit!`;
            if (window.SitSenseUI && window.SitSenseUI.showAlertPopup) {
                window.SitSenseUI.showAlertPopup('red', 'Peringatan Kritis', message, [
                    {
                        text: 'Perbaiki Postur',
                        action: () => {
                            // Optional: trigger action
                        }
                    }
                ]);
            } else {
                window.SitSenseUI?.showToast?.(message, 'error');
            }
            playAudioWarning('hard');
            // Membacakan peringatan dengan TTS
            speakRedAlert(message);
            recordAlert('audio_escalation');
        }

        // Level 3: AI Voice - Pada menit ke-N (sekali trigger per streak panjang)
        const aiStreak = typeof aiThresholdStreakMinutes === 'number' ? aiThresholdStreakMinutes : 15;
        if (badMinutes >= aiStreak && STATE.data.warningLevel < 3 && !STATE.data.hasReachedRedLevel) {
            // Hanya trigger AI jika belum pernah mencapai merah (untuk pertama kali)
            // Set flag bahwa sudah mencapai merah
            STATE.data.warningLevel = 3;
            STATE.data.lastWarningTime = now;
            STATE.data.lastRedAlertTime = now;
            STATE.data.hasReachedRedLevel = true; // SET FLAG: sudah mencapai merah
            STATE.data.goodPostureStartTime = null; // Reset tracking postur baik

            const message = `Postur buruk sudah berlangsung ${badMinutes} menit! Segera perbaiki postur Anda untuk menghindari masalah kesehatan.`;
            if (window.SitSenseUI && window.SitSenseUI.showAlertPopup) {
                window.SitSenseUI.showAlertPopup('red', 'Peringatan Kritis', message, [
                    {
                        text: 'Perbaiki Postur',
                        action: () => {
                            // Optional: trigger action
                        }
                    }
                ]);
            }
            triggerAIConsequenceWarning(badMinutes);
            recordAlert('ai_escalation');
        }
    }

    function calculateCurrentBadStreakDuration() {
        // Mundur dari tick terakhir, hitung selisih waktu sampai ketemu score >= threshold
        let duration = 0;
        const ticks = STATE.data.ticks;
        if (ticks.length === 0) return 0;

        const endTs = ticks[ticks.length - 1].ts;
        let startTs = endTs;

        for (let i = ticks.length - 1; i >= 0; i--) {
            if (ticks[i].score < STATE.config.poorThreshold) {
                startTs = ticks[i].ts;
            } else {
                break;
            }
        }
        return endTs - startTs;
    }

    function playAudioWarning(level = 'soft') {
        const audioId = level === 'hard' ? 'alertHard' : 'alertSoft';
        const audio = document.getElementById(audioId); // Gunakan alertSoft/Hard untuk beep
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => console.warn('Audio play failed', e));
        }
    }

    function handleAudioEscalation(badMinutes, score) {
        const rules = STATE.config.audioEscalation || [];
        if (!rules.length) return;
        if (badMinutes < (rules[0]?.minMinutes || Number.POSITIVE_INFINITY)) {
            STATE.data.audioLevel = 0;
            return;
        }
        for (let i = 0; i < rules.length; i++) {
            const levelIdx = i + 1;
            const rule = rules[i];
            if (badMinutes >= rule.minMinutes && STATE.data.audioLevel < levelIdx) {
                triggerAudioCoach(rule.cue || 'gentle', { badMinutes, score: Math.round(score || 0) });
                STATE.data.audioLevel = levelIdx;
            }
        }
    }

    function triggerAudioCoach(level, context) {
        if (window.SitSenseAudioCoach && typeof window.SitSenseAudioCoach.playCue === 'function') {
            try {
                window.SitSenseAudioCoach.playCue(level, context);
                return;
            } catch (err) {
                console.warn('[SessionManager] Audio coach cue failed', err);
            }
        }
        playAudioWarning(level === 'critical' ? 'hard' : 'soft');
    }

    async function triggerAIConsequenceWarning(minutes) {
        if (!window.SitSenseAI || !window.SitSenseTTS) return;

        window.SitSenseUI.showToast('AI menganalisis dampak kesehatan...', 'info');

        try {
            // Minta penjelasan ke Gemini
            const explanation = await window.SitSenseAI.getConsequenceExplanation({
                minutes: minutes,
                posture: 'membungkuk' // Bisa diperkaya dengan data sensor (neck/back)
            });

            if (explanation) {
                window.SitSenseUI.showToast('AI Voice Assistant Aktif', 'warn');
                await window.SitSenseTTS.speakText(explanation, { rate: 1.1 });
            }
        } catch (e) {
            console.error('[SessionManager] AI Warning Failed', e);
        }
    }

    async function speakAlert(message, delay = 500) {
        // Fungsi helper untuk membacakan peringatan dengan TTS (kuning, oranye, merah)
        if (typeof window.speakText === 'function') {
            try {
                // Tunggu sedikit agar audio warning selesai
                await new Promise(resolve => setTimeout(resolve, delay));
                await window.speakText(message, { rate: 1.0 });
            } catch (err) {
                console.warn('[SessionManager] TTS failed for alert', err);
            }
        } else if (window.SitSenseTTS && typeof window.SitSenseTTS.speakText === 'function') {
            try {
                await new Promise(resolve => setTimeout(resolve, delay));
                await window.SitSenseTTS.speakText(message, { rate: 1.0 });
            } catch (err) {
                console.warn('[SessionManager] TTS failed for alert', err);
            }
        }
    }

    async function speakRedAlert(message) {
        // Alias untuk backward compatibility
        return speakAlert(message, 500);
    }

    // --- Persistence ---

    async function saveSessionToFirebase(summary) {
        if (!window.firebase || !STATE.deviceId || !summary) {
            console.warn('[SessionManager] Cannot save: firebase=', !!window.firebase, 'deviceId=', STATE.deviceId, 'summary=', !!summary);
            return;
        }

        // Dapatkan user UID untuk user-specific path
        let userId = null;
        try {
            // Prioritas 1: Firebase Auth langsung (paling reliable)
            if (window.firebaseAuth && window.firebaseAuth.currentUser) {
                userId = window.firebaseAuth.currentUser.uid;
                console.log('[SessionManager] User ID from firebaseAuth:', userId);
            }
            // Prioritas 2: firebase global
            if (!userId && typeof firebase !== 'undefined' && firebase.auth) {
                const auth = firebase.auth();
                if (auth && auth.currentUser) {
                    userId = auth.currentUser.uid;
                    console.log('[SessionManager] User ID from firebase.auth():', userId);
                }
            }
            // Prioritas 3: UserContext
            if (!userId && window.UserContext) {
                userId = window.UserContext.getCurrentUserId();
                if (userId) {
                    console.log('[SessionManager] User ID from UserContext:', userId);
                }
            }
        } catch (err) {
            console.error('[SessionManager] Failed to get user ID:', err);
        }

        // Jika tidak ada user ID, tidak bisa menyimpan (untuk isolasi data)
        if (!userId) {
            console.error('[SessionManager] No user ID available, cannot save session to Firebase');
            console.warn('[SessionManager] Session data:', {
                sessionId: summary.id || STATE.sessionId,
                deviceId: STATE.deviceId,
                duration: summary.durationSec,
                avgScore: summary.avgScore
            });
            // Tampilkan toast untuk memberitahu user
            if (window.SitSenseUI && window.SitSenseUI.showToast) {
                window.SitSenseUI.showToast('Data sesi tidak dapat disimpan: User tidak terautentikasi', 'error');
            }
            return;
        }

        const db = firebase.database();
        if (!db) {
            console.error('[SessionManager] Firebase database not available');
            return;
        }

        const sessionId = summary.id || STATE.sessionId;
        if (!sessionId) {
            console.error('[SessionManager] No session ID available');
            return;
        }

        // Gunakan user-specific path
        const ref = db.ref(`/users/${userId}/sessions/${sessionId}`);

        // Pastikan semua field yang diperlukan tersedia
        const startTs = summary.startTs || STATE.startTime;
        const endTs = summary.endTs || Date.now();
        const durationSec = summary.durationSec || Math.floor((endTs - startTs) / 1000);
        
        const payload = {
            sessionId,
            userId, // Tambahkan userId ke payload untuk validasi
            deviceId: summary.deviceId || STATE.deviceId,
            startTs: startTs,
            endTs: endTs,
            duration: durationSec,
            avgScore: summary.avgScore || 0,
            avgPressure: null, // Bisa diisi dari summary jika ada
            goodCount: summary.goodCount || 0,
            badCount: summary.badCount || 0,
            alerts: summary.alerts || 0,
            note: summary.trend || summary.note || '',
            scores: {
                avgTotal: summary.avgScore || 0,
                samples: STATE.data.ticks.length
            },
            alertsLog: summary.alertsLog || STATE.data.alerts || [],
            createdAt: Date.now() // Tambahkan timestamp untuk sorting
        };

        try {
            await ref.set(payload);
            console.log('[SessionManager] ✅ Saved to Firebase at /users/' + userId + '/sessions/' + sessionId);
            console.log('[SessionManager] Payload:', JSON.stringify(payload, null, 2));
            
            // Dispatch event untuk refresh history jika ada listener
            try {
                window.dispatchEvent(new CustomEvent('sitsense:session:saved', {
                    detail: { sessionId, userId, payload }
                }));
            } catch (evtErr) {
                console.warn('[SessionManager] Failed to dispatch save event:', evtErr);
            }
            
            // Tampilkan toast sukses
            if (window.SitSenseUI && window.SitSenseUI.showToast) {
                window.SitSenseUI.showToast('Data sesi berhasil disimpan', 'success');
            }
        } catch (e) {
            console.error('[SessionManager] ❌ Save failed:', e);
            console.error('[SessionManager] Error details:', {
                code: e.code,
                message: e.message,
                userId: userId,
                sessionId: sessionId,
                path: `/users/${userId}/sessions/${sessionId}`
            });
            
            // Tampilkan toast error
            if (window.SitSenseUI && window.SitSenseUI.showToast) {
                window.SitSenseUI.showToast('Gagal menyimpan data sesi ke Firebase', 'error');
            }
            
            // Bisa simpan ke localStorage sebagai backup
            try {
                const backupKey = `sitsense_session_backup_${sessionId}`;
                localStorage.setItem(backupKey, JSON.stringify(payload));
                console.log('[SessionManager] Saved to localStorage as backup');
            } catch (backupErr) {
                console.error('[SessionManager] Failed to save backup:', backupErr);
            }
        }
    }

    function buildSessionSummaryFallback(endTime) {
        const ticks = STATE.data.ticks || [];
        const tickIntervalSec = (STATE.config.tickInterval || 10000) / 1000;
        const scores = ticks.map(t => Number(t.score) || 0).filter(Boolean);
        const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        const goodSamples = scores.filter(s => s >= 80).length;
        const badSamples = scores.filter(s => s < 60).length;
        const durationSec = Math.max(1, Math.floor((endTime - STATE.startTime) / 1000));
        let trend = 'stabil';
        if (scores.length >= 4) {
            const chunk = Math.min(scores.length, 6);
            const head = scores.slice(0, chunk).reduce((a, b) => a + b, 0) / chunk;
            const tail = scores.slice(-chunk).reduce((a, b) => a + b, 0) / chunk;
            if (tail - head >= 8) trend = 'meningkat';
            else if (head - tail >= 8) trend = 'menurun';
        }
        return {
            id: STATE.sessionId,
            deviceId: STATE.deviceId,
            startTs: STATE.startTime,
            endTs: endTime,
            durationSec,
            avgScore,
            goodCount: goodSamples,
            badCount: badSamples,
            goodSeconds: goodSamples * tickIntervalSec,
            badSeconds: badSamples * tickIntervalSec,
            alerts: STATE.data.alerts.length,
            alertsLog: STATE.data.alerts.slice(),
            trend
        };
    }

    async function generateSessionSummary(sessionId, summary) {
        // Placeholder untuk fitur summary AI pasca-sesi
        console.log('[SessionManager] Generating summary for', sessionId, summary);
    }

    // --- Helpers ---
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // Hitung durasi sesi aktif dalam detik (0 jika tidak ada sesi aktif).
    function getElapsedSeconds() {
        if (STATE.status !== 'ACTIVE' || !STATE.startTime) return 0;
        const diff = Math.floor((Date.now() - STATE.startTime) / 1000);
        return diff > 0 ? diff : 0;
    }

    // --- Public API ---
    window.SessionManager = {
        init,
        requestStart,
        startSession, // Buat public utk debug/manual start
        stopSession,
        recordTick,
        recordAlert,
        isActive: () => STATE.status === 'ACTIVE',
        getState: () => STATE,
        getElapsedSeconds,
    };

})();
