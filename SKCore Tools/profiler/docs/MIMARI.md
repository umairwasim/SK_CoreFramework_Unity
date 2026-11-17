# OmniProfiler — Mimari Kararlar, Dürüst Sınırlar ve Risk Analizi

Bu belge, raporunuzdaki mimarinin **uygulanmış hâlini** ve uygulama sırasında ortaya çıkan
teknik gerçekleri kayda geçirir. Amaç: "çalışıyor" demek yerine, **neden böyle çalıştığını**
ve **nerelerde kırılacağını** göstermek.

---

## 1. Katmanlar ve veri akışı

```
┌─────────────────────────────┐
│ Unity (oyun süreci)         │   ölç → serileştir → UDP'ye at
│  OmniProfilerAgent.cs       │   kare başına ~0.05 ms ek maliyet
└──────────────┬──────────────┘
               │ UDP :8790  (NDJSON, seq numaralı, ≤1400 byte/datagram)
               ▼
┌─────────────────────────────┐
│ OmniProfiler Main (Node)    │   Electron main process karşılığı
│  ┌───────────────────────┐  │
│  │ UDP/WS dinleyici      │  │  kaynak başına NDJSON tamponu (yarım paket birleştirme)
│  ├───────────────────────┤  │
│  │ IngestPipeline        │  │  mesaj yönlendirme + sıralama (önce metrik, sonra log)
│  ├──────────┬────────────┤  │
│  │ Store    │ Analiz     │  │  ring buffer (typed arrays) │ aggregator, leak, findings
│  ├──────────┴────────────┤  │
│  │ Storage (SQLite/WAL)  │  │  250 ms'de bir TEK transaction ile toplu yazım
│  ├───────────────────────┤  │
│  │ Hub                   │  │  kareler 100 ms'lik partilerle; log/olay/bulgu anında
│  └──────────┬────────────┘  │
└─────────────┼───────────────┘
              │ WS /ws  (Electron'da: webContents.send)
              ▼
┌─────────────────────────────┐
│ Renderer (React + TS)       │
│  FrameSink (düz dizi) ──────┼──► grafikler (append-only, 120 ms'de bir)
│  Zustand (özet/4 Hz) ───────┼──► üst bar, loglar, bulgular, paneller
└─────────────────────────────┘
```

**Kritik sıralama kararı:** `IngestPipeline` içinde önce kare metrikleri işlenir, sonra log.
Böylece log agregatörü "o anki" FPS/bellek/sahne değerini **bağlam** olarak log satırına
enjekte edebilir. Ters sıralama, bağlamın bir kare gecikmeli (veya eksik) olmasına yol açar.

---

## 2. Performans kararları (ve gerekçeleri)

### 2.1 Neden typed-array ring buffer + ayrı "sink"?

60 fps'te her kareyi React state'ine koymak, saniyede 60 kez tüm ağacı render etmek demektir.
Bu, Unity Profiler'ın kendisinin düştüğü tuzaktır. Çözüm iki katman:

| Katman | İçerik | Güncelleme hızı | Tüketici |
| --- | --- | --- | --- |
| `FrameSink` (düz dizi) | ham kareler | ~60 Hz (RAF ile toplu) | grafikler, flamegraph, A/B |
| Zustand store | özet, loglar, bulgular | ~4 Hz (snapshot) | üst bar, paneller |

Grafikler sink'i **120 ms'de bir okur** ve yalnızca yeni noktaları `series.update()` ile ekler.
Test: 30.000 kare + oturum sıfırlama + geçmiş enjeksiyonu senaryosunda çökme yok
(`test/dashboard.dom.test.js`).

### 2.2 Neden `setData()` değil, `update()`?

