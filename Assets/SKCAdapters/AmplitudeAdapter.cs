#if SKC_HAS_AMPLITUDE
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
using SKC.Analytics;
using SKC.Logging;
using SKC.Core;

namespace SKC.Adapters
{
    /// <summary>
    /// Production adapter connecting SKCFramework IAnalyticsService to Amplitude Analytics.
    /// Operates purely via Amplitude static API without creating scene components.
    /// </summary>
    public class AmplitudeAdapter : IAnalyticsService
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void AutoRegister()
        {
            var adapter = new AmplitudeAdapter();
            SKCore.AddCustomAnalyticsProvider(adapter);
        }

        public string ServiceName => "AmplitudeAdapter";
        public bool IsInitialized { get; set; }
        public TimeSpan InitializeDuration { get; set; }

        public AmplitudeAdapter()
        {
            InitSDK();
        }

        public void InitSDK()
        {
            if (IsInitialized) return;

            var start = DateTime.Now;
            try
            {
                string apiKey = SDKAdapterSettings.Instance?.amplitudeApiKey;
                if (!string.IsNullOrEmpty(apiKey))
                {
                    Amplitude.Instance.logging = SKCore.IsDevelopment;
                    Amplitude.Instance.init(apiKey);
                    Amplitude.Instance.trackSessionEvents(true);
                }
                IsInitialized = true;
                InitializeDuration = DateTime.Now.Subtract(start);
                SKCLog.Info(LogTag.Analytics, "AmplitudeAdapter initialized.");
            }
            catch (Exception ex)
            {
                SKCLog.Error(LogTag.Analytics, $"AmplitudeAdapter InitSDK failed: {ex.Message}");
            }
        }

        public async UniTask Initialize(UnityAction onSucced = null, UnityAction onError = null)
        {
            if (!IsInitialized)
            {
                InitSDK();
            }

            if (IsInitialized)
            {
                onSucced?.Invoke();
            }
            else
            {
                onError?.Invoke();
            }

            await UniTask.CompletedTask;
        }

        public void LogLevelStarted(int levelNumber)
        {
            if (!IsInitialized) InitSDK();
            Amplitude.Instance.logEvent("level_start", new Dictionary<string, object> { { "level", levelNumber } });
        }

        public void LogLevelCompleted(int levelNumber, int score = 0)
        {
            if (!IsInitialized) InitSDK();
            Amplitude.Instance.logEvent("level_complete", new Dictionary<string, object> { { "level", levelNumber }, { "score", score } });
        }

        public void LogLevelFailed(int levelNumber, int score = 0)
        {
            if (!IsInitialized) InitSDK();
            Amplitude.Instance.logEvent("level_fail", new Dictionary<string, object> { { "level", levelNumber }, { "score", score } });
        }

        public void LogEvent(string eventName, Dictionary<string, object> parameters = null)
        {
            if (!IsInitialized) InitSDK();
            if (parameters != null)
                Amplitude.Instance.logEvent(eventName, parameters);
            else
                Amplitude.Instance.logEvent(eventName);
        }

        public void SetUserProperty(string key, string value)
        {
            if (!IsInitialized) InitSDK();
            Amplitude.Instance.setUserProperties(new Dictionary<string, object> { { key, value } });
        }
    }
}
#endif
