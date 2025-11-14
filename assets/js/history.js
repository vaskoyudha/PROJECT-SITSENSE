/*
  SitSense — history.js
  ----------------------
  Mengambil data riwayat dari Firebase (atau DEMO), melakukan agregasi per jam/hari/minggu,
  menampilkan KPI, grafik, tabel sesi, pagination, dan export CSV.

  Asumsi struktur RTDB:
    /history/sessions/{id} : {
      startTs: number (ms),
      endTs: number (ms),
      avgPressure?: number,    // 0..100
      avgScore?: number,       // 0..100
      goodCount?: number,      // menit/detik kategori "Baik"
      badCount?: number,       // menit/detik kategori "Buruk"
      alerts?: number,         // jumlah peringatan dalam sesi
      note?: string
    }
  Catatan: Jika field tertentu tidak ada, script akan mencoba menghitung dari yang tersedia atau memberi default.
*/
(function(){
  'use strict';
  
  // ---------------- Utils ----------------
  const $ = (s, r=document)=> r.querySelector(s);
  const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));

  const fmtTime = (ts)=>{
    if (!Number.isFinite(ts)) return '--:--';
    const d = new Date(ts);
    const p = (n)=> String(n).padStart(2,'0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const fmtDate = (ts)=>{
    if (!Number.isFinite(ts)) return '--';
    const d = new Date(ts); const p=(n)=> String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  };
  const fmtDur = (sec)=>{
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec/3600); sec%=3600; const m = Math.floor(sec/60); const s = sec%60;
    const pad = (n)=> String(n).padStart(2,'0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  function toStartOfDay(ts){ 
    if (!Number.isFinite(ts)) return Date.now();
    const d=new Date(ts); d.setHours(0,0,0,0); return d.getTime(); 
  }
  function toStartOfWeek(ts){ 
    if (!Number.isFinite(ts)) return Date.now();
    const d=new Date(toStartOfDay(ts)); 
    const day=(d.getDay()||7); 
    d.setDate(d.getDate()-(day-1)); 
    return d.getTime(); 
  }
  function addDays(ts, n){ 
    if (!Number.isFinite(ts)) return Date.now();
    const d=new Date(ts); d.setDate(d.getDate()+n); return d.getTime(); 
  }
  function clamp(val, a, b){ return Math.max(a, Math.min(b, val)); }

  // ---------------- State ----------------
  const STATE = {
    sessions: [],       // hasil query
    page: 1,
    pageSize: 10,
    charts: { pressure: null, quality: null },
    isLoading: false,
    _lastAgg: null,
  };

  // ---------------- Fetch data ----------------
  async function fetchSessions(range){
    // range: { from: ms, to: ms }
    if (!range || !Number.isFinite(range.from) || !Number.isFinite(range.to)) {
      console.warn('[SitSense] Invalid range provided');
      return [];
    }

    // Check for demo mode
    const isDemo = /[?&]demo=1\b/.test(location.search) || 
                   !window.firebase || 
                   !window.firebase.database ||
                   !window.__SITSENSE_FIREBASE_READY__;
    
    if (isDemo) {
      console.info('[SitSense] Running in DEMO mode');
      return demoSessions(range);
    }

    try{
      const db = firebase.database();
      if (!db) {
        console.warn('[SitSense] Firebase database not available, using demo data');
        return demoSessions(range);
      }

      const ref = db.ref('/history/sessions');
      if (!ref) {
        console.warn('[SitSense] Cannot access /history/sessions, using demo data');
        return demoSessions(range);
      }

      // Query dengan range waktu
      const endTime = range.to + 86400000 - 1; // sampai akhir hari
      const snap = await ref.orderByChild('startTs')
                            .startAt(range.from)
                            .endAt(endTime)
                            .once('value');
      
      const val = snap.val() || {};
      const list = Object.keys(val).map(id => {
        const session = val[id];
        return { 
          id, 
          startTs: Number(session.startTs) || 0,
          endTs: Number(session.endTs) || 0,
          avgPressure: Number(session.avgPressure) || null,
          avgScore: Number(session.avgScore) || null,
          goodCount: Number(session.goodCount) || 0,
          badCount: Number(session.badCount) || 0,
          alerts: Number(session.alerts) || 0,
          note: String(session.note || '')
        };
      })
      .filter(x => Number.isFinite(x.startTs) && Number.isFinite(x.endTs) && x.startTs > 0 && x.endTs > x.startTs)
      .sort((a,b)=> a.startTs - b.startTs);
      
      console.info(`[SitSense] Fetched ${list.length} sessions from Firebase`);
      return list;
    } catch(e){ 
      console.error('[SitSense] history fetch error:', e); 
      window.SitSenseUI?.showToast?.('Gagal memuat data dari Firebase. Menggunakan data demo.', 'warn');
      return demoSessions(range); 
    }
  }

  function demoSessions(range){
    // Buat data dummy tersebar dalam rentang
    const out = [];
    const dayMs = 86400000; const hourMs = 3600000;
    const from = toStartOfDay(range.from), to = toStartOfDay(range.to);
    for (let t = from; t <= to; t += dayMs){
      const sessionsPerDay = 2 + Math.floor(Math.random()*2); // 2-3 sesi/hari
      for (let i=0;i<sessionsPerDay;i++){
        const start = t + (8+Math.random()*8)*hourMs; // antara 08:00 - 24:00
        const dur = (20 + Math.floor(Math.random()*80)) * 60; // 20-100 menit
        const end = start + dur*1000;
        const score = clamp(Math.round(70 + (Math.random()*30-15)), 30, 95);
        const pressure = clamp(Math.round(40 + (Math.random()*30-15)), 15, 95);
        const good = Math.round(dur * clamp((score/100), 0.2, 0.9));
        const bad = Math.max(0, dur - good - Math.round(Math.random()*10));
        const alerts = Math.round(dur/45) + (score<55?1:0);
        out.push({ id: `demo_${t}_${i}`, startTs: start, endTs: end, avgPressure: pressure, avgScore: score, goodCount: good, badCount: bad, alerts, note: (score<50? 'Perlu perbaikan duduk':'') });
      }
    }
    return out.sort((a,b)=> a.startTs - b.startTs);
  }

  // ---------------- Aggregation ----------------
  function aggregate(sessions, agg){
    // Return { labels:[], pressureVals:[], qualityCounts:{good,fix,bad}, kpi:{...} }
    const buckets = new Map();
    const quality = { good:0, fix:0, bad:0 };

    let totalDur=0, totalSess=0, totalAlerts=0, totalGood=0, totalBad=0;

    for (const s of sessions){
      const durSec = Math.max(0, Math.floor((s.endTs - s.startTs)/1000));
      totalDur += durSec; totalSess++; totalAlerts += (s.alerts||0);
      totalGood += (s.goodCount||0); totalBad += (s.badCount||0);

      // bucket key
      let key;
      if (agg === 'hour') {
        const dayStart = toStartOfDay(s.startTs);
        const hour = new Date(s.startTs).getHours();
        // Use string key format: "timestamp_hour" for proper sorting
        key = `${dayStart}_${hour}`;
      } else if (agg === 'week') {
        key = toStartOfWeek(s.startTs);
      } else {
        key = toStartOfDay(s.startTs); // day
      }

      if (!buckets.has(key)) buckets.set(key, { n:0, pressureSum:0, scoreSum:0 });
      const b = buckets.get(key);
      b.n++;
      b.pressureSum += Number.isFinite(s.avgPressure) ? s.avgPressure : 0;
      b.scoreSum += Number.isFinite(s.avgScore) ? s.avgScore : 0;

      // quality from avgScore
      const sc = Number.isFinite(s.avgScore) ? s.avgScore : 60;
      if (sc >= 75) quality.good++; else if (sc >= 50) quality.fix++; else quality.bad++;
    }

    const labels = []; const pressureVals = [];
    const keys = Array.from(buckets.keys()).sort((a,b)=> {
      // Handle hour aggregation keys (string format)
      if (agg === 'hour' && typeof a === 'string' && typeof b === 'string') {
        const [aTs, aH] = a.split('_').map(Number);
        const [bTs, bH] = b.split('_').map(Number);
        if (aTs !== bTs) return aTs - bTs;
        return aH - bH;
      }
      return Number(a) - Number(b);
    });
    for (const k of keys){
      const b = buckets.get(k);
      const avgP = b.n ? (b.pressureSum/b.n) : 0;
      pressureVals.push(Math.round(avgP));
      labels.push(formatBucketLabel(k, agg));
    }

    const kpi = {
      totalDurationSec: totalDur,
      sessions: totalSess,
      avgSessionSec: totalSess? Math.round(totalDur/totalSess) : 0,
      goodPct: (totalGood+totalBad>0) ? Math.round((totalGood/(totalGood+totalBad))*100) : clamp(Math.round((quality.good/(totalSess||1))*100),0,100),
      alerts: totalAlerts,
    };

    return { labels, pressureVals, qualityCounts: quality, kpi };
  }

  function formatBucketLabel(key, agg){
    if (agg==='hour'){
      // key format: "timestamp_hour"
      if (typeof key === 'string' && key.includes('_')) {
        const [timestamp, hour] = key.split('_').map(Number);
        const d = new Date(timestamp);
        const p=(n)=> String(n).padStart(2,'0');
        return `${p(d.getDate())}/${p(d.getMonth()+1)} ${p(hour)}:00`;
      }
      return '--';
    }
    if (agg==='week'){
      if (!Number.isFinite(key)) return '--';
      const d = new Date(key);
      const p=(n)=> String(n).padStart(2,'0');
      const end = addDays(key, 6);
      const de = new Date(end);
      return `${p(d.getDate())}/${p(d.getMonth()+1)}–${p(de.getDate())}/${p(de.getMonth()+1)}`;
    }
    // day
    if (!Number.isFinite(key)) return '--';
    const d = new Date(key);
    const p=(n)=> String(n).padStart(2,'0');
    return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`;
  }

  // ---------------- Charts ----------------
  function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function theme(){
    const accent = cssVar('--color-accent') || '#5cc8ff';
    const gridRGB = cssVar('--chart-grid-rgb') || '255,255,255';
    const gridA = parseFloat(cssVar('--chart-grid-alpha') || '.08');
    const tickRGB = cssVar('--chart-tick-rgb') || '231,238,252';
    const tickA = parseFloat(cssVar('--chart-tick-alpha') || '.65');
    return { accent, grid:`rgba(${gridRGB},${isNaN(gridA)?0.08:gridA})`, tick:`rgba(${tickRGB},${isNaN(tickA)?0.65:tickA})`, good:'#10b981', warn:'#f59e0b', bad:'#ef4444' };
  }
  function initCharts(){
    const t = theme();
    const hp = $('#historyPressure'); 
    const hq = $('#historyQuality');
    
    if (!hp || !hq || !window.Chart) {
      console.warn('[SitSense] Charts not initialized: missing canvas or Chart.js');
      return;
    }

    // Destroy existing charts if they exist
    if (STATE.charts.pressure) {
      STATE.charts.pressure.destroy();
      STATE.charts.pressure = null;
    }
    if (STATE.charts.quality) {
      STATE.charts.quality.destroy();
      STATE.charts.quality = null;
    }

    try {
      const ctxP = hp.getContext('2d');
      STATE.charts.pressure = new Chart(ctxP, {
        type: 'line', 
        data: { 
          labels: [], 
          datasets: [{ 
            label: 'Tekanan rata-rata', 
            data: [], 
            borderColor: t.accent, 
            backgroundColor: t.accent + '20', 
            fill: true,
            tension: 0.4, 
            pointRadius: 3, 
            pointHoverRadius: 5,
            borderWidth: 2 
          }] 
        },
        options: { 
          responsive: true, 
          maintainAspectRatio: false, 
          plugins: { 
            legend: { display: false }, 
            tooltip: { 
              mode: 'index', 
              intersect: false,
              backgroundColor: 'rgba(0,0,0,0.8)',
              titleColor: '#fff',
              bodyColor: '#fff',
              borderColor: t.accent,
              borderWidth: 1
            } 
          }, 
          scales: { 
            x: { 
              grid: { color: t.grid }, 
              ticks: { color: t.tick, maxRotation: 45, minRotation: 0 } 
            }, 
            y: { 
              beginAtZero: true, 
              max: 100,
              grid: { color: t.grid }, 
              ticks: { color: t.tick } 
            } 
          } 
        }
      });

      const ctxQ = hq.getContext('2d');
      STATE.charts.quality = new Chart(ctxQ, {
        type: 'doughnut', 
        data: { 
          labels: ['Baik (≥75)', 'Perlu Koreksi (50-74)', 'Buruk (<50)'], 
          datasets: [{ 
            data: [0, 0, 0], 
            backgroundColor: [t.good, t.warn, t.bad], 
            borderColor: 'transparent',
            borderWidth: 0
          }] 
        },
        options: { 
          responsive: true, 
          maintainAspectRatio: false, 
          cutout: '68%', 
          plugins: { 
            legend: { 
              position: 'bottom', 
              labels: { 
                color: t.tick, 
                boxWidth: 12,
                padding: 12,
                font: { size: 12 }
              } 
            },
            tooltip: {
              backgroundColor: 'rgba(0,0,0,0.8)',
              titleColor: '#fff',
              bodyColor: '#fff',
              borderColor: t.accent,
              borderWidth: 1
            }
          } 
        }
      });
    } catch (e) {
      console.error('[SitSense] Error initializing charts:', e);
    }
  }
  function updateCharts(aggData){
    if (!STATE.charts.pressure || !STATE.charts.quality) return;
    const t = theme();
    const chP = STATE.charts.pressure; chP.data.labels = aggData.labels; chP.data.datasets[0].data = aggData.pressureVals; chP.options.scales.x.grid.color = t.grid; chP.options.scales.y.grid.color = t.grid; chP.options.scales.x.ticks.color = t.tick; chP.options.scales.y.ticks.color = t.tick; chP.update('none');
    const chQ = STATE.charts.quality; chQ.data.datasets[0].data = [aggData.qualityCounts.good, aggData.qualityCounts.fix, aggData.qualityCounts.bad]; chQ.data.datasets[0].backgroundColor = [t.good,t.warn,t.bad]; chQ.options.plugins.legend.labels.color = t.tick; chQ.update('none');
  }
  // Theme observer
  const mo = new MutationObserver(()=>{ if (STATE._lastAgg) updateCharts(STATE._lastAgg); });
  mo.observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] });

  // ---------------- KPI & Table ----------------
  function updateKPI(kpi){
    $('#kpiTotalDuration') && ($('#kpiTotalDuration').textContent = fmtDur(kpi.totalDurationSec));
    $('#kpiSessions') && ($('#kpiSessions').textContent = kpi.sessions);
    $('#kpiAvgSession') && ($('#kpiAvgSession').textContent = fmtDur(kpi.avgSessionSec));
    $('#kpiGoodPct') && ($('#kpiGoodPct').textContent = `${kpi.goodPct}%`);
    $('#kpiAlerts') && ($('#kpiAlerts').textContent = kpi.alerts);
  }

  function renderTable(sessions){
    const body = $('#historyTableBody'); 
    if (!body) return;
    
    if (!sessions || !sessions.length) { 
      body.innerHTML = `<tr><td colspan="9" class="text-center text-slate-400 py-8">
        <i data-lucide="inbox" class="h-8 w-8 mx-auto mb-2 text-slate-500"></i>
        <p>Tidak ada data untuk rentang waktu yang dipilih</p>
      </td></tr>`; 
      if (window.lucide) window.lucide.createIcons();
      const summary = $('#historySummary');
      if (summary) summary.textContent = 'Menampilkan 0 sesi'; 
      return; 
    }

    const start = (STATE.page-1)*STATE.pageSize;
    const pageItems = sessions.slice(start, start+STATE.pageSize);

    body.innerHTML = pageItems.map(s=>{
      const durSec = Math.max(0, Math.floor((s.endTs - s.startTs)/1000));
      const dateStr = fmtDate(s.startTs);
      const note = s.note ? String(s.note).replace(/[<>]/g,'').substring(0, 50) : '';
      const safeScore = Number.isFinite(s.avgScore) ? Math.round(s.avgScore) : '-';
      const safeGood = Number.isFinite(s.goodCount) ? s.goodCount : 0;
      const safeBad  = Number.isFinite(s.badCount) ? s.badCount  : 0;
      
      // Color coding untuk skor
      let scoreClass = '';
      if (Number.isFinite(s.avgScore)) {
        if (s.avgScore >= 75) scoreClass = 'text-emerald-400';
        else if (s.avgScore >= 50) scoreClass = 'text-yellow-400';
        else scoreClass = 'text-rose-400';
      }
      
      return `<tr class="hover cursor-pointer" data-session-id="${s.id || ''}">
        <td class="font-medium">${dateStr}</td>
        <td>${fmtTime(s.startTs)}</td>
        <td>${fmtTime(s.endTs)}</td>
        <td>${fmtDur(durSec)}</td>
        <td class="${scoreClass} font-semibold">${safeScore}</td>
        <td class="text-emerald-400">${safeGood}</td>
        <td class="text-rose-400">${safeBad}</td>
        <td class="text-yellow-400">${s.alerts||0}</td>
        <td class="text-sm text-slate-400">${note || '-'}</td>
      </tr>`;
    }).join('');

    const total = sessions.length;
    const end = Math.min(start + STATE.pageSize, total);
    const summary = $('#historySummary');
    if (summary) {
      summary.textContent = `Menampilkan ${start+1}–${end} dari ${total} sesi`;
    }

    // Pagination buttons
    const prevBtn = $('#prevPage');
    const nextBtn = $('#nextPage');
    if (prevBtn) prevBtn.disabled = (STATE.page<=1);
    if (nextBtn) nextBtn.disabled = (end>=total);

    // Add click handlers for row details (optional)
    body.querySelectorAll('tr[data-session-id]').forEach(row => {
      row.addEventListener('click', function() {
        const sessionId = this.getAttribute('data-session-id');
        if (sessionId) {
          console.log('[SitSense] Session clicked:', sessionId);
          // Bisa ditambahkan modal detail sesi di sini
        }
      });
    });
  }

  // ---------------- Export CSV ----------------
  function exportCSV(sessions){
    if (!sessions || !sessions.length) {
      window.SitSenseUI?.showToast?.('Tidak ada data untuk diekspor', 'warn');
      return;
    }

    try {
      const header = ['Tanggal','Mulai','Selesai','Durasi (detik)','Skor Rata-rata','Baik','Buruk','Peringatan','Catatan'];
      const rows = sessions.map(s=>{
        const durSec = Math.max(0, Math.floor((s.endTs - s.startTs)/1000));
        return [
          fmtDate(s.startTs), 
          fmtTime(s.startTs), 
          fmtTime(s.endTs), 
          durSec,
          Number.isFinite(s.avgScore) ? Math.round(s.avgScore) : '', 
          s.goodCount||0, 
          s.badCount||0, 
          s.alerts||0,
          (s.note||'').replace(/\n/g,' ').replace(/"/g,'""')
        ];
      });
      
      // Add BOM for Excel compatibility
      const BOM = '\uFEFF';
      const csv = BOM + [header].concat(rows).map(r=> 
        r.map(x=> `"${String(x).replace(/"/g,'""')}"`).join(',')
      ).join('\n');
      
      const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); 
      a.href = url; 
      a.download = `sitsense-history-${new Date().toISOString().slice(0,10)}.csv`; 
      document.body.appendChild(a); 
      a.click(); 
      document.body.removeChild(a); 
      URL.revokeObjectURL(url);
      
      window.SitSenseUI?.showToast?.('Data berhasil diekspor', 'success');
    } catch (e) {
      console.error('[SitSense] Export CSV error:', e);
      window.SitSenseUI?.showToast?.('Gagal mengekspor data', 'error');
    }
  }

  // ---------------- Controller ----------------
  async function applyFilters(){
    if (STATE.isLoading) return; // Prevent multiple simultaneous requests
    
    STATE.isLoading = true;
    const btn = $('#btnFetchHistory');
    const originalText = btn ? btn.innerHTML : '';
    
    try {
      if (window.NProgress) NProgress.start();
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="loading loading-spinner loading-sm"></span> Memuat...';
      }

      const fd = $('#fromDate');
      const td = $('#toDate');
      const agg = $('#agg');
      
      if (!fd || !td || !agg) {
        window.SitSenseUI?.showToast?.('Elemen form tidak ditemukan', 'error');
        return;
      }

      const fromDate = fd.value;
      const toDate = td.value;
      const aggregation = agg.value || 'day';
      
      if (!fromDate || !toDate) {
        window.SitSenseUI?.showToast?.('Pilih tanggal terlebih dahulu', 'warn');
        return;
      }

      // Validate date range
      const from = new Date(fromDate + 'T00:00:00').getTime();
      const to = new Date(toDate + 'T23:59:59').getTime();
      
      if (isNaN(from) || isNaN(to)) {
        window.SitSenseUI?.showToast?.('Format tanggal tidak valid', 'error');
        return;
      }

      if (from > to) {
        window.SitSenseUI?.showToast?.('Tanggal mulai harus sebelum tanggal akhir', 'warn');
        return;
      }

      // Check if range is too large (optional: limit to 90 days)
      const daysDiff = Math.ceil((to - from) / (1000 * 60 * 60 * 24));
      if (daysDiff > 90) {
        window.SitSenseUI?.showToast?.('Rentang maksimal 90 hari. Memuat data terbatas...', 'warn');
      }

      const sessions = await fetchSessions({ from, to });
      STATE.sessions = sessions;
      STATE.page = 1;
      
      const aggData = aggregate(sessions, aggregation); 
      STATE._lastAgg = aggData;
      
      updateKPI(aggData.kpi);
      
      // Initialize charts if not already done
      if (!STATE.charts.pressure || !STATE.charts.quality) {
        initCharts();
      }
      
      updateCharts(aggData);
      renderTable(STATE.sessions);
      
      // Show success message
      if (sessions.length > 0) {
        window.SitSenseUI?.showToast?.(`Memuat ${sessions.length} sesi`, 'success');
      } else {
        window.SitSenseUI?.showToast?.('Tidak ada data untuk rentang waktu ini', 'info');
      }
      
    } catch (e) {
      console.error('[SitSense] applyFilters error:', e);
      window.SitSenseUI?.showToast?.('Terjadi kesalahan saat memuat data', 'error');
    } finally { 
      STATE.isLoading = false;
      if (window.NProgress) NProgress.done();
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText || '<span class="relative z-10">Terapkan</span>';
      }
    }
  }

  function wire(){
    $('#btnFetchHistory')?.addEventListener('click', applyFilters);
    $('#prevPage')?.addEventListener('click', ()=>{ if (STATE.page>1){ STATE.page--; renderTable(STATE.sessions); } });
    $('#nextPage')?.addEventListener('click', ()=>{ const maxPage=Math.ceil(STATE.sessions.length/STATE.pageSize); if (STATE.page<maxPage){ STATE.page++; renderTable(STATE.sessions); } });
    $('#btnExportCSV')?.addEventListener('click', ()=> exportCSV(STATE.sessions));
  }

  // ---------------- Boot ----------------
  function initialize(){
    try {
      wire();
      
      // Wait for Firebase to be ready
      const checkFirebase = setInterval(() => {
        if (window.__SITSENSE_FIREBASE_READY__ || window.firebase) {
          clearInterval(checkFirebase);
          // Auto-load data on page load
          setTimeout(() => {
            try {
              applyFilters();
            } catch (e) {
              console.warn('[SitSense] Auto-load failed:', e);
            }
          }, 500);
        }
      }, 100);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkFirebase);
        if (!window.__SITSENSE_FIREBASE_READY__ && !window.firebase) {
          console.info('[SitSense] Firebase not ready, will use demo mode');
          try {
            applyFilters();
          } catch (e) {
            console.warn('[SitSense] Auto-load failed:', e);
          }
        }
      }, 5000);
      
    } catch (e) {
      console.error('[SitSense] Initialization error:', e);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
