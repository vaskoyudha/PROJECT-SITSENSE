# Prompt untuk Generate Gambar Posture Silhouette

Dokumen ini berisi prompt yang dapat digunakan untuk menghasilkan gambar siluet postur duduk menggunakan AI image generator (seperti Midjourney, DALL-E, Stable Diffusion, dll).

## Prompt Utama (Recommended)

```
A minimalist silhouette of a person sitting in a chair, side profile view, clean white silhouette on transparent background, modern medical illustration style, simple geometric shapes, professional posture monitoring visualization, high contrast, vector art style, suitable for overlay on heatmap visualization, 2:1 aspect ratio, centered composition
```

## Alternatif Prompt 1 (Lebih Detail)

```
Human silhouette sitting posture, side view, minimalist design, white or light gray silhouette on transparent background, medical/ergonomic illustration style, clean lines, professional healthcare visualization, suitable for posture monitoring system overlay, simple geometric form, no details, just outline, 16:9 aspect ratio
```

## Alternatif Prompt 2 (Tech/Modern Style)

```
Tech-style human sitting silhouette, side profile, minimalist vector illustration, glowing outline effect, transparent background, modern UI design, ergonomic posture visualization, clean and simple, suitable for dashboard overlay, professional medical tech aesthetic, 2:1 ratio
```

## Alternatif Prompt 3 (Simple & Clean)

```
Simple human silhouette sitting in chair, side view, white outline on transparent background, minimal design, clean vector style, posture monitoring illustration, ergonomic visualization, professional medical graphic, no facial features, just body outline, centered, 16:9 aspect ratio
```

## Spesifikasi Teknis

### Format yang Disarankan:
- **PNG dengan transparansi** (prioritas utama)
- **SVG** (alternatif, jika AI generator mendukung)
- Resolusi: Minimal 800x400px (untuk 2:1 ratio) atau 1280x720px (untuk 16:9 ratio)

### Karakteristik Visual:
- **Warna**: Putih atau abu-abu terang (#FFFFFF atau #F0F0F0)
- **Background**: Transparan penuh
- **Style**: Minimalis, clean, modern
- **Detail**: Hanya outline/siluet, tanpa detail wajah atau tekstur
- **Posisi**: Side profile (tampak samping) dalam posisi duduk

### Aspek Rasio:
- **2:1** (200x400px seperti SVG saat ini) - untuk tampilan vertikal
- **16:9** (1280x720px) - untuk tampilan landscape/widescreen

## Tips untuk AI Generator

### Untuk Midjourney:
```
/imagine prompt: minimalist human silhouette sitting in chair, side profile, white outline, transparent background, medical illustration style, clean vector art, --ar 2:1 --style raw --v 6
```

### Untuk DALL-E 3:
Gunakan prompt utama di atas dengan tambahan: "transparent background, PNG format"

### Untuk Stable Diffusion:
Tambahkan negative prompt:
```
Negative: detailed face, facial features, shadows, gradients, complex details, realistic photo, 3D render
```

## Setelah Generate

1. Pastikan background benar-benar transparan
2. Jika perlu, edit menggunakan tool seperti:
   - Remove.bg (untuk menghapus background)
   - GIMP/Photoshop (untuk fine-tuning transparansi)
   - Inkscape (untuk konversi ke SVG jika diperlukan)

3. Simpan dengan nama: `posture-silhouette.png` atau `posture-silhouette.svg`
4. Letakkan di folder: `/assets/img/`

## Catatan Penting

- Gambar akan digunakan sebagai overlay pada heatmap dengan opacity 80%
- Pastikan siluet tidak terlalu tebal agar tidak menutupi heatmap
- Posisi duduk harus jelas terlihat (tidak terlalu abstrak)
- Warna putih/terang penting karena akan overlay pada background gelap (slate-900)

