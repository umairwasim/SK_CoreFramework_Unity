using System;
using System.Collections.Generic;
using System.Threading;
using Cysharp.Threading.Tasks;
using SKC.Singleton;
using UnityEngine;
using SKC.Logging;

namespace SKC.Scheduler
{
    public class SchedulerManager : Singleton<SchedulerManager> 
    {
        private readonly Dictionary<Guid, (CancellationTokenSource individual, CancellationTokenSource linked)> _activeTimers = 
            new Dictionary<Guid, (CancellationTokenSource, CancellationTokenSource)>();
        
        private CancellationToken _managerCancellationToken; 
        
        private bool _isPaused = false; 

        protected override void Awake() 
        {
            base.Awake();
            _managerCancellationToken = this.GetCancellationTokenOnDestroy(); 
        }

        public bool IsCurrentlyPaused() => _isPaused;

        public void SetPauseStatus(bool isPaused)
        {
            if (_isPaused == isPaused) return;

            _isPaused = isPaused;

            string status = _isPaused ? "PAUSED" : "CONTINUE";
            SKCLog.Warning(LogTag.Core, $"All Timers {status}.");
        }
        
        public CancellationToken RegisterTimer(SemihCoroutine timer)
        {
            var individualCts = new CancellationTokenSource();
            var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(
                _managerCancellationToken, 
                individualCts.Token
            );
            
            _activeTimers[timer.Id] = (individualCts, linkedCts);
            
            return linkedCts.Token; 
        }

        public void StopTimer(SemihCoroutine timer)
        {
            if (_activeTimers.TryGetValue(timer.Id, out var pair))
            {
                pair.individual.Cancel(); 
            }
            else
            {
                SKCLog.Warning(LogTag.Core, $"The timer to be canceled was not found or has already been stopped: {timer.Id}");
            }
        }
        
        public void RemoveTimer(Guid timerId)
        {
            if (_activeTimers.TryGetValue(timerId, out var pair))
            {
                pair.individual.Dispose();
                pair.linked.Dispose();
                _activeTimers.Remove(timerId);
                
                SKCLog.Info(LogTag.Core, $"Timer removed. Active Number: {_activeTimers.Count}");
            }
        }
    }
}