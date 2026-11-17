/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/ 
using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using SKC.Logging;

namespace SKC.Singleton
{
    /// <summary>
    /// Non-generic registry managing Domain Reload & reset callbacks for all active Singleton<T> instances.
    /// </summary>
    public static class SingletonRegistry
    {
        private static readonly List<Action> _resetActions = new List<Action>();

        public static void Register(Action resetAction)
        {
            if (resetAction != null && !_resetActions.Contains(resetAction))
            {
                _resetActions.Add(resetAction);
            }
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetAll()
        {
            for (int i = 0; i < _resetActions.Count; i++)
            {
                _resetActions[i]?.Invoke();
            }
        }
    }

    public class Singleton<T> : MonoBehaviour where T : MonoBehaviour
    {
        #region Private Vars
        // Check to see if we're about to be destroyed.
        private static bool m_ShuttingDown = false;
        private static readonly object m_Lock = new object();
        private static T m_Instance;
        #endregion

        static Singleton()
        {
            SingletonRegistry.Register(ResetStaticData);
        }

        /// <summary>
        /// Access singleton instance through this propriety.
        /// </summary>
        #region Instance
        public static T Instance
        {
            get
            {
                if (m_ShuttingDown)
                {
                    SKCLog.Warning(LogTag.Core, $"Instance '{typeof(T)}' already destroyed. Returning null.");
                    return null;
                }

                lock (m_Lock)
                {
                    if (m_Instance == null)
                    {
                        // Search for existing instance.
                        m_Instance = (T)FindFirstObjectByType(typeof(T));

                        // Create new instance if one doesn't already exist.
                        if (m_Instance == null)
                        {
                            // Need to create a new GameObject to attach the singleton to.
                            var singletonObject = new GameObject();
                            m_Instance = singletonObject.AddComponent<T>();
                            singletonObject.name = typeof(T).ToString() + " (Singleton)";

                            // Make instance persistent.
                            DontDestroyOnLoad(singletonObject);
                        }
                    }

                    return m_Instance;
                }
            }
        }
        #endregion

        #region Domain Reload & Reset
        private static void ResetStaticData()
        {
            lock (m_Lock)
            {
                m_ShuttingDown = false;
                m_Instance = null;
            }
        }
        #endregion

        #region Lifecycle
        protected virtual void Awake()
        {
            if (m_Instance == null)
            {
                m_Instance = this as T;
                DontDestroyOnLoad(gameObject);
            }
            else if (m_Instance != this)
            {
                SKCLog.Warning(LogTag.Core, $"Duplicate instance of '{typeof(T)}' detected on '{gameObject.name}'. Destroying duplicate.");
                Destroy(gameObject);
            }
        }

        private void OnApplicationQuit()
        {
            m_ShuttingDown = true;
        }

        protected virtual void OnDestroy()
        {
            if (m_Instance == this)
            {
                m_Instance = null;
            }
        }
        #endregion
    }

}

/* Tip    #if UNITY_EDITOR
          Debug.Log("Unity Editor");
          #endif                          Tip End */