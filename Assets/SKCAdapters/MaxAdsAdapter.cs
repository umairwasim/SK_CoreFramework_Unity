#if SKC_HAS_APPLOVIN_MAX
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
    /// Production adapter connecting SKCFramework IAdsService to AppLovin MAX Mediation.
    /// Manages Rewarded, Interstitial, and Banner lifecycles with internal UniTask orchestration,
    /// safety initialization, audio pause/resume, and zero-await trigger methods.
    /// </summary>
    public class MaxAdsAdapter : IAdsService
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void AutoRegister()
        {
            SKCore.RegisterCustomAdsService(new MaxAdsAdapter());
        }

        public string ServiceName => "MaxAdsAdapter";
        public bool IsInitialized { get; set; }
        public TimeSpan InitializeDuration { get; set; }

        private string RewardedAdUnitId => Application.platform == RuntimePlatform.IPhonePlayer
            ? (SDKAdapterSettings.Instance?.maxRewardedUnitIdIOS ?? "")
            : (SDKAdapterSettings.Instance?.maxRewardedUnitIdAndroid ?? "");

        private string InterstitialAdUnitId => Application.platform == RuntimePlatform.IPhonePlayer
            ? (SDKAdapterSettings.Instance?.maxInterstitialUnitIdIOS ?? "")
            : (SDKAdapterSettings.Instance?.maxInterstitialUnitIdAndroid ?? "");

        private string BannerAdUnitId => Application.platform == RuntimePlatform.IPhonePlayer
            ? (SDKAdapterSettings.Instance?.maxBannerUnitIdIOS ?? "")
            : (SDKAdapterSettings.Instance?.maxBannerUnitIdAndroid ?? "");

        public bool IsRewardedReady => MaxSdk.IsRewardedAdReady(RewardedAdUnitId);
        public bool IsInterstitialReady => MaxSdk.IsInterstitialReady(InterstitialAdUnitId);
        public bool IsBannerActive { get; private set; }

        private bool _isInitializing;
        private bool _rewardEarnedInCurrentSession;
        private UniTaskCompletionSource<AdResult> _rewardedCompletionSource;
        private UniTaskCompletionSource<bool> _interstitialCompletionSource;

        private DateTime _lastInterstitialTime = DateTime.MinValue;
        private const float InterstitialCooldownSeconds = 25f;

        public MaxAdsAdapter()
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

            MaxSdkCallbacks.OnSdkInitializedEvent += configuration =>
            {
                IsInitialized = true;
                _isInitializing = false;
                InitializeDuration = DateTime.Now.Subtract(start);
                SKCLog.Info(LogTag.Ads, "AppLovin MAX SDK Initialized successfully.");
                AttachAdCallbacks();
                LoadRewarded();
                LoadInterstitial();
                onSucced?.Invoke();
            };

#pragma warning disable CS0618
            string sdkKey = SDKAdapterSettings.Instance?.maxSdkKey;
            if (!string.IsNullOrEmpty(sdkKey))
            {
                MaxSdk.SetSdkKey(sdkKey);
            }
