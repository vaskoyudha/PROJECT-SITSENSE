(function () {
  'use strict';

  const BASE_STORAGE_KEY = 'sitsense_history_v1';
  const MAX_LOCAL_SESSIONS = 50;
  const MAX_SAMPLES_PER_SESSION = 720; // ~2 jam @ 10s per tick

  let currentSession = null;

  function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'hist-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function getStorageKey() {
    // Gunakan user-specific storage key jika UserContext tersedia
    if (window.UserContext && typeof window.UserContext.getUserStorageKey === 'function') {
      return window.UserContext.getUserStorageKey('history_v1');
    }
    // Fallback ke base key untuk backward compatibility
    return BASE_STORAGE_KEY;
  }

  function readStore() {
    try {
      const storageKey = getStorageKey();
      const currentUserId = window.UserContext?.getCurrentUserId();
      
      // Verifikasi bahwa storage key sesuai dengan user yang sedang login
      if (currentUserId && !storageKey.includes(`_${currentUserId}`)) {
        // Storage key tidak sesuai dengan user yang sedang login
        // Clear data lama untuk menghindari data leakage
        console.warn('[SitSenseHistory] Storage key mismatch, clearing old data');
        try {
          localStorage.removeItem(storageKey);
        } catch (e) {
          console.warn('[SitSenseHistory] Failed to clear mismatched storage:', e);
        }
        return [];
      }
      
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (err) {
      console.warn('[SitSenseHistory] Failed to parse store', err);
    }
    return [];
  }

  function writeStore(list) {
    try {
      const storageKey = getStorageKey();
      localStorage.setItem(storageKey, JSON.stringify(list.slice(0, MAX_LOCAL_SESSIONS)));
    } catch (err) {
      console.warn('[SitSenseHistory] Failed to persist store', err);
    }
  }

  function summarizeSession(payload) {
    if (!payload) return null;
    const tickIntervalSec = (payload.config?.tickInterval || 10000) / 1000;
    const ticks = payload.ticks || [];
    const scores = ticks.map(t => Number(t.score) || 0).filter(Boolean);
    const avgScore = scores.length
      ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
      : 0;
    const goodSamples = scores.filter(s => s >= 80).length;
    const badSamples = scores.filter(s => s < 60).length;
    const durationSec = Math.max(1, Math.floor((payload.endTime - payload.startTime) / 1000));
    const trendWindow = Math.min(5, scores.length);
    let trend = 'stabil';
    if (trendWindow >= 2) {
      const headAvg = scores.slice(0, trendWindow).reduce((a, b) => a + b, 0) / trendWindow;
      const tailAvg = scores.slice(scores.length - trendWindow).reduce((a, b) => a + b, 0) / trendWindow;
      if (tailAvg - headAvg >= 8) trend = 'meningkat';
      else if (headAvg - tailAvg >= 8) trend = 'menurun';
    }

    return {
      id: payload.sessionId,
      deviceId: payload.deviceId,
      startTs: payload.startTime,
      endTs: payload.endTime,
      durationSec,
      avgScore,
      goodCount: goodSamples,
      badCount: badSamples,
      goodSeconds: goodSamples * tickIntervalSec,
      badSeconds: badSamples * tickIntervalSec,
      alerts: payload.alerts?.length || 0,
      alertsLog: payload.alerts || [],
      trend,
      lastAlert: payload.alerts?.slice(-1)[0] || null
    };
  }

  function formatDuration(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}j ${m}m`;
    return `${m}m`;
  }

  const SitSenseHistory = {
    startSession(meta = {}) {
      currentSession = {
        sessionId: meta.sessionId || generateId(),
        deviceId: meta.deviceId || null,
        startTime: meta.startTime || Date.now(),
        ticks: [],
        alerts: [],
        config: meta.config || {},
      };
      window.dispatchEvent(new CustomEvent('sitsense:history:session-start', { detail: currentSession }));
      return currentSession.sessionId;
    },
    recordTick(sample = {}) {
      if (!currentSession) return;
      const tick = {
        ts: sample.ts || Date.now(),
        score: Number(sample.score) || 0,
        back: sample.back ?? null,
        neck: sample.neck ?? null,
        pressure: sample.pressure ?? null,
        imbalance: sample.imbalance || null
      };
      currentSession.ticks.push(tick);
      if (currentSession.ticks.length > MAX_SAMPLES_PER_SESSION) {
        currentSession.ticks.shift();
      }
    },
    recordAlert(alert = {}) {
      if (!currentSession) return;
      currentSession.alerts.push({
        ts: alert.ts || Date.now(),
        type: alert.type || 'unknown'
      });
    },
    finishSession(extra = {}) {
      if (!currentSession) return null;
      const payload = {
        ...currentSession,
        endTime: extra.endTime || Date.now(),
        config: { ...currentSession.config, ...(extra.config || {}) }
      };
      const summary = summarizeSession(payload);
      if (summary) {
        const list = readStore();
        list.unshift(summary);
        writeStore(list);
        window.dispatchEvent(new CustomEvent('sitsense:history:new-session', { detail: summary }));
      }
      currentSession = null;
      return summary;
    },
    getRecent(limit = 5) {
      return readStore().slice(0, limit);
    },
    getAll() {
      return readStore();
    },
    buildAIContext(limit = 5) {
      const sessions = this.getRecent(limit);
      if (!sessions.length) return '';
      const totalAvg = Math.round(
        sessions.reduce((sum, s) => sum + (s.avgScore || 0), 0) / sessions.length
      );
      const totalDuration = sessions.reduce((sum, s) => sum + (s.durationSec || 0), 0);
      const alertsTotal = sessions.reduce((sum, s) => sum + (s.alerts || 0), 0);
      const lines = [
        `Total sesi terbaru: ${sessions.length} • Rata-rata skor ${totalAvg}`,
        `Total durasi: ${formatDuration(totalDuration)} • Alert ${alertsTotal}`
      ];
      sessions.slice(0, 3).forEach((s, idx) => {
        const date = new Date(s.startTs);
        const label = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
        lines.push(
          `Sesi ${idx + 1} (${label}): durasi ${formatDuration(s.durationSec)}, skor ${s.avgScore}, trend ${s.trend}`
        );
      });
      return lines.join('\n');
    },
    getAIMetadata() {
      const sessions = this.getRecent(10);
      if (!sessions.length) return null;
      const avg = Math.round(sessions.reduce((sum, s) => sum + (s.avgScore || 0), 0) / sessions.length);
      const last = sessions[0];
      return {
        recentAvg: avg,
        lastScore: last?.avgScore || 0,
        lastDuration: last?.durationSec || 0,
        alertsLastWeek: sessions.reduce((sum, s) => sum + (s.alerts || 0), 0),
        trendSample: last?.trend || 'stabil'
      };
    }
  };

  window.SitSenseHistory = SitSenseHistory;
})();

