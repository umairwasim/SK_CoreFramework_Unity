#if SKC_HAS_FIREBASE
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
using Firebase;
using Firebase.Analytics;
using SKC.Analytics;
using SKC.Logging;

using SKC.Core;

namespace SKC.Adapters
{
    /// <summary>
    /// Production adapter connecting SKCFramework IAnalyticsService to Google Firebase Analytics.
    /// </summary>
    public class FirebaseAnalyticsAdapter : IAnalyticsService
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void AutoRegister()
        {
            SKCore.AddCustomAnalyticsProvider(new FirebaseAnalyticsAdapter());
        }

        public string ServiceName => "FirebaseAnalyticsAdapter";
        public bool IsInitialized { get; set; }
        public TimeSpan InitializeDuration { get; set; }

        private static readonly Queue<Action> _pendingActions = new();
        private static bool _isInitializing;

        public FirebaseAnalyticsAdapter()
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
                var dependencyStatus = await FirebaseApp.CheckAndFixDependenciesAsync();
                if (dependencyStatus == DependencyStatus.Available)
                {
                    FirebaseAnalytics.SetAnalyticsCollectionEnabled(true);
                    IsInitialized = true;
                    InitializeDuration = DateTime.Now.Subtract(start);
                    SKCLog.Info(LogTag.Analytics, "FirebaseAnalyticsAdapter initialized successfully.");

                    while (_pendingActions.Count > 0)
                    {
                        try { _pendingActions.Dequeue()?.Invoke(); }
                        catch (Exception ex) { SKCLog.Warning(LogTag.Analytics, $"Pending Firebase action failed: {ex.Message}"); }
                    }

                    onSucced?.Invoke();
                }
                else
                {
                    SKCLog.Error(LogTag.Analytics, $"Firebase dependencies unresolved: {dependencyStatus}");
                    onError?.Invoke();
                }
            }
            catch (Exception ex)
            {
                SKCLog.Error(LogTag.Analytics, $"Firebase initialization exception: {ex.Message}");
                onError?.Invoke();
            }
            finally
            {
                _isInitializing = false;
            }
        }

        public void LogLevelStarted(int levelNumber)
        {
            if (!IsInitialized)
            {
                _pendingActions.Enqueue(() => LogLevelStarted(levelNumber));
                if (!_isInitializing) Initialize().Forget();
                return;
            }
            FirebaseAnalytics.LogEvent("level_start", new Parameter("level_name", $"Level_{levelNumber}"));
        }

        public void LogLevelCompleted(int levelNumber, int score = 0)
        {
            if (!IsInitialized)
            {
                _pendingActions.Enqueue(() => LogLevelCompleted(levelNumber, score));
                if (!_isInitializing) Initialize().Forget();
                return;
            }
            FirebaseAnalytics.LogEvent("level_end",
                new Parameter("level_name", $"Level_{levelNumber}"),
                new Parameter("success", 1),
                new Parameter("score", score));
        }

        public void LogLevelFailed(int levelNumber, int score = 0)
        {
            if (!IsInitialized)
            {
                _pendingActions.Enqueue(() => LogLevelFailed(levelNumber, score));
                if (!_isInitializing) Initialize().Forget();
                return;
            }
            FirebaseAnalytics.LogEvent("level_end",
                new Parameter("level_name", $"Level_{levelNumber}"),
                new Parameter("success", 0),
                new Parameter("score", score));
        }

        public void LogEvent(string eventName, Dictionary<string, object> parameters = null)
        {
            if (!IsInitialized)
            {
                _pendingActions.Enqueue(() => LogEvent(eventName, parameters));
                if (!_isInitializing) Initialize().Forget();
                return;
            }
            if (parameters == null || parameters.Count == 0)
            {
                FirebaseAnalytics.LogEvent(eventName);
            }
            else
            {
                var fbParams = new List<Parameter>(parameters.Count);
                foreach (var kvp in parameters)
                {
                    if (kvp.Value is long l) fbParams.Add(new Parameter(kvp.Key, l));
                    else if (kvp.Value is int i) fbParams.Add(new Parameter(kvp.Key, i));
                    else if (kvp.Value is double d) fbParams.Add(new Parameter(kvp.Key, d));
                    else if (kvp.Value is float f) fbParams.Add(new Parameter(kvp.Key, f));
                    else fbParams.Add(new Parameter(kvp.Key, kvp.Value?.ToString() ?? ""));
                }
                FirebaseAnalytics.LogEvent(eventName, fbParams.ToArray());
            }
        }

        public void SetUserProperty(string key, string value)
        {
            if (!IsInitialized)
            {
                _pendingActions.Enqueue(() => SetUserProperty(key, value));
                if (!_isInitializing) Initialize().Forget();
                return;
            }
            FirebaseAnalytics.SetUserProperty(key, value);
        }
    }
}
#endif