Lightweight Charts'ta `setData()` tüm seriyi yeniden kurar (O(n)). Append-only `update()` ise
yalnızca son noktayı ekler (O(1)). 1 saatlik oturumda (216.000 kare) bu fark saniyede
yüzlerce milisaniyedir. **Bedeli:** zaman ekseni geri giderse (oturum sıfırlama, ajan yeniden
bağlanma, geçmiş enjeksiyonu) kütüphane `Cannot update oldest data` hatası fırlatır. Bu yüzden
`ChartsPanel.flush()` **konumsal doğrulama** yapar: serilere eklenmiş son nokta, sink'teki aynı
indeksli kareyle örtüşmüyorsa tam `rebuild()` tetiklenir. Bu davranış testle sabitlenmiştir.

### 2.3 Neden SQLite'a kare başına INSERT değil?

`better-sqlite3` senkron ve hızlıdır, ama 60 fps'te 60 ayrı transaction = 60 fsync riski.
Çözüm: **WAL modu + `synchronous=NORMAL` + 250 ms'de bir tek transaction**. UI yolu hiç diske
dokunmaz; disk yazması arka planda kuyruktan boşaltılır. 19 dakikalık test oturumunda
1.085.746 satır yazıldı, UI'da takılma gözlenmedi.

### 2.4 Log agregasyonu: neden "mesaj normalizasyonu"?

`"Raycast hit 412 colliders"` ve `"Raycast hit 7 colliders"` aynı sorundur ama farklı
string'lerdir. Doğrudan string eşitliğiyle gruplanırsa spam **gruplanmaz**. Bu yüzden mesaj
normalize edilir:

```
0x7ff...      → 0x#
GUID          → <guid>
123 / 1.5     → #
'text' "text" → '*' "*"
```

Ardından `FNV-1a(level | tag | exceptionType | normalized)` ile 32-bit parmak izi üretilir.
Ölçülen sonuç: **50.854 ham log → 10 grup (%99,98 azalma)**, 45.309 satır yayınlanmadı.

**Spam throttle:** bir grup `spamThreshold` (5) tekrar eşiğini geçince "spam grubu" olur ve
bundan sonra her örnek yayınlanmaz; grup satırı 400 ms'de bir güncellenir. Böylece saniyede
yüzlerce hata üreten bir oyun paneli kilitleyemez.

### 2.5 Neden UDP (ve neden kaybı kabul ediyoruz)?

* **Gecikme:** TCP başlık sıkışması (head-of-line blocking) canlı izleme için ölümcüldür.
* **Maliyet:** UDP gönderimi Unity tarafında kilit beklemez.
* **Kayıp:** metrikler için kabul edilebilir (bir kare eksikse grafikte küçük bir boşluk olur),
  **loglar için kabul edilemez**.

Bu yüzden protokol `seq` taşır ve panel **kayıp oranını ölçüp gösterir** (üst bar:
`903 paket · kayıp %0.33`). Kritik kullanım için `Transport.WebSocket` modu ajan içine
konmuştur. Pratik öneri: **Editör/masaüstü → UDP, mobil cihaz → UDP + düşük `flushIntervalMs`,
hata ayıklama oturumu → WebSocket.**

---

## 3. Dürüst sınırlar: Unity API'leri neyi vermez?

Raporunuzdaki bazı API varsayımları gerçek Unity sürümlerinde farklı davranır. Uygulanabilir
olanı yazdım, olmayanı da açıkça işaretledim:

