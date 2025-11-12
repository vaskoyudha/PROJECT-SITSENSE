const { useState, useEffect, createElement: e } = React;

// Icon offline renderer using local SVG + CSS mask
// Supports solid colors via text-* (currentColor) OR gradients via bg-gradient-* + from-*/to-*
const IconStatic = ({ name, className = '', style }) => {
  const map = {
    'activity': '../assets/icons/activity.svg',
    'radio': '../assets/icons/radio.svg',
    'wifi': '../assets/icons/wifi.svg',
    'zap': '../assets/icons/zap.svg',
    'trending-up': '../assets/icons/trending-up.svg',
    'bar-chart-3': '../assets/icons/trending-up.svg', // fallback if missing
    'alert-circle': '../assets/icons/loader-circle.svg', // fallback if missing
    'loader-circle': '../assets/icons/loader-circle.svg'
  };
  const src = map[name] || map['loader-circle'];
  const usesGradient = (className || '').includes('bg-gradient') || (className || '').includes('from-');
  const maskStyles = {
    WebkitMaskImage: `url("${src}")`,
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    WebkitMaskSize: 'contain',
    maskImage: `url("${src}")`,
    maskRepeat: 'no-repeat',
    maskPosition: 'center',
    maskSize: 'contain',
    ...(usesGradient ? {} : { backgroundColor: 'currentColor' }),
    display: 'inline-block'
  };
  return e('span', { "aria-hidden": "true", className, style: { ...maskStyles, ...style } });
};

