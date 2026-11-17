#if SKC_HAS_GAMEANALYTICS
/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System;
using System.Collections.Generic;
using Cysharp.Threading.Tasks;
using UnityEngine;
using UnityEngine.Events;
using GameAnalyticsSDK;
using SKC.Analytics;
using SKC.Logging;
using SKC.Core;

namespace SKC.Adapters
{
    /// <summary>
    /// Production adapter connecting SKCFramework IAnalyticsService to GameAnalytics progression and events.
    /// Operates purely via GameAnalytics static API without creating GameObjects or scene scripts.
    /// Self-initializes upon service registration so caller scripts (like TestCore or game screens)
    /// can send events immediately without manual initialization boilerplate.
    /// </summary>
    public class GameAnalyticsAdapter : IAnalyticsService
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void AutoRegister()
        {
            var adapter = new GameAnalyticsAdapter();
            SKCore.AddCustomAnalyticsProvider(adapter);
        }

        public string ServiceName => "GameAnalyticsAdapter";
        public bool IsInitialized { get; set; }
        public TimeSpan InitializeDuration { get; set; }

        public GameAnalyticsAdapter()
        {
            InitSDK();
        }

        /// <summary>
        /// Pure static initialization of GameAnalytics SDK without creating GameObjects or scene components.
        /// </summary>
        private void InitSDK()
        {
            if (IsInitialized) return;

            var start = DateTime.Now;
            try
            {
                var settings = SDKAdapterSettings.Instance;
                if (settings != null)
                {
                    SyncCredentials(settings);
                }

                GameAnalytics.Initialize();
                IsInitialized = true;
                InitializeDuration = DateTime.Now.Subtract(start);
                SKCLog.Info(LogTag.Analytics, "GameAnalyticsAdapter: Initialized static GameAnalytics SDK successfully.");
            }
            catch (Exception ex)
            {
                SKCLog.Error(LogTag.Analytics, $"GameAnalyticsAdapter InitSDK failed: {ex.Message}");
            }
        }

        public async UniTask Initialize(UnityAction onSucced = null, UnityAction onError = null)
        {
            if (!IsInitialized)
            {
                InitSDK();
            }
            onSucced?.Invoke();
            await UniTask.CompletedTask;
        }

        public void LogLevelStarted(int levelNumber)
        {
            if (!IsInitialized) InitSDK();
            GameAnalytics.NewProgressionEvent(GAProgressionStatus.Start, $"level_{levelNumber:D3}");
        }

        public void LogLevelCompleted(int levelNumber, int score = 0)
        {
            if (!IsInitialized) InitSDK();
            GameAnalytics.NewProgressionEvent(GAProgressionStatus.Complete, $"level_{levelNumber:D3}", score);
        }

        public void LogLevelFailed(int levelNumber, int score = 0)
        {
            if (!IsInitialized) InitSDK();
            GameAnalytics.NewProgressionEvent(GAProgressionStatus.Fail, $"level_{levelNumber:D3}", score);
        }

        public void LogEvent(string eventName, Dictionary<string, object> parameters = null)
        {
            if (!IsInitialized) InitSDK();
            GameAnalytics.NewDesignEvent(eventName);
        }

        public void SetUserProperty(string key, string value)
        {
            if (!IsInitialized) InitSDK();
            if (key == "dimension01") GameAnalytics.SetCustomDimension01(value);
            else if (key == "dimension02") GameAnalytics.SetCustomDimension02(value);
            else if (key == "dimension03") GameAnalytics.SetCustomDimension03(value);
        }

        private void SyncCredentials(SDKAdapterSettings settings)
        {
            try
            {
                var gaSettings = GameAnalytics.SettingsGA;
                if (gaSettings == null) return;

                // Sync Android Game Key & Secret Key
                if (!string.IsNullOrEmpty(settings.gaGameKeyAndroid))
                {
                    int androidIdx = gaSettings.Platforms.IndexOf(RuntimePlatform.Android);
                    if (androidIdx < 0)
                    {
                        gaSettings.AddPlatform(RuntimePlatform.Android);
                        androidIdx = gaSettings.Platforms.Count - 1;
                    }
                    gaSettings.UpdateGameKey(androidIdx, settings.gaGameKeyAndroid);
                    gaSettings.UpdateSecretKey(androidIdx, settings.gaSecretKeyAndroid);
                }

                // Sync iOS Game Key & Secret Key
                if (!string.IsNullOrEmpty(settings.gaGameKeyIOS))
                {
                    int iosIdx = gaSettings.Platforms.IndexOf(RuntimePlatform.IPhonePlayer);
                    if (iosIdx < 0)
                    {
                        gaSettings.AddPlatform(RuntimePlatform.IPhonePlayer);
                        iosIdx = gaSettings.Platforms.Count - 1;
                    }
                    gaSettings.UpdateGameKey(iosIdx, settings.gaGameKeyIOS);
                    gaSettings.UpdateSecretKey(iosIdx, settings.gaSecretKeyIOS);
                }
            }
            catch (Exception ex)
            {
                SKCLog.Warning(LogTag.Analytics, $"GameAnalytics credentials sync notice: {ex.Message}");
            }
        }
    }
}
#endif
