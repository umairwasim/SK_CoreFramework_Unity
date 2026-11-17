/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/
using System;
using System.Threading;
using System.Threading.Tasks;
using Cysharp.Threading.Tasks;
using SKC.Helpers;
using UnityEngine;

namespace SKC.Scheduler
{
    public class SemihCoroutine
    {
        public readonly Guid Id;
        private CancellationToken _token;
        private float _duration;

        public SemihCoroutine(float duration, CancellationToken token = default)
        {
            Id = Guid.NewGuid();
            _token = token;
            _duration = duration;
        }

        public void SetToken(CancellationToken token)
        {
            _token = token;
        }

        public void Stop()
        {
            SchedulerManager.Instance.StopTimer(this);
        }

        #region Run Action With No Parameters
        public void Run(Action action)
        {
            RunTaskWithNoParams(action).Forget();
        }

        async UniTask RunTaskWithNoParams(Action action)
        {
            try
            {
                await RunInternal(async () =>
                {
                    await UniTask.Delay(TimeSpan.FromSeconds(_duration), ignoreTimeScale: false, cancellationToken: _token);
                });

                if (action != null && Application.isPlaying && !_token.IsCancellationRequested)
                    action();
            }
            catch (OperationCanceledException)
            {
                // Timer was cancelled normally; exit gracefully.
            }
            finally
            {
                SchedulerManager.Instance.RemoveTimer(this.Id);
            }
        }
        #endregion

        #region Run Action With Parameters
        public void Run<T>(Action<T> action, T value)
        {
            RunTaskWithParams(action, value).Forget();
        }

        async UniTask RunTaskWithParams<T>(Action<T> action, T value)
        {
            try
            {
                await RunInternal(async () =>
                {
                    await UniTask.Delay(TimeSpan.FromSeconds(_duration), ignoreTimeScale: false, cancellationToken: _token);
                });

                if (action != null && Application.isPlaying && !_token.IsCancellationRequested)
                    action(value);
            }
            catch (OperationCanceledException)
            {
                // Timer was cancelled normally; exit gracefully.
            }
            finally
            {
                SchedulerManager.Instance.RemoveTimer(this.Id);
            }
        }
        #endregion

        private async UniTask RunInternal(Func<UniTask> awaiter)
        {
            if (!Application.isPlaying) return;

            _token.ThrowIfCancellationRequested();

            while (SchedulerManager.Instance.IsCurrentlyPaused() && !_token.IsCancellationRequested)
            {
                await UniTask.Yield(PlayerLoopTiming.Update, _token);
            }

            await awaiter();

            while (SchedulerManager.Instance.IsCurrentlyPaused() && !_token.IsCancellationRequested)
            {
                await UniTask.Yield(PlayerLoopTiming.Update, _token);
            }
        }
    }
}