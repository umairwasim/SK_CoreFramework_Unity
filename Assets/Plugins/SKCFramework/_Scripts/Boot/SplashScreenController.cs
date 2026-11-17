/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System;
using Cysharp.Threading.Tasks;
using DG.Tweening;
using TMPro;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using SKC.Core;
using SKC.Global;
#if SKC_HAS_TRANSITIONS
using SKC.Transition;
#endif
using SKC.Text;

namespace SKC.Boots
{
    /// <summary>
    /// Coordinates the animated splash screen sequence during SKCore initialization.
    /// Manages logo animation, service initialization, progress bar fade-out, logo enlargement,
    /// and scene transition using SKCore.TransitionService.
    /// </summary>
    public class SplashScreenController : MonoBehaviour
    {
        [Header("Canvas & Groups")]
        [SerializeField] private CanvasGroup _mainCanvasGroup;
        [SerializeField] private CanvasGroup _logoCanvasGroup;
        [SerializeField] private CanvasGroup _contentCanvasGroup;
        [SerializeField] private CanvasGroup _progressCanvasGroup;
        [SerializeField] private CanvasGroup _transitionCurtain;

        [Header("Visual Elements")]
        [SerializeField] private RectTransform _logoRect;
        [SerializeField] private TextMeshProUGUI _titleText;
        [SerializeField] private TextMeshProUGUI _subtitleText;

        [Header("Loading Progress Elements")]
        [SerializeField] private Image _progressBarFill;
        [SerializeField] private TextMeshProUGUI _statusText;
        [SerializeField] private TextMeshProUGUI _percentText;

        [Header("Timing & Flow")]
        [SerializeField] private float _loadingDuration = 2.5f;
        [SerializeField] private float _celebrationDelay = 2.0f; // User requested +2 seconds delay
        [SerializeField] private string _nextSceneName = "MainScene";

        private void Awake()
        {
            // Set initial visual states
            if (_mainCanvasGroup != null) _mainCanvasGroup.alpha = 0f;
            if (_logoCanvasGroup != null) _logoCanvasGroup.alpha = 0f;
            if (_contentCanvasGroup != null) _contentCanvasGroup.alpha = 0f;
            if (_progressCanvasGroup != null) _progressCanvasGroup.alpha = 0f;
            if (_transitionCurtain != null)
            {
                _transitionCurtain.alpha = 0f;
                _transitionCurtain.blocksRaycasts = false;
                _transitionCurtain.interactable = false;
            }

            if (_logoRect != null) _logoRect.localScale = Vector3.one * 0.4f;
            if (_progressBarFill != null) _progressBarFill.fillAmount = 0f;

            UpdateStatus(0f, "Initializing Framework...");

            // Ensure SKCore is instantiated
            SKCore.InitSKCore();
        }

        private void Start()
        {
            RunSplashSequenceAsync().Forget();
        }

