/**
 * Image Loader Utility
 * Mendukung berbagai format gambar (SVG, PNG, JPG, WEBP) dengan fallback otomatis
 */

/**
 * Mencoba memuat gambar dengan urutan fallback: SVG -> PNG -> JPG -> WEBP
 * @param {string} baseName - Nama file tanpa ekstensi (e.g., "logo-sitsense")
 * @param {string} basePath - Path dasar ke folder gambar (default: "./assets/img/")
 * @param {string[]} formats - Array format yang akan dicoba (default: ["svg", "png", "jpg", "jpeg", "webp"])
 * @returns {Promise<string>} URL gambar yang berhasil dimuat
 */
async function loadImageWithFallback(baseName, basePath = "./assets/img/", formats = ["svg", "png", "jpg", "jpeg", "webp"]) {
  const formatPriority = formats.map(f => f.toLowerCase());
  
  for (const format of formatPriority) {
    const url = `${basePath}${baseName}.${format}`;
    try {
      const exists = await checkImageExists(url);
      if (exists) {
        return url;
      }
    } catch (e) {
      // Continue to next format
      continue;
    }
  }
  
  // Jika tidak ada yang ditemukan, return format pertama sebagai fallback
  console.warn(`[ImageLoader] Tidak dapat memuat gambar: ${baseName}, menggunakan format default: ${formatPriority[0]}`);
  return `${basePath}${baseName}.${formatPriority[0]}`;
}

/**
 * Memeriksa apakah gambar ada dengan mencoba memuatnya
 * @param {string} url - URL gambar yang akan diperiksa
 * @returns {Promise<boolean>} True jika gambar ada
 */
function checkImageExists(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/**
 * Memuat gambar dan set src elemen img
 * @param {HTMLImageElement|string} imgElement - Elemen img atau selector
 * @param {string} baseName - Nama file tanpa ekstensi
 * @param {string} basePath - Path dasar ke folder gambar
 * @param {string[]} formats - Array format yang akan dicoba
 */
async function setImageSource(imgElement, baseName, basePath = "./assets/img/", formats = ["svg", "png", "jpg", "jpeg", "webp"]) {
  const img = typeof imgElement === 'string' ? document.querySelector(imgElement) : imgElement;
  if (!img) {
    console.error(`[ImageLoader] Elemen gambar tidak ditemukan:`, imgElement);
    return;
  }
  
  try {
    const url = await loadImageWithFallback(baseName, basePath, formats);
    img.src = url;
    img.onerror = () => {
      // Jika masih error, sembunyikan gambar
      console.warn(`[ImageLoader] Gagal memuat gambar: ${url}`);
      img.style.display = 'none';
    };
  } catch (e) {
    console.error(`[ImageLoader] Error memuat gambar:`, e);
    img.style.display = 'none';
  }
}

/**
 * Memuat gambar untuk CSS mask-image dengan fallback
 * @param {string} baseName - Nama file tanpa ekstensi
 * @param {string} basePath - Path dasar ke folder gambar
 * @param {string[]} formats - Array format yang akan dicoba
 * @returns {Promise<string>} URL gambar untuk CSS
 */
async function getImageForCSS(baseName, basePath = "./assets/img/", formats = ["svg", "png", "webp"]) {
  // Untuk CSS mask, hanya format yang didukung: SVG, PNG, WEBP
  const cssFormats = formats.filter(f => ["svg", "png", "webp"].includes(f.toLowerCase()));
  return await loadImageWithFallback(baseName, basePath, cssFormats.length > 0 ? cssFormats : ["svg", "png", "webp"]);
}

/**
 * Inisialisasi semua gambar di halaman dengan fallback
 * Menemukan semua img dengan data-image-base attribute
 */
async function initializeImages() {
  const images = document.querySelectorAll('img[data-image-base]');
  
  for (const img of images) {
    const baseName = img.getAttribute('data-image-base');
    const basePath = img.getAttribute('data-image-path') || "./assets/img/";
    const formatsAttr = img.getAttribute('data-image-formats');
    const formats = formatsAttr ? formatsAttr.split(',').map(f => f.trim()) : ["svg", "png", "jpg", "jpeg", "webp"];
    
    await setImageSource(img, baseName, basePath, formats);
  }
}

/**
 * Set CSS mask-image dengan fallback
 * @param {HTMLElement|string} element - Elemen atau selector
 * @param {string} baseName - Nama file tanpa ekstensi
 * @param {string} basePath - Path dasar ke folder gambar
 */
async function setMaskImage(element, baseName, basePath = "./assets/img/") {
  const el = typeof element === 'string' ? document.querySelector(element) : element;
  if (!el) {
    console.error(`[ImageLoader] Elemen tidak ditemukan:`, element);
    return;
  }
  
  try {
    const url = await getImageForCSS(baseName, basePath);
    el.style.maskImage = `url('${url}')`;
    el.style.webkitMaskImage = `url('${url}')`;
  } catch (e) {
    console.error(`[ImageLoader] Error set mask image:`, e);
  }
}

// Export untuk penggunaan global
window.ImageLoader = {
  loadImageWithFallback,
  setImageSource,
  getImageForCSS,
  setMaskImage,
  initializeImages,
  checkImageExists
};

// Auto-initialize saat DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeImages);
} else {
  initializeImages();
}

// Observer untuk memantau perubahan DOM (komponen yang dimuat dinamis)
const imageObserver = new MutationObserver((mutations) => {
  let shouldReinit = false;
  mutations.forEach((mutation) => {
    if (mutation.addedNodes.length > 0) {
      // Periksa apakah ada elemen img dengan data-image-base yang ditambahkan
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          if (node.tagName === 'IMG' && node.hasAttribute('data-image-base')) {
            shouldReinit = true;
          } else if (node.querySelectorAll && node.querySelectorAll('img[data-image-base]').length > 0) {
            shouldReinit = true;
          }
        }
      });
    }
  });
  
  if (shouldReinit) {
    // Delay kecil untuk memastikan semua atribut sudah ter-set
    setTimeout(initializeImages, 100);
  }
});

// Mulai observe setelah DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    imageObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
} else {
  imageObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Event listener untuk komponen yang dimuat dinamis
window.addEventListener('load', () => {
  // Re-initialize setelah semua resource dimuat
  setTimeout(initializeImages, 200);
});

