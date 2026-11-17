#if SKC_HAS_BYTEBREW
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
using ByteBrewSDK;
using SKC.Analytics;
using SKC.Logging;
using SKC.Core;

namespace SKC.Adapters
{
    /// <summary>
    /// Production adapter connecting SKCFramework IAnalyticsService to ByteBrew free analytics and attribution.
    /// Operates purely via ByteBrew static API without creating GameObjects or modifying ScriptableObjects at runtime.
    /// Keys are managed in SKC Control Center and synced directly to ByteBrewSettings asset.
    /// </summary>
    public class ByteBrewAdapter : IAnalyticsService
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void AutoRegister()
        {
            var adapter = new ByteBrewAdapter();
            SKCore.AddCustomAnalyticsProvider(adapter);
        }

        public string ServiceName => "ByteBrewAdapter";
        public bool IsInitialized { get; set; }
        public TimeSpan InitializeDuration { get; set; }

        public ByteBrewAdapter()
        {
            InitSDK();
        }

        public void InitSDK()
        {
            if (IsInitialized) return;

            var start = DateTime.Now;
            try
            {
                ByteBrew.InitializeByteBrew();
                IsInitialized = true;
                InitializeDuration = DateTime.Now.Subtract(start);
                SKCLog.Info(LogTag.Analytics, "ByteBrewAdapter initialized.");
            }
            catch (Exception ex)
            {
                SKCLog.Error(LogTag.Analytics, $"ByteBrewAdapter InitSDK failed: {ex.Message}");
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
            ByteBrew.NewCustomEvent("level_start", levelNumber.ToString());
        }

        public void LogLevelCompleted(int levelNumber, int score = 0)
        {
            if (!IsInitialized) InitSDK();
            ByteBrew.NewCustomEvent("level_complete", new Dictionary<string, string>
            {
                { "level", levelNumber.ToString() },
                { "score", score.ToString() }
            });
        }

        public void LogLevelFailed(int levelNumber, int score = 0)
        {
            if (!IsInitialized) InitSDK();
            ByteBrew.NewCustomEvent("level_fail", new Dictionary<string, string>
            {
                { "level", levelNumber.ToString() },
                { "score", score.ToString() }
            });
        }

        public void LogEvent(string eventName, Dictionary<string, object> parameters = null)
        {
            if (!IsInitialized) InitSDK();
            if (parameters != null && parameters.Count > 0)
            {
                var stringParams = new Dictionary<string, string>();
                foreach (var kvp in parameters)
                {
                    stringParams[kvp.Key] = kvp.Value?.ToString() ?? string.Empty;
                }
                ByteBrew.NewCustomEvent(eventName, stringParams);
            }
            else
            {
                ByteBrew.NewCustomEvent(eventName);
            }
        }

        public void SetUserProperty(string key, string value)
        {
            if (!IsInitialized) InitSDK();
            ByteBrew.SetCustomUserDataAttribute(key, value);
        }
    }
}
#endif
