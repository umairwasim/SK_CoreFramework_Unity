/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System.Collections.Generic;
using DG.Tweening;
using UnityEngine;
using Cysharp.Threading.Tasks;
using SKC.Core;
using SKC.Services;
using SKC.Global;
#if SKC_HAS_POOLING
using SKC.Pooling;
#endif
#if SKC_HAS_TRANSITIONS
using SKC.Transition;
#endif
#if SKC_HAS_UI
using SKC.UI.Samples;
#endif
#if SKC_HAS_HAPTICS
using SKC.Haptics;
#endif
#if SKC_HAS_LEVELS
using SKC.Levels;
#endif
#if SKC_HAS_ECONOMY
using SKC.Economy;
#endif
#if SKC_HAS_DAILY_REWARDS
using SKC.DailyRewards;
#endif
using SKC.Logging;
#if SKC_HAS_ADS
using SKC.Ads;
#endif
#if SKC_HAS_IAP
using SKC.IAP;
#endif
#if SKC_HAS_PRIVACY
using SKC.Privacy;
#endif

namespace SKC.Test
{
    public enum TestTab
    {
        Core,
        UI,
        Haptics,
        Levels,
        Economy,
        DailyRewards,
        Analytics,
        Ads,
        Publisher
    }

    public class TestCore : MonoBehaviour
    {
        public CanvasGroup transitionGroup;
#if SKC_HAS_POOLING
        private bool _calledPool = false;
        private GameObject _objectPool;
#endif
#if SKC_HAS_AUDIO
        private bool _bgIsplayed = false;
#endif
        private bool _inputEnabled = false;
        private bool _schedulerEnabled = false;
        private bool _showTestPanel = true;
        private TestTab _activeTab = TestTab.Core;

        private float _cornerPressTimer = 0f;
        private bool IsStealthMode => SKCore.IsProduction;

        private void Start()
        {
#if SKC_HAS_ANALYTICS
            // Test event sent directly through SKCore.Analytics (adapter initializes Amplitude / configured provider statically)
            SKCore.Analytics.LogEvent("test_amplitude_boot");
            SKCLog.Info(LogTag.Analytics, "[TestCore] Amplitude test event sent: test_amplitude_boot");
#endif
        }

        private void Update()
        {
            // Keyboard shortcut for Editor / PC (F1)
            if (Input.GetKeyDown(KeyCode.F1))
            {
                _showTestPanel = !_showTestPanel;
            }

            // Stealth Gesture 1: 3-finger simultaneous touch
            if (Input.touchCount >= 3)
            {
                _showTestPanel = true;
            }

            // Stealth Gesture 2: Top-right corner long press (2.0s)
            if (Input.GetMouseButton(0))
            {
                Vector2 mousePos = Input.mousePosition;
                if (mousePos.x > Screen.width * 0.82f && mousePos.y > Screen.height * 0.85f)
                {
                    _cornerPressTimer += Time.unscaledDeltaTime;
                    if (_cornerPressTimer >= 2.0f)
                    {
                        _showTestPanel = true;
                        _cornerPressTimer = 0f;
                    }
                }
                else
                {
                    _cornerPressTimer = 0f;
                }
            }
            else
            {
                _cornerPressTimer = 0f;
            }
        }

        private void OnEnable()
        {
            SKCore.EventService.Subscribe<PointerDownEvent>(OnPointerDown);
            SKCore.EventService.Subscribe<PointerUpEvent>(OnPointerUp);
            SKCore.EventService.Subscribe<ScreenDragEvent>(OnScreenDrag);
        }
        
        private void OnDisable()
        {
            SKCore.EventService.Unsubscribe<PointerDownEvent>(OnPointerDown);
            SKCore.EventService.Unsubscribe<PointerUpEvent>(OnPointerUp);
            SKCore.EventService.Unsubscribe<ScreenDragEvent>(OnScreenDrag);
        }

