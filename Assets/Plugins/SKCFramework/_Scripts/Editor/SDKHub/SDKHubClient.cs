/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.Networking;
using UnityEditor;

namespace SKC.Editor.SDKHub
{
    public static class SDKHubClient
    {
        private const string CacheFilePath = "ProjectSettings/SKC_SDKHubCache.json";
        public const string DefaultManifestUrlPrefKey = "SKC_SDKHub_ManifestUrl";

        // Default GitHub Raw endpoint pointing to user's skc-unity-plugins repository
        public const string FallbackManifestUrl = "https://raw.githubusercontent.com/SemihKC94/skc-unity-plugins/refs/heads/main/sdk_manifest.json";

        private static SDKHubManifestData _cachedManifest;

        public static string ManifestUrl
        {
            get
            {
                string url = EditorPrefs.GetString(DefaultManifestUrlPrefKey, FallbackManifestUrl);
                if (string.IsNullOrEmpty(url) || url.Contains("fe-gb-starter_unity") || url == "https://raw.githubusercontent.com/SemihKC94/skc-unity-plugins/main/sdk_manifest.json")
                {
                    url = FallbackManifestUrl;
                    EditorPrefs.SetString(DefaultManifestUrlPrefKey, url);
                }
                return url;
            }
            set => EditorPrefs.SetString(DefaultManifestUrlPrefKey, value);
        }

        public static SDKHubManifestData GetCurrentManifest()
        {
            if (_cachedManifest != null && _cachedManifest.items.Count > 0)
            {
                return _cachedManifest;
            }

            // Try read from disk cache
            if (File.Exists(CacheFilePath))
            {
                try
                {
                    string json = File.ReadAllText(CacheFilePath);
                    _cachedManifest = JsonUtility.FromJson<SDKHubManifestData>(json);
                    if (_cachedManifest != null && _cachedManifest.items.Count > 0)
                    {
                        return _cachedManifest;
                    }
                }
                catch (Exception)
                {
                    // Fallback to default
                }
            }

            _cachedManifest = CreateDefaultCatalog();
            SaveCache(_cachedManifest);
            return _cachedManifest;
        }

        public static void FetchRemoteManifest(Action<SDKHubManifestData> onComplete = null, Action<string> onError = null)
        {
            string url = ManifestUrl;
            if (string.IsNullOrEmpty(url))
            {
                onError?.Invoke("Manifest URL is empty.");
                return;
            }

            var request = UnityWebRequest.Get(url);
            var asyncOp = request.SendWebRequest();

            asyncOp.completed += _ =>
            {
                if (request.result == UnityWebRequest.Result.Success)
                {
                    try
                    {
                        string json = request.downloadHandler.text;
                        var manifest = JsonUtility.FromJson<SDKHubManifestData>(json);
                        if (manifest != null && manifest.items.Count > 0)
                        {
                            _cachedManifest = manifest;
                            SaveCache(manifest);
                            onComplete?.Invoke(manifest);
                            request.Dispose();
                            return;
                        }
                    }
                    catch (Exception ex)
                    {
                        onError?.Invoke($"JSON parse error: {ex.Message}");
                        request.Dispose();
                        return;
                    }
                }

                onError?.Invoke(request.error ?? "Failed to download manifest.");
                request.Dispose();
            };
        }

        public static void SaveCache(SDKHubManifestData data)
        {
            try
            {
                string json = JsonUtility.ToJson(data, true);
                File.WriteAllText(CacheFilePath, json);
            }
            catch
            {
                // ignored
            }
        }