const UltrasonicMonitor = () => {
  const [neckDistance, setNeckDistance] = useState(15);
  const [backDistance, setBackDistance] = useState(22);
  const [particles, setParticles] = useState([]);
  const [signalStrength, setSignalStrength] = useState(100);
  const [neckHistory, setNeckHistory] = useState(Array(30).fill(15));
  const [backHistory, setBackHistory] = useState(Array(30).fill(22));
  const [useSimulation, setUseSimulation] = useState(true);
  const search = (typeof window !== 'undefined' && (window.location?.search || '')) || '';
  const parentSearch = (typeof window !== 'undefined' && window.parent && window.parent.location && window.parent.location.search) || '';
  const debugEnabled = /[?&]debug=1\b/.test(search) || /[?&]debug=1\b/.test(parentSearch);
  const [debugVisible, setDebugVisible] = useState(debugEnabled);
  const [events, setEvents] = useState([]);
  const logEvent = (evt) => {
    try {
      const withTs = { ts: new Date().toISOString(), ...evt };
      console.debug('[Ultrasonic][RX]', withTs);
      setEvents(prev => [...prev.slice(-59), withTs]);
    } catch (e) {}
  };
  const backendUrl = window.BACKEND_ENDPOINT || null;

  useEffect(() => {
    const newParticles = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 2,
      duration: Math.random() * 3 + 2,
      delay: Math.random() * 2
    }));
    setParticles(newParticles);

    if (!useSimulation) return;
    const interval = setInterval(() => {
      const newNeckDist = Math.max(5, Math.min(50, neckDistance + (Math.random() - 0.5) * 3));
      const newBackDist = Math.max(5, Math.min(50, backDistance + (Math.random() - 0.5) * 3));
      setNeckDistance(newNeckDist);
      setBackDistance(newBackDist);
      setSignalStrength(Math.floor(Math.random() * 20) + 80);
      setNeckHistory(prev => [...prev.slice(1), newNeckDist]);
      setBackHistory(prev => [...prev.slice(1), newBackDist]);
    }, 100);
    return () => clearInterval(interval);
  }, [neckDistance, backDistance, useSimulation]);

  useEffect(() => {
    try {
      const cfg = window.FIREBASE_CONFIG;
      if (!cfg) {
        console.warn('[Monitor] FIREBASE_CONFIG not found; running simulation.');
        return;
      }
      if (cfg && !(window.firebase?.apps?.length)) {
        window.firebase.initializeApp(cfg);
      }
      const db = window.firebase?.database?.();
      if (!db) {
        console.warn('[Monitor] firebase.database() unavailable; running simulation.');
        return;
      }

      const refs = [];
      let lastNeck = null, lastBack = null;
      let seenData = false;

      const setupListeners = (deviceId) => {
        console.info(`[Monitor] Attaching listeners for device ID: ${deviceId}`);
        const neckPath = `devices/${deviceId}/live/ultrasonic/leher_cm`;
        const backPath = `devices/${deviceId}/live/ultrasonic/punggung_cm`;

        const attach = (path, onValueCb) => {
          const r = db.ref(path);
          const handler = r.on('value', onValueCb, (err) => console.error('[Monitor] listener error', path, err));
          refs.push({ r, handler });
        };

        attach(neckPath, (snap) => {
          const v = parseFloat(snap.val());
          if (!Number.isNaN(v) && v !== lastNeck) {
            lastNeck = v;
            setNeckDistance(v);
            setNeckHistory(prev => [...prev.slice(1), v]);
            logEvent({ sensor: 'neck', path: neckPath, raw: snap.val(), parsed: v });
            if (!seenData) { seenData = true; setUseSimulation(false); }
          }
        });

        attach(backPath, (snap) => {
          const v = parseFloat(snap.val());
          if (!Number.isNaN(v) && v !== lastBack) {
            lastBack = v;
            setBackDistance(v);
            setBackHistory(prev => [...prev.slice(1), v]);
            logEvent({ sensor: 'back', path: backPath, raw: snap.val(), parsed: v });
            if (!seenData) { seenData = true; setUseSimulation(false); }
          }
        });
      };

      db.ref('devices').limitToFirst(1).once('value', (snapshot) => {
        if (snapshot.exists()) {
          const devices = snapshot.val();
          const deviceId = Object.keys(devices)[0];
          if (deviceId) {
            setupListeners(deviceId);
          } else {
            console.warn('[Monitor] No device ID found under /devices.');
          }
        } else {
          console.warn('[Monitor] /devices path does not exist in the database.');
        }
      }).catch(err => {
        console.error('[Monitor] Error fetching device ID:', err);
      });

      return () => {
        try {
          refs.forEach(({ r, handler }) => r.off('value', handler));
        } catch (e) {}
      };
    } catch (e) {
      console.error('[Monitor] Firebase init exception:', e);
    }
  }, []);

  useEffect(() => {
    if (!backendUrl) return;
    const controller = new AbortController();
    const payload = {
      neckDistance,
      backDistance,
      signalStrength,
      timestamp: Date.now()
    };
    fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
      signal: controller.signal
    }).catch(() => {});
    return () => controller.abort();
  }, [neckDistance, backDistance, signalStrength, backendUrl]);

  useEffect(() => {
    try {
      const statusOf = (d) => {
        if (d < 10) return { text: 'Berbahaya', color: 'red' };
        if (d < 20) return { text: 'Waspada', color: 'yellow' };
        return { text: 'Aman', color: 'green' };
      };
      const neckS = statusOf(neckDistance);
      const backS = statusOf(backDistance);
      window.parent?.postMessage({
        type: 'SITSENSE_ULTRA_UPDATE',
        data: {
          neckDistance,
          backDistance,
          signalStrength,
          neckStatus: neckS,
          backStatus: backS
        }
      }, '*');
    } catch (e) {}
  }, [neckDistance, backDistance, signalStrength]);

  const getStatusColor = (distance) => {
    if (distance < 10) return 'text-red-500 bg-red-500/10 border-red-500/30';
    if (distance < 20) return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30';
    return 'text-green-500 bg-green-500/10 border-green-500/30';
  };
  const getStatus = (distance) => {
    if (distance < 10) return 'Terlalu Dekat';
    if (distance < 20) return 'Perhatian';
    return 'Normal';
  };

  const SensorCard = ({ title, distance, gradient, accentColor, history }) => {
    const statusColor = getStatusColor(distance);
    const maxValue = 50;
    return e('div', { className: "relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700 shadow-2xl group hover:scale-[1.02] transition-all duration-500" },
      e('div', { className: `absolute inset-0 bg-gradient-to-br ${gradient} opacity-10 group-hover:opacity-20 transition-opacity duration-500` }),
      particles.slice(0, 10).map(particle => e('div', {
        key: particle.id,
        className: "absolute rounded-full opacity-30",
        style: {
          left: `${particle.x}%`,
          top: `${particle.y}%`,
          width: `${particle.size}px`,
          height: `${particle.size}px`,
          backgroundColor: accentColor.includes('blue') ? '#60a5fa' : '#a78bfa',
          animation: `float ${particle.duration}s ease-in-out infinite`,
          animationDelay: `${particle.delay}s`
        }
      })),
      e('div', { className: "absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.1),rgba(255,255,255,0))]" }),
      e('div', { className: "absolute inset-0 opacity-20" }, e('div', { className: "absolute w-full h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-scan" })),
      e('div', { className: "absolute top-0 left-0 w-20 h-20 opacity-20 blur-2xl group-hover:opacity-40 transition-opacity", style: { backgroundColor: accentColor.includes('blue') ? '#60a5fa' : '#a78bfa' } }),
      e('div', { className: "absolute bottom-0 right-0 w-20 h-20 opacity-20 blur-2xl group-hover:opacity-40 transition-opacity", style: { backgroundColor: accentColor.includes('blue') ? '#60a5fa' : '#a78bfa' } }),
      e('div', { className: "relative p-6" },
        e('div', { className: "flex items-center justify-between mb-8" },
          e('div', { className: "flex items-center gap-3" },
            e('div', { className: `p-3 rounded-xl bg-gradient-to-br ${gradient} border shadow-lg relative overflow-hidden`, style: { borderColor: accentColor.includes('blue') ? '#60a5fa' : '#a78bfa' } },
              e('div', { className: "absolute inset-0 bg-white opacity-0 group-hover:opacity-20 transition-opacity" }),
              e(IconStatic, { name: "activity", className: "w-6 h-6 bg-gradient-to-r from-slate-400 to-slate-200" })
            ),
            e('div', null,
              e('h2', { className: "text-2xl font-bold text-white flex items-center gap-2" },
                title,
                e('div', { className: "relative" }, e(IconStatic, { name: "zap", className: `w-5 h-5 bg-gradient-to-r ${gradient}` }))
              ),
              e('p', { className: "text-slate-400 text-sm flex items-center gap-1.5" },
                e(IconStatic, { name: "radio", className: `w-4 h-4 bg-gradient-to-r ${gradient}` }),
                "Sensor Ultrasonik"
              )
            )
          ),
          e('div', { className: "flex flex-col items-end gap-2" },
            e('div', { className: "flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/20 border border-green-500/30 backdrop-blur-sm" },
              e('div', { className: "w-2 h-2 rounded-full bg-green-500 animate-pulse" }),
              e('span', { className: "text-green-400 text-xs font-semibold" }, "AKTIF")
            ),
            e('div', { className: "flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700 backdrop-blur-sm" },
              e(IconStatic, { name: "activity", className: "w-4 h-4 bg-gradient-to-r from-slate-400 to-slate-200" }),
              e('span', { className: "text-slate-300 text-xs" }, `${signalStrength}%`)
            )
          )
        ),
        e('div', { className: "relative mb-6 rounded-2xl overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 border border-slate-700 p-6 h-56 flex items-center justify-center" },
          e('div', { className: "absolute inset-0 bg-gradient-to-b from-transparent via-blue-500/10 to-transparent animate-scan-vertical" }),
          e('div', { className: "absolute inset-0 flex items-center justify-center" },
            [...Array(4)].map((_, i) => e('div', { key: i, className: "absolute rounded-full border-2 opacity-0 animate-sonar", style: { borderColor: accentColor.includes('blue') ? '#60a5fa' : '#a78bfa', animationDelay: `${i * 0.6}s`, animationDuration: '2.4s', width: '32px', height: '32px' } }))
          ),
          e('div', { className: "absolute inset-0 opacity-10" },
            e('div', { className: "w-full h-full", style: { backgroundImage: 'linear-gradient(rgba(96, 165, 250, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(96, 165, 250, 0.3) 1px, transparent 1px)', backgroundSize: '20px 20px' } })
          ),
          e('div', { className: "relative z-10 text-center" },
            e('div', { className: "relative w-32 h-32 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 border-2 border-dashed border-slate-600 flex items-center justify-center shadow-2xl" },
              e('div', { className: "text-center relative z-10" },
                e(IconStatic, { name: "wifi", className: `w-6 h-6 bg-gradient-to-r ${gradient}` }),
                e('p', { className: "text-slate-500 text-xs font-medium" }, "Sensor aktif")
              )
            ),
            e('div', { className: "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border", style: { backgroundColor: accentColor.includes('blue') ? 'rgba(59,130,246,0.1)' : 'rgba(168,85,247,0.1)', borderColor: accentColor.includes('blue') ? 'rgba(59,130,246,0.3)' : 'rgba(168,85,247,0.3)' } },
              e('div', { className: "w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" }),
              e('p', { className: "text-slate-400 text-sm font-medium" }, "Transmitting...")
            )
          )
        ),
        e('div', { className: "mb-5 relative" },
          e('div', { className: "relative flex items-end justify-center gap-2 mb-4" },
            e(IconStatic, { name: "trending-up", className: `w-6 h-6 bg-gradient-to-r ${gradient}` }),
            e('span', { className: "text-5xl font-bold bg-gradient-to-r bg-clip-text text-transparent drop-shadow-2xl animate-pulse", style: { backgroundImage: accentColor.includes('blue') ? 'linear-gradient(to right, #3b82f6, #06b6d4)' : 'linear-gradient(to right, #a855f7, #ec4899)' } }, distance.toFixed(1)),
            e('span', { className: "text-2xl font-semibold text-slate-400 mb-1.5" }, "cm")
          ),
          e('div', { className: "relative h-3.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700 shadow-inner" },
            e('div', { className: "absolute top-0 left-0 h-full transition-all duration-300 rounded-full shadow-lg", style: { width: `${Math.min((distance / 50) * 100, 100)}%`, backgroundImage: accentColor.includes('blue') ? 'linear-gradient(to right, #3b82f6, #06b6d4)' : 'linear-gradient(to right, #a855f7, #ec4899)' } },
              e('div', { className: "absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" }),
              e('div', { className: "absolute inset-0 bg-white/20 animate-pulse" })
            ),
            [25, 50, 75].map((mark) => e('div', { key: mark, className: "absolute top-0 h-full w-0.5 bg-slate-700", style: { left: `${mark}%` } }))
          ),
          e('div', { className: "flex justify-between mt-2 px-1" },
            e('span', { className: "text-xs text-slate-500" }, "0cm"),
            e('span', { className: "text-xs text-slate-500" }, "50cm")
          )
        ),
        e('div', { className: `flex items-center justify-center gap-2 px-4 py-3 rounded-xl border ${statusColor} backdrop-blur-sm relative overflow-hidden group/status` },
          e('div', { className: "absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover/status:translate-x-[100%] transition-transform duration-1000" }),
          e(IconStatic, { name: "activity", className: "w-5 h-5 bg-gradient-to-r from-slate-400 to-slate-200" }),
          e('span', { className: "font-semibold text-lg" }, getStatus(distance)),
          e(IconStatic, { name: "alert-circle", className: `w-5 h-5 bg-gradient-to-r ${gradient}` })
        ),
        e('div', { className: "mt-6 grid grid-cols-3 gap-4" },
          e('div', { className: "text-center p-3 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 hover:border-blue-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20" },
            e('p', { className: "text-slate-400 text-xs mb-1.5" }, "Min Range"),
            e('p', { className: "text-white font-bold text-lg" }, "5 cm")
          ),
          e('div', { className: "text-center p-3 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 hover:border-purple-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/20" },
            e('p', { className: "text-slate-400 text-xs mb-1.5" }, "Max Range"),
            e('p', { className: "text-white font-bold text-lg" }, "50 cm")
          ),
          e('div', { className: "text-center p-3 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 hover:border-green-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/20" },
            e('p', { className: "text-slate-400 text-xs mb-1.5" }, "Akurasi"),
            e('p', { className: "text-white font-bold text-lg" }, "±3mm")
          )
        ),
        e('div', { className: "mt-6 relative" },
          e('div', { className: "flex items-center justify-between mb-3" },
            e('div', { className: "flex items-center gap-2" },
              e(IconStatic, { name: "bar-chart-3", className: `w-5 h-5 bg-gradient-to-r ${gradient}` }),
              e('span', { className: "text-slate-300 font-semibold text-sm" }, "Real-time Graph")
            ),
            e('div', { className: "flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-800/50 border border-slate-700" },
              e('div', { className: "w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" }),
              e('span', { className: "text-slate-400 text-xs" }, "Live")
            )
          ),
          e('div', { className: "relative h-32 bg-slate-900/50 rounded-xl border border-slate-700 p-4 overflow-hidden backdrop-blur-sm" },
            e('div', { className: "absolute inset-0 flex flex-col justify-between p-4 pointer-events-none" },
              [0, 1, 2, 3, 4].map((i) => e('div', { key: i, className: "w-full h-px bg-slate-700/30" }))
            ),
            e('svg', { className: "w-full h-full", preserveAspectRatio: "none", viewBox: "0 0 100 100" },
              e('defs', null,
                e('linearGradient', { id: `gradient-${title}`, x1: "0%", y1: "0%", x2: "0%", y2: "100%" },
                  e('stop', { offset: "0%", stopColor: accentColor.includes('blue') ? '#3b82f6' : '#a855f7', stopOpacity: "0.5" }),
                  e('stop', { offset: "100%", stopColor: accentColor.includes('blue') ? '#3b82f6' : '#a855f7', stopOpacity: "0.05" })
                )
              ),
              e('path', { d: `M 0 ${100 - (history[0] / maxValue) * 100} ${history.map((val, i) => `L ${(i / (history.length - 1)) * 100} ${100 - (val / maxValue) * 100}`).join(' ')} L 100 100 L 0 100 Z`, fill: `url(#gradient-${title})`, vectorEffect: "non-scaling-stroke" }),
              e('path', { d: `M 0 ${100 - (history[0] / maxValue) * 100} ${history.map((val, i) => `L ${(i / (history.length - 1)) * 100} ${100 - (val / maxValue) * 100}`).join(' ')}`, fill: "none", stroke: accentColor.includes('blue') ? '#3b82f6' : '#a855f7', strokeWidth: "2", vectorEffect: "non-scaling-stroke" }),
              e('path', { d: `M 0 ${100 - (history[0] / maxValue) * 100} ${history.map((val, i) => `L ${(i / (history.length - 1)) * 100} ${100 - (val / maxValue) * 100}`).join(' ')}`, fill: "none", stroke: accentColor.includes('blue') ? '#3b82f6' : '#a855f7', strokeWidth: "4", vectorEffect: "non-scaling-stroke", opacity: "0.3" }),
              e('circle', { cx: "100", cy: 100 - (history[history.length - 1] / maxValue) * 100, r: "3", fill: accentColor.includes('blue') ? '#3b82f6' : '#a855f7' },
                e('animate', { attributeName: "r", values: "3;5;3", dur: "1.5s", repeatCount: "indefinite" })
              )
            ),
            e('div', { className: "absolute left-1 top-2 text-xs text-slate-500" }, "50cm"),
            e('div', { className: "absolute left-1 bottom-2 text-xs text-slate-500" }, "0cm")
          ),
          e('div', { className: "mt-3 grid grid-cols-3 gap-2" },
            e('div', { className: "text-center p-2 rounded-lg bg-slate-800/30 border border-slate-700/50" },
              e('p', { className: "text-slate-500 text-xs" }, "Avg"),
              e('p', { className: "font-bold text-sm", style: { color: accentColor.includes('blue') ? '#60a5fa' : '#a78bfa' } }, `${(history.reduce((a, b) => a + b, 0) / history.length).toFixed(1)}cm`)
            ),
            e('div', { className: "text-center p-2 rounded-lg bg-slate-800/30 border border-slate-700/50" },
              e('p', { className: "text-slate-500 text-xs" }, "Min"),
              e('p', { className: "font-bold text-sm", style: { color: accentColor.includes('blue') ? '#60a5fa' : '#a78bfa' } }, `${Math.min(...history).toFixed(1)}cm`)
            ),
            e('div', { className: "text-center p-2 rounded-lg bg-slate-800/30 border border-slate-700/50" },
              e('p', { className: "text-slate-500 text-xs" }, "Max"),
              e('p', { className: "font-bold text-sm", style: { color: accentColor.includes('blue') ? '#60a5fa' : '#a78bfa' } }, `${Math.max(...history).toFixed(1)}cm`)
            )
          )
        )
      )
    );
  };

  useEffect(() => {
    try { window.lucide?.createIcons?.(); } catch (e) {}
  }, []);

  return e('div', { className: "min-h-[820px] bg-transparent p-6" },
    e('div', { className: "max-w-7xl mx-auto grid md:grid-cols-2 gap-8" },
      e(SensorCard, { title: "Sensor Leher", distance: neckDistance, gradient: "from-blue-500 to-cyan-500", accentColor: "blue", history: neckHistory }),
      e(SensorCard, { title: "Sensor Punggung", distance: backDistance, gradient: "from-purple-500 to-pink-500", accentColor: "purple", history: backHistory })
    ),
    e('div', { className: "fixed bottom-4 right-4 z-[1000]" },
      e('div', { className: "flex justify-end mb-2" },
        e('button', { onClick: () => setDebugVisible(v => !v), className: "px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-700 bg-slate-900/80 text-slate-200 shadow hover:bg-slate-800" },
          debugVisible ? 'Sembunyikan Debug' : 'Tampilkan Debug'
        )
      ),
      debugVisible && e('div', { className: "w-[min(380px,90vw)] max-h-[40vh] overflow-auto rounded-xl border border-slate-700 bg-slate-900/80 backdrop-blur p-3 shadow-2xl" },
        e('div', { className: "text-xs text-slate-400 mb-2" }, "Debug Data (realtime) — tekan tombol di atas untuk toggle. Tambahkan ?debug=1 pada URL untuk default menyala."),
        e('div', { className: "text-[11px] font-mono space-y-1" },
          e('div', { className: "text-slate-300" }, `Neck: ${neckDistance.toFixed(2)} cm • Back: ${backDistance.toFixed(2)} cm • Signal: ${signalStrength}%`),
          e('hr', { className: "border-slate-700 my-2" }),
          events.length === 0 && e('div', { className: "text-slate-500" }, "Belum ada data."),
          events.slice().reverse().map((e, i) => e('div', { key: i, className: "text-slate-300" },
            `[${e.ts}] ${e.sensor}@${e.path} → ${typeof e.parsed === 'number' ? e.parsed : 'NaN'}`,
            e('div', { className: "text-slate-500 break-words" }, `raw: ${typeof e.raw === 'object' ? JSON.stringify(e.raw) : String(e.raw)}`)
          ))
        )
      )
    )
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(e(UltrasonicMonitor));