        private void OnGUI()
        {
            var prevMatrix = GUI.matrix;
            var prevColor = GUI.backgroundColor;
            var prevSkinFont = GUI.skin.button.fontSize;

            float scaleX = Screen.width / 1080f;
            float scaleY = Screen.height / 1920f;
            GUI.matrix = Matrix4x4.TRS(Vector3.zero, Quaternion.identity, new Vector3(scaleX, scaleY, 1f));

            if (!_showTestPanel)
            {
                // In Production / Release builds, completely hide button (Stealth Mode)
                if (IsStealthMode)
                {
                    GUI.backgroundColor = prevColor;
                    GUI.skin.button.fontSize = prevSkinFont;
                    GUI.matrix = prevMatrix;
                    return;
                }

                GUI.skin.button.fontSize = 24;
                GUI.backgroundColor = new Color(0.18f, 0.55f, 0.9f, 0.95f);
                if (GUI.Button(new Rect(30, 60, 280, 70), "🛠️ OPEN TESTS"))
                {
                    _showTestPanel = true;
                }
                GUI.backgroundColor = prevColor;
                GUI.skin.button.fontSize = prevSkinFont;
                GUI.matrix = prevMatrix;
                return;
            }

            // --- Panel Background Box ---
            GUI.backgroundColor = new Color(0.12f, 0.14f, 0.18f, 0.96f);
            GUI.Box(new Rect(30, 55, 1020, 720), GUIContent.none);
            GUI.backgroundColor = Color.white;

            // --- Header Bar ---
            GUI.skin.label.fontSize = 28;
            GUI.skin.label.fontStyle = FontStyle.Bold;
            GUI.Label(new Rect(50, 70, 680, 48), $"🛠️ TEST CONSOLE  •  {_activeTab}");

            // Close / Hide Button
            GUI.backgroundColor = new Color(0.92f, 0.32f, 0.32f, 1f);
            GUI.skin.button.fontSize = 22;
            if (GUI.Button(new Rect(790, 68, 235, 50), "✕ HIDE PANEL"))
            {
                _showTestPanel = false;
            }
            GUI.backgroundColor = Color.white;

            // --- Category Tab Bar ---
            DrawTabBar();

            // --- Active Tab Buttons Content ---
            GUI.skin.button.fontSize = 22;
            switch (_activeTab)
            {
                case TestTab.Core:
                    DrawCoreTab();
                    break;
#if SKC_HAS_UI
                case TestTab.UI:
                    DrawUITab();
                    break;
#endif
#if SKC_HAS_HAPTICS
                case TestTab.Haptics:
                    DrawHapticsTab();
                    break;
#endif
#if SKC_HAS_LEVELS
                case TestTab.Levels:
                    DrawLevelsTab();
                    break;
#endif
#if SKC_HAS_ECONOMY
                case TestTab.Economy:
                    DrawEconomyTab();
                    break;
#endif
#if SKC_HAS_DAILY_REWARDS
                case TestTab.DailyRewards:
                    DrawDailyRewardsTab();
                    break;
#endif
#if SKC_HAS_ANALYTICS
                case TestTab.Analytics:
                    DrawAnalyticsTab();
                    break;
#endif
#if SKC_HAS_ADS
                case TestTab.Ads:
                    DrawAdsTab();
                    break;
#endif
#if SKC_HAS_IAP || SKC_HAS_PRIVACY || SKC_HAS_REVIEW || SKC_HAS_NOTIFICATIONS || SKC_HAS_TELEMETRY
                case TestTab.Publisher:
                    DrawPublisherTab();
                    break;
#endif
            }

            GUI.backgroundColor = prevColor;
            GUI.skin.button.fontSize = prevSkinFont;
            GUI.matrix = prevMatrix;
        }

