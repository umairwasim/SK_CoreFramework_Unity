# 🚀 SKC-Framework Development Handoff Document

> **Tarih:** 17 Eylül 2026  
> **Kaynak Ortam:** macOS (Antigravity)  
> **Hedef Ortam:** Windows PC (Antigravity)  
> **Repository:** `SemihKC94/fe-gb-starter_unity` (skc-framework)  
> **Unity Sürümü:** Unity 6 / 2022+ (Universal Render Pipeline)

---

## 📌 1. Proje Genel Özeti & Mimari

Bu proje, mobil oyunlar için modüler, tak-çıkar (plug-and-play) ve üretim kalitesinde geliştirilmiş **SKCFramework** çekirdeğini barındırır.

- **Servis Yöneticisi (`SKCore.cs`):** Tüm temel sistemler (`SaveService`, `PoolService`, `SoundService`, `LevelService`, `CurrencyService` vb.) statik ve dynamic service registry üzerinden yönetilir.
- **Dinamik Adapter Mimarisi (`Assets/SKCAdapters/`):** Üçüncü parti SDK'ler (Amplitude, ByteBrew, Firebase, GameAnalytics, Facebook, AppLovin MAX, ironSource) oyun koduna doğrudan bağlanmaz; `IAnalyticsService` ve `IAdsService` interface'leri üzerinden adapter sınıflarıyla soyutlanır.
- **Otomatik Kayıt (`AutoRegister`):** Adapter'lar `[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]` ile sahnede herhangi bir GameObject oluşturmadan kendilerini `SKCore`'a kaydeder ve arka planda initialize olur.
- **Merkezi Kontrol Paneli (`SKCControlCenter.cs`):** `Tools > SKC Framework > Control Center` penceresi; SDK kurulumlarını, anahtarları (`SDKAdapterSettings.asset`) ve loglama profillerini yönetir.

---

## 🛠️ 2. Son Yapılan Geliştirmeler & Düzeltmeler

### A. DOTween & DOFade Derleme Hataları (Çözüldü)
- `DOTweenModuleEPOOutline.cs` içindeki eksik namespace kaynaklı derleme hataları giderildi (`DOTWEEN_EPO` direktifleri).
- `DOTweenSettings.asset` dosyasında `createASMDEF: 0` yapılarak çakışmalar önlendi.
- `SKC.Framework.asmdef` ve `SKC.Framework.Editor.asmdef` assembly tanımlarına gerekli DOTween GUID referansları eklendi.

### B. ByteBrew Adapter & Kontrol Merkezi Entegrasyonu (Çözüldü)
- `Assets/SKCAdapters/ByteBrewAdapter.cs` API overloads (`NewCustomEvent`, `SetCustomUserDataAttribute`) güncellendi.
- Adapter'ın çalışma anında sahne objesi üretmesi ve ScriptableObject anahtarlarını ezmesi engellendi.
- Kontrol Merkezinden girilen anahtarların editörde doğrudan `ByteBrewSettings.asset`'e yazılması sağlandı.

### C. Amplitude Adapter & Dinamik Profil Desteği
- `Assets/SKCAdapters/AmplitudeAdapter.cs` sıfırdan revize edildi:
  - Oturum başlatma ve bitiş takibi: `Amplitude.Instance.trackSessionEvents(true);` eklendi.
  - Paketleme süresi: `eventUploadPeriodSeconds = 30` olarak korundu.
  - **Dinamik Build Profili:** `SKCore.ActiveBuildProfile` üzerinden:
    - **Development Mode:** `Amplitude.Instance.logging = true`
    - **Production Mode:** `Amplitude.Instance.logging = false`
- `SKCore.cs` dosyasına `ActiveBuildProfile`, `IsProduction`, `IsDevelopment` statik erişimleri eklendi.

### D. EDM4U (External Dependency Manager) Mimarisi & Prensibi
- **On-Demand Kurulum:** EDM4U framework çekirdeğinde yerleşik olarak barındırılmaz; geliştirici ihtiyaç duyduğunda `Tools > SKC Framework > Control Center > SDK Hub` üzerinden tek tıkla indirip kurar.
- İlgili resolver bağımlılıkları (`mainTemplate.gradle`, `settingsTemplate.gradle`) yalnızca EDM4U kurulduğunda ve resolver çalıştırıldığında devreye girer.

### E. Firebase Analytics Entegrasyonu & TestCore Güncellemesi
- **`FirebaseAnalyticsAdapter.cs` Güçlendirildi:**
  - `using UnityEngine;` eksikliği giderildi (`RuntimeInitializeOnLoadMethod` derleme hatası çözüldü).
  - Constructor auto-initialization (`Initialize().Forget()`) eklendi.
  - **Olay Kuyruğu (`_pendingActions`):** Firebase `CheckAndFixDependenciesAsync` tamamlanana kadar tetiklenen ilk event'ler kaybolmasın diye kuyruğa alınıp SDK hazır olunca otomatik dispatch edilir.
