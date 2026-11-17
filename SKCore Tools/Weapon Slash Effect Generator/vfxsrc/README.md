# SLASH FORGE — Kaynak & Build

Ana teslimat: `../3D-Melee-Trail-Slash-VFX-Studio.html` (tek dosya, offline çalışır)

## Dosyalar
- `body.html` — UI işaretlemesi (viewport + kontrol paneli)
- `style.css` — koyu tema stilleri
- `app.js` — tüm uygulama mantığı (sahne, prosedürel kılıç, saldırı motoru,
  ribbon trail motoru + Catmull-Rom, shader, preset'ler, Unity export üreteçleri)
- `vendor/` — three.js r147 UMD + OrbitControls + UnrealBloomPass vb. (MIT, build ile gömülür)
- `build.js` — tek HTML dosyasını üretir: `node build.js`
- `pose-test.js` — saldırı keyframe matematiği testleri: `node pose-test.js`
- `smoke-test.js` — jsdom ile headless uygulama testi: `node smoke-test.js` (gerekli: `npm i`)

## Not
`edit_file` yerine sed/python kullanıldığında sorun çıkmadı; testler yeşil.