        private void DrawTabBar()
        {
            GUI.skin.button.fontSize = 19;

            // Row 1
            DrawTabButton(TestTab.Core, "⚙️ Core", new Rect(50, 126, 314, 52));
#if SKC_HAS_UI
            DrawTabButton(TestTab.UI, "📱 UI & Popup", new Rect(380, 126, 314, 52));
#endif
#if SKC_HAS_HAPTICS
            DrawTabButton(TestTab.Haptics, "📳 Haptics", new Rect(710, 126, 314, 52));
#endif

            // Row 2
#if SKC_HAS_LEVELS
            DrawTabButton(TestTab.Levels, "🎮 Levels", new Rect(50, 184, 314, 52));
#endif
#if SKC_HAS_ECONOMY
            DrawTabButton(TestTab.Economy, "🪙 Economy", new Rect(380, 184, 314, 52));
#endif
#if SKC_HAS_DAILY_REWARDS
            DrawTabButton(TestTab.DailyRewards, "🎁 Daily Reward", new Rect(710, 184, 314, 52));
#endif

            // Row 3
#if SKC_HAS_ANALYTICS
            DrawTabButton(TestTab.Analytics, "📊 Analytics", new Rect(50, 242, 314, 52));
#endif
#if SKC_HAS_ADS
            DrawTabButton(TestTab.Ads, "📺 Ads Mediation", new Rect(380, 242, 314, 52));
#endif
#if SKC_HAS_IAP || SKC_HAS_PRIVACY || SKC_HAS_REVIEW || SKC_HAS_NOTIFICATIONS || SKC_HAS_TELEMETRY
            DrawTabButton(TestTab.Publisher, "👑 Publisher / IAP", new Rect(710, 242, 314, 52));
#endif
        }

        private void DrawTabButton(TestTab tab, string label, Rect rect)
        {
            bool isActive = _activeTab == tab;
            GUI.backgroundColor = isActive
                ? new Color(0.2f, 0.72f, 1f, 1f)
                : new Color(0.26f, 0.29f, 0.36f, 0.95f);

            if (GUI.Button(rect, label))
            {
                _activeTab = tab;
            }
            GUI.backgroundColor = Color.white;
        }

        private Rect GetGridRect(int index, int columns = 2)
        {
            int col = index % columns;
            int row = index / columns;
            int startX = 50;
            int startY = 308;
            int btnWidth = 478;
            int btnHeight = 84;
            int gapX = 24;
            int gapY = 14;
            return new Rect(startX + col * (btnWidth + gapX), startY + row * (btnHeight + gapY), btnWidth, btnHeight);
        }

