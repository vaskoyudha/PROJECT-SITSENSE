(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const flag = params.get('testAudio');
  if (!flag) return;

  const PRESETS = {
    quick: {
      audioEscalation: [
        { minMinutes: 0.1, cue: 'gentle' },  // ~6 detik
        { minMinutes: 0.25, cue: 'firm' },   // ~15 detik
        { minMinutes: 0.4, cue: 'critical' } // ~24 detik
      ],
      aiThresholdStreak: 0.5 // ~30 detik
    },
    faster: {
      audioEscalation: [
        { minMinutes: 0.05, cue: 'gentle' },
        { minMinutes: 0.12, cue: 'firm' },
        { minMinutes: 0.2, cue: 'critical' }
      ],
      aiThresholdStreak: 0.25
    }
  };

  const preset = PRESETS[flag] || PRESETS.quick;

  function applyOverrides() {
    if (!window.SessionManager || typeof window.SessionManager.getState !== 'function') {
      console.warn('[SessionDebug] SessionManager not ready yet, retrying...');
      setTimeout(applyOverrides, 300);
      return;
    }
    const state = window.SessionManager.getState();
    if (!state || !state.config) {
      console.warn('[SessionDebug] SessionManager state unavailable');
      return;
    }
    state.config.audioEscalation = preset.audioEscalation;
    state.config.aiThresholdStreak = preset.aiThresholdStreak;
    window.SitSenseUI?.showToast?.('Audio test mode active (fast thresholds)', 'warn');
    console.log('[SessionDebug] Applied audio test preset:', preset);
  }

  document.addEventListener('DOMContentLoaded', applyOverrides);
})();







