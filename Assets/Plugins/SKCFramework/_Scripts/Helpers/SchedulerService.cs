/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/
using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using SKC.Boots;
using SKC.Scheduler;
using UnityEngine.Events;
using SKC.Logging;

namespace SKC.Services
{
    public class SchedulerService : IService
    {
        public string ServiceName => "SchedulerService";
        public bool IsInitialized { get; set; }
        public TimeSpan InitializeDuration { get; set; }

#pragma warning disable CS1998 
        public async UniTask Initialize(UnityAction onSucced = null, UnityAction onError = null)
        {
            var startTime = DateTime.Now;
            
            var manager = SchedulerManager.Instance; 
            
            IsInitialized = true;
            onSucced?.Invoke();
            
            SKCLog.Info(LogTag.Core, $"{ServiceName} is initialized");

            InitializeDuration = DateTime.Now.Subtract(startTime);
            await UniTask.CompletedTask;
        }
        
        public SemihCoroutine RunAfter(float duration, System.Action action)
        {
            SemihCoroutine smhCoroutine = new SemihCoroutine(duration); 
            CancellationToken timerToken = SchedulerManager.Instance.RegisterTimer(smhCoroutine);
            smhCoroutine.SetToken(timerToken);
            smhCoroutine.Run(action);
            return smhCoroutine;
        }

        public SemihCoroutine RunAfter<T>(float duration, System.Action<T> action, T value)
        {
            SemihCoroutine smhCoroutine = new SemihCoroutine(duration); 
            CancellationToken timerToken = SchedulerManager.Instance.RegisterTimer(smhCoroutine);
            smhCoroutine.SetToken(timerToken);
            smhCoroutine.Run(action, value);
            return smhCoroutine;
        }
        
        public void SetAllTimersPaused(bool status)
        {
            SchedulerManager.Instance.SetPauseStatus(status);
        }
    }
}