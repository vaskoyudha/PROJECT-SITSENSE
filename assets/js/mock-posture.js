(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mockPosture');
  if (!mode || mode.toLowerCase() !== 'bad') return;

  function startMockStream() {
    if (typeof window.__injectPacket !== 'function') {
      console.warn('[MockPosture] __injectPacket not ready, retrying...');
      setTimeout(startMockStream, 500);
      return;
    }

    console.log('[MockPosture] Starting bad-posture simulation stream');
    window.SitSenseUI?.showToast?.('Mock postur buruk aktif (sensor dapat dimatikan)', 'info');

    setInterval(() => {
      // Nilai yang sengaja membuat skor jelek: punggung & leher terlalu dekat
      const packet = {
        fsr: 150, // di bawah range ideal supaya pressure jelek
        ultrasonic: {
          punggung_cm: 8,  // terlalu dekat
          leher_cm: 10     // terlalu dekat
        }
      };
      try {
        window.__injectPacket(packet);
      } catch (err) {
        console.warn('[MockPosture] Failed to inject packet', err);
      }
    }, 4000); // setiap 4 detik, cukup sering untuk membentuk streak
  }

  document.addEventListener('DOMContentLoaded', startMockStream);
})();








