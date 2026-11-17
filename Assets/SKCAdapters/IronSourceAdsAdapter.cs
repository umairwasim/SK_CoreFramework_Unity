#if SKC_HAS_IRONSOURCE
/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System;
using Cysharp.Threading.Tasks;
using UnityEngine;
using UnityEngine.Events;
using SKC.Ads;
using SKC.Logging;
using SKC.Core;

namespace SKC.Adapters
{
    /// <summary>
    /// Production adapter connecting SKCFramework IAdsService to Unity LevelPlay / ironSource Mediation.
    /// Manages Rewarded, Interstitial, and Banner lifecycles with internal UniTask orchestration,
    /// safety initialization, audio pause/resume, and zero-await trigger methods.
    /// </summary>
    public class IronSourceAdsAdapter : IAdsService
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void AutoRegister()
        {
            SKCore.RegisterCustomAdsService(new IronSourceAdsAdapter());
        }

        public string ServiceName => "IronSourceAdsAdapter";
        public bool IsInitialized { get; set; }
        public TimeSpan InitializeDuration { get; set; }

        private string AppKey => Application.platform == RuntimePlatform.IPhonePlayer
            ? (SDKAdapterSettings.Instance?.ironSourceAppKeyIOS ?? "")
            : (SDKAdapterSettings.Instance?.ironSourceAppKeyAndroid ?? "");

        public bool IsRewardedReady => IronSource.Agent.isRewardedVideoAvailable();
        public bool IsInterstitialReady => IronSource.Agent.isInterstitialReady();
        public bool IsBannerActive { get; private set; }

        private bool _isInitializing;
        private bool _rewardEarnedInCurrentSession;
        private UniTaskCompletionSource<AdResult> _rewardedCompletionSource;
        private UniTaskCompletionSource<bool> _interstitialCompletionSource;

        private DateTime _lastInterstitialTime = DateTime.MinValue;
        private const float InterstitialCooldownSeconds = 25f;

        public IronSourceAdsAdapter()
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

            AttachAdCallbacks();

            if (!string.IsNullOrEmpty(AppKey))
            {
                IronSource.Agent.init(AppKey);
                IronSource.Agent.validateIntegration();
                IronSource.Agent.loadInterstitial();
            }