        private void DrawCoreTab()
        {
            if (GUI.Button(GetGridRect(0), "Test Save"))
            {
                TestSaveService();
            }

#if SKC_HAS_TRANSITIONS
            if (GUI.Button(GetGridRect(1), "Test Transition"))
            {
                TestTransitionService();
            }
#endif

#if SKC_HAS_POOLING
            if (!_calledPool)
            {
                if (GUI.Button(GetGridRect(2), "Test Pool"))
                {
                    TestPoolService();
                }
            }
            else
            {
                if (GUI.Button(GetGridRect(2), "Send To Pool"))
                {
                    SendObjectToPool();
                }
            }
#endif

#if SKC_HAS_AUDIO
            if (GUI.Button(GetGridRect(3), "Play Sound"))
            {
                PlaySound();
            }

            if (!_bgIsplayed)
            {
                if (GUI.Button(GetGridRect(4), "Start BG"))
                {
                    PlayBG();
                }
            }
            else
            {
                if (GUI.Button(GetGridRect(4), "Pause BG"))
                {
                    PauseBG();
                }
            }

            if (GUI.Button(GetGridRect(5), "Resume BG"))
            {
                ResumeBG();
            }
#endif

#if SKC_HAS_INPUTS
            if (!_inputEnabled)
            {
                if (GUI.Button(GetGridRect(6), "Enable Inputs"))
                {
                    _inputEnabled = true;
                    SKCore.InputService.EnableInput(_inputEnabled);
                }
            }
            else
            {
                if (GUI.Button(GetGridRect(6), "Disable Inputs"))
                {
                    _inputEnabled = false;
                    SKCore.InputService.EnableInput(_inputEnabled);
                }
            }
#endif

            if (!_schedulerEnabled)
            {
                if (GUI.Button(GetGridRect(7), "Try Scheduler\n(2s Action)"))
                {
                    SKCLog.Info(LogTag.Core, "Scheduler start. After 2 seconds later, it will be reusable.");
                    _schedulerEnabled = true;
                    SKCore.SchedulerService.RunAfter(2.0f, () =>
                    {
                        _schedulerEnabled = false;
                        SKCLog.Info(LogTag.Core, "Scheduler complete.");
                    });
                }
            }
            else
            {
                GUI.enabled = false;
                GUI.Button(GetGridRect(7), "Scheduler...\n(Waiting)");
                GUI.enabled = true;
            }
        }

#if SKC_HAS_UI
        private void DrawUITab()
        {
            if (GUI.Button(GetGridRect(0), "Open HUD Screen"))
            {
                SKCore.UIService.ShowScreen<SampleGameHUD>().Forget();
            }

            if (GUI.Button(GetGridRect(1), "Open Popup"))
            {
                SKCore.UIService.ShowPopup<SampleSettingsPopup>().Forget();
            }

            if (GUI.Button(GetGridRect(2), "Show Toast\n(Overlay)"))
            {
                SKCore.UIService.ShowOverlay<SampleToastOverlay>("Hello from UIService!").Forget();
            }

            if (GUI.Button(GetGridRect(3), "Close Top Popup"))
            {
                SKCore.UIService.CloseTopPopup();
            }

            if (GUI.Button(GetGridRect(4), "Queue 3 Popups"))
            {
                SKCore.UIService.ShowPopup<SampleSettingsPopup>().Forget();
                SKCore.UIService.ShowPopup<SampleSettingsPopup>().Forget();
                SKCore.UIService.ShowPopup<SampleSettingsPopup>().Forget();
            }
        }
#endif

#if SKC_HAS_HAPTICS
        private void DrawHapticsTab()
        {
            if (GUI.Button(GetGridRect(0), "Haptic Light"))
            {
                SKCore.HapticService.Light();
            }

            if (GUI.Button(GetGridRect(1), "Haptic Medium"))
            {
                SKCore.HapticService.Medium();
            }

            if (GUI.Button(GetGridRect(2), "Haptic Heavy"))
            {
                SKCore.HapticService.Heavy();
            }

            if (GUI.Button(GetGridRect(3), "Haptic Success"))
            {
                SKCore.HapticService.Success();
            }

            if (GUI.Button(GetGridRect(4), "Haptic Warning"))
            {
                SKCore.HapticService.Warning();
            }

            if (GUI.Button(GetGridRect(5), "Haptic Failure"))
            {
                SKCore.HapticService.Failure();
            }
        }
#endif

#if SKC_HAS_LEVELS
        private void DrawLevelsTab()
        {
            string modeStr = SKCore.LevelService != null ? SKCore.LevelService.CurrentLoadMode.ToString() : "N/A";
            int lvlNum = SKCore.LevelService != null ? SKCore.LevelService.DisplayLevelNumber : 1;

            if (GUI.Button(GetGridRect(0), $"Load Level {lvlNum}"))
            {
                SKCore.LevelService?.LoadCurrentLevelAsync().Forget();
            }

            if (GUI.Button(GetGridRect(1), "Start Level"))
            {
                SKCore.LevelService?.StartLevel();
            }

            if (GUI.Button(GetGridRect(2), "Win Level"))
            {
                SKCore.LevelService?.CompleteCurrentLevel();
            }

            if (GUI.Button(GetGridRect(3), "Fail Level"))
            {
                SKCore.LevelService?.FailCurrentLevel();
            }

            if (GUI.Button(GetGridRect(4), "Next Level"))
            {
                SKCore.LevelService?.NextLevelAsync().Forget();
            }

            if (GUI.Button(GetGridRect(5), "Restart Level"))
            {
                SKCore.LevelService?.RestartLevelAsync().Forget();
            }

            if (GUI.Button(GetGridRect(6), $"Mode: {modeStr}\n(Click Swap)"))
            {
                if (SKCore.LevelService != null)
                {
                    var nextMode = SKCore.LevelService.CurrentLoadMode == LevelLoadMode.PrefabBased
                        ? LevelLoadMode.SceneBased
                        : LevelLoadMode.PrefabBased;
                    SKCore.LevelService.SetLoadMode(nextMode);
                }
            }
        }
#endif

#if SKC_HAS_ECONOMY
        private void DrawEconomyTab()
        {
            string coinsStr = SKCore.CurrencyService != null
                ? CurrencyFormatter.Format(SKCore.CurrencyService.Coins)
                : "0";
            string gemsStr = SKCore.CurrencyService != null
                ? CurrencyFormatter.Format(SKCore.CurrencyService.Gems)
                : "0";
            float mult = SKCore.CurrencyService != null
                ? SKCore.CurrencyService.GetMultiplier(CurrencyType.Coin)
                : 1f;

            if (GUI.Button(GetGridRect(0), $"Coins: {coinsStr}\n(+100)"))
            {
                SKCore.CurrencyService?.Add(CurrencyType.Coin, 100);
            }

            if (GUI.Button(GetGridRect(1), "Spend 50 Coins"))
            {
                SKCore.CurrencyService?.TrySpend(CurrencyType.Coin, 50);
            }

            if (GUI.Button(GetGridRect(2), "Fly 15 Coins\n(Options Test)"))
            {
                SKCore.CurrencyService?.Add(CurrencyType.Coin, 250, new CurrencyFlyOptions
                {
                    Count = 15,
                    Duration = 0.65f
                });
            }

            if (GUI.Button(GetGridRect(3), "Fly from 3D World\n(Vector3 Chest)"))
            {
                Vector3 worldChestPos = Camera.main != null ? Camera.main.transform.position + Camera.main.transform.forward * 5f : Vector3.zero;
                SKCore.CurrencyService?.Add(CurrencyType.Coin, 300, new CurrencyFlyOptions
                {
                    WorldSource = worldChestPos,
                    Count = 18,
                    BurstRadius = 120f
                });
            }

            if (GUI.Button(GetGridRect(4), "Fly 10 Gems\n(Bezier Curve)"))
            {
                SKCore.CurrencyService?.Add(CurrencyType.Gem, 25, new CurrencyFlyOptions
                {
                    Count = 10
                });
            }

            if (GUI.Button(GetGridRect(5), "Spend 10,000\n(Toast Test)"))
            {
                SKCore.CurrencyService?.TrySpend(CurrencyType.Coin, 10000);
            }

            if (GUI.Button(GetGridRect(6), $"2x Boost (10s)\n({mult}x Active)"))
            {
                SKCore.CurrencyService?.SetMultiplier(CurrencyType.Coin, 2.0f, 10f);
            }
        }
#endif

#if SKC_HAS_DAILY_REWARDS
        private void DrawDailyRewardsTab()
        {
            bool isDrReady = SKCore.DailyRewardService != null && SKCore.DailyRewardService.IsRewardAvailable;
            int drDay = SKCore.DailyRewardService != null ? SKCore.DailyRewardService.CurrentCycleDayIndex + 1 : 1;
            int drStreak = SKCore.DailyRewardService != null ? SKCore.DailyRewardService.CurrentStreak : 0;
            string statusStr = isDrReady ? "READY!" : "LOCKED";

            if (GUI.Button(GetGridRect(0), "Daily Reward\n(Show Popup)"))
            {
                SKCore.DailyRewardService?.ShowRewardPopup();
            }

            if (GUI.Button(GetGridRect(1), $"Day {drDay}: {statusStr}\n(Claim Direct)"))
            {
                SKCore.DailyRewardService?.ClaimCurrentRewardAsync(doubleWithAd: false).Forget();
            }

            if (GUI.Button(GetGridRect(2), "Claim 2X (Ad)\n(Doubled Coins)"))
            {
                SKCore.DailyRewardService?.ClaimCurrentRewardAsync(doubleWithAd: true).Forget();
            }

            if (GUI.Button(GetGridRect(3), "Simulate +24h\n(Fast Forward)"))
            {
                SKCore.DailyRewardService?.SimulateAdvanceHoursAsync(24).Forget();
            }

            if (GUI.Button(GetGridRect(4), $"Streak: {drStreak} Days\n(Log Status)"))
            {
                SKCLog.Info(LogTag.DailyRewards, $"Daily Reward - Day: {drDay}, Streak: {drStreak}, Ready: {isDrReady}, Next in: {SKCore.DailyRewardService?.TimeUntilNextReward.Hours}h {SKCore.DailyRewardService?.TimeUntilNextReward.Minutes}m");
            }

            if (GUI.Button(GetGridRect(5), "Reset Daily\nReward Data"))
            {
                SKCore.DailyRewardService?.ResetRewardDataAsync().Forget();
            }
        }
#endif

#if SKC_HAS_ANALYTICS
        private void DrawAnalyticsTab()
        {
            if (GUI.Button(GetGridRect(0), "Amplitude: Event\n(Simple Event)"))
            {
                SKCore.Analytics.LogEvent("test_amplitude_click");
                SKCLog.Info(LogTag.Analytics, "[TestCore] Fired Amplitude Test Event: test_amplitude_click");
            }

            if (GUI.Button(GetGridRect(1), "Amplitude: Start\n(Level 1)"))
            {
                SKCore.Analytics.LogLevelStarted(1);
                SKCLog.Info(LogTag.Analytics, "[TestCore] Fired Amplitude Level 1 Start: level_start");
            }

            if (GUI.Button(GetGridRect(2), "Amplitude: Win\n(Score: 1000)"))
            {
                SKCore.Analytics.LogLevelCompleted(1, 1000);
                SKCLog.Info(LogTag.Analytics, "[TestCore] Fired Amplitude Level 1 Complete (Score: 1000)");
            }

            if (GUI.Button(GetGridRect(3), "Amplitude: Fail\n(Score: 150)"))
            {
                SKCore.Analytics.LogLevelFailed(1, 150);
                SKCLog.Info(LogTag.Analytics, "[TestCore] Fired Amplitude Level 1 Fail (Score: 150)");
            }

            if (GUI.Button(GetGridRect(4), "Amplitude: Params\n(Dict Event)"))
            {
                var dict = new Dictionary<string, object>
                {
                    { "button", "custom_param_test" },
                    { "timestamp", System.DateTime.UtcNow.ToString("o") },
                    { "platform", Application.platform.ToString() }
                };
                SKCore.Analytics.LogEvent("test_custom_params", dict);
                SKCLog.Info(LogTag.Analytics, "[TestCore] Fired Amplitude Custom Event with parameters: test_custom_params");
            }

            if (GUI.Button(GetGridRect(5), "Amplitude: User\n(Set Property)"))
            {
                SKCore.Analytics.SetUserProperty("user_type", "tester");
                SKCLog.Info(LogTag.Analytics, "[TestCore] Fired Amplitude SetUserProperty: user_type = tester");
            }
        }
#endif

#if SKC_HAS_ADS
        private void DrawAdsTab()
        {
            string adsProvider = SKCore.Ads != null ? SKCore.Ads.ServiceName : "None";
            bool isRwdReady = SKCore.Ads != null && SKCore.Ads.IsRewardedReady;
            bool isIntReady = SKCore.Ads != null && SKCore.Ads.IsInterstitialReady;
            bool isBannerActive = SKCore.Ads != null && SKCore.Ads.IsBannerActive;

            if (GUI.Button(GetGridRect(0), "Trigger Rewarded\n(Zero-Await)"))
            {
                SKCore.Ads.TriggerRewarded(
                    "test_rewarded",
                    onRewardEarned: () => SKCLog.Info(LogTag.Ads, "[TestCore] Rewarded Ad COMPLETED! Reward granted!"),
                    onSkipped: () => SKCLog.Warning(LogTag.Ads, "[TestCore] Rewarded Ad SKIPPED by user."),
                    onFailed: () => SKCLog.Error(LogTag.Ads, "[TestCore] Rewarded Ad FAILED or Not Ready.")
                );
            }

            if (GUI.Button(GetGridRect(1), "Trigger Interstitial\n(Cooldown Check)"))
            {
                SKCore.Ads.TriggerInterstitial(
                    "test_interstitial",
                    onClosed: () => SKCLog.Info(LogTag.Ads, "[TestCore] Interstitial ad closed."),
                    onFailed: () => SKCLog.Warning(LogTag.Ads, "[TestCore] Interstitial ad failed or on cooldown.")
                );
            }

            if (GUI.Button(GetGridRect(2), isBannerActive ? "Banner Active\n(Show Again)" : "Show Banner\n(BottomCenter)"))
            {
                SKCore.Ads.ShowBanner("test_banner", BannerPosition.BottomCenter);
            }

            if (GUI.Button(GetGridRect(3), "Hide Banner\n(Dismiss)"))
            {
                SKCore.Ads.HideBanner();
            }

            if (GUI.Button(GetGridRect(4), $"Ads Status\n({adsProvider})"))
            {
                SKCLog.Info(LogTag.Ads, $"[TestCore] Active Provider: {adsProvider}, Init: {SKCore.Ads.IsInitialized}, Rewarded Ready: {isRwdReady}, Interstitial Ready: {isIntReady}, Banner Active: {isBannerActive}");
            }

            if (GUI.Button(GetGridRect(5), "Async Rewarded\n(await UniTask)"))
            {
                TestRewardedAsync().Forget();
            }
        }

