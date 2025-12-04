/*
  SitSense — time-scale.js
  ------------------------
  Engine kecil untuk mengatur "percepatan waktu" (time scale) khusus testing.
  Konsep:
    - scale = 1   → waktu normal (production / user biasa)
    - scale = 10  → 1 menit logis terasa seperti 6 detik waktu nyata

  API global (window.SitSenseTime):
    - getScale()          → number
    - setScale(factor)    → atur faktor time scale (clamped)
    - toScaledMs(ms)      → ms / scale (dipakai untuk interval/cooldown)
    - fromMinutes(min)    → (min * 60 * 1000) / scale (menit logis → ms nyata)
    - getMode()           → 'user' | 'admin'

  Catatan:
    - Nilai default scale diambil dari settings (debug.timeScale) bila ada, else 1.
    - setScale() hanya mengubah engine waktu + broadcast event,
      penyimpanan ke localStorage dikelola modul settings.js.
*/
(function(){
  'use strict';

  const STORAGE_KEY = 'sitsense_settings_v1';
  const MODE_KEY = 'sitsense_mode';

  function safeParse(json, fallback){
    try { return JSON.parse(json); } catch(_) { return fallback; }
  }

  function detectInitialScale(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return 1;
      const obj = safeParse(raw, null);
      const debugScale = obj && obj.debug && typeof obj.debug.timeScale === 'number'
        ? obj.debug.timeScale
        : 1;
      return Number.isFinite(debugScale) && debugScale > 0 ? debugScale : 1;
    }catch(_){
      return 1;
    }
  }

  function detectMode(){
    try{
      const params = new URLSearchParams(window.location.search || '');
      if (params.get('admin') === '1') return 'admin';
    }catch(_){}
    try{
      const flag = localStorage.getItem(MODE_KEY);
      if (flag === 'admin') return 'admin';
    }catch(_){}
    return 'user';
  }

  // Refresh mode detection (dipanggil saat halaman dimuat ulang atau navigasi)
  function refreshMode(){
    state.mode = detectMode();
    return state.mode;
  }

  const state = {
    scale: detectInitialScale(),
    mode: detectMode(),
  };

  function clampScale(v){
    if (!Number.isFinite(v)) return 1;
    // Batasi agar tidak terlalu ekstrem tapi tetap fleksibel untuk demo
    return Math.min(60, Math.max(0.1, v));
  }

  function getScale(){
    return state.scale;
  }

  function setScale(factor){
    const next = clampScale(Number(factor) || 1);
    if (next === state.scale) return;
    state.scale = next;
    try{
      console.log('[SitSenseTime] scale set to', next, 'x');
    }catch(_){}
    // Broadcast agar modul lain dapat menyesuaikan threshold/interval
    try{
      const ev = new CustomEvent('sitsense:timeScaleChanged', { detail: { scale: next } });
      window.dispatchEvent(ev);
    }catch(_){}
  }

  function toScaledMs(ms){
    const s = getScale();
    if (!Number.isFinite(ms)) return 0;
    return ms / (s || 1);
  }

  function fromMinutes(min){
    const s = getScale();
    if (!Number.isFinite(min)) return 0;
    return (min * 60 * 1000) / (s || 1);
  }

  function getMode(){
    return state.mode;
  }

  window.SitSenseTime = {
    getScale,
    setScale,
    toScaledMs,
    fromMinutes,
    getMode,
    refreshMode, // Expose untuk refresh saat navigasi
  };

  // Refresh mode saat DOM ready (untuk handle navigasi dari sidebar)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshMode);
  } else {
    refreshMode();
  }
})();


