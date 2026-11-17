/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System;
using System.Collections.Generic;
using System.Threading;
using Cysharp.Threading.Tasks;
using UnityEngine;
using UnityEngine.Events;
using SKC.Boots;
using SKC.Global;
using SKC.Services;
using SKC.Save;
using SKC.Logging;
using Object = UnityEngine.Object;

#if SKC_HAS_UI
using SKC.UI;
#endif
#if SKC_HAS_HAPTICS
using SKC.Haptics;
#endif
#if SKC_HAS_LEVELS
using SKC.Levels;
#endif
#if SKC_HAS_ECONOMY
using SKC.Economy;
#endif
#if SKC_HAS_DAILY_REWARDS
using SKC.DailyRewards;
#endif
#if SKC_HAS_ADS
using SKC.Ads;
#endif
#if SKC_HAS_ANALYTICS
using SKC.Analytics;
#endif
#if SKC_HAS_IAP
using SKC.IAP;
#endif
#if SKC_HAS_PRIVACY
using SKC.Privacy;
#endif
#if SKC_HAS_REVIEW
using SKC.Review;
#endif
#if SKC_HAS_NOTIFICATIONS
using SKC.Notifications;
#endif
#if SKC_HAS_TELEMETRY
using SKC.Telemetry;
#endif
#if SKC_HAS_POOLING
using SKC.Pooling;
#endif
#if SKC_HAS_TRANSITIONS
using SKC.Transition;
#endif
#if SKC_HAS_INPUTS
using SKC.Inputs;
#endif

namespace SKC.Core
{
    /// <summary>
    /// Master Service Locator and Application Core Bootstrapper for SKCFramework.
    /// Provides decoupled service lookup (Get<T>, Register<T>, Has<T>) and backward-compatible shortcuts.
    /// </summary>
    public class SKCore
    {
        private static SKCoreServiceSettings Settings;
        private static void LoadSettings()
        {
            Settings = Resources.Load<SKCoreServiceSettings>("SKCoreServiceSettings");

            if (Settings == null)
            {
                Debug.LogWarning("[SKCore] SKCoreServiceSettings file not found in Resources! " +
                                 "All services will be initialized by default.");
            }
        }
        
        private static GameObject _gameObject;
        public static GameObject GameObject
        {
            get
            {
                if (_gameObject != null) return _gameObject;
                _gameObject = new GameObject("SKCore");
                Object.DontDestroyOnLoad(_gameObject);
                return _gameObject;
            }
        }
        public static GameObject gameObject => GameObject;
        
        public static GameState GameState { get; set; }
        
        /// <summary>
        /// Active build profile configured in SKC Control Center (Development or Production).
        /// </summary>
        public static BuildLoggingProfile ActiveBuildProfile => SKCLog.Settings != null ? SKCLog.Settings.profile : BuildLoggingProfile.Development;

        public static bool IsProduction => ActiveBuildProfile == BuildLoggingProfile.Production;
        public static bool IsDevelopment => ActiveBuildProfile == BuildLoggingProfile.Development;

        public static CancellationToken CancellationToken => _gameObject.GetCancellationTokenOnDestroy();
        
        #region Core Foundation Services (Always Available)

        public static readonly SaveService SaveService = new SaveService();
        public static readonly EventService EventService = new EventService();
        public static readonly SchedulerService SchedulerService = new SchedulerService();

        #endregion

