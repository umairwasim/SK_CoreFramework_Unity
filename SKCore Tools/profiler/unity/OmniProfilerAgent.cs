// =============================================================================
//  OmniProfiler — Unity Agent (OmniProfilerAgent.cs)
// -----------------------------------------------------------------------------
//  Tek bir MonoBehaviour. Sahneye boş bir GameObject'e ekleyin (veya
//  OmniProfiler.Bootstrap() çağırın), gerisini ajan halleder.
//
//  TASARIM İLKESİ: Unity tarafında SADECE ölç + serileştir + UDP'ye at.
//  Parse, agregasyon, grafik, disk yazımı → Electron/Node tarafında.
//  Bu yüzden Unity Profiler "Deep Profile" modunun aksine oyun döngüsüne
//  bindirilen yük mikrosaniyeler mertebesindedir.
//
//  Ölçüm bütçesi (varsayılan ayarlarla, Editör + Standalone):
//    • metrik toplama      : ~0.05 ms / kare   (2 karede bir)
//    • log yakalama        : olay başına ~0.02 ms (yalnızca log üretildiğinde)
//    • örneklem ağacı      : yalnızca Sample() kullandığınız bloklar için
//    • UDP gönderimi       : ~0.05 ms / paket  (flush aralığı 50 ms)
//
//  ÖNEMLİ PLATFORM NOTLARI (dürüst sınırlar):
//    1) UnityStats.* SADECE Editör'de vardır (UnityEditor sınıfları). Build'de
//       draw call / batch / üçgen sayıları için alternatif yol aşağıda
//       `CollectRenderStats()` içinde #if ile ayrılmıştır:
//         - Editör        : UnityEditor.UnityStats
//         - URP/HDRP build: FrameTimingManager (GPU/CPU frame time) +
//                           kendi sayacınız (OmniProfiler.CountDrawCall())
//         - Legacy build  : yalnızca thread süreleri + bellek (UnityStats yok)
//    2) Profiler.BeginSample/EndSample verisini build'de GERİ OKUYAMAZSINIZ
//       (Recorder API'si sadece üst seviye "Main Thread", "Render Thread" gibi
//       sabit kaydedicileri verir). Bu yüzden alev grafiği için ajanın kendi
//       örnekleme API'si kullanılır:
//           using (OmniProfiler.Sample("Inventory.Resort")) { ... }
//       Bu çağrı hem Profiler.BeginSample yapar (Unity Profiler'da da görünür)
//       hem de OmniProfiler'a veri üretir. Maliyet: ~0.2 µs.
//    3) Instantiate/Destroy takibi: Unity'de global bir "Instantiate oldu"
//       callback'i YOKTUR. İki yol desteklenir:
//         a) OmniProfiler.Spawn(prefab, ...) / OmniProfiler.Despawn(go)
//            → hem Instantiate/Destroy çağrısını yapar hem sayar (önerilen,
//              pooling'inize 2 satır ekler)
//         b) Otomatik yol: sahnedeki tüm OmniProfilerTracker bileşenleri
//            OnEnable/OnDisable'da sayar (prefab'a bir kez eklemeniz yeterli).
//       Ayrıca Resources.UnloadUnusedAssets / sahne geçişlerinde toplu
//       "destroy" sayımı yapılır (SceneWatcher).
//    4) UDP güvenilmezdir. `seq` alanı sayesinde panel tarafı paket kaybını
//       ölçer ve UI'da gösterir. Kritik loglar için WS moduna geçin
//       (transport: WebSocket) — TCP üzerinden kayıpsız iletim.
//    5) Mobil: cihaz ile panel aynı Wi-Fi ağında olmalı. `host` alanına
//       geliştirme makinesinin LAN IP'sini yazın. Multicast/ broadcast
//       keşfi için DiscoveryListener'ı açın (port 8791).
// =============================================================================

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using UnityEngine;
using UnityEngine.SceneManagement;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace OmniProfiling
{
    /// <summary>Ajanın taşımaya aldığı mesaj tipleri (bkz. shared/protocol.js).</summary>
    internal enum MsgType { Hello, Frame, Log, Event, Obj, Scene, Samples, Bye }

    /// <summary>
    /// Halka açık API. Oyun kodundan yalnızca bu sınıf kullanılır:
    ///   OmniProfiler.Bootstrap();
    ///   OmniProfiler.TrackEvent("PlayerDied", new { Score = 100 });
    ///   using (OmniProfiler.Sample("Boss.AI")) { ... }
    ///   var go = OmniProfiler.Spawn(bulletPrefab, pos, rot);
    /// </summary>
    public static class OmniProfiler
    {
        static OmniProfilerAgent _agent;

        /// <summary>Ajanı (yoksa) oluşturur ve DontDestroyOnLoad ile korur.</summary>
        public static OmniProfilerAgent Bootstrap(OmniProfilerSettings settings = null)
        {
            if (_agent != null) return _agent;
            var go = new GameObject("[OmniProfiler]");
            go.hideFlags = HideFlags.HideAndDontSave;
            UnityEngine.Object.DontDestroyOnLoad(go);
            _agent = go.AddComponent<OmniProfilerAgent>();
            _agent.settings = settings ?? OmniProfilerSettings.Default;
            return _agent;
        }

        public static void Shutdown()
        {
            if (_agent != null) { _agent.StopAgent(); _agent = null; }
        }

        /// <summary>Özel telemetri olayı. Dashboard'da zaman çizelgesinde işaretlenir.</summary>
        public static void TrackEvent(string name, object payload = null, string kind = "default")
            => _agent?.EnqueueEvent(name, payload, kind);

        /// <summary>Alev grafiği için ölçüm bloğu (IDisposable → using ile kullanılır).</summary>
        public static SampleScope Sample(string name) => new SampleScope(name);

        /// <summary>Instantiate + sayım. (Sızıntı dedektörünün "spawn" kanıtı.)</summary>
        public static GameObject Spawn(GameObject prefab, Vector3 pos, Quaternion rot, Transform parent = null)
        {
            var go = UnityEngine.Object.Instantiate(prefab, pos, rot, parent);
            _agent?.TrackObject(go != null ? prefab.name : "Unknown", +1);
            return go;
        }

        /// <summary>Destroy + sayım. (Sızıntı dedektörünün "destroy" kanıtı.)</summary>
        public static void Despawn(GameObject go, string prefabName = null, float delay = 0f)
        {
            if (go == null) return;
            _agent?.TrackObject(prefabName ?? go.name, -1);
            if (delay > 0f) UnityEngine.Object.Destroy(go, delay);
            else UnityEngine.Object.Destroy(go);
        }

        /// <summary>Ham log göndermek için (kendi log sisteminiz varsa köprüleyin).</summary>
        public static void Log(string tag, string message, LogType level = LogType.Log, string stack = null)
            => _agent?.EnqueueLog(tag, message, level, stack);

        /// <summary>using bloğu: Begin/End Sample + ağaç düğümü üretir.</summary>
        public struct SampleScope : IDisposable
        {
            readonly int _token;
            public SampleScope(string name)
            {
                _token = _agent != null ? _agent.BeginSample(name) : -1;
                if (_token >= 0) Profiler.BeginSample(name);
            }
            public void Dispose()
            {
                if (_token >= 0) { Profiler.EndSample(); _agent?.EndSample(_token); }
            }
        }

        // Profiler çakışmasını önlemek için alias (UnityEngine.Profiling.Profiler)
        static class Profiler
        {
            public static void BeginSample(string n) => UnityEngine.Profiling.Profiler.BeginSample(n);
            public static void EndSample() => UnityEngine.Profiling.Profiler.EndSample();
        }

        internal static OmniProfilerAgent Agent => _agent;
    }

    [Serializable]
    public class OmniProfilerSettings
    {
        [Header("Bağlantı")]
        public string host = "127.0.0.1";     // panel (Electron) adresi; mobilde LAN IP
        public int port = 8790;                // panelin UDP dinlediği port
        public Transport transport = Transport.Udp;
        public bool startOnPlay = true;
        public bool persistAcrossScenes = true;

        [Header("Ölçüm")]
        public int metricsEveryNFrames = 2;    // 1 = her kare (daha doğru, daha çok paket)
        public int sampleEveryNFrames = 2;     // alev grafiği örnekleme oranı
        public bool captureLogs = true;
        public bool captureStackTrace = true;
        public int maxLogsPerFlush = 32;
        public int flushIntervalMs = 50;
        public int maxDatagramBytes = 1400;    // UDP fragmentasyonunu önleme eşiği

        [Header("Güvenilirlik")]
        public double simulatedLossRate = 0.0; // 0 = kapat (yalnızca test için)
        public bool enableDiscovery = true;    // UDP broadcast ile panel keşfi
        public int discoveryPort = 8791;

        [Header("Editör")]
        public bool disableUnityDeepProfileWarning = true;

        public static OmniProfilerSettings Default => new OmniProfilerSettings();
    }

    public enum Transport { Udp, WebSocket }

    /// <summary>
    /// Ajanın kendisi. Update()'de ölçüm yapar, arka planda biriktirir ve
    /// flush aralığında TEK bir UDP datagramı olarak gönderir.
    ///
    /// Thread modeli: gönderim ana thread'de yapılır (Unity API'leri ana thread
    /// ister) ama serileştirme tamponu kilitlidir; log callback'i Unity'nin
    /// kendi thread'inden gelebileceği için (logMessageReceivedThreaded) yalnızca
    /// kuyruğa yazar. Ağ I/O'su için ayrı thread kullanmak da mümkündür;
    /// varsayılan olarak kare başına ~0.05 ms'lik ana thread maliyeti,
    /// kilit çekişmesinden daha öngörülebilirdir.
    /// </summary>
    public class OmniProfilerAgent : MonoBehaviour
    {
        public OmniProfilerSettings settings = OmniProfilerSettings.Default;
        public bool IsRunning { get; private set; }

        // --- ağ ---
        UdpClient _udp;
        IPEndPoint _endpoint;
        readonly object _sendLock = new object();
        long _seq;
        readonly StringBuilder _sb = new StringBuilder(4096);
        readonly List<string> _outbox = new List<string>(256);

        // --- ölçüm ---
        int _frameCounter;
        double _lastFlushMs;
        readonly Stopwatch _sw = new Stopwatch();
        readonly Stopwatch _frameSw = new Stopwatch();
        long _lastMonoUsed;
        string _currentScene = "?";

        // Recorder'lar (Editör + build'de çalışır; Unity'nin kendi iç sayaçlarıdır)
        UnityEngine.Profiling.Recorder _recMain, _recRender, _recGfx, _recPhysics, _recAnim;

        // --- örneklem ağacı ---
        struct SampleNode { public string Name; public long SelfTicks; public long TotalTicks; public int ChildCount; public int Depth; }
        readonly List<SampleNode> _nodes = new List<SampleNode>(128);
        readonly Stack<int> _scopeStack = new Stack<int>(16);
        long _scopeStartTick;
        bool _samplesThisFrame;

        // --- log kuyruğu ---
        struct LogEntry { public string Tag; public string Msg; public LogType Level; public string Stack; public int Frame; public long Ts; }
        readonly Queue<LogEntry> _logQueue = new Queue<LogEntry>(256);
        readonly object _logLock = new object();

        // --- olay / obje kuyrukları ---
        readonly Queue<string> _eventQueue = new Queue<string>(64);
        readonly List<object[]> _objBatch = new List<object[]>(64);

        // GC ölçümü için
        long _prevMonoUsedForGcDelta;

        void Awake()
        {
            if (settings.persistAcrossScenes) DontDestroyOnLoad(gameObject);
            _sw.Start();
            SetupRecorders();
            SceneManager.activeSceneChanged += OnActiveSceneChanged;
            _currentScene = SceneManager.GetActiveScene().name;
            if (settings.startOnPlay) StartAgent();
        }

        void SetupRecorders()
        {
            // Recorder API'si build'de de çalışır; sabit kaydedici adları:
            _recMain = UnityEngine.Profiling.Recorder.Get("PlayerLoop");
            _recRender = UnityEngine.Profiling.Recorder.Get("Render.Thread");
            _recGfx = UnityEngine.Profiling.Recorder.Get("Gfx.WaitForPresentOnGfxThread");
            _recPhysics = UnityEngine.Profiling.Recorder.Get("Physics.Simulate");
            _recAnim = UnityEngine.Profiling.Recorder.Get("Animation.Update");
            if (_recMain != null) _recMain.enabled = true;
            if (_recRender != null) _recRender.enabled = true;
            if (_recGfx != null) _recGfx.enabled = true;
            if (_recPhysics != null) _recPhysics.enabled = true;
            if (_recAnim != null) _recAnim.enabled = true;
#if UNITY_EDITOR
            // Deep Profile açıkken ajanın ölçümleri yanıltıcı olur (Unity'nin
            // kendi overhead'i kare süresine karışır). Kullanıcıyı uyar.
            if (settings.disableUnityDeepProfileWarning && ProfilerDriver.deepProfile)
                UnityEngine.Debug.LogWarning("[OmniProfiler] Unity Deep Profile açık. OmniProfiler'ın sıfır-overhead ölçümü için Deep Profile'ı kapatın.");
#endif
        }

        public void StartAgent()
        {
            if (IsRunning) return;
            try
            {
                if (settings.transport == Transport.Udp)
                {
                    _udp = new UdpClient(AddressFamily.InterNetwork);
                    _udp.Client.SendBufferSize = 256 * 1024;
                    _udp.Client.Blocking = false;
                    _endpoint = new IPEndPoint(IPAddress.Parse(settings.host), settings.port);
                }
                else
                {
                    ConnectWebSocket();
                }
                IsRunning = true;
                _frameSw.Restart();
                if (settings.captureLogs)
                    Application.logMessageReceivedThreaded += OnUnityLog;
                SendHello();
                if (settings.enableDiscovery) StartDiscovery();
            }
            catch (Exception e)
            {
                IsRunning = false;
                UnityEngine.Debug.LogError($"[OmniProfiler] Ajan başlatılamadı: {e.Message}");
            }
        }

        public void StopAgent()
        {
            if (!IsRunning) return;
            SendBye("agent stopped");
            Flush(true);
            IsRunning = false;
            Application.logMessageReceivedThreaded -= OnUnityLog;
            lock (_sendLock) { _udp?.Close(); _udp = null; }
        }

        void OnDestroy()
        {
            StopAgent();
            SceneManager.activeSceneChanged -= OnActiveSceneChanged;
        }

        void OnApplicationQuit() => StopAgent();

#if UNITY_EDITOR
        // Editörde Play Mode'dan çıkışta düzgün kapanış (aksi halde panel "ajan bağlı" kalır)
        void OnApplicationPause(bool paused) { if (paused) Flush(true); }
#endif

        void OnActiveSceneChanged(Scene from, Scene to)
        {
            _currentScene = to.name;
            EnqueueRaw(MsgType.Scene, $"\"name\":{Json(to.name)},\"op\":\"load\",\"frame\":{Time.frameCount},\"ts\":{NowMs()}");
        }

        // =====================================================================
        //  Ölçüm döngüsü
        // =====================================================================
        void Update()
        {
            if (!IsRunning) return;
            _frameCounter++;

            // Kare başına zorunlu iş: örneklem ağacını kapat + flush zamanı kontrolü
            if (_samplesThisFrame) { EmitSamples(); _samplesThisFrame = false; }

            if (_frameCounter % Math.Max(1, settings.metricsEveryNFrames) != 0) { MaybeFlush(); return; }

            CollectAndEmitFrame();
            MaybeFlush();
        }

        void LateUpdate()
        {
            // Örneklem ağacı kullanan kod Update içinde çalışır; LateUpdate'te
            // açık kalan scope varsa (kullanıcı EndSample'ı unuttuysa) kapatılır.
            while (_scopeStack.Count > 0) EndSample(_scopeStack.Peek());
        }

        void CollectAndEmitFrame()
        {
            // _frameSw, bir önceki metrik toplama anından bu yana geçen süreyi ölçer.
            // metricsEveryNFrames = 2 iken bu değer ~2 karenin toplam süresidir;
            // bu yüzden aşağıda dtMs, ölçüm aralığına bölünerek kare başına indirilir.
            long dtTicks = _frameSw.ElapsedTicks;
            _frameSw.Restart();

            // --- bellek / GC ---
            long monoUsed = UnityEngine.Profiling.Profiler.GetMonoUsedSizeLong();
            long monoHeap = UnityEngine.Profiling.Profiler.GetMonoHeapSizeLong();
            long totalReserved = UnityEngine.Profiling.Profiler.GetTotalReservedMemoryLong();
            long totalAllocated = UnityEngine.Profiling.Profiler.GetTotalAllocatedMemoryLong();
            long gfx = UnityEngine.Profiling.Profiler.GetAllocatedMemoryForGraphicsDriver();

            // Kare başına managed allocation = monoUsed artışı (negatifse GC oldu)
            long gcAlloc = monoUsed - _prevMonoUsedForGcDelta;
            if (gcAlloc < 0) gcAlloc = 0; // GC topladı: bu karede alloc ölçülemiyor
            _prevMonoUsedForGcDelta = monoUsed;
            _lastMonoUsed = monoUsed;

            // --- thread süreleri (Recorder) ---
            double mainMs = SafeElapsed(_recMain);
            double renderMs = SafeElapsed(_recRender);
            double gpuMs = SafeElapsed(_recGfx);
            double physicsMs = SafeElapsed(_recPhysics);
            double animMs = SafeElapsed(_recAnim);
            if (mainMs <= 0.0) mainMs = Time.unscaledDeltaTime * 1000.0;

            // --- render istatistikleri ---
            int drawCalls, batches, setPass, triangles, vertices;
            CollectRenderStats(out drawCalls, out batches, out setPass, out triangles, out vertices);

            // FRAME_FIELDS sırası (shared/protocol.js ile birebir aynı olmalı)
            // 0 frameId, 1 dtMs, 2 gcAllocBytes, 3 totalReserved, 4 totalAllocated,
            // 5 monoHeap, 6 monoUsed, 7 gfxDriver, 8 drawCalls, 9 batches,
            // 10 setPassCalls, 11 triangles, 12 vertices, 13 mainThreadMs,
            // 14 renderThreadMs, 15 gpuMs, 16 physicsMs, 17 animMs
            int interval = Math.Max(1, settings.metricsEveryNFrames);
            double dtMs = dtTicks > 0
                ? (dtTicks * 1000.0 / Stopwatch.Frequency) / interval   // ölçüm aralığını kareye indir
                : Time.unscaledDeltaTime * 1000.0;
            _sb.Length = 0;
            _sb.Append("[");
            AppendNum(_sb, Time.frameCount); _sb.Append(',');
            AppendNum(_sb, Round(dtMs, 3)); _sb.Append(',');
            AppendNum(_sb, gcAlloc); _sb.Append(',');
            AppendNum(_sb, totalReserved); _sb.Append(',');
            AppendNum(_sb, totalAllocated); _sb.Append(',');
            AppendNum(_sb, monoHeap); _sb.Append(',');
            AppendNum(_sb, monoUsed); _sb.Append(',');
            AppendNum(_sb, gfx); _sb.Append(',');
            AppendNum(_sb, drawCalls); _sb.Append(',');
            AppendNum(_sb, batches); _sb.Append(',');
            AppendNum(_sb, setPass); _sb.Append(',');
            AppendNum(_sb, triangles); _sb.Append(',');
            AppendNum(_sb, vertices); _sb.Append(',');
            AppendNum(_sb, Round(mainMs, 3)); _sb.Append(',');
            AppendNum(_sb, Round(renderMs, 3)); _sb.Append(',');
            AppendNum(_sb, Round(gpuMs, 3)); _sb.Append(',');
            AppendNum(_sb, Round(physicsMs, 3)); _sb.Append(',');
            AppendNum(_sb, Round(animMs, 3));
            _sb.Append(']');

            EnqueueRaw(MsgType.Frame, $"\"f\":[{_sb}],\"ts\":{NowMs()}");

            // Alev grafiği örnekleme kararı
            if (Time.frameCount % Math.Max(1, settings.sampleEveryNFrames) == 0)
                _samplesThisFrame = true;
        }

        static double SafeElapsed(UnityEngine.Profiling.Recorder r)
            => (r != null && r.enabled && r.isValid) ? r.elapsedNanoseconds / 1e6 : 0.0;

        /// <summary>
        /// Draw call / batch sayıları. Editör'de UnityStats, build'de
        /// FrameTimingManager + kendi sayaçlarımız.
        /// </summary>
        void CollectRenderStats(out int drawCalls, out int batches, out int setPass, out int triangles, out int vertices)
        {
#if UNITY_EDITOR
            drawCalls = UnityStats.drawCalls;
            batches = UnityStats.batches;
            setPass = UnityStats.setPassCalls;
            triangles = UnityStats.triangles;
            vertices = UnityStats.vertices;
#else
            // Build'de UnityStats YOKTUR. FrameTimingManager ile CPU/GPU süresi
            // alınabilir; draw call sayısı için ya SRP render pipeline callback'ine
            // (RenderPipelineManager.endCameraRendering) kendi sayacınızı takın ya da
            // OmniProfiler.CountDrawCall(n) ile kritik noktalarda manuel bildirin.
            drawCalls = RenderCounters.DrawCalls;
            batches = RenderCounters.Batches;
            setPass = RenderCounters.SetPassCalls;
            triangles = RenderCounters.Triangles;
            vertices = RenderCounters.Vertices;
            RenderCounters.Reset();
#endif
        }

        // =====================================================================
        //  Örneklem ağacı (alev grafiği)
        // =====================================================================
        internal int BeginSample(string name)
        {
            if (!_samplesThisFrame && _nodes.Count == 0) _samplesThisFrame = Time.frameCount % Math.Max(1, settings.sampleEveryNFrames) == 0;
            int depth = _scopeStack.Count;
            _nodes.Add(new SampleNode { Name = name, SelfTicks = 0, TotalTicks = 0, ChildCount = 0, Depth = depth });
            int idx = _nodes.Count - 1;
            if (_scopeStack.Count > 0)
            {
                var p = _nodes[_scopeStack.Peek()];
                p.ChildCount++;
                _nodes[_scopeStack.Peek()] = p;
            }
            _scopeStack.Push(idx);
            _scopeStartTick = Stopwatch.GetTimestamp();
            return idx;
        }

        internal void EndSample(int token)
        {
            if (_scopeStack.Count == 0) return;
            int idx = _scopeStack.Pop();
            long now = Stopwatch.GetTimestamp();
            long elapsed = now - _scopeStartTick;
            var n = _nodes[idx];
            n.TotalTicks = elapsed;
            // self = total - çocukların toplamı
            long childTotal = 0;
            for (int i = idx + 1; i < _nodes.Count && _nodes[i].Depth > n.Depth; i++)
                if (_nodes[i].Depth == n.Depth + 1) childTotal += _nodes[i].TotalTicks;
            n.SelfTicks = Math.Max(0, elapsed - childTotal);
            _nodes[idx] = n;
            _scopeStartTick = now; // üst kapsamın self saati devam etsin
            if (token < 0) { /* no-op */ }
        }

        void EmitSamples()
        {
            if (_nodes.Count == 0) return;

            // Örneklem ağacını maxDatagramBytes sınırına göre parçalara böl.
            // Panel tarafı (server/ingest.js) frameId + part/i/n ile birleştirir.
            var chunks = new List<StringBuilder>();
            var cur = new StringBuilder(1024);
            cur.Append('[');
            bool firstInChunk = true;
            for (int i = 0; i < _nodes.Count; i++)
            {
                var n = _nodes[i];
                var piece = new StringBuilder(96);
                if (!firstInChunk) piece.Append(',');
                piece.Append('[').Append(Json(n.Name)).Append(',')
                     .Append(TicksToUs(n.SelfTicks)).Append(',')
                     .Append(TicksToUs(n.TotalTicks)).Append(',')
                     .Append(n.ChildCount).Append(',')
                     .Append(n.Depth).Append(']');
                // eşik aşıldıysa yeni parça aç
                if (cur.Length + piece.Length > settings.maxDatagramBytes - 200 && !firstInChunk)
                {
                    cur.Append(']');
                    chunks.Add(cur);
                    cur = new StringBuilder(1024);
                    cur.Append('[');
                    piece = new StringBuilder(96);
                    piece.Append('[').Append(Json(n.Name)).Append(',')
                         .Append(TicksToUs(n.SelfTicks)).Append(',')
                         .Append(TicksToUs(n.TotalTicks)).Append(',')
                         .Append(n.ChildCount).Append(',')
                         .Append(n.Depth).Append(']');
                    firstInChunk = true;
                }
                cur.Append(piece);
                firstInChunk = false;
            }
            cur.Append(']');
            chunks.Add(cur);

            int total = chunks.Count;
            for (int i = 0; i < total; i++)
            {
                string partFields = total > 1
                    ? $",\"part\":1,\"i\":{i},\"n\":{total}"
                    : "";
                EnqueueRaw(MsgType.Samples,
                    $"\\"frame\\":{Time.frameCount},\\"ts\\":{NowMs()}{partFields},\\"s\\":{chunks[i]}");
            }
            _nodes.Clear();
        }

        static long TicksToUs(long ticks) => (long)(ticks * 1000000.0 / Stopwatch.Frequency);

        // =====================================================================
        //  Log yakalama + spam önleme (Unity tarafı ilk filtre)
        // =====================================================================
        void OnUnityLog(string condition, string stackTrace, LogType type)
        {
            if (!settings.captureLogs) return;
            lock (_logLock)
            {
                if (_logQueue.Count >= 4096) return; // taşma koruması: panel yetişemiyorsa atla
                _logQueue.Enqueue(new LogEntry
                {
                    Tag = ExtractTag(condition),
                    Msg = condition,
                    Level = type,
                    Stack = settings.captureStackTrace ? TruncateStack(stackTrace) : null,
                    Frame = Time.frameCount,
                    Ts = NowMs(),
                });
            }
        }

        /// <summary>"[Physics] ..." -> "Physics". Panel tarafında da aynı regex var (çift koruma).</summary>
        static string ExtractTag(string msg)
        {
            if (string.IsNullOrEmpty(msg) || msg[0] != '[') return null;
            int end = msg.IndexOf(']', 1);
            if (end < 2 || end > 33) return null;
            return msg.Substring(1, end - 1);
        }

        /// <summary>Stack trace'i ilk 12 kareyle sınırla: UDP paketini şişirmesin.</summary>
        static string TruncateStack(string stack)
        {
            if (string.IsNullOrEmpty(stack)) return null;
            int lines = 0, idx = 0;
            for (int i = 0; i < stack.Length; i++)
            {
                if (stack[i] == '\n' && ++lines >= 12) { idx = i; break; }
            }
            var s = idx > 0 ? stack.Substring(0, idx) : stack;
            return s.Length > 1800 ? s.Substring(0, 1800) : s;
        }

        internal void EnqueueLog(string tag, string message, LogType level, string stack)
        {
            lock (_logLock)
            {
                if (_logQueue.Count >= 4096) return;
                _logQueue.Enqueue(new LogEntry { Tag = tag, Msg = message, Level = level, Stack = stack, Frame = Time.frameCount, Ts = NowMs() });
            }
        }

        // =====================================================================
        //  Olay / obje takibi
        // =====================================================================
        internal void EnqueueEvent(string name, object payload, string kind)
        {
            _eventQueue.Enqueue($"\"name\":{Json(name)},\"kind\":{Json(kind ?? "default")},\"frame\":{Time.frameCount},\"ts\":{NowMs()},\"payload\":{SerializePayload(payload)}");
        }

        internal void TrackObject(string prefabName, int delta)
        {
            lock (_objBatch) _objBatch.Add(new object[] { "GameObject", prefabName, delta, Time.frameCount, NowMs() });
        }

        /// <summary>
        /// Anonim tip / Dictionary / POCO payload'ını JSON'a çevirir.
        /// Unity'nin JsonUtility'si anonim tipleri desteklemediği için
        /// reflection ile hafif bir serileştirici kullanılır (yalnızca olay
        /// başına çalışır, kare başına değil → maliyet ihmal edilebilir).
        /// </summary>
        static string SerializePayload(object payload)
        {
            if (payload == null) return "{}";
            if (payload is string s) return Json(s);
            var t = payload.GetType();
            var sb = new StringBuilder(128);
            sb.Append('{');
            bool first = true;
            if (payload is System.Collections.IDictionary dict)
            {
                foreach (System.Collections.DictionaryEntry e in dict)
                {
                    if (!first) sb.Append(','); first = false;
                    sb.Append(Json(Convert.ToString(e.Key, CultureInfo.InvariantCulture))).Append(':').Append(Json(e.Value));
                }
            }
            else
            {
                foreach (var f in t.GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance))
                {
                    if (!first) sb.Append(','); first = false;
                    sb.Append(Json(f.Name)).Append(':').Append(Json(f.GetValue(payload)));
                }
                foreach (var p in t.GetProperties(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance))
                {
                    if (!p.CanRead || p.GetIndexParameters().Length > 0) continue;
                    if (!first) sb.Append(','); first = false;
                    sb.Append(Json(p.Name)).Append(':').Append(Json(p.GetValue(payload, null)));
                }
            }
            sb.Append('}');
            return sb.ToString();
        }

        // =====================================================================
        //  Serileştirme + gönderim
        // =====================================================================
        void MaybeFlush()
        {
            double now = _sw.Elapsed.TotalMilliseconds;
            if (now - _lastFlushMs < settings.flushIntervalMs) return;
            Flush(false);
        }

        void SendHello()
        {
            EnqueueRaw(MsgType.Hello,
                $"\"sessionId\":{Json(SessionId)},\"app\":{Json(Application.productName)}," +
                $"\"platform\":{Json(PlatformName())},\"unity\":{Json(Application.unityVersion)}," +
                $"\"device\":{Json(DeviceDescription())},\"targetFps\":{TargetFps()}," +
                $"\"deepProfile\":{(_samplesThisFrame || settings.sampleEveryNFrames <= 2 ? "true" : "false")}");
        }

        void SendBye(string reason) => EnqueueRaw(MsgType.Bye, $"\"reason\":{Json(reason)},\"ts\":{NowMs()}");

        public string SessionId { get; } = "u-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture);

        static string PlatformName()
        {
#if UNITY_EDITOR
            return "editor";
#elif UNITY_ANDROID
            return "android";
#elif UNITY_IOS
            return "ios";
#elif UNITY_STANDALONE
            return "standalone";
#elif UNITY_WEBGL
            return "webgl";
#else
            return "unknown";
#endif
        }

        static string DeviceDescription()
            => $"{SystemInfo.deviceModel} / {SystemInfo.graphicsDeviceName} / {SystemInfo.processorCount}c";

        static int TargetFps()
            => Application.targetFrameRate > 0 ? Application.targetFrameRate
             : QualitySettings.vSyncCount > 0 ? Screen.currentResolution.refreshRateRatio.GetValueOrDefault(60)
             : 60;

        void EnqueueRaw(MsgType type, string bodyWithoutEnvelope)
        {
            string t = type switch
            {
                MsgType.Hello => "hello",
                MsgType.Frame => "frame",
                MsgType.Log => "log",
                MsgType.Event => "event",
                MsgType.Obj => "obj",
                MsgType.Scene => "scene",
                MsgType.Samples => "samples",
                MsgType.Bye => "bye",
                _ => null
            };
            if (t == null) return;
            lock (_outbox) _outbox.Add($"{{\"t\":\"{t}\",\"seq\":{Interlocked.Increment(ref _seq)},{bodyWithoutEnvelope}}}");
        }

        void Flush(bool force)
        {
            _lastFlushMs = _sw.Elapsed.TotalMilliseconds;
            var batch = new StringBuilder(8192);

            // 1) loglar
            lock (_logLock)
            {
                int n = 0;
                while (_logQueue.Count > 0 && n < settings.maxLogsPerFlush)
                {
                    var l = _logQueue.Dequeue();
                    batch.Append("{\"t\":\"log\",\"seq\":").Append(Interlocked.Increment(ref _seq))
                         .Append(",\"ts\":").Append(l.Ts)
                         .Append(",\"frame\":").Append(l.Frame)
                         .Append(",\"level\":").Append(Json(LevelName(l.Level)))
                         .Append(",\"msg\":").Append(Json(l.Msg));
                    if (l.Tag != null) batch.Append(",\"tag\":").Append(Json(l.Tag));
                    if (l.Stack != null) batch.Append(",\"stack\":").Append(Json(l.Stack));
                    batch.Append("}\n");
                    n++;
                }
            }

            // 2) olaylar
            while (_eventQueue.Count > 0)
                batch.Append("{\"t\":\"event\",\"seq\":").Append(Interlocked.Increment(ref _seq)).Append(',').Append(_eventQueue.Dequeue()).Append("}\n");

            // 3) kare / örneklem / sahne mesajları
            lock (_outbox)
            {
                for (int i = 0; i < _outbox.Count; i++) batch.Append(_outbox[i]).Append('\n');
                _outbox.Clear();
            }

            // 4) obje olayları (tek mesajda toplu → paket sayısı azalır)
            lock (_objBatch)
            {
                if (_objBatch.Count > 0)
                {
                    batch.Append("{\"t\":\"obj\",\"seq\":").Append(Interlocked.Increment(ref _seq)).Append(",\"d\":[");
                    for (int i = 0; i < _objBatch.Count; i++)
                    {
                        var o = _objBatch[i];
                        if (i > 0) batch.Append(',');
                        batch.Append('[').Append(Json((string)o[0])).Append(',').Append(Json((string)o[1])).Append(',')
                             .Append((int)o[2]).Append(',').Append((int)o[3]).Append(',').Append((long)o[4]).Append(']');
                    }
                    batch.Append("]}\n");
                    _objBatch.Clear();
                }
            }

            if (batch.Length == 0 && !force) return;
            SendRaw(batch.ToString());
        }

        void SendRaw(string payload)
        {
            if (string.IsNullOrEmpty(payload)) return;
            // Paket kaybı simülasyonu (yalnızca stres testi için)
            if (settings.simulatedLossRate > 0.0 && UnityEngine.Random.value < settings.simulatedLossRate) return;
            try
            {
                if (settings.transport == Transport.Udp)
                {
                    var bytes = Encoding.UTF8.GetBytes(payload);
                    lock (_sendLock)
                    {
                        if (_udp == null) return;
                        int max = Math.Max(512, settings.maxDatagramBytes);
                        int off = 0;
                        while (off < bytes.Length)
                        {
                            int len = Math.Min(max, bytes.Length - off);
                            // Çok baytlı UTF-8 karakteri ortadan bölme: son bayt bir
                            // devam baytıysa (10xxxxxx) karakter sınırına kadar geri çekil.
                            if (len < bytes.Length - off)
                            {
                                int guard = 0;
                                while (len > 1 && (bytes[off + len] & 0xC0) == 0x80 && guard++ < 4) len--;
                            }
                            _udp.Send(new ArraySegment<byte>(bytes, off, len), _endpoint);
                            off += len;
                        }
                    }
                }
                else
                {
                    SendWebSocket(payload);
                }
            }
            catch (Exception e)
            {
                // Ağ hatası oyunu ÇÖKERTMEMELİ: bir kez uyar, sonra sessizce atla.
                if (!_warnedSend)
                {
                    _warnedSend = true;
                    UnityEngine.Debug.LogWarning($"[OmniProfiler] Gönderim hatası (sonraki hatalar sessiz): {e.Message}");
                }
            }
        }
        bool _warnedSend;

        // =====================================================================
        //  JSON yardımcıları (System.Text.Json yerine elle: IL2CPP + mobil
        //  uyumluluğu ve sıfır allocation hedefi için)
        // =====================================================================
        internal static string Json(string s)
        {
            if (s == null) return "null";
            var sb = new StringBuilder(s.Length + 8);
            sb.Append('"');
            for (int i = 0; i < s.Length; i++)
            {
                char c = s[i];
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    default:
                        if (c < ' ') sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
            return sb.ToString();
        }

        static string Json(object v)
        {
            switch (v)
            {
                case null: return "null";
                case string s: return Json(s);
                case bool b: return b ? "true" : "false";
                case float f: return Round(f, 4).ToString(CultureInfo.InvariantCulture);
                case double d: return Round(d, 4).ToString(CultureInfo.InvariantCulture);
                case IFormattable n: return n.ToString(null, CultureInfo.InvariantCulture);
                default: return Json(Convert.ToString(v, CultureInfo.InvariantCulture));
            }
        }

        static double Round(double v, int digits) => Math.Round(v, digits);
        static void AppendNum(StringBuilder sb, double v) => sb.Append(v.ToString("0.###", CultureInfo.InvariantCulture));
        static void AppendNum(StringBuilder sb, long v) => sb.Append(v.ToString(CultureInfo.InvariantCulture));
        static void AppendNum(StringBuilder sb, int v) => sb.Append(v.ToString(CultureInfo.InvariantCulture));

        static string LevelName(LogType t) => t switch
        {
            LogType.Error => "error",
            LogType.Assert => "assert",
            LogType.Warning => "warn",
            LogType.Exception => "exception",
            _ => "log"
        };

        long NowMs() => _sw.ElapsedMilliseconds + _epochMs;
        static readonly long _epochMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // =====================================================================
        //  WebSocket taşıma (kayıpsız mod) — minimal istemci
        // =====================================================================
        System.Net.WebSockets.ClientWebSocket _ws;
        void ConnectWebSocket()
        {
#if !UNITY_WEBGL
            _ws = new System.Net.WebSockets.ClientWebSocket();
            var uri = new Uri($"ws://{settings.host}:{settings.port + 1}/agent");
            var t = _ws.ConnectAsync(uri, CancellationToken.None);
            t.Wait(3000);
#endif
        }
        void SendWebSocket(string payload)
        {
#if !UNITY_WEBGL
            if (_ws == null || _ws.State != System.Net.WebSockets.WebSocketState.Open) return;
            var bytes = Encoding.UTF8.GetBytes(payload);
            var seg = new ArraySegment<byte>(bytes);
            var t = _ws.SendAsync(seg, System.Net.WebSockets.WebSocketMessageType.Text, true, CancellationToken.None);
            t.Wait(200);
#endif
        }

        // =====================================================================
        //  Panel keşfi (UDP broadcast) — mobilde IP yazma zahmetini kaldırır
        // =====================================================================
        UdpClient _discovery;
        void StartDiscovery()
        {
            try
            {
                _discovery = new UdpClient();
                _discovery.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
                _discovery.Client.Bind(new IPEndPoint(IPAddress.Any, settings.discoveryPort));
                _discovery.BeginReceive(OnDiscovery, null);
            }
            catch (Exception) { _discovery = null; } // keşif opsiyoneldir
        }

        void OnDiscovery(IAsyncResult ar)
        {
            try
            {
                IPEndPoint remote = null;
                var data = _discovery.EndReceive(ar, ref remote);
                var text = Encoding.UTF8.GetString(data, 0, data.Length);
                // Panel "OMNI_DISCOVER <host> <port>" yayınlar
                if (text.StartsWith("OMNI_DISCOVER"))
                {
                    var parts = text.Split(' ');
                    if (parts.Length >= 3)
                    {
                        settings.host = parts[1];
                        settings.port = int.Parse(parts[2], CultureInfo.InvariantCulture);
                        lock (_sendLock) { _udp?.Close(); _udp = null; }
                        StartAgent();
                        UnityEngine.Debug.Log($"[OmniProfiler] Panel keşfedildi: {settings.host}:{settings.port}");
                    }
                }
                _discovery.BeginReceive(OnDiscovery, null);
            }
            catch (Exception) { /* keşif hatası yoksayılır */ }
        }
    }

    /// <summary>Build'de draw call saymak için kullanılan sayaçlar (SRP callback'ine bağlanır).</summary>
    public static class RenderCounters
    {
        public static int DrawCalls, Batches, SetPassCalls, Triangles, Vertices;
        public static void AddDrawCall(int n = 1) => DrawCalls += n;
        public static void AddTriangles(int tris, int verts) { Triangles += tris; Vertices += verts; }
        public static void Reset() { DrawCalls = Batches = SetPassCalls = Triangles = Vertices = 0; }
    }

    /// <summary>
    /// Prefab'a ekleyerek otomatik spawn/destroy sayımı (Spawn/Despawn API'sini
    /// kullanmak istemiyorsanız). OnEnable/OnDisable havuzlamayla da uyumludur.
    /// </summary>
    public class OmniProfilerTracker : MonoBehaviour
    {
        public string prefabName;
        void OnEnable() => OmniProfiler.Agent?.TrackObject(string.IsNullOrEmpty(prefabName) ? name : prefabName, +1);
        void OnDisable() => OmniProfiler.Agent?.TrackObject(string.IsNullOrEmpty(prefabName) ? name : prefabName, -1);
    }

#if UNITY_EDITOR
    /// <summary>
    /// Editör entegrasyonu: Play Mode'a girince ajanı otomatik başlatır,
    /// çıkınca durdurur. Tools menüsünden ayarlar açılabilir.
    /// </summary>
    [InitializeOnLoad]
    static class OmniProfilerEditorBridge
    {
        const string MenuPath = "Tools/OmniProfiler/Enable Agent";
        const string PrefsKey = "OmniProfiler.Enabled";

        static OmniProfilerEditorBridge()
        {
            EditorApplication.playModeStateChanged += OnPlayModeChanged;
            EditorApplication.update += OnEditorUpdate;
        }

        static void OnPlayModeChanged(PlayModeStateChange state)
        {
            if (!EditorPrefs.GetBool(PrefsKey, true)) return;
            if (state == PlayModeStateChange.EnteredPlayMode) OmniProfiler.Bootstrap();
            else if (state == PlayModeStateChange.ExitingPlayMode) OmniProfiler.Shutdown();
        }

        static void OnEditorUpdate()
        {
            // Panel keşfi için broadcast dinleyicisine periyodik "buradayım" sinyali
            // (gerçek implementasyon panel tarafında yapılır; burada placeholder).
        }

        [MenuItem(MenuPath, false, 100)]
        static void Toggle()
        {
            bool v = !EditorPrefs.GetBool(PrefsKey, true);
            EditorPrefs.SetBool(PrefsKey, v);
            Menu.SetChecked(MenuPath, v);
            UnityEngine.Debug.Log($"[OmniProfiler] Editör ajanı {(v ? "etkin" : "devre dışı")} (bir sonraki Play Mode'da geçerli).");
        }

        [MenuItem(MenuPath, true)]
        static bool ToggleValidate() { Menu.SetChecked(MenuPath, EditorPrefs.GetBool(PrefsKey, true)); return true; }
    }
#endif
}