            IsInitialized = true;
            _isInitializing = false;
            InitializeDuration = DateTime.Now.Subtract(start);
            SKCLog.Info(LogTag.Ads, "ironSource LevelPlay initialized successfully.");
            onSucced?.Invoke();
            await UniTask.CompletedTask;
        }

        private async UniTask<bool> EnsureInitializedAsync(float timeoutSeconds = 4.0f)
        {
            if (IsInitialized) return true;
            if (!_isInitializing) Initialize().Forget();

            float elapsed = 0f;
            while (!IsInitialized && elapsed < timeoutSeconds)
            {
                await UniTask.Delay(100);
                elapsed += 0.1f;
            }

            return IsInitialized;
        }

        private void AttachAdCallbacks()
        {
            // Rewarded callbacks
            IronSourceEvents.onRewardedVideoAdOpenedEvent += () =>
            {
                _rewardEarnedInCurrentSession = false;
                SKCore.SoundService?.PauseBGM();
            };

            IronSourceEvents.onRewardedVideoAdRewardedEvent += s =>
            {
                _rewardEarnedInCurrentSession = true;
                SKCLog.Info(LogTag.Ads, $"[ironSource] Rewarded ad reward earned for placement: {s.getPlacementName()}");
            };

            IronSourceEvents.onRewardedVideoAdClosedEvent += () =>
            {
                SKCore.SoundService?.ResumeBGM();
                AdResult result = _rewardEarnedInCurrentSession ? AdResult.Completed : AdResult.Skipped;
                _rewardedCompletionSource?.TrySetResult(result);
                _rewardedCompletionSource = null;
            };

            IronSourceEvents.onRewardedVideoAdShowFailedEvent += error =>
            {
                SKCore.SoundService?.ResumeBGM();
                SKCLog.Error(LogTag.Ads, $"[ironSource] Rewarded ad display failed: {error.getDescription()}");
                _rewardedCompletionSource?.TrySetResult(AdResult.Failed);
                _rewardedCompletionSource = null;
            };

            // Interstitial callbacks
            IronSourceEvents.onInterstitialAdOpenedEvent += () =>
            {
                SKCore.SoundService?.PauseBGM();
            };

            IronSourceEvents.onInterstitialAdClosedEvent += () =>
            {
                SKCore.SoundService?.ResumeBGM();
                _lastInterstitialTime = DateTime.UtcNow;
                _interstitialCompletionSource?.TrySetResult(true);
                _interstitialCompletionSource = null;
                IronSource.Agent.loadInterstitial();
            };

            IronSourceEvents.onInterstitialAdShowFailedEvent += error =>
            {
                SKCore.SoundService?.ResumeBGM();
                SKCLog.Error(LogTag.Ads, $"[ironSource] Interstitial ad display failed: {error.getDescription()}");
                _interstitialCompletionSource?.TrySetResult(false);
                _interstitialCompletionSource = null;
                IronSource.Agent.loadInterstitial();
            };
        }

        #region Zero-Await Triggers (Caller writes zero await code)

        public void TriggerRewarded(string placement, Action onRewardEarned, Action onFailed = null, Action onSkipped = null)
        {
            TriggerRewardedAsync(placement, onRewardEarned, onFailed, onSkipped).Forget();
        }

        public void TriggerInterstitial(string placement = "default", Action onClosed = null, Action onFailed = null, bool ignoreCooldown = false)
        {
            TriggerInterstitialAsync(placement, onClosed, onFailed, ignoreCooldown).Forget();
        }

        #endregion

        #region First-Class UniTask Async Core

        public async UniTask<AdResult> TriggerRewardedAsync(string placement = "default", Action onRewardEarned = null, Action onFailed = null, Action onSkipped = null)
        {
            bool ready = await EnsureInitializedAsync();
            if (!ready)
            {
                SKCLog.Warning(LogTag.Ads, "[ironSource] SDK initialization timed out.");
                onFailed?.Invoke();
                return AdResult.Failed;
            }

            if (!IsRewardedReady)
            {
                SKCLog.Warning(LogTag.Ads, $"[ironSource] Rewarded video not available for placement '{placement}'.");
                onFailed?.Invoke();
                return AdResult.NotReady;
            }

            _rewardEarnedInCurrentSession = false;
            _rewardedCompletionSource = new UniTaskCompletionSource<AdResult>();

            IronSource.Agent.showRewardedVideo(placement);

            AdResult result = await _rewardedCompletionSource.Task;
            await UniTask.SwitchToMainThread();

            switch (result)
            {
                case AdResult.Completed:
                    SKCLog.Info(LogTag.Ads, $"[ironSource] Rewarded ad '{placement}' COMPLETED.");
                    onRewardEarned?.Invoke();
                    break;
                case AdResult.Skipped:
                    SKCLog.Warning(LogTag.Ads, $"[ironSource] Rewarded ad '{placement}' SKIPPED. No reward granted.");
                    onSkipped?.Invoke();
                    break;
                case AdResult.Failed:
                case AdResult.NotReady:
                    onFailed?.Invoke();
                    break;
            }

            return result;
        }

        public async UniTask<bool> TriggerInterstitialAsync(string placement = "default", Action onClosed = null, Action onFailed = null, bool ignoreCooldown = false)
        {
            // Automated No-Ads Suppression
            if (SKCore.IAP != null && SKCore.IAP.IsNoAdsActive)
            {
                SKCLog.Info(LogTag.Ads, $"[ironSource] No-Ads is ACTIVE! Interstitial ad '{placement}' suppressed automatically.");
                onClosed?.Invoke();
                return true;
            }

            if (!ignoreCooldown)
            {
                var elapsed = (DateTime.UtcNow - _lastInterstitialTime).TotalSeconds;
                if (elapsed < InterstitialCooldownSeconds)
                {
                    float remaining = InterstitialCooldownSeconds - (float)elapsed;
                    SKCLog.Info(LogTag.Ads, $"[ironSource] Interstitial '{placement}' on cooldown ({remaining:F1}s left). Skipping.");
                    onClosed?.Invoke();
                    return false;
                }
            }

            bool ready = await EnsureInitializedAsync();
            if (!ready || !IsInterstitialReady)
            {
                SKCLog.Warning(LogTag.Ads, $"[ironSource] Interstitial not ready for placement '{placement}'.");
                IronSource.Agent.loadInterstitial();
                onFailed?.Invoke();
                onClosed?.Invoke();
                return false;
            }

            _interstitialCompletionSource = new UniTaskCompletionSource<bool>();
            IronSource.Agent.showInterstitial(placement);

            bool displayed = await _interstitialCompletionSource.Task;
            await UniTask.SwitchToMainThread();

            onClosed?.Invoke();
            return displayed;
        }

        #endregion

        #region Banner Controls

        public void ShowBanner(string placement = "default", BannerPosition position = BannerPosition.BottomCenter)
        {
            // Automated No-Ads Suppression
            if (SKCore.IAP != null && SKCore.IAP.IsNoAdsActive)
            {
                SKCLog.Info(LogTag.Ads, $"[ironSource] No-Ads is ACTIVE! Banner ad '{placement}' suppressed automatically.");
                return;
            }

            IronSourceBannerPosition isPos = position switch
            {
                BannerPosition.TopCenter => IronSourceBannerPosition.TOP,
                BannerPosition.TopLeft => IronSourceBannerPosition.TOP,
                BannerPosition.TopRight => IronSourceBannerPosition.TOP,
                _ => IronSourceBannerPosition.BOTTOM
            };

            IronSource.Agent.loadBanner(IronSourceBannerSize.BANNER, isPos);
            IsBannerActive = true;
            SKCLog.Info(LogTag.Ads, $"[ironSource] Banner requested at {position} (Placement: '{placement}').");
        }

        public void HideBanner()
        {
            IronSource.Agent.destroyBanner();
            IsBannerActive = false;
            SKCLog.Info(LogTag.Ads, "[ironSource] Banner destroyed.");
        }

        #endregion

        #region Compatibility Overloads

        public void ShowRewarded(Action onCompleted, Action onFailed = null, string placement = "default")
        {
            TriggerRewarded(placement, onCompleted, onFailed);
        }

        public void ShowInterstitial(Action onClosed = null, string placement = "default")
        {
            TriggerInterstitial(placement, onClosed, ignoreCooldown: true);
        }

        public void ShowBanner(bool show, string placement = "default")
        {
            if (show) ShowBanner(placement);
            else HideBanner();
        }

        #endregion
    }
}
#endif