        #region Modular Service Instances (Guarded by Define Symbols)

#if SKC_HAS_POOLING
        public static readonly PoolService PoolService = new PoolService();
#endif
#if SKC_HAS_AUDIO
        public static readonly SoundService SoundService = new SoundService();
#endif
#if SKC_HAS_TRANSITIONS
        public static readonly SceneService SceneService = new SceneService();
        public static readonly TransitionService TransitionService = new TransitionService();
#endif
#if SKC_HAS_INPUTS
        public static readonly InputService InputService = new InputService();
#endif
#if SKC_HAS_UI
        public static readonly UIService UIService = new UIService();
#endif
#if SKC_HAS_HAPTICS
        public static readonly HapticService HapticService = new HapticService();
#endif
#if SKC_HAS_LEVELS
        public static readonly LevelService LevelService = new LevelService();
#endif
#if SKC_HAS_ECONOMY
        public static readonly CurrencyService CurrencyService = new CurrencyService();
#endif
#if SKC_HAS_DAILY_REWARDS
        public static readonly DailyRewardService DailyRewardService = new DailyRewardService();
#endif
#if SKC_HAS_IAP
        public static readonly IAPService IAPService = new IAPService();
#endif
#if SKC_HAS_PRIVACY
        public static readonly PrivacyService PrivacyService = new PrivacyService();
#endif
#if SKC_HAS_REVIEW
        public static readonly ReviewService ReviewService = new ReviewService();
#endif
#if SKC_HAS_NOTIFICATIONS
        public static readonly NotificationService NotificationService = new NotificationService();
#endif
#if SKC_HAS_TELEMETRY
        public static readonly LevelTelemetryTracker LevelTelemetryTracker = new LevelTelemetryTracker();
#endif

        #endregion

        private static List<IService> Services = new List<IService>();
        private static readonly Dictionary<Type, IService> _dynamicServices = new Dictionary<Type, IService>();

#if SKC_HAS_ADS
        private static readonly DummyAdsService _dummyAds = new DummyAdsService();
        private static IAdsService _customAdsService;
#endif
#if SKC_HAS_ANALYTICS
        private static readonly DummyAnalyticsService _dummyAnalytics = new DummyAnalyticsService();
        private static readonly List<IAnalyticsService> _customAnalyticsProviders = new();
#endif

        #region Master Service Locator (Pure Generic API)

        /// <summary>
        /// Registers a service instance into the service locator.
        /// Replaces any existing registration for the specified contract type.
        /// </summary>
        public static void Register<T>(T service) where T : class, IService
        {
            if (service == null) return;
            _dynamicServices[typeof(T)] = service;
            if (!Services.Contains(service))
            {
                Services.Add(service);
            }
        }

        public static void RegisterService<T>(T service) where T : class, IService => Register<T>(service);

        /// <summary>
        /// Unregisters a service contract from the service locator.
        /// </summary>
        public static void Unregister<T>() where T : class, IService
        {
            if (_dynamicServices.TryGetValue(typeof(T), out var s))
            {
                _dynamicServices.Remove(typeof(T));
                Services.Remove(s);
            }
        }

        public static void UnregisterService<T>() where T : class, IService => Unregister<T>();

        /// <summary>
        /// Retrieves a registered service by type, or null if not found.
        /// </summary>
        public static T Get<T>() where T : class, IService
        {
            return _dynamicServices.TryGetValue(typeof(T), out var s) ? s as T : null;
        }

        public static T GetService<T>() where T : class, IService => Get<T>();

        /// <summary>
        /// Tries to retrieve a registered service by type.
        /// </summary>
        public static bool TryGet<T>(out T service) where T : class, IService
        {
            if (_dynamicServices.TryGetValue(typeof(T), out var s) && s is T typed)
            {
                service = typed;
                return true;
            }
            service = null;
            return false;
        }

        public static bool TryGetService<T>(out T service) where T : class, IService => TryGet<T>(out service);

        /// <summary>
        /// Checks if a service contract is registered in the service locator.
        /// </summary>
        public static bool Has<T>() where T : class, IService => _dynamicServices.ContainsKey(typeof(T));
        public static bool HasService<T>() where T : class, IService => Has<T>();

        /// <summary>
        /// Read-only dictionary of all dynamically registered services in the locator.
        /// </summary>
        public static IReadOnlyDictionary<Type, IService> DynamicServices => _dynamicServices;

        #endregion

        #region Core Shortcuts

        public static ISaveService Save => Get<ISaveService>() ?? SaveService;
        public static IEventService Events => Get<IEventService>() ?? EventService;

        #endregion

        #region Modular Shortcuts

#if SKC_HAS_ADS
        /// <summary>
        /// Registers a custom Ads mediation service (e.g. MaxAdsAdapter, IronSourceAdsAdapter).
        /// Replaces any default or dummy ads service.
        /// </summary>
        public static void RegisterCustomAdsService(IAdsService adsService)
        {
            if (adsService == null) return;
            _customAdsService = adsService;
            Unregister<IAdsService>();
            Register<IAdsService>(adsService);
            SKCLog.Info(LogTag.Core, $"Active Ads Service set to: {adsService.ServiceName}");
        }