        private async UniTaskVoid TestRewardedAsync()
        {
            SKCLog.Info(LogTag.Ads, "[TestCore] Awaiting Rewarded Ad via UniTask...");
            AdResult result = await SKCore.Ads.TriggerRewardedAsync("async_test");
            SKCLog.Info(LogTag.Ads, $"[TestCore] UniTask Rewarded Ad finished with result: {result}");
        }
#endif

#if SKC_HAS_IAP || SKC_HAS_PRIVACY || SKC_HAS_REVIEW || SKC_HAS_NOTIFICATIONS || SKC_HAS_TELEMETRY
        private void DrawPublisherTab()
        {
#if SKC_HAS_IAP
            bool noAds = SKCore.IAP != null && SKCore.IAP.IsNoAdsActive;
            if (GUI.Button(GetGridRect(0), noAds ? "No-Ads: ACTIVE 🟢\n(Click to Disable)" : "No-Ads: INACTIVE ⚪\n(Click to Enable)"))
            {
                SKCore.IAP?.SetNoAds(!noAds);
            }

            if (GUI.Button(GetGridRect(1), "Purchase No-Ads\n(Simulator / Store)"))
            {
                SKCore.IAP?.PurchaseNoAdsAsync().Forget();
            }

            if (GUI.Button(GetGridRect(2), "Restore Purchases\n(iOS StoreKit)"))
            {
                SKCore.IAP?.RestorePurchasesAsync().Forget();
            }
#endif

#if SKC_HAS_PRIVACY
            string consent = SKCore.Privacy != null ? SKCore.Privacy.ConsentStatus.ToString() : "N/A";
            if (GUI.Button(GetGridRect(3), $"ATT / Consent\n({consent})"))
            {
                SKCore.Privacy?.RequestTrackingAuthorizationAsync(showPrePermissionDialog: true).Forget();
            }
#endif

#if SKC_HAS_REVIEW
            if (GUI.Button(GetGridRect(4), "In-App Review\n(Force Prompt)"))
            {
                SKCore.Review?.ForceRequestReviewAsync().Forget();
            }
#endif

#if SKC_HAS_NOTIFICATIONS
            if (GUI.Button(GetGridRect(5), "Schedule Notifs\n(D1 & D3 Retention)"))
            {
                SKCore.Notification?.ScheduleRetentionNotifications();
            }
#endif

#if SKC_HAS_TELEMETRY
            float fps = SKCore.Telemetry != null ? SKCore.Telemetry.CurrentFPS : 60f;
            int stutters = SKCore.Telemetry != null ? SKCore.Telemetry.LastLevelLagSpikes : 0;
            if (GUI.Button(GetGridRect(6), $"Telemetry: {fps:F0} FPS\n({stutters} Stutters)"))
            {
                SKCLog.Info(LogTag.Analytics, $"[TestCore] Telemetry Status - Current FPS: {fps:F1}, Last Level Duration: {SKCore.Telemetry?.LastLevelDuration:F1}s, Last Level Avg FPS: {SKCore.Telemetry?.LastLevelAvgFPS:F1}, Stutters: {stutters}");
            }
#endif
        }
#endif

