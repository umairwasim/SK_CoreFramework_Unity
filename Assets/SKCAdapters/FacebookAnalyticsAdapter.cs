#if SKC_HAS_FACEBOOK
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
using Facebook.Unity;
using SKC.Analytics;
using SKC.Logging;

using SKC.Core;

namespace SKC.Adapters
{
    /// <summary>
    /// Production adapter connecting SKCFramework IAnalyticsService to Facebook / Meta App Events.
    /// </summary>
    public class FacebookAnalyticsAdapter : IAnalyticsService
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void AutoRegister()
        {
            SKCore.AddCustomAnalyticsProvider(new FacebookAnalyticsAdapter());
        }

        public string ServiceName => "FacebookAnalyticsAdapter";
        public bool IsInitialized { get; set; }
        public TimeSpan InitializeDuration { get; set; }

        private static readonly Queue<Action> _pendingActions = new();
        private static bool _isInitializing;

        public FacebookAnalyticsAdapter()
        {
            if (!IsInitialized && !_isInitializing)
            {
                Initialize().Forget();
            }
        }

        public async UniTask Initialize(UnityAction onSucced = null, UnityAction onError = null)
        {
            if (IsInitialized)
            {
                onSucced?.Invoke();
                return;
            }

            _isInitializing = true;
            var start = DateTime.Now;
            try
            {
                if (!FB.IsInitialized)
                {
                    FB.Init(() =>
                    {
                        FB.ActivateApp();
                        IsInitialized = true;
                        InitializeDuration = DateTime.Now.Subtract(start);
                        SKCLog.Info(LogTag.Analytics, "FacebookAnalyticsAdapter initialized.");

                        while (_pendingActions.Count > 0)
                        {
                            try { _pendingActions.Dequeue()?.Invoke(); }
                            catch (Exception ex) { SKCLog.Warning(LogTag.Analytics, $"Pending FB action failed: {ex.Message}"); }
                        }

                        onSucced?.Invoke();
                    });
                }
                else
                {
                    FB.ActivateApp();
                    IsInitialized = true;
                    InitializeDuration = DateTime.Now.Subtract(start);

                    while (_pendingActions.Count > 0)
                    {
                        try { _pendingActions.Dequeue()?.Invoke(); }
                        catch (Exception ex) { SKCLog.Warning(LogTag.Analytics, $"Pending FB action failed: {ex.Message}"); }
                    }

                    onSucced?.Invoke();
                }
            }
            catch (Exception ex)
            {
                SKCLog.Error(LogTag.Analytics, $"Facebook initialization exception: {ex.Message}");
                onError?.Invoke();
            }
            finally
            {
                _isInitializing = false;
            }
            await UniTask.CompletedTask;
        }

        public void LogLevelStarted(int levelNumber)
        {
            if (!IsInitialized)
            {
                _pendingActions.Enqueue(() => LogLevelStarted(levelNumber));
                if (!_isInitializing) Initialize().Forget();
                return;
            }
            FB.LogAppEvent("fb_mobile_level_achieved", null, new Dictionary<string, object> { { "level", levelNumber } });
        }

        public void LogLevelCompleted(int levelNumber, int score = 0)
        {
            if (!IsInitialized)
            {
                _pendingActions.Enqueue(() => LogLevelCompleted(levelNumber, score));
                if (!_isInitializing) Initialize().Forget();
                return;
            }
            FB.LogAppEvent("fb_mobile_level_achieved", (float)score, new Dictionary<string, object> { { "level", levelNumber }, { "status", "complete" } });
        }

        public void LogLevelFailed(int levelNumber, int score = 0)
        {
            if (!IsInitialized)
            {
                _pendingActions.Enqueue(() => LogLevelFailed(levelNumber, score));
                if (!_isInitializing) Initialize().Forget();
                return;
            }
            FB.LogAppEvent("fb_mobile_level_achieved", (float)score, new Dictionary<string, object> { { "level", levelNumber }, { "status", "fail" } });
        }

        public void LogEvent(string eventName, Dictionary<string, object> parameters = null)
        {
            if (!IsInitialized)
            {
                _pendingActions.Enqueue(() => LogEvent(eventName, parameters));
                if (!_isInitializing) Initialize().Forget();
                return;
            }
            FB.LogAppEvent(eventName, null, parameters);
        }

        public void SetUserProperty(string key, string value)
        {
            // Meta App Events does not support direct user properties without CAPI
        }
    }
}
#endif