        /// <summary>
        /// Accesses the active Ads mediation service, or falls back to DummyAdsService if none is installed.
        /// </summary>
        public static IAdsService Ads => Get<IAdsService>() ?? _dummyAds;
#endif

#if SKC_HAS_ANALYTICS
        /// <summary>
        /// Adds a custom Analytics provider into CompositeAnalyticsService.
        /// </summary>
        public static void AddCustomAnalyticsProvider(IAnalyticsService provider)
        {
            if (provider == null) return;
            if (!_customAnalyticsProviders.Contains(provider))
            {
                _customAnalyticsProviders.Add(provider);
            }

            if (TryGet<IAnalyticsService>(out var service) && service is CompositeAnalyticsService composite)
            {
                composite.AddProvider(provider);
                SKCLog.Info(LogTag.Analytics, $"Added Analytics provider to Composite: {provider.ServiceName}");
            }
        }

        /// <summary>
        /// Accesses the active Analytics service, or falls back to DummyAnalyticsService if none is installed.
        /// </summary>
        public static IAnalyticsService Analytics => Get<IAnalyticsService>() ?? _dummyAnalytics;
#endif

#if SKC_HAS_IAP
        public static IIAPService IAP => Get<IIAPService>() ?? IAPService;
#endif
#if SKC_HAS_PRIVACY
        public static IPrivacyService Privacy => Get<IPrivacyService>() ?? PrivacyService;
#endif
#if SKC_HAS_REVIEW
        public static IReviewService Review => Get<IReviewService>() ?? ReviewService;
#endif
#if SKC_HAS_NOTIFICATIONS
        public static INotificationService Notification => Get<INotificationService>() ?? NotificationService;
#endif
#if SKC_HAS_TELEMETRY
        public static LevelTelemetryTracker Telemetry => Get<LevelTelemetryTracker>() ?? LevelTelemetryTracker;
#endif

        #endregion