| Rapor iddiası | Gerçek | Ajanın çözümü |
| --- | --- | --- |
| `UnityStats.drawCalls/batches/setPassCalls/triangles/vertices` her yerde kullanılabilir | **Yalnızca Editör** (`UnityEditor.UnityStats`). Build'de bu sınıf yoktur. | Editör'de `UnityStats`; build'de `RenderCounters` + SRP callback (`RenderPipelineManager.endCameraRendering`) veya `FrameTimingManager`. |
| `Profiler.BeginSample/EndSample` verisi ajan tarafından "yakalanır" | Build'de bu örneklem ağacını **geri okuyamazsınız**. `Recorder` API'si yalnızca sabit üst-seviye kaydedicileri (`PlayerLoop`, `Render.Thread`, `Physics.Simulate`…) verir. | Kendi örnekleme API'miz: `OmniProfiler.Sample("...")` → hem `Profiler.BeginSample` çağırır (Unity Profiler'da da görünür) hem de düz pre-order dizi üretir. Maliyet ~0.2 µs. |
| `Profiler.GetMonoUsedSizeLong()` "her karedeki anlık GC Alloc"ı verir | Bu değer **kümülatif used heap**'tir; tek karelik alloc değildir. | Kare başına GC alloc = `monoUsed[i] − monoUsed[i−1]`, negatifse (GC çalıştı) 0 kabul edilir. Sınırlama: GC'in gerçekleştiği karede alloc **ölçülemez**; bu yüzden `gcSpike` bulgusu eşikle birlikte `GC.Collect` log'uyla çapraz doğrulanır. Kesin değer gerekiyorsa Editör'de `ProfilerDriver` ham verisi veya `Unity.Profiling.ProfilerCategory` sayaçları kullanılır. |
| `Object.Instantiate/Destroy` çağrıları "dinlenir" | Unity'de global Instantiate/Destroy callback'i **yoktur**. | İki yol: (a) `OmniProfiler.Spawn()/Despawn()` (2 satır), (b) prefab'a `OmniProfilerTracker` bileşeni → `OnEnable/OnDisable` sayımı (havuzlamayla uyumlu). |
| Mobilde "UDP multicast" | Multicast birçok kurumsal Wi-Fi'da ve mobil AP'de engellenir/IGMP ister. | **Broadcast keşif** (port 8791, `OMNI_DISCOVER <host> <port>`) veya elle LAN IP. Multicast opsiyonel bırakıldı. |
| Xterm.js "milyonlarca satırı handle eder" | Doğru, ama xterm **sabit satır yüksekliği** varsayar; zengin satırlar (bağlam chip'leri, stack trace, suçlu kare vurgusu, örnek listesi) için uygun değildir. | Ölçülmüş yükseklikli **kendi sanallaştırılmış listemiz** (DOM'da yalnızca görünür satır). Test: 5.000 grup → DOM'da < 120 düğüm. İstenirse "düz terminal" modu için xterm sonradan takılabilir. |

---

## 4. Doğruluk kararları (yanlış pozitif / yanlış negatif korumaları)

### 4.1 Sızıntı dedektörü neden üç kanıt istiyor?
Tek başına "canlı obje sayısı artıyor" sızıntı demek değildir: **havuz** da büyür. Bu yüzden:

```
oran = destroyed / spawned         (0.55 altı → objeler geri dönmüyor)
eğim = linearSlope(live, 12 sn)    (0.35 obje/sn üstü → birikme sürüyor)
heap = linearSlope(monoUsed, 30 sn)(0.35 MB/sn üstü → bellek gerçekten büyüyor)
```

`oran && eğim` → bulgu; `heap` korelasyonu → önem derecesi yükselir. Ölçülen davranış:
`BulletPrefab` (oran 0.039, eğim +12.06) → **high**; `HitEffectVFX` (oran 1.000, canlı 0) →
**aklandı**; `EnemyPrefab` (oran 1.005) → **aklandı**. Yani havuzlar yanlış alarm üretmiyor.

