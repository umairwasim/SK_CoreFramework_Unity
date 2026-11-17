# OmniProfiler — Geliştirme Yol Haritası (durum takibi)

Raporunuzdaki 8 haftalık planın **uygulanmış durumu**. ✅ = bu depoda çalışıyor ve testle
doğrulanmış, 🟡 = kısmen / altyapısı hazır ama gerçek cihazda doğrulanmadı, ⬜ = henüz yok.

---

## Faz 1 — Temel İletişim ve Log Motoru ✅

| Görev | Durum | Nerede |
| --- | --- | --- |
| Unity UDP ajanı (log + temel UnityStats) | ✅ | `unity/OmniProfilerAgent.cs` (gerçek C#) + `tools/mock-unity-agent.js` (protokol birebir taklidi) |
| Node UDP dinleyicisi | ✅ | `server/index.js` — kaynak başına NDJSON tamponu, yarım paket birleştirme, taşma koruması |
| SQLite şeması | ✅ | `server/db.js` — 7 tablo, WAL, toplu transaction yazımı |
| Log akışı + temel filtreleme | ✅ | `client/components/LogPanel.tsx` — seviye/etiket/spam/arama, sanallaştırılmış liste |
| Log agregasyonu (spam önleme) | ✅ | `server/aggregator.js` — normalizasyon + FNV-1a fingerprint + throttle. **Ölçüm: 50.854 ham log → 10 satır (%99,98)** |
| *Ek:* etiket çıkarımı + suçlu kare tespiti | ✅ | `extractTag()`, `parseStack()` (Unity içi kareleri atlar) |
| *Ek:* bağlam enjeksiyonu | ✅ | `IngestPipeline.context()` — ±2 sn komşuluk kuralıyla (`docs/MIMARI.md` §4.2) |

**Faz 1 doğrulaması:** `test/analysis.test.js` → "1) Log agregasyonu", "2) Etiket + stack parse",
"7) Uçtan uca pipeline". `test/dashboard.dom.test.js` → sanallaştırma ve filtre testleri.

---

## Faz 2 — Metrikler ve Grafikler ✅

| Görev | Durum | Not |
| --- | --- | --- |
| GC, bellek, draw call metrikleri | ✅ | 18 kolonlu `FRAME_FIELDS`; Editör'de `UnityStats`, build'de `RenderCounters` |
| Lightweight Charts entegrasyonu | ✅ | v5 API (`addSeries`, `createSeriesMarkers`), 5 senkron grafik |
| Gerçek zamanlı çizim | ✅ | WS + 100 ms kare partileri + 120 ms append-only `update()` |
| 1% Low / 0.1% Low | ✅ | İki düzeyde: canlı kayan pencere (600 kare) **ve** SQL üzerinden tüm oturum |
| *Ek:* frame-time histogram renklendirmesi | ✅ | Bütçe içi yeşil / 1-2x amber / >2x kırmızı |
| *Ek:* GC spike + hitch bulguları | ✅ | `FindingsEngine` |
| *Ek:* zaman serisi sıkıştırma | ✅ | `store.series()` — min/max koruyucu örnekleme (spike küçültmede kaybolmaz, testli) |

**Kritik bulgu:** append-only `update()` ile oturum sıfırlama birleşince Lightweight Charts
`Cannot update oldest data` hatası veriyor. Konumsal doğrulama + otomatik `rebuild()` ile
çözüldü ve **regresyon testi** yazıldı.

---

## Faz 3 — İleri Seviye Profilme ve UI ✅

| Görev | Durum | Not |
| --- | --- | --- |
| `BeginSample/EndSample` yakalama | ✅ | `OmniProfiler.Sample()` (using-blok) → düz pre-order dizi `[name, selfUs, totalUs, childCount, depth]` |
| Frame Timeline (flamegraph) UI | ✅ | `client/components/FlameGraph.tsx` — tıkla-zoom, Esc, self-time tablosu |
| Büyük ağaçların bölünmesi | ✅ | `part/i/n` chunking; panel birleştiriyor (testli) |
| `TrackEvent` API'si | ✅ | `OmniProfiler.TrackEvent(name, payload, kind)` |
| Olay zaman çizelgesi | ✅ | Grafiklerin altında, aynı zaman ekseniyle hizalı şerit + grafik üstünde işaretçiler |
| 4 panelli UI düzeni | ✅ | CSS grid: üst bar / sol log / orta grafik / sağ bulgu / alt inspector |
| Dark + Light tema | ✅ | CSS değişkenleri, `localStorage`'da kalıcı |
| *Ek:* bulgu motoru + "Bulgular" çekmecesi | ✅ | GC, hitch, heap, leak, logspam; önem derecesine göre sıralı, tıklayınca kareye atlar |

---

## Faz 4 — Akıllı Analiz, Mobil ve Paketleme 🟡

| Görev | Durum | Not |
| --- | --- | --- |
| Bellek sızıntısı dedektörü | ✅ | Üç kanıt (oran + eğim + heap korelasyonu); yanlış pozitif koruması testli |
| A/B kare karşılaştırması | ✅ | 17 metrik + İYİ/KÖTÜ kararı + örneklem diff'i + "yalnız B" işareti |
| Mobil ajan (Android/iOS) Wi-Fi | 🟡 | Kod hazır (`host` ayarı, broadcast keşif, `#if UNITY_ANDROID/IOS` platform adı). **Gerçek cihazda doğrulanmadı.** |
| Electron Builder paketleme | 🟡 | `electron/main.js` + `preload.js` + builder yapılandırması yazıldı. **Bu sandbox'ta GUI çalıştırılamadığı için derlenip denenmedi.** |
| *Ek:* tarihsel analiz (SQLite sorguları) | ✅ | Geçmiş oturumlar, toplu istatistik, GC spike listesi, log spam sıralaması, obje dengesi |
| *Ek:* CSV dışa aktarma | ✅ | `frames.csv`, `logs.csv` |
| *Ek:* test paketi | ✅ | 34 test (20 node + 14 dom) |
| *Ek:* mock ajan senaryoları | ✅ | 96 sn döngü: 5 sahne, GC spike'ları, sızıntı, log spam'i, hitch'ler, özel olaylar |

---

## Sonraki faz (önerilen sıra)

1. **Gerçek cihaz doğrulaması (Faz 4 kapanışı)**
   * Unity 2022 LTS + 2023 LTS'de ajanı derle, Editör ve Android'de çalıştır.
   * `adb reverse tcp:8790 tcp:8790` ile USB üzerinden UDP (Wi-Fi gerekmez) — mobilde en güvenilir yol.
   * Ölç: ajanın oyun FPS'i üzerindeki gerçek etkisi (Deep Profile ile yan yana).
2. **GPU zamanlaması** — `FrameTimingManager.EnableFrameTimingStats()` + `FrameTiming.gpuFrameTime`.
3. **Grafikte A/B işaretçileri** — seçili iki kare için dikey çizgi (`createSeriesMarkers` veya price line).
4. **Çoklu ajan / çoklu cihaz** — `Store`'u `sessionId` ile böl; üst bara cihaz seçici.
5. **Memory snapshot (.snap) içe aktarma** — Unity Memory Profiler paketinin çıktısını açıp
   sızıntı dedektörünün obje listesiyle çaprazlamak.
6. **CI entegrasyonu** — eşik aşımında (ör. 1% low < 30 fps veya leak bulgusu `high`) build'i
   kıran headless mod: `node server/index.js --headless --assert 1pLow>=30 --duration 300`.
7. **xterm.js "düz terminal" modu** — log panelinin alternatif görünümü olarak (zengin mod zaten var).

---

## Bu depoda ölçülen sayılar (19 dakikalık sürekli oturum)

| Ölçüm | Değer |
| --- | --- |
| İşlenen kare | 69.746 |
| Ham log → agregatör satırı | 50.854 → **10** (%99,98 azalma) |
| Yayınlanmayan (bastırılan) log | 45.309 |
| SQLite'a yazılan satır | 1.085.746 |
| Üretilen bulgu | 200 (tavan; gc / heap / leak / logspam / hitch) |
| Sızıntı tespiti | `BulletPrefab` live 5.168, destroy oranı 0.039, eğim +12.06/sn → **high** |
| Aklanan havuzlar | `HitEffectVFX` (oran 1.000), `EnemyPrefab` (oran 1.005) |
| UDP modunda ölçülen paket kaybı | %0.31 (simüle edilen %0.4'e karşılık) |
| Testler | 34/34 geçti (node 20 + dom 14) |