        private static void RegisterBuiltinServices()
        {
            // Core Foundation
            Register<ISaveService>(SaveService);
            Register<IEventService>(EventService);
            Register<SaveService>(SaveService);
            Register<EventService>(EventService);
            Register<SchedulerService>(SchedulerService);

#if SKC_HAS_POOLING
            Register<PoolService>(PoolService);
#endif
#if SKC_HAS_AUDIO
            Register<SoundService>(SoundService);
#endif
#if SKC_HAS_TRANSITIONS
            Register<SceneService>(SceneService);
            Register<TransitionService>(TransitionService);
#endif
#if SKC_HAS_INPUTS
            Register<InputService>(InputService);
#endif
#if SKC_HAS_UI
            Register<UIService>(UIService);
#endif
#if SKC_HAS_HAPTICS
            Register<HapticService>(HapticService);
#endif
#if SKC_HAS_LEVELS
            Register<LevelService>(LevelService);
#endif
#if SKC_HAS_ECONOMY
            Register<CurrencyService>(CurrencyService);
#endif
#if SKC_HAS_DAILY_REWARDS
            Register<DailyRewardService>(DailyRewardService);
#endif
#if SKC_HAS_IAP
            Register<IIAPService>(IAPService);
            Register<IAPService>(IAPService);
#endif
#if SKC_HAS_PRIVACY
            Register<IPrivacyService>(PrivacyService);
            Register<PrivacyService>(PrivacyService);
#endif
#if SKC_HAS_REVIEW
            Register<IReviewService>(ReviewService);
            Register<ReviewService>(ReviewService);
#endif
#if SKC_HAS_NOTIFICATIONS
            Register<INotificationService>(NotificationService);
            Register<NotificationService>(NotificationService);
#endif
#if SKC_HAS_TELEMETRY
            Register<LevelTelemetryTracker>(LevelTelemetryTracker);
#endif

#if SKC_HAS_ADS
            if (_customAdsService != null)
            {
                Register<IAdsService>(_customAdsService);
            }
            else
            {
                Register<IAdsService>(_dummyAds);
            }
#endif

#if SKC_HAS_ANALYTICS
            var compositeAnalytics = new CompositeAnalyticsService();
            for (int i = 0; i < _customAnalyticsProviders.Count; i++)
            {
                compositeAnalytics.AddProvider(_customAnalyticsProviders[i]);
            }

            FindAndRegisterAdaptersViaReflection(compositeAnalytics);

            if (compositeAnalytics.Providers.Count == 0)
            {
                compositeAnalytics.AddProvider(_dummyAnalytics);
            }
            Register<IAnalyticsService>(compositeAnalytics);
#endif
        }

#if SKC_HAS_ANALYTICS || SKC_HAS_ADS
        private static void FindAndRegisterAdaptersViaReflection(object compositeAnalyticsObj)
        {
            try
            {
                var assemblies = AppDomain.CurrentDomain.GetAssemblies();
                for (int a = 0; a < assemblies.Length; a++)
                {
                    string asmName = assemblies[a].GetName().Name;
                    if (!asmName.StartsWith("Assembly-CSharp") && !asmName.StartsWith("SKC")) continue;

                    Type[] types;
                    try
                    {
                        types = assemblies[a].GetTypes();
                    }
                    catch
                    {
                        continue;
                    }

                    for (int t = 0; t < types.Length; t++)
                    {
                        var type = types[t];
                        if (type == null || type.IsAbstract || type.IsInterface) continue;

#if SKC_HAS_ADS
                        if (_customAdsService == null && typeof(IAdsService).IsAssignableFrom(type) && type != typeof(DummyAdsService))
                        {
                            try
                            {
                                if (Activator.CreateInstance(type) is IAdsService ads)
                                {
                                    RegisterCustomAdsService(ads);
                                }
                            }
                            catch (Exception ex)
                            {
                                SKCLog.Warning(LogTag.Core, $"Failed to instantiate {type.Name}: {ex.Message}");
                            }
                        }
#endif

#if SKC_HAS_ANALYTICS
                        if (compositeAnalyticsObj is CompositeAnalyticsService compositeAnalytics &&
                            typeof(IAnalyticsService).IsAssignableFrom(type) &&
                            type != typeof(DummyAnalyticsService) &&
                            type != typeof(CompositeAnalyticsService) &&
                            !_customAnalyticsProviders.Exists(p => p.GetType() == type))
                        {
                            try
                            {
                                if (Activator.CreateInstance(type) is IAnalyticsService analytics)
                                {
                                    _customAnalyticsProviders.Add(analytics);
                                    compositeAnalytics.AddProvider(analytics);
                                }
                            }
                            catch (Exception ex)
                            {
                                SKCLog.Warning(LogTag.Core, $"Failed to instantiate {type.Name}: {ex.Message}");
                            }
                        }
#endif
                    }
                }
            }
            catch (Exception ex)
            {
                SKCLog.Warning(LogTag.Core, $"Adapter discovery scan: {ex.Message}");
            }
        }
#endif

        public static void InitSKCore()
        {
            RegisterBuiltinServices();
            _gameObject = new GameObject("SKCore");
            Object.DontDestroyOnLoad(_gameObject);
            
#if UNITY_ANDROID
            _gameObject.AddComponent<AndroidLifeCycle>();
#elif UNITY_IOS || UNITY_EDITOR
            _gameObject.AddComponent<IOSLifeCycle>();
#endif
        }
        
        private static async UniTask InitializeSaveService(UnityAction onSucceed = null, UnityAction onError = null)
        {
            if (ShouldInitialize(Settings != null ? Settings.enableSaveService : true))
            {
                await SaveService.Initialize(onSucceed, onError);
                Services.Add(SaveService);
            }
        }
        
        private static async UniTask InitializeEventService(UnityAction onSucceed = null, UnityAction onError = null)
        {
            if (ShouldInitialize(Settings != null ? Settings.enableEventService : true))
            {
                await EventService.Initialize(onSucceed, onError);
                Services.Add(EventService);
            }
        }

        private static async UniTask InitializeSchedulerService(UnityAction onSucceed = null, UnityAction onError = null)
        {
            if (ShouldInitialize(Settings != null ? Settings.enableSchedulerService : true))
            {
                await SchedulerService.Initialize(onSucceed, onError);
                Services.Add(SchedulerService);
            }
        }

#if SKC_HAS_TRANSITIONS
        private static async UniTask InitializeTransitionService(UnityAction onSucceed = null, UnityAction onError = null)
        {
            if (ShouldInitialize(Settings != null ? Settings.enableTransitionService : true))
            {
                await TransitionService.Initialize(onSucceed, onError);
                Services.Add(TransitionService);
            }
        }

