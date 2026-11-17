/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System;
using System.IO;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace SKC.Adapters
{
    /// <summary>
    /// Centralized configuration asset for third-party SDK keys, App IDs, and Ad Unit IDs.
    /// Safely stored as a ScriptableObject in Resources, avoiding hardcoded keys in scripts or git diffs.
    /// </summary>
    public class SDKAdapterSettings : ScriptableObject
    {
        private const string ResourcePath = "SDKAdapterSettings";
        private static SDKAdapterSettings _instance;

        public static SDKAdapterSettings Instance
        {
            get
            {
                if (_instance != null) return _instance;

                _instance = Resources.Load<SDKAdapterSettings>(ResourcePath);
                if (_instance == null)
                {
                    _instance = Resources.Load<SDKAdapterSettings>("Settings/" + ResourcePath);
                }

#if UNITY_EDITOR
                if (_instance == null)
                {
                    _instance = CreateDefaultAsset();
                }
#endif
                return _instance;
            }
        }

#if UNITY_EDITOR
        public static SDKAdapterSettings CreateDefaultAsset()
        {
            string resourcesDir = "Assets/Resources";
            if (!Directory.Exists(resourcesDir))
            {
                Directory.CreateDirectory(resourcesDir);
            }

            string assetPath = "Assets/Resources/SDKAdapterSettings.asset";
            var existing = AssetDatabase.LoadAssetAtPath<SDKAdapterSettings>(assetPath);
            if (existing != null) return existing;

            var settings = CreateInstance<SDKAdapterSettings>();
            AssetDatabase.CreateAsset(settings, assetPath);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            return settings;
        }
#endif

        [Header("AppLovin MAX")]
        public string maxSdkKey = "";
        public string maxRewardedUnitIdAndroid = "";
        public string maxRewardedUnitIdIOS = "";
        public string maxInterstitialUnitIdAndroid = "";
        public string maxInterstitialUnitIdIOS = "";
        public string maxBannerUnitIdAndroid = "";
        public string maxBannerUnitIdIOS = "";

        [Header("ironSource LevelPlay")]
        public string ironSourceAppKeyAndroid = "";
        public string ironSourceAppKeyIOS = "";

        [Header("GameAnalytics")]
        public string gaGameKeyAndroid = "";
        public string gaGameKeyIOS = "";
        public string gaSecretKeyAndroid = "";
        public string gaSecretKeyIOS = "";

        [Header("ByteBrew")]
        public string byteBrewGameIdAndroid = "";
        public string byteBrewGameIdIOS = "";
        public string byteBrewSdkKeyAndroid = "";
        public string byteBrewSdkKeyIOS = "";

        [Header("Amplitude")]
        public string amplitudeApiKey = "";

        [Header("Facebook / Meta")]
        public string facebookAppId = "";
        public string facebookClientToken = "";

        [Header("Microsoft PlayFab")]
        public string playFabTitleId = "";

        [Header("Firebase Diagnostics")]
        public bool HasGoogleServicesJson => File.Exists("Assets/google-services.json") || File.Exists("Assets/Firebase/google-services.json");
        public bool HasGoogleServiceInfoPlist => File.Exists("Assets/GoogleService-Info.plist") || File.Exists("Assets/Firebase/GoogleService-Info.plist");
    }
}
