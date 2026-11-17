/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/
using UnityEngine;

namespace SKC.Core
{
    // Adds an option to create this settings file in the Unity menu.
    [CreateAssetMenu(fileName = "SKCoreServiceSettings", 
        menuName = "SKC/Core/Service Settings")]
    public class SKCoreServiceSettings : ScriptableObject
    {
        [Header("SKCore Service Initialization Settings")]
        [Tooltip("Should SaveService be initialized?")]
        public bool enableSaveService = true;
        
        [Tooltip("Should PoolService be initialized?")]
        public bool enablePoolService = true;
        
        [Tooltip("Should SoundService be initialized?")]
        public bool enableSoundService = true;
        
        [Tooltip("Should SceneService be initialized?")]
        public bool enableSceneService = true;
        
        [Tooltip("Should InputService be initialized?")]
        public bool enableInputService = true;
        
        [Tooltip("Should EventService be initialized?")]
        public bool enableEventService = true;
        
        [Tooltip("Should SchedulerService be initialized?")]
        public bool enableSchedulerService = true;
        
        [Tooltip("Should TransitionService be initialized?")]
        public bool enableTransitionService = true;

        [Tooltip("Should UIService be initialized?")]
        public bool enableUIService = true;

        [Tooltip("Should HapticService be initialized?")]
        public bool enableHapticService = true;

        [Tooltip("Should LevelService be initialized?")]
        public bool enableLevelService = true;

        [Tooltip("Should CurrencyService be initialized?")]
        public bool enableCurrencyService = true;

        [Tooltip("Should DailyRewardService be initialized?")]
        public bool enableDailyRewardService = true;

        [Header("Publisher & Monetization Settings")]
        [Tooltip("Should IAPService (and No-Ads entitlement) be initialized?")]
        public bool enableIAPService = true;

        [Tooltip("Should Privacy & Consent Service (ATT / UMP) be initialized?")]
        public bool enablePrivacyService = true;

        [Tooltip("Should In-App Review Service be initialized?")]
        public bool enableReviewService = true;

        [Tooltip("Should Local Retention Notification Service be initialized?")]
        public bool enableNotificationService = true;

        [Tooltip("Should 0-GC Level & Performance Telemetry Tracker be initialized?")]
        public bool enableTelemetryTracker = true;
    }
}