        private static async UniTask InitializeSceneService(UnityAction onSucceed = null, UnityAction onError = null)
        {
            if (ShouldInitialize(Settings != null ? Settings.enableSceneService : true))
            {
                await SceneService.Initialize(onSucceed, onError);
                Services.Add(SceneService);
            }
        }
#endif

#if SKC_HAS_POOLING
        private static async UniTask InitializePoolService(UnityAction onSucceed = null, UnityAction onError = null)
        {
            if (ShouldInitialize(Settings != null ? Settings.enablePoolService : true))
            {
                await PoolService.Initialize(gameObject.transform, onSucceed, onError);
                Services.Add(PoolService);
            }
        }
#endif

#if SKC_HAS_AUDIO
        private static async UniTask InitializeSoundService(UnityAction onSucceed = null, UnityAction onError = null)
        {
            if (ShouldInitialize(Settings != null ? Settings.enableSoundService : true))
            {
                await SoundService.Initialize(gameObject.transform, onSucceed, onError);
                Services.Add(SoundService);
            }
        }
#endif

#if SKC_HAS_INPUTS
        private static async UniTask InitializeInputService(UnityAction onSucceed = null, UnityAction onError = null)
        {
            if (ShouldInitialize(Settings != null ? Settings.enableInputService : true))
            {
                await InputService.Initialize(onSucceed, onError);
                Services.Add(InputService);
            }
        }
#endif

#if SKC_HAS_UI
        private static async UniTask InitializeUIService(UnityAction onSucceed = null, UnityAction onError = null)
        {
            if (ShouldInitialize(Settings != null ? Settings.enableUIService : true))
            {
                await UIService.Initialize(onSucceed, onError);
                Services.Add(UIService);
            }
        }
#endif

#if SKC_HAS_HAPTICS
        private static async UniTask InitializeHapticService(UnityAction onSucceed = null, UnityAction onError = null)
        {
            if (ShouldInitialize(Settings != null ? Settings.enableHapticService : true))
            {
                await HapticService.Initialize(onSucceed, onError);
                Services.Add(HapticService);
            }
        }
#endif

#if SKC_HAS_LEVELS
        private static async UniTask InitializeLevelService(UnityAction onSucceed = null, UnityAction onError = null)
        {
            if (ShouldInitialize(Settings != null ? Settings.enableLevelService : true))
            {
                await LevelService.Initialize(onSucceed, onError);
                Services.Add(LevelService);
            }
        }
#endif

#if SKC_HAS_ECONOMY
        private static async UniTask InitializeCurrencyService(UnityAction onSucceed = null, UnityAction onError = null)
        {
            if (ShouldInitialize(Settings != null ? Settings.enableCurrencyService : true))
            {
                await CurrencyService.Initialize(onSucceed, onError);
                Services.Add(CurrencyService);
            }
        }
#endif

#if SKC_HAS_DAILY_REWARDS
        private static async UniTask InitializeDailyRewardService(UnityAction onSucceed = null, UnityAction onError = null)
        {
            if (ShouldInitialize(Settings != null ? Settings.enableDailyRewardService : true))
            {
                await DailyRewardService.Initialize(onSucceed, onError);
                Services.Add(DailyRewardService);
            }
        }
#endif

#if SKC_HAS_ADS
        private static async UniTask InitializeAdsService(UnityAction onSucceed = null, UnityAction onError = null)
        {
            if (Ads != null && !Ads.IsInitialized)
            {
                await Ads.Initialize(onSucceed, onError);
                Services.Add(Ads);
            }
        }
#endif

#if SKC_HAS_ANALYTICS
        private static async UniTask InitializeAnalyticsService(UnityAction onSucceed = null, UnityAction onError = null)
        {
            if (Analytics != null && !Analytics.IsInitialized)
            {
                await Analytics.Initialize(onSucceed, onError);
                Services.Add(Analytics);
            }
        }
#endif

#if SKC_HAS_IAP
        private static async UniTask InitializeIAPService(UnityAction onSucceed = null, UnityAction onError = null)
        {
            if (ShouldInitialize(Settings != null ? Settings.enableIAPService : true))
            {
                await IAPService.Initialize(onSucceed, onError);
                Services.Add(IAPService);
            }
        }
#endif

#if SKC_HAS_PRIVACY
        private static async UniTask InitializePrivacyService(UnityAction onSucceed = null, UnityAction onError = null)
        {
            if (ShouldInitialize(Settings != null ? Settings.enablePrivacyService : true))
            {
                await PrivacyService.Initialize(onSucceed, onError);
                Services.Add(PrivacyService);
            }
        }
#endif

#if SKC_HAS_REVIEW
        private static async UniTask InitializeReviewService(UnityAction onSucceed = null, UnityAction onError = null)
        {
            if (ShouldInitialize(Settings != null ? Settings.enableReviewService : true))
            {
                await ReviewService.Initialize(onSucceed, onError);
                Services.Add(ReviewService);
            }
        }
#endif

#if SKC_HAS_NOTIFICATIONS
        private static async UniTask InitializeNotificationService(UnityAction onSucceed = null, UnityAction onError = null)
        {
            if (ShouldInitialize(Settings != null ? Settings.enableNotificationService : true))
            {
                await NotificationService.Initialize(onSucceed, onError);
                Services.Add(NotificationService);
            }
        }
#endif

#if SKC_HAS_TELEMETRY
        private static async UniTask InitializeTelemetryService(UnityAction onSucceed = null, UnityAction onError = null)
        {
            if (ShouldInitialize(Settings != null ? Settings.enableTelemetryTracker : true))
            {
                await LevelTelemetryTracker.Initialize(onSucceed, onError);
                Services.Add(LevelTelemetryTracker);
            }
        }
#endif

