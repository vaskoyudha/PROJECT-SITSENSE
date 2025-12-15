/*
  SitSense — alerts.js
  ---------------------
  Stop-watch durasi duduk + peringatan audio berbasis ambang (soft/hard),
  dengan API publik berikut (window.SitSenseAlerts):

    startSitTimer()                 // mulai hitung (jika belum jalan)
    stopSitTimer()                  // hentikan hitung (pause, simpan elapsed)
    resetSitTimer()                 // reset ke 0 dan hentikan
    setThresholds({ soft, hard, repeatSoftSec?, repeatHardSec? }) // detik
    getElapsedSeconds()             // integer detik
    onThresholdHit(cb)              // cb({ type:'soft'|'hard', elapsed })
    setMuted(flag)                  // matikan/nyalakan suara
    playAlert(type)                 // paksa mainkan 'soft' atau 'hard'

  UI yang disentuh (opsional bila ID ada):
    #sitDuration, #softThresholdLabel, #hardThresholdLabel
    <audio id="alertSoft">, <audio id="alertHard">

  Catatan autoplay: beberapa browser butuh user gesture.
  Jika play() gagal, sistem akan menunggu klik/touch berikutnya untuk memutar audio tertunda.
*/
(function(){
  const state = {
    running: false,
    startAt: 0,           // timestamp ms ketika start terakhir
    carry: 0,             // akumulasi durasi ms dari sesi sebelumnya
    tickId: null,
    thresholds: { soft: 30*60, hard: 60*60, repeatSoftSec: 15*60, repeatHardSec: 30*60 },
    // Nilai ambang mentah dalam menit (dipakai untuk time scale testing)
    rawMinutes: { softMin: 30, hardMin: 60, repeatSoftMin: 15, repeatHardMin: 30 },
    lastSoftAt: null,     // detik ketika soft dipicu
    lastHardAt: null,     // detik ketika hard dipicu
    muted: false,
    pendingAudio: null,   // 'soft'|'hard' menunggu user gesture
  };

  const fmt = (s)=>{
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s/3600); s%=3600; const m=Math.floor(s/60); const sec=s%60;
    const pad = n=>String(n).padStart(2,'0');
    return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  };

  function nowSec(){ return Math.floor(Date.now()/1000); }
  function elapsedSec(){
    if (!state.running) return Math.floor(state.carry/1000);
    return Math.floor((Date.now()-state.startAt + state.carry)/1000);
  }

  function updateClockUI(){
    const el = document.getElementById('sitDuration');
    if (el) el.textContent = fmt(elapsedSec());
  }

  function toHumanMinFromMinutes(min){
    const m = Math.round(min);
    return m >= 60 ? `${Math.floor(m/60)}j${String(m%60).padStart(2,'0')}m` : `${m}m`;
  }

  function updateThresholdLabels(){
    const soft = document.getElementById('softThresholdLabel');
    const hard = document.getElementById('hardThresholdLabel');
    // Tampilkan dalam "menit logis" (bukan menit yang sudah di-scale),
    // sehingga admin bisa melihat 30/60 menit walaupun timeScale > 1.
    if (soft){
      if (state.rawMinutes && Number.isFinite(state.rawMinutes.softMin)){
        soft.textContent = toHumanMinFromMinutes(state.rawMinutes.softMin);
      } else {
        soft.textContent = toHumanMin(state.thresholds.soft);
      }
    }
    if (hard){
      if (state.rawMinutes && Number.isFinite(state.rawMinutes.hardMin)){
        hard.textContent = toHumanMinFromMinutes(state.rawMinutes.hardMin);
      } else {
        hard.textContent = toHumanMin(state.thresholds.hard);
      }
    }
  }
  function toHumanMin(sec){
    const m = Math.round(sec/60);
    return m >= 60 ? `${Math.floor(m/60)}j${String(m%60).padStart(2,'0')}m` : `${m}m`;
  }

  // ---------- Audio ----------
  function getAudioEl(type){
    return document.getElementById(type==='hard' ? 'alertHard' : 'alertSoft');
  }

  async function playAlert(type){
    if (state.muted) return;
    const el = getAudioEl(type);
    if (!el) return;
    try{
      el.currentTime = 0;
      await el.play();
    }catch(err){
      // Autoplay blocked → tunda sampai gesture
      state.pendingAudio = type;
      const once = ()=>{
        document.removeEventListener('click', once);
        document.removeEventListener('touchstart', once);
        const t = state.pendingAudio; state.pendingAudio = null;
        if (t) getAudioEl(t)?.play().catch(()=>{});
      };
      document.addEventListener('click', once, { once:true });
      document.addEventListener('touchstart', once, { once:true });
    }
    // Vibrate (jika ada)
    if (navigator.vibrate) navigator.vibrate(type==='hard' ? [60,40,60] : 40);
  }

  // ---------- Threshold logic ----------
  const listeners = new Set();
  function emit(type){
    const payload = { type, elapsed: elapsedSec() };
    listeners.forEach(fn=>{ try{ fn(payload); }catch(_){} });
    const ev = new CustomEvent('sitsense:alert', { detail: payload });
    document.dispatchEvent(ev);
  }

  function checkThresholds(){
    const e = elapsedSec();
    const { soft, hard, repeatSoftSec, repeatHardSec } = state.thresholds;

    // Hard threshold (prioritas tinggi)
    if (e >= hard){
      const shouldFire = state.lastHardAt === null || (e - state.lastHardAt) >= repeatHardSec;
      if (shouldFire){
        state.lastHardAt = e;
        playAlert('hard');
        emit('hard');
      }
      return; // jangan double trigger soft setelah hard di frame yang sama
    }

    // Soft threshold
    if (e >= soft){
      const shouldFire = state.lastSoftAt === null || (e - state.lastSoftAt) >= repeatSoftSec;
      if (shouldFire){
        state.lastSoftAt = e;
        playAlert('soft');
        emit('soft');
      }
    }
  }

  // ---------- Timer control ----------
  function tick(){
    updateClockUI();
    checkThresholds();
    const ev = new CustomEvent('sitsense:timer:tick', { detail: { elapsed: elapsedSec() } });
    document.dispatchEvent(ev);
  }

  function startSitTimer(){
    if (state.running) return;
    state.running = true;
    state.startAt = Date.now();
    if (state.tickId) clearInterval(state.tickId);
    state.tickId = setInterval(tick, 1000);
    document.dispatchEvent(new CustomEvent('sitsense:timer:start'));
  }

  function stopSitTimer(){
    if (!state.running) return;
    state.carry += Date.now() - state.startAt;
    state.running = false;
    state.startAt = 0;
    if (state.tickId) { clearInterval(state.tickId); state.tickId = null; }
    document.dispatchEvent(new CustomEvent('sitsense:timer:stop', { detail: { elapsed: elapsedSec() } }));
  }

  function resetSitTimer(){
    if (state.tickId) { clearInterval(state.tickId); state.tickId = null; }
    state.running = false; state.startAt = 0; state.carry = 0;
    state.lastSoftAt = null; state.lastHardAt = null;
    updateClockUI();
    document.dispatchEvent(new CustomEvent('sitsense:timer:reset'));
  }

  function setThresholds({ soft, hard, repeatSoftSec, repeatHardSec }){
    if (Number.isFinite(soft) && soft > 0) state.thresholds.soft = Math.floor(soft);
    if (Number.isFinite(hard) && hard > 0) state.thresholds.hard = Math.floor(hard);
    if (Number.isFinite(repeatSoftSec) && repeatSoftSec >= 10) state.thresholds.repeatSoftSec = Math.floor(repeatSoftSec);
    if (Number.isFinite(repeatHardSec) && repeatHardSec >= 10) state.thresholds.repeatHardSec = Math.floor(repeatHardSec);
    // Pastikan konsistensi: hard >= soft
    if (state.thresholds.hard < state.thresholds.soft) state.thresholds.hard = state.thresholds.soft;
    updateThresholdLabels();
  }

  // Versi berbasis menit logis + time scale (khusus admin/testing)
  function setThresholdsFromMinutes({ softMin, hardMin, repeatSoftMin, repeatHardMin }){
    const scale = window.SitSenseTime && typeof window.SitSenseTime.getScale === 'function'
      ? window.SitSenseTime.getScale()
      : 1;

    // Simpan raw untuk label & re-apply saat scale berubah
    const nextRaw = Object.assign({}, state.rawMinutes);
    if (Number.isFinite(softMin) && softMin > 0) nextRaw.softMin = softMin;
    if (Number.isFinite(hardMin) && hardMin > 0) nextRaw.hardMin = hardMin;
    if (Number.isFinite(repeatSoftMin) && repeatSoftMin > 0) nextRaw.repeatSoftMin = repeatSoftMin;
    if (Number.isFinite(repeatHardMin) && repeatHardMin > 0) nextRaw.repeatHardMin = repeatHardMin;
    state.rawMinutes = nextRaw;

    const s = Math.max(0.1, Number(scale) || 1);
    const softSec = nextRaw.softMin * 60 / s;
    const hardSec = nextRaw.hardMin * 60 / s;
    const rSoftSec = nextRaw.repeatSoftMin * 60 / s;
    const rHardSec = nextRaw.repeatHardMin * 60 / s;

    state.thresholds.soft = Math.floor(softSec);
    state.thresholds.hard = Math.floor(hardSec);
    state.thresholds.repeatSoftSec = Math.floor(rSoftSec);
    state.thresholds.repeatHardSec = Math.floor(rHardSec);
    if (state.thresholds.hard < state.thresholds.soft) state.thresholds.hard = state.thresholds.soft;
    updateThresholdLabels();
  }

  // Re-apply skala ketika admin mengubah timeScale di tengah sesi
  window.addEventListener('sitsense:timeScaleChanged', function(ev){
    try{
      setThresholdsFromMinutes(state.rawMinutes || {});
    }catch(_){}
  });

  function onThresholdHit(cb){ if (typeof cb === 'function') listeners.add(cb); return ()=>listeners.delete(cb); }
  function setMuted(flag){ state.muted = !!flag; }

  // Pause/resume behavior when tab hidden/visible → tetap akurat (pakai time delta)
  document.addEventListener('visibilitychange', ()=>{
    if (!state.running) return;
    if (document.hidden){
      // biarkan berjalan; tick berbasis setInterval mungkin throttled tapi elapsed menghitung delta waktu riil
      return;
    } else {
      // saat kembali, paksa update UI langsung
      tick();
    }
  });

  // Public API
  window.SitSenseAlerts = {
    startSitTimer,
    stopSitTimer,
    resetSitTimer,
    setThresholds,
    setThresholdsFromMinutes,
    getElapsedSeconds: elapsedSec,
    onThresholdHit,
    setMuted,
    playAlert,
  };

  // Boot ringan saat DOM siap
  document.addEventListener('DOMContentLoaded', ()=>{
    updateClockUI();
    updateThresholdLabels();
  });
})();
