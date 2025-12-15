(function () {
  'use strict';

  const DEFAULT_CUES = {
    gentle: {
      message: (ctx) =>
        `Perhatikan posturmu ya. Sudah ${ctx.badMinutes} menit skor berada di kisaran ${ctx.score}. Tarik bahu ke belakang dan beri jeda sebentar.`,
      fallbackAudio: 'alertSoft',
      rate: 1.05,
    },
    firm: {
      message: (ctx) =>
        `Postur masih kurang baik selama ${ctx.badMinutes} menit. Rilekskan leher, tempelkan punggung ke sandaran, lalu tarik napas dalam.`,
      fallbackAudio: 'alertSoft',
      rate: 1.0,
    },
    critical: {
      message: (ctx) =>
        `Ini peringatan serius. Postur buruk sudah ${ctx.badMinutes} menit dan skor berada di ${ctx.score}. Segera berdiri dan lakukan peregangan sebelum melanjutkan.`,
      fallbackAudio: 'alertHard',
      rate: 0.95,
    },
  };

  const STATE = {
    cues: DEFAULT_CUES,
    muted: false,
  };

  function resolveAudioElement(id) {
    if (!id) return null;
    return document.getElementById(id);
  }

  async function speak(text, cue) {
    if (!text) return;
    if (STATE.muted) {
      window.SitSenseUI?.showToast?.(text, 'warn');
      return;
    }

    // 1) Selalu coba putar chime pendek dulu (alertSoft/alertHard)
    const fallbackEl = resolveAudioElement(cue?.fallbackAudio || 'alertSoft');
    if (fallbackEl) {
      try {
        fallbackEl.currentTime = 0;
        // Jangan blokir terlalu lama; biarkan TTS mulai segera setelah play() dipanggil
        await fallbackEl.play();
      } catch (err) {
        console.warn('[AudioCoach] pre-TTS chime failed', err);
      }
    }

    // 2) Lanjutkan dengan suara TTS utama
    if (typeof window.speakText === 'function') {
      try {
        await window.speakText(text, { rate: cue?.rate || 1 });
        return;
      } catch (err) {
        console.warn('[AudioCoach] speakText failed, fallback to chime only', err);
      }
    }

    // 3) Jika TTS tidak tersedia sama sekali, minimal munculkan toast
    window.SitSenseUI?.showToast?.(text, 'warn');
  }

  function formatMessage(message, context = {}) {
    if (typeof message === 'function') return message(context);
    return message ? message.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] ?? '') : '';
  }

  async function playCue(level, context = {}) {
    const cue = STATE.cues[level];
    if (!cue) return;
    const text = formatMessage(cue.message, context);
    await speak(text, cue);
    document.dispatchEvent(
      new CustomEvent('sitsense:audiocoach:cue', { detail: { level, text, context } })
    );
  }

  function configure(opts = {}) {
    if (opts.cues) {
      STATE.cues = {
        ...STATE.cues,
        ...opts.cues,
      };
    }
    if (typeof opts.muted === 'boolean') {
      STATE.muted = opts.muted;
    }
  }

  window.SitSenseAudioCoach = {
    playCue,
    configure,
    setMuted(flag) {
      STATE.muted = !!flag;
    },
    getConfig() {
      return { ...STATE };
    },
  };
})();