        public static async UniTask InitializeServices()
        {
            GameState = GameState.Loading;
            RegisterBuiltinServices();
            
            LoadSettings();
            
            List<UniTask> initializationTasks = new List<UniTask>();
            initializationTasks.Add(InitializeSaveService());
            initializationTasks.Add(InitializeEventService());
            initializationTasks.Add(InitializeSchedulerService());

#if SKC_HAS_POOLING
            initializationTasks.Add(InitializePoolService());
#endif
#if SKC_HAS_AUDIO
            initializationTasks.Add(InitializeSoundService());
#endif
#if SKC_HAS_TRANSITIONS
            initializationTasks.Add(InitializeSceneService());
            initializationTasks.Add(InitializeTransitionService());
#endif
#if SKC_HAS_INPUTS
            initializationTasks.Add(InitializeInputService());
#endif
#if SKC_HAS_UI
            initializationTasks.Add(InitializeUIService());
#endif
#if SKC_HAS_HAPTICS
            initializationTasks.Add(InitializeHapticService());
#endif
#if SKC_HAS_LEVELS
            initializationTasks.Add(InitializeLevelService());
#endif
#if SKC_HAS_ECONOMY
            initializationTasks.Add(InitializeCurrencyService());
#endif
#if SKC_HAS_DAILY_REWARDS
            initializationTasks.Add(InitializeDailyRewardService());
#endif
#if SKC_HAS_ADS
            initializationTasks.Add(InitializeAdsService());
#endif
#if SKC_HAS_ANALYTICS
            initializationTasks.Add(InitializeAnalyticsService());
#endif
#if SKC_HAS_IAP
            initializationTasks.Add(InitializeIAPService());
#endif
#if SKC_HAS_PRIVACY
            initializationTasks.Add(InitializePrivacyService());
#endif
#if SKC_HAS_REVIEW
            initializationTasks.Add(InitializeReviewService());
#endif
#if SKC_HAS_NOTIFICATIONS
            initializationTasks.Add(InitializeNotificationService());
#endif
#if SKC_HAS_TELEMETRY
            initializationTasks.Add(InitializeTelemetryService());
#endif

            await UniTask.WhenAll(initializationTasks);
        }
        
        private static bool ShouldInitialize(bool settingValue)
        {
            if (Settings == null)
                return true; 
            
            return settingValue; 
        }
    }
}