        private void TestSaveService()
        {
            SKCLog.Info(LogTag.Save, $"Save Service works as expected. Level : {SKCore.SaveService.CurrentGameData.Level}");
        }

#if SKC_HAS_TRANSITIONS
        private void TestTransitionService()
        {
            SKCLog.Info(LogTag.Core, "Transition Service works as expected.");
            var config = new TransitionConfig()
            {
                EaseType = Ease.Linear,
                Duration = 1.0f,
                Delay = 1.0f,
                TransitionType = TransitionType.Both
            };
            SKCore.TransitionService.Transition(transitionGroup,config, () => SKCLog.Info(LogTag.Core, "Transition Start"),
                () => SKCLog.Info(LogTag.Core, "Transition is in the middle of process"),
                () => SKCLog.Info(LogTag.Core, "Transition Complete"));
        }
#endif

#if SKC_HAS_POOLING
        private void TestPoolService()
        {
            _objectPool = SKCore.PoolService.GetObject("Test", Vector3.zero, Quaternion.identity, this.transform).GetGameObject().gameObject;

            if (_objectPool != null)
            {
                SKCLog.Info(LogTag.Pool, "Pool Service works as expected.");
            }
            _calledPool = true;
        }

        private void SendObjectToPool()
        {
            if (_objectPool == null)
            {
                SKCLog.Warning(LogTag.Pool, "ERROR - There is no object in cache -");
                return;
            }
            
            _objectPool.GetComponent<PoolableObject>().BackToPool();
            _calledPool = false;
        }
#endif

#if SKC_HAS_AUDIO
        private void PlaySound()
        {
            SKCore.SoundService.Play("TestSound");
        }

        private void PlayBG()
        {
            SKCore.SoundService.PlayBGM("TestBG");
            _bgIsplayed = true;
        }

        private void PauseBG()
        {
            SKCore.SoundService.PauseBGM();
        }

        private void ResumeBG()
        {
            SKCore.SoundService.ResumeBGM();
        }
#endif
        
        private void OnPointerDown(PointerDownEvent evt)
        {
            if(!_inputEnabled) return;

            SKCLog.Verbose(LogTag.Core, $"[EventBus] PointerDown at: {evt.Position}");
        }
        
        private void OnPointerUp(PointerUpEvent evt)
        {
            if(!_inputEnabled) return;

            SKCLog.Verbose(LogTag.Core, $"[EventBus] PointerUp at: {evt.Position}");
        }
        
        private void OnScreenDrag(ScreenDragEvent evt)
        {
            if(!_inputEnabled) return;

            SKCLog.Verbose(LogTag.Core, $"[EventBus] ScreenDrag delta: {evt.Delta}");
        }
    }
}