        public static SDKHubManifestData CreateDefaultCatalog()
        {
            var data = new SDKHubManifestData
            {
                manifestVersion = "1.0.0",
                lastUpdated = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                items = new List<SDKItem>
                {
                    new SDKItem
                    {
                        id = "edm4u",
                        name = "External Dependency Manager (EDM4U)",
                        version = "1.2.189",
                        category = SDKCategory.Utilities,
                        description = "Google Android and iOS dependency resolver for Unity (Gradle and CocoaPods). The core dependency foundation for Firebase, MAX, and Facebook.",
                        author = "Google",
                        downloadUrl = "https://github.com/SemihKC94/skc-unity-plugins/releases/download/v1.0.0/edm4u-1.2.189.unitypackage",
                        documentationUrl = "https://github.com/googlesamples/unity-jar-resolver",
                        scriptingDefineSymbol = "SKC_HAS_EDM4U",
                        detectionPath = "Assets/ExternalDependencyManager"
                    },
                    new SDKItem
                    {
                        id = "gameanalytics",
                        name = "GameAnalytics",
                        version = "8.1.0",
                        category = SDKCategory.Analytics,
                        description = "Industry-standard player progression tracking (Start, Complete, Fail), business events, retention funnels, and crash telemetry.",
                        author = "GameAnalytics",
                        downloadUrl = "https://github.com/SemihKC94/skc-unity-plugins/releases/download/v1.0.0/GameAnalytics_8.1.0.unitypackage",
                        documentationUrl = "https://docs.gameanalytics.com/integrate-sdk/unity",
                        scriptingDefineSymbol = "SKC_HAS_GAMEANALYTICS",
                        detectionPath = "Assets/GameAnalytics"
                    },
                    new SDKItem
                    {
                        id = "applovin_max",
                        name = "AppLovin MAX Mediation",
                        version = "8.6.6",
                        category = SDKCategory.Ads,
                        description = "High-yield ad mediation platform for Rewarded, Interstitial, and Banner networks with built-in Mediation Debugger.",
                        author = "AppLovin",
                        downloadUrl = "https://github.com/SemihKC94/skc-unity-plugins/releases/download/v1.0.0/AppLovin_MAX_8.6.6.unitypackage",
                        documentationUrl = "https://dash.applovin.com/documentation/mediation/unity/getting-started/integration",
                        scriptingDefineSymbol = "SKC_HAS_APPLOVIN_MAX",
                        detectionPath = "Assets/MaxSdk"
                    },
                    new SDKItem
                    {
                        id = "ironsource_levelplay",
                        name = "ironSource LevelPlay",
                        version = "9.3.0",
                        category = SDKCategory.Ads,
                        description = "Unity LevelPlay / ironSource ad mediation platform for Rewarded, Interstitial, and Banner ad monetization.",
                        author = "Unity ironSource",
                        downloadUrl = "https://github.com/SemihKC94/skc-unity-plugins/releases/download/v1.0.0/UnityLevelPlay_v9.3.0.unitypackage",
                        documentationUrl = "https://developers.is.com/ironsource-mobile/unity/unity-plugin/",
                        scriptingDefineSymbol = "SKC_HAS_IRONSOURCE",
                        detectionPath = "Assets/IronSource"
                    },
                    new SDKItem
                    {
                        id = "facebook_sdk",
                        name = "Facebook / Meta SDK",
                        version = "18.1.1",
                        category = SDKCategory.Attribution,
                        description = "Meta App Events, Aggregated Event Measurement (AEM), campaign attribution, and social authentication.",
                        author = "Meta",
                        downloadUrl = "https://github.com/SemihKC94/skc-unity-plugins/releases/download/v1.0.0/facebook_unitysdk_18.1.1.unitypackage",
                        documentationUrl = "https://developers.facebook.com/docs/app-events/unity",
                        scriptingDefineSymbol = "SKC_HAS_FACEBOOK",
                        detectionPath = "Assets/FacebookSDK"
                    },
                    new SDKItem
                    {
                        id = "bytebrew",
                        name = "ByteBrew SDK",
                        version = "0.2.4",
                        category = SDKCategory.Analytics,
                        description = "All-in-one free game analytics, custom event tracking, push notifications, ad revenue measurement (LTV), and attribution.",
                        author = "ByteBrew",
                        downloadUrl = "https://github.com/SemihKC94/skc-unity-plugins/releases/download/v1.0.0/ByteBrew_SDK_0.2.4.unitypackage",
                        documentationUrl = "https://docs.bytebrew.io/",
                        scriptingDefineSymbol = "SKC_HAS_BYTEBREW",
                        detectionPath = "Assets/ByteBrew"
                    },
                    new SDKItem
                    {
                        id = "amplitude",
                        name = "Amplitude Analytics",
                        version = "2.8.0",
                        category = SDKCategory.Analytics,
                        description = "Product behavioral analytics, user retention cohorts, conversion funnels, and real-time event exploration.",
                        author = "Amplitude",
                        downloadUrl = "https://github.com/SemihKC94/skc-unity-plugins/releases/download/v1.0.0/Amplitude_Unity_2.8.unitypackage",
                        documentationUrl = "https://amplitude.com/docs/apis/analytics/sdks/unity-sdk",
                        scriptingDefineSymbol = "SKC_HAS_AMPLITUDE",
                        detectionPath = "Assets/Amplitude"
                    },
                    new SDKItem
                    {
                        id = "playfab",
                        name = "Microsoft PlayFab SDK",
                        version = "2.242",
                        category = SDKCategory.Utilities,
                        description = "Complete backend live-ops, player authentication, cloud script, leaderboards, player inventories, and virtual catalogs.",
                        author = "Microsoft",
                        downloadUrl = "https://github.com/SemihKC94/skc-unity-plugins/releases/download/v1.0.0/PlayFab_UnitySDK_2.242.unitypackage",
                        documentationUrl = "https://learn.microsoft.com/en-us/gaming/playfab/",
                        scriptingDefineSymbol = "SKC_HAS_PLAYFAB",
                        detectionPath = "Assets/PlayFabSdk"
                    },
                    new SDKItem
                    {
                        id = "firebase_analytics",
                        name = "Firebase Analytics",
                        version = "13.16.0",
                        category = SDKCategory.Analytics,
                        description = "Google Firebase Analytics for audience segmentation, user engagement tracking, and Google Analytics 4 integration.",
                        author = "Google Firebase",
                        downloadUrl = "https://github.com/SemihKC94/skc-unity-plugins/releases/download/v1.0.0/FirebaseAnalytics_13.16.0.unitypackage",
                        documentationUrl = "https://firebase.google.com/docs/analytics/get-started?platform=unity",
                        scriptingDefineSymbol = "SKC_HAS_FIREBASE",
                        detectionPath = "Assets/Firebase"
                    },
                    new SDKItem
                    {
                        id = "firebase_crashlytics",
                        name = "Firebase Crashlytics",
                        version = "13.16.0",
                        category = SDKCategory.Utilities,
                        description = "Real-time crash reporting, ANR diagnostics, and stack trace insights for iOS and Android.",
                        author = "Google Firebase",
                        downloadUrl = "https://github.com/SemihKC94/skc-unity-plugins/releases/download/v1.0.0/FirebaseCrashlytics_13.16.0.unitypackage",
                        documentationUrl = "https://firebase.google.com/docs/crashlytics/get-started?platform=unity",
                        scriptingDefineSymbol = "SKC_HAS_FIREBASE_CRASHLYTICS",
                        detectionPath = "Assets/Firebase"
                    },
                    new SDKItem
                    {
                        id = "firebase_remote_config",
                        name = "Firebase Remote Config",
                        version = "13.16.0",
                        category = SDKCategory.Utilities,
                        description = "Dynamic cloud parameters, A/B testing, and remote game balance adjustments without releasing app updates.",
                        author = "Google Firebase",
                        downloadUrl = "https://github.com/SemihKC94/skc-unity-plugins/releases/download/v1.0.0/FirebaseRemoteConfig_13.16.0.unitypackage",
                        documentationUrl = "https://firebase.google.com/docs/remote-config/get-started?platform=unity",
                        scriptingDefineSymbol = "SKC_HAS_FIREBASE_REMOTECONFIG",
                        detectionPath = "Assets/Firebase"
                    },
                    new SDKItem
                    {
                        id = "firebase_auth",
                        name = "Firebase Auth",
                        version = "13.16.0",
                        category = SDKCategory.Utilities,
                        description = "User authentication with email/password, anonymous sign-in, Google Play Games, and Apple Sign-In.",
                        author = "Google Firebase",
                        downloadUrl = "https://github.com/SemihKC94/skc-unity-plugins/releases/download/v1.0.0/FirebaseAuth_13.16.0.unitypackage",
                        documentationUrl = "https://firebase.google.com/docs/auth/unity/start",
                        scriptingDefineSymbol = "SKC_HAS_FIREBASE_AUTH",
                        detectionPath = "Assets/Firebase"
                    },
                    new SDKItem
                    {
                        id = "firebase_installations",
                        name = "Firebase Installations",
                        version = "13.16.0",
                        category = SDKCategory.Utilities,
                        description = "Unique app installation token management, required by Firebase Cloud Messaging (FCM) and In-App Messaging.",
                        author = "Google Firebase",
                        downloadUrl = "https://github.com/SemihKC94/skc-unity-plugins/releases/download/v1.0.0/FirebaseInstallations_13.16.0.unitypackage",
                        documentationUrl = "https://firebase.google.com/docs/projects/manage-installations",
                        scriptingDefineSymbol = "SKC_HAS_FIREBASE_INSTALLATIONS",
                        detectionPath = "Assets/Firebase"
                    }
                }
            };
            return data;
        }
    }
}
