# OmniProfiler

**Unity için sıfır-overhead, derinlemesine profilme ve hata ayıklama panosu.**

Unity'nin yerleşik Profiler'ı iki temel konuda yetersiz kalır: **Deep Profile** modu oyunun
FPS'ini ciddi biçimde düşürür ve **ring buffer** yalnızca son birkaç saniyeyi tuttuğu için
"10. dakikadaki GC spike'ı" ile "1. dakikayı" karşılaştıramazsınız. OmniProfiler bu iki sorunu
aynı anda çözer:

1. Unity tarafında yalnızca **ölç + serileştir + UDP'ye at** yapılır (ağır iş yok).
2. Tüm oturum **SQLite'a** yazılır → tarihsel ve oturumlar arası analiz mümkün olur.

Bu depo, projenin **çalışan prototipidir**: gerçek ingestion hattı, analiz motorları, SQLite
katmanı ve 4 panelli React dashboard'u içerir. Unity tarafı gerçek C# ajanıyla
(`unity/OmniProfilerAgent.cs`), masaüstü paketlemesi Electron kabuğuyla (`electron/`) temsil edilir.

---

## Hızlı başlangıç

```bash
npm install
npm run dev          # sunucu (:8787) + dashboard (:5173) + mock Unity ajanı
```

Tarayıcıda `http://localhost:5173` açılır. **Mock Unity ajanı otomatik başlar** ve 96 saniyelik
dönen bir senaryo üretir (MainMenu → Level_01 → Level_02 sızıntı sahnesi → Level_03 UI spam →
Boss_Arena hitch'leri), böylece tüm özellikler gerçek veriyle görülebilir.

```bash
npm test             # 34 test: analiz motorları + panel DOM davranışı
npm run typecheck    # TypeScript kontrolü
npm run build        # production bundle (dist/)
```

Ortam değişkenleri:

| Değişken | Varsayılan | Açıklama |
| --- | --- | --- |
| `OMNI_PORT` | `8787` | REST + WebSocket portu |
| `OMNI_UDP_PORT` | `8790` | Unity ajanının UDP gönderdiği port |
| `OMNI_DB` | `data/omniprofiler.db` | SQLite dosyası (`:memory:` = kalıcı değil) |
| `OMNI_SIM` | `1` | Mock ajanı otomatik başlat |
| `OMNI_SIM_TRANSPORT` | `inproc` | `inproc` (doğrudan enjeksiyon) veya `udp` (gerçek ağ yolu) |

> **`OMNI_SIM_TRANSPORT=udp` ile çalıştırdığınızda** mock ajan verileri gerçekten UDP datagram
> olarak gönderir; sunucunun paket birleştirme, `seq` tabanlı kayıp ölçümü ve NDJSON tamponu
> gerçek yoldan test edilir. Üst bardaki "kayıp %x" göstergesi bunu yansıtır.

---

## Ekran düzeni

```
┌──────────────────────────── ÜST BAR (global metrikler) ────────────────────────────┐
│ FPS · 1%/0.1% Low · Draw Calls · GC Alloc/sn · Mono Used · Gfx · Sahne · Ajan      │
├──────────────┬──────────────────────────────────────────┬──────────────────────────┤
│ SOL          │ ORTA/ÜST                                 │ SAĞ                      │
│ Log akışı    │ Frame Time (renkli histogram + bütçe)    │ Bulgular (GC / hitch /   │
│ • seviye     │ FPS + 1% / 0.1% Low                      │  heap / leak / spam)     │
│ • etiket     │ Bellek (mono used / heap / reserved /gfx)│ Maliyet panosu           │
│ • spam       │ GC Alloc (kare başına KB)                │ (agregasyon oranı,       │
│ • arama      │ Draw Calls / SetPass                     │  SQLite yazımı, WS)      │
│ • sanallık   │ Özel Olaylar zaman şeridi (TrackEvent)   │                          │
├──────────────┴──────────────────────────────────────────┴──────────────────────────┤
│ ALT: Frame Inspector · A/B Karşılaştırma · Sızıntı Dedektörü · Özel Olaylar ·      │
│      Tarihsel Analiz (SQLite)                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

Klavye: `1..5` sekme değiştir · `/` log aramasına odaklan · `Esc` flamegraph zoom sıfırla.

---

## Özellikler ve nasıl kullanılır

### 1. Akıllı log motoru
* **Agregasyon:** aynı hata 5+ kez tekrarlanınca "spam grubu" olur ve ekranda **tek satır**
  halinde `NullReferenceException (x11006) · İlk: 00:12 (kare 4201) · Son: 18:53 (kare 74120)`
  biçiminde görünür. 19 dakikalık test oturumunda **50.854 ham log → 10 satır** (%99,98 azalma).
* **Etiketleme:** `[Physics]`, `[UI]`, `[Network]` gibi köşeli parantez ifadeleri otomatik
  ayrılır, renkli chip'e dönüşür ve filtrelenebilir.
* **Suçlu kare:** stack trace parse edilir; Unity/Mono içi kareler atlanıp **ilk kullanıcı kodu**
  bulunur ve vurgulanır (`Assets/Scripts/UI/UIHUDController.cs:214 → UIHUDController.RefreshHealthBar`).
* **Bağlam enjeksiyonu:** her log grubuna, hata anındaki **FPS / frame time / Mono used / GC /
  draw call / sahne** anlık görüntüsü iliştirilir.
* **Modlar:** `Grup` (agregatör çıktısı) ve `Ham` (klasik akış). Liste **sanallaştırılmıştır**:
  DOM'da yalnızca görünür satırlar bulunur.

### 2. Derinlemesine metrikler
Kare başına 18 kolon: `frameId, dtMs, gcAllocBytes, totalReserved, totalAllocated, monoHeap,
monoUsed, gfxDriver, drawCalls, batches, setPassCalls, triangles, vertices, mainThreadMs,
renderThreadMs, gpuMs, physicsMs, animMs` (bkz. `shared/protocol.js` → `FRAME_FIELDS`).

* **1% Low / 0.1% Low:** kayan pencerede (varsayılan 600 kare) en kötü %1 ve %0.1'lik dilimlerin
  ortalaması. Hem canlı (üst bar + FPS grafiğinde adım serisi) hem de **SQL üzerinden tüm oturum**
  için hesaplanır (Tarihsel Analiz sekmesi).
* **Darboğaz tespiti:** seçili karede `main / render / gpu / physics / animation` süreleri
  karşılaştırılıp "DARBOĞAZ: Main Thread (55.0 ms · karenin %89'u)" olarak gösterilir.

### 3. Frame Timeline (alev grafiği)
Ajan `Profiler.BeginSample/EndSample` (veya `OmniProfiler.Sample()`) ağacını **düz pre-order dizi**
olarak gönderir: `[name, selfUs, totalUs, childCount, depth]`. Panel bu diziden doğrudan çizer —
ağacı yeniden kurmak için ek gezinme gerekmez. Bloğa tıklayınca o blok kök kabul edilip zoom yapılır.
Altında **Self Time — En Pahalı Fonksiyonlar** tablosu vardır.

### 4. Otomatik bellek sızıntısı dedektörü
Ajan Instantiate/Destroy olaylarını `(tip, prefab, delta)` olarak gönderir. Dedektör **üç kanıtı
birlikte** ister; bu yüzden havuzlanmış (pooled) objeler yanlış alarm üretmez:

| Kanıt | Eşik | Amaç |
| --- | --- | --- |
| destroy/spawn oranı | `< 0.55` | objeler geri dönüyor mu? |
| canlı sayı eğimi | `> 0.35 obje/sn` (12 sn pencere, en küçük kareler) | birikme var mı? |
| mono heap eğimi | `> 0.35 MB/sn` (30 sn pencere) | bellek gerçekten büyüyor mu? |

19 dakikalık örnek oturumda üretilen tablo (gerçek çıktı):

```
BulletPrefab   spawned=5380   destroyed=212    live=5168  ratio=0.039  slope=+12.06  → SIZINTI (high)
TooltipPanel   spawned=252    destroyed=23     live=229   ratio=0.091  slope=+0.20   → izleniyor
EnemyPrefab    spawned=1464   destroyed=1472   live=21    ratio=1.005  slope=-0.59   → dengeli
HitEffectVFX   spawned=16751  destroyed=16751  live=0     ratio=1.000  slope=-0.12   → dengeli (pool)
```

### 5. Özel telemetri (`TrackEvent`)
`OmniProfiler.TrackEvent("PlayerDied", new { Score = 100, Level = 5 })` çağrısı, grafiklerin
**altındaki olay şeridinde** işaretlenir; her olaya gerçekleştiği andaki FPS/GC/sahne bağlamı
iliştirilir. "Oyuncu öldüğü anda FPS neden düştü?" sorusu tek bakışta cevaplanır.

### 6. A/B kare karşılaştırması
Frame Inspector'da bir kareyi **A**, diğerini **B** olarak pinleyin. Panel:
* 17 metriğin yan yana değerlerini, mutlak ve yüzde farklarını, **İYİ/KÖTÜ/=** kararını gösterir
  (draw call artışı "kötü", FPS artışı "iyi" — yön metriğe göre tersine çevrilir).
* Örneklem ağaçlarını **fonksiyon bazında** karşılaştırır; adlardaki sayılar normalize edilir
  (`EnemyAI.Update() x12` ≡ `EnemyAI.Update() x48`) ve **yalnızca B'de çalışan** fonksiyonlar
  işaretlenir (regresyonların gerçek nedeni genelde budur).
* Kısayol: "En yavaş kareyi A/B yap", "Normal ↔ en yüksek GC".

### 7. Tarihsel analiz (SQLite)
Tüm kareler, loglar, olaylar, obje yaşam döngüleri, örneklem ağaçları ve bulgular diske yazılır.
`Tarihsel Analiz` sekmesi geçmiş oturumları listeler ve **SQL üzerinden** şunları hesaplar:
oturum özeti (ortalama/medyan/min FPS, 1% & 0.1% low, toplam GC, draw call ort/max),
en büyük GC spike'ları, en çok tekrar eden log grupları, tip bazında obje dengesi.
Kareler ve loglar **CSV** olarak dışa aktarılabilir.

---

## Komutlar ve API

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | Sunucu + dashboard + mock ajan |
| `npm test` | 34 test (analiz motorları + panel DOM) |
| `npm run typecheck` | TypeScript |
| `npm run build` | `dist/` üretim paketi |
| `OMNI_SIM_TRANSPORT=udp npm run dev` | Gerçek UDP yoluyla çalıştır |

REST uç noktaları (tümü `http://localhost:8787`):

```
GET  /api/health                       sağlık + sayaçlar
GET  /api/state                        tam durum (oturum, snapshot, gruplar, bulgular)
GET  /api/series?fields=&maxPoints=    sıkıştırılmış zaman serisi
GET  /api/frame?id=                    kare detayı (+ örneklem, loglar, olaylar)
GET  /api/samples?id=                  örneklem ağacı (komşu kareye düşer)
GET  /api/compare?a=&b=                A/B karşılaştırma
GET  /api/logs?levels=&tags=&search=   agregatör grupları
GET  /api/logs/:fingerprint            tek grup (stack + örnekler)
GET  /api/leaks  /api/findings  /api/events
GET  /api/sessions                     geçmiş oturumlar (SQLite)
GET  /api/history?sessionId=           toplu istatistik + GC spike + log grupları
GET  /api/export/frames.csv  /api/export/logs.csv
POST /api/sim                          mock ajan kontrolü (start/stop/reset/fps/lossRate/gcSpike/event/log)
WS   /ws                               canlı akış
```

---

## Depo yapısı

```
omniprofiler/
├── shared/protocol.js          # WIRE PROTOCOL v1 (NDJSON + FRAME_FIELDS + örneklem biçimi)
├── server/                     # Electron "main" karşılığı (Node.js)
│   ├── index.js                # HTTP + WS + UDP dinleyici + simülatör
│   ├── ingest.js               # mesaj yönlendirme → Store + SQLite + yayın
│   ├── store.js                # ring buffer (typed arrays), 1%/0.1% low, seri sıkıştırma
│   ├── aggregator.js           # log motoru: etiket, stack parse, fingerprint, spam throttle
│   ├── analysis.js             # sızıntı dedektörü + bulgu motoru + darboğaz tespiti
│   ├── db.js                   # SQLite şeması, toplu yazma, tarihsel sorgular
│   ├── hub.js                  # yayın katmanı (kare partileri 100 ms'de bir)
│   └── http.js                 # REST uç noktaları + A/B karşılaştırma mantığı
├── tools/mock-unity-agent.js   # deterministik Unity ajan simülatörü (inproc/udp)
├── unity/OmniProfilerAgent.cs  # GERÇEK Unity ajanı (C#, ~1000 satır, yoğun yorumlu)
├── electron/                   # masaüstü kabuğu (main.js, preload.js, builder yapılandırması)
├── client/                     # React + TypeScript dashboard
│   ├── lib/{sink,store,transport,format,ws}.ts
│   └── components/{TopBar,LogPanel,ChartsPanel,SidePanel,BottomPanel,
│                   FrameInspector,FlameGraph,ComparePanel,LeakPanel,
│                   EventsPanel,HistoryPanel}.tsx
├── test/                       # vitest: analiz motorları + jsdom panel testleri
└── docs/                       # MIMARI.md (kararlar + riskler), YOL-HARITASI.md
```

---

## Unity tarafına geçiş (gerçek ajan)

1. `unity/OmniProfilerAgent.cs` dosyasını `Assets/Scripts/` altına kopyalayın
   (Editor klasörü gerekmez; `#if UNITY_EDITOR` blokları içeride).
2. Editör menüsünden **Tools → OmniProfiler → Enable Agent** işaretli olsun
   (varsayılan: açık). Play Mode'a girince ajan otomatik başlar.
3. Panelin çalıştığı makinenin adresini verin:
   * aynı makine → `127.0.0.1` (varsayılan)
   * mobil/cihaz → geliştirme makinesinin LAN IP'si (`OmniProfilerSettings.host`)
     veya `enableDiscovery = true` ile UDP broadcast keşfini kullanın.
4. İsteğe bağlı ölçüm noktaları:
   ```csharp
   OmniProfiler.TrackEvent("PlayerDied", new { Score = 100, Level = 5 });

   using (OmniProfiler.Sample("Inventory.Resort")) { ResortItems(); }

   var bullet = OmniProfiler.Spawn(bulletPrefab, pos, rot);   // sayım dahil Instantiate
   OmniProfiler.Despawn(bullet);                              // sayım dahil Destroy
   ```
   Havuzunuza dokunmak istemiyorsanız prefab'a `OmniProfilerTracker` bileşeni ekleyin;
   OnEnable/OnDisable üzerinden otomatik sayar.

---

## Electron'a paketleme

Web prototipi ile masaüstü uygulaması **aynı pipeline kodunu** paylaşır; yalnızca taşıma katmanı değişir:

```bash
cd electron
npm install
npm run dist          # electron-builder: dmg / nsis / AppImage
```

| Web prototipi | Electron |
| --- | --- |
| `Hub` → WebSocket | `webContents.send('omni', msg)` |
| `fetch('/api/...')` | `ipcRenderer.invoke('omni:api', path)` |
| `data/omniprofiler.db` | `app.getPath('userData')/omniprofiler.db` |
| Vite dev server | `loadFile('dist/index.html')` |

`client/lib/transport.ts` bu farkı gizler: `window.omni` varsa IPC, yoksa WebSocket kullanılır.
Yani **dashboard kodu iki ortamda da aynıdır**.

> `better-sqlite3` native bir modüldür. Paketlerken `electron-rebuild` ile Electron ABI'sine
> derlenmeli ve `asarUnpack` ile arşiv dışına çıkarılmalıdır (yapılandırma `electron/package.json`
> içinde hazır). Bu prototipte Node ABI'si kullanıldığı için yeniden derleme gerekmez.

---

## Testler

```
node projesi (20 test)
  1) Log agregasyonu      — 50 tekrar → 1 satır, bastırma oranı, ilk/son zaman & kare
  2) Etiket + stack parse — [Physics] ayrımı, suçlu kare seçimi, Unity içi karelerin atlanması
  3) 1% / 0.1% Low        — 990×60fps + 9×30fps + 1×5fps penceresinde beklenen değerler
  4) Sızıntı dedektörü    — gerçek sızıntı yakalanır, sağlıklı havuz AKLANIR (yanlış pozitif yok)
  5) A/B karşılaştırma    — worse/better yönü, örneklem adı normalizasyonu, "yalnız B" işareti
  6) SQLite               — toplu yazım, SQL ile low percentile, GC spike ve obje dengesi sorguları
  7) Uçtan uca pipeline   — hello→frame→log→event→obj→samples(chunked) akışı
  8) Ring buffer          — kapasite aşımı, frameId araması, spike koruyucu seri sıkıştırma

dom projesi (14 test)
  • 5.000 log grubu → DOM'da < 120 satır (sanallaştırma kanıtı)
  • filtre/arama/spam kesişimleri gerçekten daraltıyor
  • spam satırı "(x50) · İlk · Son · bağlam chip'leri · suçlu kare" gösteriyor
  • 30.000 kare + oturum sıfırlama + geçmiş enjeksiyonu → grafikler çökmüyor
    ("Cannot update oldest data" regresyonu bu testle yakalanır)
  • flamegraph geometrisi: kök %100, çocuk %60/%39, zoom + Esc
  • üst bar / bulgular / sekme geçişleri
```