- **`TestCore.cs`:**
  - Start event'i: `test_firebase_boot`
  - Kolon 7 butonları Firebase testlerine uyarlandı (`test_firebase_click`, `level_start`, `level_end`, `test_custom_params`, `user_type`).
- `ProjectSettings.asset` içine `SKC_HAS_FIREBASE` ve `SKC_HAS_AMPLITUDE` define sembolleri eklendi.

### F. Tüm Diğer Adapter'lerin Sertleştirilmesi (Hardening)
- `FacebookAnalyticsAdapter.cs`: `using UnityEngine;`, constructor auto-init ve asenkron olay kuyruğu eklendi.
- `MaxAdsAdapter.cs` ve `IronSourceAdsAdapter.cs`: Constructor auto-init ve `SDKAdapterSettings.Instance?.` null-reference koruması eklendi.

---

## 📂 3. Değiştirilen ve Kritik Dosyalar

| Dosya Yolu | Açıklama |
|---|---|
| `Assets/Plugins/SKCFramework/_Scripts/Boot/SKCore.cs` | Build profili helper'ları (`ActiveBuildProfile`, `IsProduction`, `IsDevelopment`) |
| `Assets/Plugins/SKCFramework/_Scripts/Test/TestCore.cs` | Firebase test butonları ve boot event'i |
| `Assets/SKCAdapters/FirebaseAnalyticsAdapter.cs` | Firebase kuyruklu, güvenli analytics adapter'ı |
| `Assets/SKCAdapters/AmplitudeAdapter.cs` | Dinamik loglama ve oturum takipli Amplitude adapter'ı |
| `Assets/SKCAdapters/ByteBrewAdapter.cs` | Statik API kullanan ByteBrew adapter'ı |
| `Assets/SKCAdapters/FacebookAnalyticsAdapter.cs` | Kuyruklu ve null-safe Facebook adapter'ı |
| `Assets/SKCAdapters/MaxAdsAdapter.cs` | Null-safe AppLovin MAX reklam adapter'ı |
| `Assets/SKCAdapters/IronSourceAdsAdapter.cs` | Null-safe ironSource reklam adapter'ı |
| `Assets/Resources/SDKAdapterSettings.asset` | SDK anahtarlarını barındıran ayar asset'i |
| `ProjectSettings/ProjectSettings.asset` | Scripting Define Symbols (`SKC_HAS_FIREBASE`, `SKC_HAS_AMPLITUDE`, `DOTWEEN` vb.) |
| `Assets/google-services.json` | Firebase Android konfigürasyon dosyası |

---

## 💻 4. Windows PC'ye Geçişte Yapılması Gerekenler

### Adım 1: Mac'te Değişiklikleri Commit & Push Edin
Mac terminalinde:
```bash
git add -A
git commit -m "feat: Hardened analytics & ads adapters, added Firebase test events and dynamic build profiles"
git push origin <branch-adiniz>
```

### Adım 2: Windows PC'de Projeyi Çekin
Windows'ta terminal / Git Bash açarak:
```bash
git pull origin <branch-adiniz>
```

### Adım 3: Unity'yi Açın & SDK Hub Kontrolü
1. Unity Hub üzerinden projeyi açın.
2. EDM4U framework içinde yerleşik tutulmaz; eğer Firebase veya reklam SDK'leri için Android kütüphanelerinin çözümlenmesi gerekirse:  
   **`Tools` > `SKC Framework` > `Control Center` > `SDK Hub`** sekmesinden **EDM4U** paketini "Download & Install" edebilir ve ardından `Force Resolve` çalıştırabilirsiniz.

### Adım 4: TestCore Üzerinden Firebase'i Test Edin
1. `TestCore` sahnesini açın ve **Play**'e basın.
2. Unity Konsolunda şu logları görmelisiniz:
   ```text
   [Analytics] FirebaseAnalyticsAdapter initialized successfully.
   [Analytics] Firebase test event sent: test_firebase_boot
   ```
3. Ekrandaki Kolon 7 butonlarına basarak (`Firebase: Event`, `Firebase: Start`, `Firebase: Win`, `Firebase: Params` vb.) event'leri ateşleyin.
4. Cihaz testinde Firebase Console'da **Analytics > DebugView** açarak anlık event akışını doğrulayın:
   - Android DebugView aktifleştirme (USB bağlıyken):
     ```bash
     adb shell setprop debug.firebase.analytics.app <paket-adiniz>
     ```

---

## 📋 5. Sıradaki Olası Görevler (Backlog)

1. **Firebase Crashlytics:** Eğer Crashlytics kullanılacaksa, `FirebaseCrashlyticsAdapter.cs` yazılarak `Application.logMessageReceived` üzerinden otomatik hata yakalama kurulabilir.
2. **Firebase Remote Config:** A/B testleri ve uzaktan parametre yönetimi için `FirebaseRemoteConfigAdapter.cs` eklenebilir.
3. **Store / Production Build Kontrolü:** `Tools > SKC Framework > Control Center` içerisinden **PRODUCTION MODE** seçildiğinde logların tamamen kısıldığını ve Amplitude/Firebase debug loglarının kapandığını doğrulamak.