Ek koruma: `spawned < 30` olan tipler hiç değerlendirilmez (istatistiksel anlamsızlık),
`live < 0` değeri 0'a kelepçelenir (sahne unload'ında toplu destroy gelirse eğim bozulmasın),
aynı bulgu 20 saniyede bir yenilenir (bulgu spam'i olmasın).

### 4.2 Bağlam enjeksiyonu neden "en yeni kareyi" kullanmıyor?
Log'un karesi ring buffer'dan düşmüş olabilir. Bu durumda en yeni kareyi bağlam diye eklemek
**1. dakikadaki hataya 10. dakikanın FPS'ini iliştirmek** olurdu. Kural: yalnızca **±2 sn
(±120 kare)** içindeki en yakın kare kullanılır; bulunamazsa `approx: true` + sadece sahne yazılır.

Aynı gerekçeyle `MetricsStore.logicalOfFrameId()` tam eşleşme yoksa `-1` döner (en yakını değil).
"Kareye git" eylemi için ayrı `nearestByFrameId()` vardır ve sonucu `approx` olarak işaretler.

### 4.3 Örneklem (flamegraph) verisi neden her karede değil?
Bir karede 25–60 düğümlük ağaç ≈ 1.5–4 KB JSON'dur. Her karede göndermek 60 fps'te
**~150 KB/s** demektir. Bu yüzden ajan `sampleEveryNFrames = 2` ile örnekler (≈75 KB/s),
panel ise örneklem verisi olmayan kare için **komşu kareye** düşer (`usedFrame` alanında
bildirilir). Böylece "bu karede flamegraph yok" çıkmaz.

---

## 5. Protokol özeti (v1)

Taşıma: UDP (varsayılan) veya WebSocket. Kodlama: **NDJSON** — bir datagram 1..N mesaj,
`\n` ile ayrılır. Hedef datagram ≤ **1400 byte** (IPv4 fragmentasyonunu önlemek için).

```jsonc
{"t":"hello","seq":1,"ts":1790324747279,"sessionId":"u-20260925-082547",
 "app":"NeonDrift","platform":"editor","unity":"2023.2.9f1",
 "device":"DEV-PC / RTX 3060","targetFps":60,"deepProfile":true}

// f satırı = FRAME_FIELDS sırası (18 kolon, shared/protocol.js)
{"t":"frame","seq":2,"ts":...,"f":[[4201,14.019,4127,463470592,155601988,268435456,
 151473420,96123456,186,115,58,620000,421000,8.4,4.1,6.2,1.6,1.4]]}

{"t":"log","seq":3,"ts":...,"frame":4201,"level":"exception","tag":"UI",
 "msg":"NullReferenceException: ...","stack":"UIHUDController... :214","scene":"Level_03"}

{"t":"event","seq":4,"ts":...,"frame":4201,"name":"PlayerDied","kind":"bad",
 "payload":{"Score":100,"Level":5}}

// d satırı = [type, prefab, delta, frame, ts]
{"t":"obj","seq":5,"d":[["GameObject","BulletPrefab",1,4201,...],["GameObject","HitEffectVFX",-2,4204,...]]}

// s düğümü = [name, selfUs, totalUs, childCount, depth]  (pre-order, düz)
{"t":"samples","seq":6,"ts":...,"frame":4202,"s":[["PlayerLoop",60,19573,5,0], ...],
 "part":1,"i":0,"n":3}          // part/i/n yalnızca ağaç bölündüğünde

{"t":"scene","seq":7,"ts":...,"frame":4203,"name":"Boss_Arena","op":"load"}
{"t":"bye","seq":8,"ts":...,"reason":"play mode exited"}
```

**Panel → istemci:** `state` (tam durum), `history` (geçmiş serisi), `frames` (100 ms'lik parti),
`snapshot` (250 ms'lik özet), `logs`, `events`, `objs`, `scene`, `finding`, `agent`, `session`, `samples`.

**Neden JSON ve MessagePack/Protobuf değil?** JSON, Unity tarafında `StringBuilder` ile
elle serileştirilebilir (IL2CPP + mobil uyumlu, sıfır bağımlılık) ve panel tarafında `JSON.parse`
native hızındadır. Ölçüm: 18 kolonlu kare ≈ 190 byte; 60 fps'te ≈ 11 KB/s — JSON için bile
ihmal edilebilir. MessagePack'e geçmek yalnızca çok düşük bant genişliğinde (Wi-Fi yerine
Bluetooth/USB-serial) anlamlı olur.

---

## 6. Riskler ve hafifletmeler

| # | Risk | Etki | Hafifletme (bu depoda uygulanan) |
| --- | --- | --- | --- |
| R1 | UDP paket kaybı → grafikte boşluk, log kaybı | Orta | `seq` + kayıp oranı göstergesi; log için WS modu; datagram ≤1400 byte; ajan tarafı `SendBufferSize=256KB` ve `Blocking=false` |
| R2 | Log fırtınası paneli kilitler | Yüksek | Agregasyon + spam throttle + `maxLogsPerFlush` (ajan) + `_logQueue` tavanı 4096 + sanallaştırılmış liste |
| R3 | Uzun oturumda bellek şişmesi | Yüksek | Ring buffer (120k kare) + sink tavanı (240k) + grup tavanı (4000) + `instances` tavanı (20) + seri nokta tavanı (40k) + örneklem ağacı LRU (600 kare) |
| R4 | SQLite yazımı UI'yı bloklar | Orta | WAL + `synchronous=NORMAL` + 250 ms toplu transaction; UI yolu bellekten okur |
| R5 | `better-sqlite3` native modül / Electron ABI uyuşmazlığı | Yüksek (paketleme) | `electron-rebuild` + `asarUnpack`; prototipte Node ABI'si kullanıldığı için sorun yok. Alternatif: `node:sqlite` (Node ≥22.5) — bu ortam Node 20 olduğu için seçilmedi |
| R6 | Build'de `UnityStats` yok → draw call verisi boş | Orta | `RenderCounters` + SRP callback; Editör'de tam veri. Panel boş kolonları `—` olarak gösterir, çökmez |
| R7 | `BeginSample` ağacı build'de okunamaz | Orta | `OmniProfiler.Sample()` sarmalayıcı (hem Unity Profiler hem OmniProfiler beslenir) |
| R8 | Mobilde panel bulunamaz (IP değişir) | Orta | UDP broadcast keşif (8791) + `OMNI_DISCOVER` yanıtı; alternatif: `adb reverse tcp:8790` |
| R9 | GC'in gerçekleştiği karede alloc ölçülemez | Düşük | Negatif delta 0'a kelepçelenir; bulgu motoru `GC.Collect` log'u ve heap eğimiyle çapraz doğrular |
| R10 | Zaman ekseni geri gidince grafikler patlar | Yüksek (gerçek bug, bulundu) | Konumsal doğrulama + otomatik `rebuild()`; regresyon testi mevcut |
| R11 | Ring buffer'dan düşen kare için yanlış bağlam | Orta | ±2 sn komşuluk kuralı + `approx` işareti; `logicalOfFrameId` tam eşleşme yoksa `-1` |
| R12 | Ajan hatası oyunu çökertir | Yüksek | Tüm ağ/serileştirme yolları `try/catch`; ilk hata loglanır, sonrası sessiz; `HideFlags.HideAndDontSave` |

---

## 7. Bilinen eksikler / sonraki adımlar

* **GPU zamanlaması:** `Gfx.WaitForPresentOnGfxThread` her platformda doldurulmaz. Kesin GPU
  süresi için `FrameTimingManager` (GPU frame time) entegrasyonu gerekir.
* **Deep-link / kalıcı bağlantı:** panel yeniden bağlanınca geçmiş serisi `series()` ile
  sıkıştırılmış gelir; frameId taşımaz. Tam geri doldurma için `/api/frames?from=&to=` var ama
  renderer bunu otomatik çağırmıyor.
* **Çoklu ajan:** protokol `sessionId` taşır ve SQLite şeması hazır, ama `Store` şu an tek
  oturum tutar. Aynı anda iki cihaz (ör. telefon + editör) izlemek için Store'u sessionId ile
  bölmek gerekir.
* **Karşılaştırma çizgileri:** grafiklerde seçili A/B kareleri için dikey işaretçi çizilmiyor
  (yalnızca olay şeridi ve inspector üzerinden atlanıyor). `createSeriesMarkers` ile eklenebilir.
* **FrameTimingManager / SRP Batcher sayaçları**, **memory snapshot (.snap) içe aktarma**,
  **CI entegrasyonu** (eşik aşımında build'i kırmak) yol haritasında.