#pragma warning restore CS0618
            MaxSdk.InitializeSdk();
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
            MaxSdkCallbacks.Rewarded.OnAdDisplayedEvent += (adUnitId, adInfo) =>
            {
                _rewardEarnedInCurrentSession = false;
                SKCore.SoundService?.PauseBGM();
            };

            MaxSdkCallbacks.Rewarded.OnAdReceivedRewardEvent += (adUnitId, reward, adInfo) =>
            {
                _rewardEarnedInCurrentSession = true;
                SKCLog.Info(LogTag.Ads, $"[MAX] Rewarded ad reward received: {reward.Label} ({reward.Amount})");
            };

            MaxSdkCallbacks.Rewarded.OnAdHiddenEvent += (adUnitId, adInfo) =>
            {
                SKCore.SoundService?.ResumeBGM();
                AdResult result = _rewardEarnedInCurrentSession ? AdResult.Completed : AdResult.Skipped;
                _rewardedCompletionSource?.TrySetResult(result);
                _rewardedCompletionSource = null;
                LoadRewarded();
            };

            MaxSdkCallbacks.Rewarded.OnAdDisplayFailedEvent += (adUnitId, error, adInfo) =>
            {
                SKCore.SoundService?.ResumeBGM();
                SKCLog.Error(LogTag.Ads, $"[MAX] Rewarded ad display failed: {error.Message}");
                _rewardedCompletionSource?.TrySetResult(AdResult.Failed);
                _rewardedCompletionSource = null;
                LoadRewarded();
            };

            // Interstitial callbacks
            MaxSdkCallbacks.Interstitial.OnAdDisplayedEvent += (adUnitId, adInfo) =>
            {
                SKCore.SoundService?.PauseBGM();
            };

            MaxSdkCallbacks.Interstitial.OnAdHiddenEvent += (adUnitId, adInfo) =>
            {
                SKCore.SoundService?.ResumeBGM();
                _lastInterstitialTime = DateTime.UtcNow;
                _interstitialCompletionSource?.TrySetResult(true);
                _interstitialCompletionSource = null;
                LoadInterstitial();
            };

            MaxSdkCallbacks.Interstitial.OnAdDisplayFailedEvent += (adUnitId, error, adInfo) =>
            {
                SKCore.SoundService?.ResumeBGM();
                SKCLog.Error(LogTag.Ads, $"[MAX] Interstitial ad display failed: {error.Message}");
                _interstitialCompletionSource?.TrySetResult(false);
                _interstitialCompletionSource = null;
                LoadInterstitial();
            };
        }

        private void LoadRewarded()
        {
            if (!string.IsNullOrEmpty(RewardedAdUnitId))
            {
                MaxSdk.LoadRewardedAd(RewardedAdUnitId);
            }
        }

        private void LoadInterstitial()
        {
            if (!string.IsNullOrEmpty(InterstitialAdUnitId))
            {
                MaxSdk.LoadInterstitial(InterstitialAdUnitId);
            }
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
                SKCLog.Warning(LogTag.Ads, "[MAX] SDK initialization timed out. Rewarded ad cannot be shown.");
                onFailed?.Invoke();
                return AdResult.Failed;
            }

            if (!IsRewardedReady)
            {
                SKCLog.Warning(LogTag.Ads, $"[MAX] Rewarded ad not ready for placement '{placement}'. Requesting preload.");
                LoadRewarded();
                onFailed?.Invoke();
                return AdResult.NotReady;
            }

            _rewardEarnedInCurrentSession = false;
            _rewardedCompletionSource = new UniTaskCompletionSource<AdResult>();

            MaxSdk.ShowRewardedAd(RewardedAdUnitId, placement);

            AdResult result = await _rewardedCompletionSource.Task;
            await UniTask.SwitchToMainThread();

            switch (result)
            {
                case AdResult.Completed:
                    SKCLog.Info(LogTag.Ads, $"[MAX] Rewarded ad '{placement}' COMPLETED. Granting reward callback.");
                    onRewardEarned?.Invoke();
                    break;
                case AdResult.Skipped:
                    SKCLog.Warning(LogTag.Ads, $"[MAX] Rewarded ad '{placement}' SKIPPED. No reward granted.");
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
                SKCLog.Info(LogTag.Ads, $"[MAX] No-Ads is ACTIVE! Interstitial ad '{placement}' suppressed automatically.");
                onClosed?.Invoke();
                return true;
            }

            if (!ignoreCooldown)
            {
                var elapsed = (DateTime.UtcNow - _lastInterstitialTime).TotalSeconds;
                if (elapsed < InterstitialCooldownSeconds)
                {
                    float remaining = InterstitialCooldownSeconds - (float)elapsed;
                    SKCLog.Info(LogTag.Ads, $"[MAX] Interstitial '{placement}' on cooldown ({remaining:F1}s left). Skipping.");
                    onClosed?.Invoke();
                    return false;
                }
            }

            bool ready = await EnsureInitializedAsync();
            if (!ready || !IsInterstitialReady)
            {
                SKCLog.Warning(LogTag.Ads, $"[MAX] Interstitial not ready for placement '{placement}'.");
                LoadInterstitial();
                onFailed?.Invoke();
                onClosed?.Invoke();
                return false;
            }

            _interstitialCompletionSource = new UniTaskCompletionSource<bool>();
            MaxSdk.ShowInterstitial(InterstitialAdUnitId, placement);

            bool displayed = await _interstitialCompletionSource.Task;
            await UniTask.SwitchToMainThread();

            onClosed?.Invoke();
            return displayed;
        }

        #endregion

        #region Banner Controls

        public void ShowBanner(string placement = "default", BannerPosition position = BannerPosition.BottomCenter)
        {
            if (string.IsNullOrEmpty(BannerAdUnitId)) return;

            // Automated No-Ads Suppression
            if (SKCore.IAP != null && SKCore.IAP.IsNoAdsActive)
            {
                SKCLog.Info(LogTag.Ads, $"[MAX] No-Ads is ACTIVE! Banner ad '{placement}' suppressed automatically.");
                return;
            }

            MaxSdkBase.AdViewPosition maxPos = position switch
            {
                BannerPosition.TopCenter => MaxSdkBase.AdViewPosition.TopCenter,
                BannerPosition.TopLeft => MaxSdkBase.AdViewPosition.TopLeft,
                BannerPosition.TopRight => MaxSdkBase.AdViewPosition.TopRight,
                _ => MaxSdkBase.AdViewPosition.BottomCenter
            };

            MaxSdk.CreateBanner(BannerAdUnitId, new MaxSdkBase.AdViewConfiguration(maxPos));
            MaxSdk.ShowBanner(BannerAdUnitId);
            IsBannerActive = true;
            SKCLog.Info(LogTag.Ads, $"[MAX] Banner shown at {position} (Placement: '{placement}').");
        }

        public void HideBanner()
        {
            if (string.IsNullOrEmpty(BannerAdUnitId)) return;
            MaxSdk.HideBanner(BannerAdUnitId);
            IsBannerActive = false;
            SKCLog.Info(LogTag.Ads, "[MAX] Banner hidden.");
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

        public void ShowMediationDebugger()
        {
            MaxSdk.ShowMediationDebugger();
        }

        #endregion
    }
}
#endif
