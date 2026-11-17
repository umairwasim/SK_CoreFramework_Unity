/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/
using System;
using System.Collections.Generic;
using Cysharp.Threading.Tasks;
using SKC.Boots;
#if SKC_HAS_TRANSITIONS
using SKC.Transition; 
#endif
using UnityEngine;
using UnityEngine.Events;
using SKC.Logging;

namespace SKC.Services
{
    #region Standard Event Contracts (Structs)
    public readonly struct PointerDownEvent
    {
        public readonly Vector3 Position;
        public PointerDownEvent(Vector3 position) => Position = position;
    }

    public readonly struct PointerUpEvent
    {
        public readonly Vector3 Position;
        public PointerUpEvent(Vector3 position) => Position = position;
    }

    public readonly struct JumpEvent
    {
    }

    public readonly struct ScreenDragEvent
    {
        public readonly Vector2 Delta;
        public ScreenDragEvent(Vector2 delta) => Delta = delta;
    }

    public readonly struct GameInitializeEvent
    {
    }

    public readonly struct GameSaveEvent
    {
    }

#if SKC_HAS_TRANSITIONS
    public readonly struct TransitionRequestEvent
    {
        public readonly TransitionConfig Config;
        public readonly Action OnStart;
        public readonly Action OnMiddle;
        public readonly Action OnComplete;

        public TransitionRequestEvent(TransitionConfig config, Action onStart = null, Action onMiddle = null, Action onComplete = null)
        {
            Config = config;
            OnStart = onStart;
            OnMiddle = onMiddle;
            OnComplete = onComplete;
        }
    }
#endif
    #endregion

    public class EventService : IEventService, IService
    {
        public string ServiceName => "EventService";
        public bool IsInitialized { get; set; }
        public TimeSpan InitializeDuration { get; set; }

        private readonly Dictionary<Type, Delegate> _eventTable = new Dictionary<Type, Delegate>();
        private readonly object _lock = new object();

        public async UniTask Initialize(UnityAction onSucced = null, UnityAction onError = null)
        {
            var startTime = DateTime.Now;
            
            ClearAll();
            IsInitialized = true;
            onSucced?.Invoke();

            SKCLog.Info(LogTag.Core, $"{ServiceName} is initialized");

            InitializeDuration = DateTime.Now.Subtract(startTime);
            await UniTask.CompletedTask;
        }

        #region Generic Pub-Sub API
        /// <summary>
        /// Subscribes a listener to a specific event type.
        /// </summary>
        public void Subscribe<T>(Action<T> listener)
        {
            if (listener == null) return;

            lock (_lock)
            {
                Type type = typeof(T);
                if (_eventTable.TryGetValue(type, out var existingDelegate))
                {
                    _eventTable[type] = Delegate.Combine(existingDelegate, listener);
                }
                else
                {
                    _eventTable[type] = listener;
                }
            }
        }

        /// <summary>
        /// Unsubscribes a previously registered listener.
        /// </summary>
        public void Unsubscribe<T>(Action<T> listener)
        {
            if (listener == null) return;

            lock (_lock)
            {
                Type type = typeof(T);
                if (_eventTable.TryGetValue(type, out var existingDelegate))
                {
                    var currentDel = Delegate.Remove(existingDelegate, listener);
                    if (currentDel == null)
                    {
                        _eventTable.Remove(type);
                    }
                    else
                    {
                        _eventTable[type] = currentDel;
                    }
                }
            }
        }

        /// <summary>
        /// Publishes an event and invokes all subscribed listeners.
        /// </summary>
        public void Publish<T>(T eventData)
        {
            Delegate targetDelegate;
            lock (_lock)
            {
                if (!_eventTable.TryGetValue(typeof(T), out targetDelegate))
                {
                    return;
                }
            }

            try
            {
                (targetDelegate as Action<T>)?.Invoke(eventData);
            }
            catch (Exception ex)
            {
                SKCLog.Error(LogTag.Core, $"Error executing event of type {typeof(T).Name}: {ex.Message}\n{ex.StackTrace}");
            }
        }

        /// <summary>
        /// Publishes a parameterless / default-constructed event.
        /// </summary>
        public void Publish<T>() where T : new()
        {
            Publish(new T());
        }

        /// <summary>
        /// Alias for Publish.
        /// </summary>
        public void Fire<T>(T eventData)
        {
            Publish(eventData);
        }

        /// <summary>
        /// Clears all subscriptions for a specific event type.
        /// </summary>
        public void Clear<T>()
        {
            lock (_lock)
            {
                _eventTable.Remove(typeof(T));
            }
        }

        /// <summary>
        /// Clears all subscriptions across all event types.
        /// </summary>
        public void ClearAll()
        {
            lock (_lock)
            {
                _eventTable.Clear();
            }
        }
        #endregion
    }
}