        private async UniTaskVoid RunSplashSequenceAsync()
        {
            // 1. Fade in screen
            if (_mainCanvasGroup != null)
            {
                await AwaitTween(_mainCanvasGroup.DOFade(1f, 0.4f));
            }

            // 2. Animate Logo & Title in
            var introSeq = DOTween.Sequence();
            if (_logoRect != null)
            {
                introSeq.Join(_logoRect.DOScale(Vector3.one, 0.7f).SetEase(Ease.OutBack));
            }
            if (_logoCanvasGroup != null)
            {
                introSeq.Join(_logoCanvasGroup.DOFade(1f, 0.5f));
            }
            if (_contentCanvasGroup != null)
            {
                introSeq.Join(_contentCanvasGroup.DOFade(1f, 0.6f));
            }
            if (_progressCanvasGroup != null)
            {
                introSeq.Join(_progressCanvasGroup.DOFade(1f, 0.5f));
            }

            // 3. Start SKCore service initialization
            var initTask = SKCore.InitializeServices();

            // 4. Progress bar fill tween
            float progress = 0f;
            var progressTween = DOVirtual.Float(0f, 1f, _loadingDuration, val =>
            {
                progress = val;
                if (_progressBarFill != null)
                {
                    _progressBarFill.fillAmount = val;
                }

                string statusMessage = val switch
                {
                    < 0.25f => "Initializing Core Services...",
                    < 0.50f => "Loading Audio & Save Systems...",
                    < 0.75f => "Configuring UI & Haptics...",
                    < 0.95f => "Preparing Game World...",
                    _ => "Ready!"
                };

                UpdateStatus(val, statusMessage);
            }).SetEase(Ease.InOutSine);

            // Wait for both progress bar tween and SKCore initialization to complete
            await UniTask.WhenAll(
                initTask,
                AwaitTween(progressTween)
            );

            // Force 100% completion state
            if (_progressBarFill != null) _progressBarFill.fillAmount = 1f;
            UpdateStatus(1f, "Ready!");

            // 5. User Request: Progress bar fades out
            if (_progressCanvasGroup != null)
            {
                await AwaitTween(_progressCanvasGroup.DOFade(0f, 0.35f));
            }

            // 6. User Request: Logo grows with a celebration animation & haptics
            if (_logoRect != null)
            {
                var logoEnlargeSeq = DOTween.Sequence();
                logoEnlargeSeq.Append(_logoRect.DOScale(Vector3.one * 1.35f, 0.7f).SetEase(Ease.OutBack));
                logoEnlargeSeq.Join(_logoRect.DOPunchRotation(new Vector3(0, 0, 8f), 0.6f, 4, 0.5f));
                await AwaitTween(logoEnlargeSeq);
            }
#if SKC_HAS_HAPTICS
            SKCore.HapticService?.Success();
#endif

            // 7. User Request: +2 seconds delay to display the enlarged logo animation
            await UniTask.Delay((int)(_celebrationDelay * 1000), cancellationToken: destroyCancellationToken);

            // 8. User Request: Transition to next scene using SKCore.TransitionService
            ExecuteTransitionToNextScene();
        }

        private void ExecuteTransitionToNextScene()
        {
            if (string.IsNullOrEmpty(_nextSceneName)) return;

            var curtain = _transitionCurtain != null ? _transitionCurtain : _mainCanvasGroup;

#if SKC_HAS_TRANSITIONS
            if (SKCore.TransitionService != null && curtain != null)
            {
                var transitionConfig = new TransitionConfig()
                {
                    TransitionType = TransitionType.FadeIn,
                    Duration = 0.75f,
                    EaseType = Ease.InOutCubic,
                    Delay = 0.0f
                };

                SKCore.TransitionService.Transition(
                    curtain,
                    transitionConfig,
                    callbackOnStart: () =>
                    {
#if SKC_HAS_HAPTICS
                        SKCore.HapticService?.Light();
#endif
                    },
                    callbackOnMiddle: null,
                    callbackOnComplete: () =>
                    {
                        SceneManager.LoadSceneAsync(_nextSceneName);
                    }
                );
            }
            else
            {
                SceneManager.LoadSceneAsync(_nextSceneName);
            }
#else
            SceneManager.LoadSceneAsync(_nextSceneName);
#endif
        }

        private void UpdateStatus(float progress01, string status)
        {
            if (_statusText != null)
            {
                _statusText.text = status;
            }

            if (_percentText != null)
            {
                using (StringBuilderPool.Get(out var sb))
                {
                    sb.Append(Mathf.RoundToInt(progress01 * 100f)).Append('%');
                    _percentText.SetText(sb);
                }
            }
        }

        private UniTask AwaitTween(Tween tween)
        {
            if (tween == null || !tween.IsActive() || tween.IsComplete())
            {
                return UniTask.CompletedTask;
            }

            var tcs = new UniTaskCompletionSource();
            tween.OnComplete(() => tcs.TrySetResult());
            tween.OnKill(() => tcs.TrySetResult());
            return tcs.Task;
        }
    }
}
