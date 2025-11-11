import React, { useState, useEffect } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';
import { Activity, Wifi, Zap, Radio, TrendingUp, AlertCircle, BarChart3 } from 'lucide-react';
const { Activity, Wifi, Zap, Radio, TrendingUp, AlertCircle } = window.LucideIcons;

// Firebase bootstrap (safe no-op if config missing)
let firebaseApp = null;
let firebaseDb = null;
try {
  const firebaseConfig = (typeof window !== 'undefined' && window.FIREBASE_CONFIG) || null;
  if (firebaseConfig && getApps().length === 0) {
    firebaseApp = initializeApp(firebaseConfig);
    firebaseDb = getDatabase(firebaseApp);
  }
} catch (e) {
  // ignore init errors; component will fallback to simulation
}

const UltrasonicMonitor = () => {
  const [neckDistance, setNeckDistance] = useState(15);
  const [backDistance, setBackDistance] = useState(22);
  const [particles, setParticles] = useState([]);
  const [signalStrength, setSignalStrength] = useState(100);
  const [neckHistory, setNeckHistory] = useState(Array(30).fill(15));
  const [backHistory, setBackHistory] = useState(Array(30).fill(22));
  const [useSimulation, setUseSimulation] = useState(true);
  const backendUrl = (typeof window !== 'undefined' && window.BACKEND_ENDPOINT) || null;

  useEffect(() => {
    // Generate floating particles
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
      
      // Update history for charts
      setNeckHistory(prev => [...prev.slice(1), newNeckDist]);
      setBackHistory(prev => [...prev.slice(1), newBackDist]);
    }, 100);

    return () => clearInterval(interval);
  }, [neckDistance, backDistance, useSimulation]);

  // Attach Firebase listeners when available
  useEffect(() => {
    if (!firebaseDb) return;
    const neckRef = ref(firebaseDb, 'sensors/neckDistance');
    const backRef = ref(firebaseDb, 'sensors/backDistance');
    const sigRef = ref(firebaseDb, 'sensors/signalStrength');
    
    const unsubs = [];
    unsubs.push(onValue(neckRef, (snap) => {
      const v = Number(snap.val());
      if (!Number.isNaN(v)) {
        setNeckDistance(v);
        setNeckHistory(prev => [...prev.slice(1), v]);
      }
    }));
    unsubs.push(onValue(backRef, (snap) => {
      const v = Number(snap.val());
      if (!Number.isNaN(v)) {
        setBackDistance(v);
        setBackHistory(prev => [...prev.slice(1), v]);
      }
    }));
    unsubs.push(onValue(sigRef, (snap) => {
      const v = Number(snap.val());
      if (!Number.isNaN(v)) setSignalStrength(v);
    }));
    setUseSimulation(false);
    return () => {
      try { unsubs.forEach(u => typeof u === 'function' && u()); } catch (e) {}
    };
  }, []);

  // Optional: Post updates to backend when values change
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

  const SensorCard = ({ title, distance, icon, gradient, accentColor, history }) => {
    const statusColor = getStatusColor(distance);
    const maxValue = 50;
    
    return (
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700 shadow-2xl group hover:scale-[1.02] transition-all duration-500">
        {/* Animated background gradient */}
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-10 group-hover:opacity-20 transition-opacity duration-500`}></div>
        
        {/* Floating particles */}
        {particles.slice(0, 10).map(particle => (
          <div
            key={particle.id}
            className={`absolute w-1 h-1 ${accentColor} rounded-full opacity-30`}
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              animation: `float ${particle.duration}s ease-in-out infinite`,
              animationDelay: `${particle.delay}s`
            }}
          ></div>
        ))}
        
        {/* Mesh gradient overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.1),rgba(255,255,255,0))]"></div>
        
        {/* Animated scan line */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-scan"></div>
        </div>
        
        {/* Corner accents */}
        <div className={`absolute top-0 left-0 w-20 h-20 ${accentColor} opacity-20 blur-2xl group-hover:opacity-40 transition-opacity`}></div>
        <div className={`absolute bottom-0 right-0 w-20 h-20 ${accentColor} opacity-20 blur-2xl group-hover:opacity-40 transition-opacity`}></div>
        
        <div className="relative p-8">
          {/* Header with glow effect */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl bg-gradient-to-br ${gradient} border ${accentColor.replace('bg-', 'border-')} shadow-lg relative overflow-hidden`}>
                <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 transition-opacity"></div>
                {icon}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  {title}
                  <div className="relative">
                    <Zap className={`w-4 h-4 ${accentColor.replace('bg-', 'text-')} animate-pulse`} />
                  </div>
                </h2>
                <p className="text-slate-400 text-sm flex items-center gap-1.5">
                  <Radio className="w-3 h-3" />
                  Sensor Ultrasonik HC-SR04
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/20 border border-green-500/30 backdrop-blur-sm">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-500/50"></div>
                <span className="text-green-400 text-xs font-semibold">AKTIF</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700 backdrop-blur-sm">
                <Activity className="w-3 h-3 text-blue-400" />
                <span className="text-slate-300 text-xs">{signalStrength}%</span>
              </div>
            </div>
          </div>

          {/* Sensor Image with holographic effect */}
          <div className="relative mb-8 rounded-2xl overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 border border-slate-700 p-8 h-64 flex items-center justify-center group/sensor">
            {/* Holographic scan effect */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-500/10 to-transparent animate-scan-vertical"></div>
            
            {/* Concentric wave rings */}
            <div className="absolute inset-0 flex items-center justify-center">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className={`absolute rounded-full ${accentColor.replace('bg-', 'border-')} border-2 opacity-0 animate-sonar`}
                  style={{
                    width: '32px',
                    height: '32px',
                    animationDelay: `${i * 0.6}s`,
                    animationDuration: '2.4s'
                  }}
                ></div>
              ))}
            </div>
            
            {/* Grid overlay */}
            <div className="absolute inset-0 opacity-10">
              <div className="w-full h-full" style={{
                backgroundImage: 'linear-gradient(rgba(96, 165, 250, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(96, 165, 250, 0.3) 1px, transparent 1px)',
                backgroundSize: '20px 20px'
              }}></div>
            </div>
            
            {/* Spotlight effect */}
            <div className={`absolute inset-0 bg-gradient-radial from-${accentColor.split('-')[1]}-500/20 to-transparent opacity-0 group-hover/sensor:opacity-100 transition-opacity duration-500`}></div>
            
            {/* Sensor placeholder with 3D effect */}
            <div className="relative z-10 text-center">
              <div className="relative w-32 h-32 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 border-2 border-dashed border-slate-600 flex items-center justify-center transform transition-all duration-500 hover:scale-110 hover:rotate-3 shadow-2xl">
                {/* Glow effect */}
                <div className={`absolute inset-0 ${accentColor} opacity-20 blur-xl group-hover/sensor:opacity-40 transition-opacity rounded-2xl`}></div>
                
                {/* Animated corner brackets */}
                <div className="absolute top-1 left-1 w-4 h-4 border-l-2 border-t-2 border-blue-500 animate-pulse"></div>
                <div className="absolute top-1 right-1 w-4 h-4 border-r-2 border-t-2 border-blue-500 animate-pulse" style={{animationDelay: '0.3s'}}></div>
                <div className="absolute bottom-1 left-1 w-4 h-4 border-l-2 border-b-2 border-blue-500 animate-pulse" style={{animationDelay: '0.6s'}}></div>
                <div className="absolute bottom-1 right-1 w-4 h-4 border-r-2 border-b-2 border-blue-500 animate-pulse" style={{animationDelay: '0.9s'}}></div>
                
                <div className="text-center relative z-10">
                  <Wifi className="w-12 h-12 text-slate-500 mx-auto mb-2 animate-pulse" />
                  <p className="text-slate-500 text-xs font-medium">Tempatkan gambar<br/>sensor di sini</p>
                </div>
              </div>
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${accentColor.replace('bg-', 'bg-')}/10 border ${accentColor.replace('bg-', 'border-')}/30`}>
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping"></div>
                <p className="text-slate-400 text-sm font-medium">Transmitting...</p>
              </div>
            </div>
          </div>

          {/* Distance Display with neon effect */}
          <div className="mb-6 relative">
            {/* Glow background */}
            <div className={`absolute inset-0 ${accentColor} opacity-20 blur-3xl animate-pulse`}></div>
            
            <div className="relative flex items-end justify-center gap-2 mb-4">
              <TrendingUp className={`w-8 h-8 ${accentColor.replace('bg-', 'text-')} animate-bounce`} />
              <span className={`text-7xl font-bold bg-gradient-to-r ${gradient.split(' ')[0]} ${gradient.split(' ')[1]} bg-clip-text text-transparent drop-shadow-2xl animate-pulse`}>
                {distance.toFixed(1)}
              </span>
              <span className="text-3xl font-semibold text-slate-400 mb-2">cm</span>
            </div>
            
            {/* Enhanced progress bar with segments */}
            <div className="relative h-4 bg-slate-800 rounded-full overflow-hidden border border-slate-700 shadow-inner">
              {/* Animated gradient fill */}
              <div
                className={`absolute top-0 left-0 h-full bg-gradient-to-r ${gradient} transition-all duration-300 rounded-full shadow-lg`}
                style={{ width: `${Math.min((distance / 50) * 100, 100)}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer"></div>
                <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
              </div>
              
              {/* Segment markers */}
              {[25, 50, 75].map((mark) => (
                <div
                  key={mark}
                  className="absolute top-0 h-full w-0.5 bg-slate-700"
                  style={{ left: `${mark}%` }}
                ></div>
              ))}
            </div>
            
            {/* Min/Max markers */}
            <div className="flex justify-between mt-2 px-1">
              <span className="text-xs text-slate-500">0cm</span>
              <span className="text-xs text-slate-500">50cm</span>
            </div>
          </div>

          {/* Status Badge with animation */}
          <div className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border ${statusColor} backdrop-blur-sm relative overflow-hidden group/status`}>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover/status:translate-x-[100%] transition-transform duration-1000"></div>
            <Activity className="w-5 h-5 animate-pulse" />
            <span className="font-semibold text-lg">{getStatus(distance)}</span>
            <AlertCircle className="w-4 h-4 opacity-50" />
          </div>

          {/* Enhanced Stats with icons */}
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="text-center p-3 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 hover:border-blue-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20 group/stat">
              <p className="text-slate-400 text-xs mb-1.5 flex items-center justify-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                Min Range
              </p>
              <p className="text-white font-bold text-lg group-hover/stat:text-blue-400 transition-colors">5 cm</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 hover:border-purple-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/20 group/stat">
              <p className="text-slate-400 text-xs mb-1.5 flex items-center justify-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                Max Range
              </p>
              <p className="text-white font-bold text-lg group-hover/stat:text-purple-400 transition-colors">50 cm</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 hover:border-green-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/20 group/stat">
              <p className="text-slate-400 text-xs mb-1.5 flex items-center justify-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                Akurasi
              </p>
              <p className="text-white font-bold text-lg group-hover/stat:text-green-400 transition-colors">±3mm</p>
            </div>
          </div>

          {/* Real-time Chart */}
          <div className="mt-6 relative">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className={`w-5 h-5 ${accentColor.replace('bg-', 'text-')}`} />
                <span className="text-slate-300 font-semibold text-sm">Real-time Graph</span>
              </div>
              <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-800/50 border border-slate-700">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-slate-400 text-xs">Live</span>
              </div>
            </div>
            
            <div className="relative h-32 bg-slate-900/50 rounded-xl border border-slate-700 p-4 overflow-hidden backdrop-blur-sm">
              {/* Grid lines */}
              <div className="absolute inset-0 flex flex-col justify-between p-4 pointer-events-none">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-full h-px bg-slate-700/30"></div>
                ))}
              </div>
              
              {/* Chart area */}
              <svg className="w-full h-full" preserveAspectRatio="none">
                <defs>
                  <linearGradient id={`gradient-${title}`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={accentColor === 'bg-blue-500' ? '#3b82f6' : '#a855f7'} stopOpacity="0.5" />
                    <stop offset="100%" stopColor={accentColor === 'bg-blue-500' ? '#3b82f6' : '#a855f7'} stopOpacity="0.05" />
                  </linearGradient>
                </defs>
                
                {/* Area fill */}
                <path
                  d={`M 0 ${100 - (history[0] / maxValue) * 100} ${history.map((val, i) => 
                    `L ${(i / (history.length - 1)) * 100} ${100 - (val / maxValue) * 100}`
                  ).join(' ')} L 100 100 L 0 100 Z`}
                  fill={`url(#gradient-${title})`}
                  vectorEffect="non-scaling-stroke"
                />
                
                {/* Line */}
                <path
                  d={`M 0 ${100 - (history[0] / maxValue) * 100} ${history.map((val, i) => 
                    `L ${(i / (history.length - 1)) * 100} ${100 - (val / maxValue) * 100}`
                  ).join(' ')}`}
                  fill="none"
                  stroke={accentColor === 'bg-blue-500' ? '#3b82f6' : '#a855f7'}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                  className="drop-shadow-lg"
                />
                
                {/* Glow effect on line */}
                <path
                  d={`M 0 ${100 - (history[0] / maxValue) * 100} ${history.map((val, i) => 
                    `L ${(i / (history.length - 1)) * 100} ${100 - (val / maxValue) * 100}`
                  ).join(' ')}`}
                  fill="none"
                  stroke={accentColor === 'bg-blue-500' ? '#3b82f6' : '#a855f7'}
                  strokeWidth="4"
                  vectorEffect="non-scaling-stroke"
                  opacity="0.3"
                  className="blur-sm"
                />
                
                {/* Current point indicator */}
                <circle
                  cx="100"
                  cy={100 - (history[history.length - 1] / maxValue) * 100}
                  r="3"
                  fill={accentColor === 'bg-blue-500' ? '#3b82f6' : '#a855f7'}
                  className="animate-pulse"
                >
                  <animate
                    attributeName="r"
                    values="3;5;3"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                </circle>
              </svg>
              
              {/* Y-axis labels */}
              <div className="absolute left-1 top-2 text-xs text-slate-500">50cm</div>
              <div className="absolute left-1 bottom-2 text-xs text-slate-500">0cm</div>
            </div>
            
            {/* Mini stats below chart */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="text-center p-2 rounded-lg bg-slate-800/30 border border-slate-700/50">
                <p className="text-slate-500 text-xs">Avg</p>
                <p className={`font-bold text-sm ${accentColor.replace('bg-', 'text-')}`}>
                  {(history.reduce((a, b) => a + b, 0) / history.length).toFixed(1)}cm
                </p>
              </div>
              <div className="text-center p-2 rounded-lg bg-slate-800/30 border border-slate-700/50">
                <p className="text-slate-500 text-xs">Min</p>
                <p className={`font-bold text-sm ${accentColor.replace('bg-', 'text-')}`}>
                  {Math.min(...history).toFixed(1)}cm
                </p>
              </div>
              <div className="text-center p-2 rounded-lg bg-slate-800/30 border border-slate-700/50">
                <p className="text-slate-500 text-xs">Max</p>
                <p className={`font-bold text-sm ${accentColor.replace('bg-', 'text-')}`}>
                  {Math.max(...history).toFixed(1)}cm
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-blob"></div>
        <div className="absolute top-40 right-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-20 left-1/2 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl animate-blob animation-delay-4000"></div>
      </div>
      
      {/* Header with glitch effect */}
      <div className="max-w-7xl mx-auto mb-8 relative z-10">
        <div className="text-center mb-12">
          <div className="relative inline-block">
            <h1 className="text-6xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-3 animate-gradient-x relative">
              Monitoring Postur Tubuh
              {/* Glitch overlay */}
              <span className="absolute inset-0 text-6xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent opacity-70 animate-glitch">
                Monitoring Postur Tubuh
              </span>
            </h1>
          </div>
          <p className="text-slate-400 text-lg flex items-center justify-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400 animate-pulse" />
            Sistem Deteksi Jarak Real-time dengan Sensor Ultrasonik
            <Zap className="w-5 h-5 text-yellow-400 animate-pulse" />
          </p>
          
          {/* Decorative line */}
          <div className="flex items-center justify-center gap-4 mt-6">
            <div className="h-px w-20 bg-gradient-to-r from-transparent to-blue-500"></div>
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
            <div className="h-px w-20 bg-gradient-to-l from-transparent to-purple-500"></div>
          </div>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-8 relative z-10">
        <SensorCard
          title="Sensor Leher"
          distance={neckDistance}
          icon={<Activity className="w-6 h-6 text-blue-400" />}
          gradient="from-blue-500 to-cyan-500"
          accentColor="bg-blue-500"
          history={neckHistory}
        />
        <SensorCard
          title="Sensor Punggung"
          distance={backDistance}
          icon={<Activity className="w-6 h-6 text-purple-400" />}
          gradient="from-purple-500 to-pink-500"
          accentColor="bg-purple-500"
          history={backHistory}
        />
      </div>

      {/* Enhanced Footer */}
      <div className="max-w-7xl mx-auto mt-8 text-center relative z-10">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-slate-800/50 border border-slate-700 backdrop-blur-sm shadow-lg hover:shadow-2xl hover:border-blue-500/50 transition-all duration-300 group">
          <div className="relative">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-ping absolute"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <span className="text-slate-300 text-sm">Sistem berjalan normal • Update real-time setiap 100ms</span>
          <Radio className="w-4 h-4 text-blue-400 group-hover:animate-spin" />
        </div>
      </div>

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) translateX(0px); }
          50% { transform: translateY(-20px) translateX(10px); }
        }
        
        @keyframes scan {
          0% { top: -2px; }
          100% { top: 100%; }
        }
        
        @keyframes scan-vertical {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        
        @keyframes sonar {
          0% {
            width: 32px;
            height: 32px;
            opacity: 1;
          }
          100% {
            width: 200px;
            height: 200px;
            opacity: 0;
          }
        }
        
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        
        @keyframes gradient-x {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        
        @keyframes glitch {
          0%, 100% { transform: translate(0); }
          20% { transform: translate(-2px, 2px); }
          40% { transform: translate(-2px, -2px); }
          60% { transform: translate(2px, 2px); }
          80% { transform: translate(2px, -2px); }
        }
        
        .animate-scan {
          animation: scan 3s linear infinite;
        }
        
        .animate-scan-vertical {
          animation: scan-vertical 4s ease-in-out infinite;
        }
        
        .animate-sonar {
          animation: sonar 2.4s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
        
        .animate-blob {
          animation: blob 7s infinite;
        }
        
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        
        .animate-gradient-x {
          background-size: 200% 200%;
          animation: gradient-x 3s ease infinite;
        }
        
        .animate-glitch {
          animation: glitch 0.3s infinite;
        }
      `}</style>
    </div>
  );
};

export default UltrasonicMonitor;