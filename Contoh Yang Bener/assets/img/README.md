# Image Assets Directory

Direktori ini menyimpan semua aset gambar untuk aplikasi SitSense.

## Format Gambar yang Didukung

Aplikasi sekarang mendukung berbagai format gambar dengan fallback otomatis:
- **SVG** (Scalable Vector Graphics) - Format default, prioritas tertinggi
- **PNG** (Portable Network Graphics)
- **JPG/JPEG** (Joint Photographic Experts Group)
- **WEBP** (Web Picture Format)

## Cara Menggunakan

### 1. Menambahkan Gambar Baru

Tambahkan gambar dengan nama yang sama tetapi ekstensi berbeda di direktori ini:

```
assets/img/
  ├── logo-sitsense.svg
  ├── logo-sitsense.png
  ├── logo-sitsense.jpg
  ├── posture-silhouette.svg
  ├── posture-silhouette.png
  └── ...
```

### 2. Menggunakan di HTML

Gunakan atribut `data-image-base` pada tag `<img>`:

```html
<!-- Format lama (hanya SVG) -->
<img src="./assets/img/logo-sitsense.svg" alt="Logo" />

<!-- Format baru (dengan fallback) -->
<img data-image-base="logo-sitsense" alt="Logo" />
```

### 3. Konfigurasi Kustom

Anda dapat mengkonfigurasi path dan format yang ingin dicoba:

```html
<!-- Dengan path kustom -->
<img data-image-base="logo-sitsense" 
     data-image-path="./custom/path/" 
     alt="Logo" />

<!-- Dengan format kustom -->
<img data-image-base="logo-sitsense" 
     data-image-formats="png,jpg,svg" 
     alt="Logo" />
```

### 4. Menggunakan di JavaScript

```javascript
// Memuat gambar dengan fallback
const imageUrl = await window.ImageLoader.loadImageWithFallback(
  'logo-sitsense',
  './assets/img/',
  ['svg', 'png', 'jpg']
);

// Set sumber gambar ke elemen
await window.ImageLoader.setImageSource(
  '#myImage',
  'logo-sitsense',
  './assets/img/',
  ['svg', 'png', 'jpg']
);
```

## Prioritas Fallback

Sistem akan mencoba memuat gambar dalam urutan berikut:
1. SVG (jika tersedia)
2. PNG (jika SVG tidak ditemukan)
3. JPG/JPEG (jika PNG tidak ditemukan)
4. WEBP (jika JPG tidak ditemukan)

## Catatan

- Format SVG direkomendasikan untuk logo dan ikon karena skalabilitasnya
- Format PNG direkomendasikan untuk gambar dengan transparansi
- Format JPG direkomendasikan untuk foto dan gambar dengan banyak warna
- Format WEBP direkomendasikan untuk optimasi ukuran file (dukungan browser modern)

## Kompatibilitas

- Sistem akan secara otomatis mendeteksi format yang tersedia
- Jika gambar tidak ditemukan dalam format apapun, gambar akan disembunyikan
- Sistem kompatibel dengan komponen yang dimuat dinamis (via fetch/async)

