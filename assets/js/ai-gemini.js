/*
  SitSense — ai-gemini.js
  ---------------------------------
  Ambil rekomendasi postur dari Google Gemini (Generative Language API).

  ⚠️ Keamanan: Dianjurkan memakai PROXY server-side agar API key tidak diekspos.
  File ini mendukung 3 mode:
    1) PROXY (disarankan): set window.__GEMINI_PROXY_URL ke endpoint milikmu.
       - Metode: POST { prompt, model, system, generationConfig }
       - Harus balas { text: "..." }
    2) Direct browser (sementara): set API key via SitSenseAI.setConfig({ apiKey })
       - Panggil endpoint resmi Google: /v1beta/models/{model}:generateContent
    3) Fallback dummy: mengembalikan saran lokal jika belum dikonfigurasi.

  API publik:
    SitSenseAI.setConfig({ apiKey?, proxyUrl?, model?, lang? })
    getPostureAdvice({ score, imbalance:{lr,fb}, durationSec, lastAlerts, pressureMatrix? }) -> Promise<{ text, rationale? }>
*/
(function () {
  const DEFAULT_MODEL = 'gemini-1.5-flash'; // Model yang lebih cepat dan hemat biaya
  // Default API key (akan di-override oleh settings jika ada)
  const DEFAULT_API_KEY = 'AIzaSyABdOqWvGZVao6sLvhpy5X7JpwuSXbC0Aw';

  const STATE = {
    apiKey: DEFAULT_API_KEY, // Default, akan di-override oleh setConfig dari settings
    proxyUrl: (typeof window !== 'undefined' && window.__GEMINI_PROXY_URL) ? window.__GEMINI_PROXY_URL : null,
    model: DEFAULT_MODEL,
    lang: 'id-ID',
    timeoutMs: 12000,
  };

  function setConfig(cfg = {}) {
    if (cfg.apiKey !== undefined) {
      const trimmedKey = typeof cfg.apiKey === 'string' ? cfg.apiKey.trim() : '';
      if (trimmedKey) {
        STATE.apiKey = trimmedKey;
        console.log('[SitSense AI] API key updated from config:', trimmedKey.substring(0, 10) + '...');
      } else {
        // Jika apiKey kosong, gunakan default
        STATE.apiKey = DEFAULT_API_KEY;
        console.log('[SitSense AI] Using default API key');
      }
    }
    if (cfg.proxyUrl !== undefined) STATE.proxyUrl = cfg.proxyUrl;
    if (cfg.model) STATE.model = cfg.model;
    if (cfg.lang) STATE.lang = cfg.lang;

    console.log('[SitSense AI] Current config:', {
      hasApiKey: !!STATE.apiKey,
      apiKeyPreview: STATE.apiKey ? STATE.apiKey.substring(0, 10) + '...' : 'none',
      hasProxy: !!STATE.proxyUrl,
      model: STATE.model
    });
  }

  function safeJson(o) { try { return JSON.stringify(o); } catch (_) { return '{}'; } }

  function buildSystem() {
    return (
      `Anda adalah pelatih ergonomi untuk aplikasi SitSense (Bahasa Indonesia). 
Tujuan: berikan rekomendasi singkat, praktis, dan aman untuk memperbaiki postur duduk berdasarkan parameter yang diberikan. 
Gaya: ramah, langsung ke poin, hindari istilah medis berlebihan. Maks 3-5 butir.
Jika situasi berisiko (skor < 40 atau durasi > 120 menit), tambahkan peringatan ringkas.
Jangan berikan saran medis—sarankan konsultasi profesional bila keluhan berlanjut.`
    );
  }

  function toMMSS(sec) { sec = Math.max(0, Math.floor(sec)); const m = Math.floor(sec / 60); const s = sec % 60; return `${m}m ${String(s).padStart(2, '0')}s`; }

  function buildPrompt({ score = 50, imbalance = { lr: 0, fb: 0 }, durationSec = 0, lastAlerts = '-', pressureMatrix, historyContext = '', historyStats = null, trend = 'stabil' }) {
    const lrPct = Math.round(Math.min(1, Math.abs(imbalance.lr || 0)) * 100);
    const fbPct = Math.round(Math.min(1, Math.abs(imbalance.fb || 0)) * 100);
    const duration = toMMSS(durationSec || 0);
    const shapeHint = Array.isArray(pressureMatrix) ? `Matriks ${pressureMatrix.length}x${pressureMatrix[0]?.length || pressureMatrix.length}` : 'Matriks tidak tersedia';
    const historyBlock = historyContext ? `\nRingkasan sesi sebelumnya:\n${historyContext}\n` : '';
    let historyStatsBlock = '';
    if (historyStats) {
      historyStatsBlock = `\nStatistik tambahan:\n- Rata-rata skor 10 sesi terakhir: ${historyStats.recentAvg}\n- Skor sesi terakhir: ${historyStats.lastScore}\n- Durasi sesi terakhir: ${historyStats.lastDuration} detik\n- Total alert pekan ini: ${historyStats.alertsLastWeek}\n- Tren terbaru: ${historyStats.trendSample}\n`;
    }
    return (
      `DATA:
- Skor postur: ${score}
- Ketidakseimbangan: kiri/kanan ~ ${lrPct}%, depan/belakang ~ ${fbPct}%
- Durasi duduk: ${duration}
- Alert terakhir: ${String(lastAlerts)}
- Heatmap: ${shapeHint}
- Tren live: ${trend}
${historyBlock}${historyStatsBlock}

TUGAS:
Berikan rekomendasi ringkas untuk memperbaiki postur saat ini.
Output harus dalam format JSON dengan skema:
{
  "recommendations": ["string (poin 1)", "string (poin 2)", ...],
  "motivation": "string (kalimat motivasi)"
}
Pastikan semua output dalam Bahasa Indonesia.`
    );
  }

  function parseGeminiText(json) {
    try {
      // Google Generative Language API v1beta shape
      const cands = json?.candidates; if (!Array.isArray(cands) || !cands[0]) return null;
      const parts = cands[0]?.content?.parts; if (!Array.isArray(parts)) return null;
      const text = parts.map(p => p.text).filter(Boolean).join('\n');
      return text || null;
    } catch (_) { return null; }
  }

  async function fetchWithTimeout(url, options) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), STATE.timeoutMs);
    try { return await fetch(url, { ...options, signal: ctrl.signal }); }
    finally { clearTimeout(id); }
  }

  async function callViaProxy(payload) {
    const url = STATE.proxyUrl;
    if (!url) return null;
    try {
      const res = await fetchWithTimeout(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: payload.prompt, system: payload.system, model: STATE.model, generationConfig: payload.generationConfig })
      });
      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`Proxy ${res.status}: ${errorText || res.statusText}`);
      }
      const data = await res.json();
      // Proxy diharapkan mengembalikan { text } atau bentuk resmi Google
      if (typeof data?.text === 'string') return data.text;
      const maybe = parseGeminiText(data);
      return maybe || null;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Proxy timeout');
      }
      throw err;
    }
  }

  async function callDirect(payload) {
    if (!STATE.apiKey) return null;

    // Daftar model yang akan dicoba secara berurutan
    const CANDIDATE_MODELS = [
      'gemini-2.5-flash', // From user image
      'gemini-2.0-flash', // From user image
      'gemini-2.5-pro',   // From user image
      'gemini-flash-latest',
      'gemini-1.5-flash',
      'gemini-1.5-flash-001',
      'gemini-1.5-pro',
      'gemini-1.5-pro-001',
      'gemini-1.5-flash-8b',
      'gemini-2.0-flash-exp'
    ];

    // Jika user sudah set model spesifik via config, coba itu dulu
    let modelsToTry = [...CANDIDATE_MODELS];
    if (STATE.model && !CANDIDATE_MODELS.includes(STATE.model)) {
      modelsToTry.unshift(STATE.model);
    } else if (STATE.model) {
      // Pindahkan model yang dipilih ke paling depan
      modelsToTry = modelsToTry.filter(m => m !== STATE.model);
      modelsToTry.unshift(STATE.model);
    }

    let lastError = null;

    for (const modelName of modelsToTry) {
      const base = 'https://generativelanguage.googleapis.com/v1beta';
      const endpoint = `${base}/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(STATE.apiKey)}`;

      // Format request body
      const body = {
        contents: payload.contents || [{
          role: 'user',
          parts: [{ text: payload.prompt }]
        }],
        systemInstruction: {
          parts: [{ text: payload.system }]
        },
        generationConfig: Object.assign({
          temperature: 0.7,
          topK: 32,
          topP: 0.9,
          maxOutputTokens: 256
        }, payload.generationConfig || {})
      };

      try {
        console.log(`[SitSense AI] Trying model: ${modelName}`);

        const res = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          const errorText = await res.text().catch(() => '');
          let errorData = {};
          try { errorData = JSON.parse(errorText); } catch (_) { }

          const errorMsg = errorData?.error?.message || res.statusText || `HTTP ${res.status}`;

          // Jika 404 (Not Found) atau 400 (Bad Request - Invalid Argument), lanjut ke model berikutnya
          if (res.status === 404 || (res.status === 400 && errorMsg.includes('not found'))) {
            console.warn(`[SitSense AI] Model ${modelName} failed: ${errorMsg}. Trying next...`);
            lastError = new Error(`Model ${modelName} not found: ${errorMsg}`);
            continue;
          }

          // Error lain (e.g. 403 Permission, 429 Quota) mungkin fatal, tapi kita coba lanjut dulu siapa tau beda model beda kuota/izin
          console.warn(`[SitSense AI] Model ${modelName} error ${res.status}: ${errorMsg}. Trying next...`);
          lastError = new Error(`Gemini API ${res.status}: ${errorMsg}`);
          continue;
        }

        // Success!
        const data = await res.json();
        const text = parseGeminiText(data);
        if (!text) {
          throw new Error('Empty response from Gemini');
        }

        console.log(`[SitSense AI] ✅ Success with model: ${modelName}`);
        // Update state agar request berikutnya langsung pakai model ini
        STATE.model = modelName;
        return text;

      } catch (err) {
        console.warn(`[SitSense AI] Error with ${modelName}:`, err);
        lastError = err;
      }
    }

    // Jika semua gagal
    console.error('[SitSense AI] All candidate models failed.');
    throw lastError || new Error('All models failed');
  }

  function fallbackAdvice(payload) {
    const { score = 50, imbalance = { lr: 0, fb: 0 }, durationSec = 0 } = payload || {};
    const lr = Math.round((imbalance.lr || 0) * 100), fb = Math.round((imbalance.fb || 0) * 100);
    const mins = Math.round(durationSec / 60);
    return (
      `• Topang punggung: dorong pinggang ke sandaran, bahu rileks.
• Sejajarkan paha & telapak kaki rata; atur tinggi kursi jika perlu.
• Geser beban agar kiri/kanan (${lr}% ) & depan/belakang (${fb}% ) lebih seimbang.
• Istirahat singkat ${Math.max(1, Math.min(5, Math.ceil(mins / 30)))} menit, lalu peregangan leher & bahu.
Tetap konsisten—perbaikan kecil tapi sering lebih efektif.`
    );
  }

  async function getPostureAdvice(input = {}) {
    console.log('[SitSense AI] getPostureAdvice called', input);
    const system = buildSystem();
    const prompt = buildPrompt(input);
    const generationConfig = { temperature: 0.6, maxOutputTokens: 256, responseMimeType: "application/json" };
    const payload = { system, prompt, generationConfig };

    try {
      // 1) Proxy first (jika ada)
      if (STATE.proxyUrl) {
        try {
          const text = await callViaProxy(payload);
          if (text) return { text };
        } catch (proxyErr) {
          console.warn('[SitSense AI] Proxy call failed:', proxyErr);
          // Continue to try direct API
        }
      }
      // 2) Direct (jika apiKey di-set)
      if (STATE.apiKey && STATE.apiKey.trim()) {
        try {
          console.log('[SitSense AI] Attempting direct API call with key:', STATE.apiKey.substring(0, 10) + '...');
          console.log('[SitSense AI] Model:', STATE.model);
          console.log('[SitSense AI] Request payload preview:', {
            promptLength: payload.prompt?.length || 0,
            systemLength: payload.system?.length || 0
          });

          const text = await callDirect(payload);
          if (text) {
            console.log('[SitSense AI] ✅ Direct API call successful, text length:', text.length);

            // Parse JSON output
            try {
              const json = JSON.parse(text);
              let formattedText = '';
              if (Array.isArray(json.recommendations)) {
                formattedText += json.recommendations.map(r => `• ${r}`).join('\n');
              }
              if (json.motivation) {
                formattedText += `\n\n${json.motivation}`;
              }

              // Fallback if JSON structure is unexpected but valid JSON
              if (!formattedText.trim()) {
                formattedText = text;
              }

              return { text: formattedText, rationale: 'ai' };
            } catch (e) {
              console.warn('[SitSense AI] Failed to parse JSON response, using raw text:', e);
              return { text, rationale: 'ai' };
            }
          } else {
            console.warn('[SitSense AI] Direct API call returned empty text');
          }
        } catch (directErr) {
          console.error('[SitSense AI] ❌ Direct API call failed:', directErr);
          console.error('[SitSense AI] Error details:', {
            message: directErr.message,
            name: directErr.name,
            stack: directErr.stack?.substring(0, 200)
          });
          // Re-throw error dengan detail lebih lengkap untuk debugging
          throw new Error(`API call failed: ${directErr.message}`);
        }
      } else {
        console.warn('[SitSense AI] No API key configured or API key is empty');
      }
      // 3) Fallback dummy
      const hasApiKey = !!STATE.apiKey;
      const hasProxy = !!STATE.proxyUrl;
      console.warn('[SitSense AI] Gemini belum dikonfigurasi atau gagal terhubung, menggunakan saran lokal.');
      console.warn('[SitSense AI] Status konfigurasi - API Key:', hasApiKey ? 'Ada' : 'Tidak ada', 'Proxy:', hasProxy ? 'Ada' : 'Tidak ada');
      return { text: fallbackAdvice(input), rationale: 'fallback', error: 'AI tidak terhubung - menggunakan saran lokal' };
    } catch (err) {
      // Catch any unexpected errors
      console.error('[SitSense AI] Unexpected error in getPostureAdvice:', err);
      return { text: fallbackAdvice(input), rationale: 'fallback-error' };
    } finally {
      if (window.__GEMINI_LANG) STATE.lang = window.__GEMINI_LANG;
    }
  }

  async function sendChat(message, history = []) {
    const system = buildSystem();
    // Construct contents from history + new message
    // History format: [{role: 'user'|'model', parts: [{text: '...'}]}]
    const contents = [...history, { role: 'user', parts: [{ text: message }] }];

    const generationConfig = { temperature: 0.7, maxOutputTokens: 500 }; // No JSON for chat, free text
    const payload = { system, contents, generationConfig };

    try {
      // Try direct call (assuming proxy logic is similar or we skip proxy for chat for now)
      if (STATE.apiKey) {
        const text = await callDirect(payload);
        return { text };
      }
      return { text: "Maaf, API Key belum dikonfigurasi." };
    } catch (e) {
      console.error("Chat error:", e);
      return { text: "Maaf, terjadi kesalahan saat memproses pesan Anda." };
    }
  }

  // Expose to window
  window.getPostureAdvice = getPostureAdvice;
  window.SitSenseAI = {
    setConfig,
    getPostureAdvice,
    sendChat, // New function
    getConfig: () => ({ ...STATE })
  };
})();
