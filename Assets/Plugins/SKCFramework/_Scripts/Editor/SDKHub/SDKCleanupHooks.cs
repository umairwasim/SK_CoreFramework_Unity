/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using UnityEngine;
using UnityEditor;

namespace SKC.Editor.SDKHub
{
    public interface ISDKCleanupHook
    {
        string SdkId { get; }
        void ExecuteCleanup();
    }

    /// <summary>
    /// Specialized cleanup hook for EDM4U that cleans injected Android Gradle code blocks and resolver XMLs.
    /// </summary>
    public class EDM4UCleanupHook : ISDKCleanupHook
    {
        public string SdkId => "edm4u";

        public void ExecuteCleanup()
        {
            CleanMainTemplateGradle();
            CleanSettingsTemplateGradle();
            CleanGradleProperties();
            DeleteResolverSettingsFiles();
        }

        private void CleanMainTemplateGradle()
        {
            string path = "Assets/Plugins/Android/mainTemplate.gradle";
            if (!File.Exists(path)) return;

            try
            {
                string content = File.ReadAllText(path);
                string original = content;

                // Remove Android Resolver Dependencies block
                content = Regex.Replace(content, @"//\s*Android Resolver Dependencies Start[\s\S]*?//\s*Android Resolver Dependencies End\r?\n?", "", RegexOptions.IgnoreCase);

                // Remove Android Resolver Exclusions block
                content = Regex.Replace(content, @"//\s*Android Resolver Exclusions Start[\s\S]*?//\s*Android Resolver Exclusions End\r?\n?", "", RegexOptions.IgnoreCase);

                if (content != original)
                {
                    File.WriteAllText(path, content);
                    Debug.Log($"[SDKHub] Cleaned Android Resolver blocks from '{path}'.");
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[SDKHub] Failed to clean '{path}': {ex.Message}");
            }
        }

        private void CleanSettingsTemplateGradle()
        {
            string path = "Assets/Plugins/Android/settingsTemplate.gradle";
            if (!File.Exists(path)) return;

            try
            {
                string content = File.ReadAllText(path);
                string original = content;

                // Remove Android Resolver Repos block
                content = Regex.Replace(content, @"//\s*Android Resolver Repos Start[\s\S]*?//\s*Android Resolver Repos End\r?\n?", "", RegexOptions.IgnoreCase);

                if (content != original)
                {
                    File.WriteAllText(path, content);
                    Debug.Log($"[SDKHub] Cleaned Android Resolver repos from '{path}'.");
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[SDKHub] Failed to clean '{path}': {ex.Message}");
            }
        }

        private void CleanGradleProperties()
        {
            string path = "Assets/Plugins/Android/gradleTemplate.properties";
            if (!File.Exists(path)) return;

            try
            {
                string content = File.ReadAllText(path);
                string original = content;

                // Remove Android Resolver Properties block
                content = Regex.Replace(content, @"#\s*Android Resolver Properties Start[\s\S]*?#\s*Android Resolver Properties End\r?\n?", "", RegexOptions.IgnoreCase);

                if (content != original)
                {
                    File.WriteAllText(path, content);
                    Debug.Log($"[SDKHub] Cleaned Android Resolver properties from '{path}'.");
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[SDKHub] Failed to clean '{path}': {ex.Message}");
            }
        }

        private void DeleteResolverSettingsFiles()
        {
            string[] filesToDelete =
            {
                "ProjectSettings/AndroidResolverDependencies.xml",
                "ProjectSettings/GvhProjectSettings.xml"
            };

            foreach (var f in filesToDelete)
            {
                if (File.Exists(f))
                {
                    try
                    {
                        File.Delete(f);
                        Debug.Log($"[SDKHub] Deleted resolver file: {f}");
                    }
                    catch (Exception) { }
                }
            }

            if (Directory.Exists("Assets/GeneratedLocalRepo"))
            {
                AssetDatabase.DeleteAsset("Assets/GeneratedLocalRepo");
            }
        }
    }

    /// <summary>
    /// Specialized cleanup hook for ByteBrew.
    /// </summary>
    public class ByteBrewCleanupHook : ISDKCleanupHook
    {
        public string SdkId => "bytebrew";

        public void ExecuteCleanup()
        {
            string settingsAsset = "Assets/Resources/ByteBrewSettings.asset";
            if (File.Exists(settingsAsset))
            {
                AssetDatabase.DeleteAsset(settingsAsset);
                Debug.Log($"[SDKHub] Removed ByteBrew settings: {settingsAsset}");
            }
        }
    }

    /// <summary>
    /// Specialized cleanup hook for GameAnalytics.
    /// </summary>
    public class GameAnalyticsCleanupHook : ISDKCleanupHook
    {
        public string SdkId => "gameanalytics";

        public void ExecuteCleanup()
        {
            string[] dirs = { "Assets/Resources/GameAnalytics", "Assets/Gizmos/GameAnalytics" };
            foreach (var d in dirs)
            {
                if (Directory.Exists(d))
                {
                    AssetDatabase.DeleteAsset(d);
                    Debug.Log($"[SDKHub] Removed GameAnalytics directory: {d}");
                }
            }
        }
    }

    /// <summary>
    /// Registry managing specialized cleanup hooks and curated fallback paths for all supported SDKs.
    /// </summary>
    public static class SDKCleanupRegistry
    {
        private static readonly Dictionary<string, ISDKCleanupHook> _hooks = new Dictionary<string, ISDKCleanupHook>(StringComparer.OrdinalIgnoreCase);

        private static readonly Dictionary<string, string[]> _fallbackPaths = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            {
                "edm4u", new[]
                {
                    "Assets/ExternalDependencyManager",
                    "ProjectSettings/AndroidResolverDependencies.xml",
                    "ProjectSettings/GvhProjectSettings.xml",
                    "Assets/GeneratedLocalRepo"
                }
            },
            {
                "gameanalytics", new[]
                {
                    "Assets/GameAnalytics",
                    "Assets/Resources/GameAnalytics",
                    "Assets/Gizmos/GameAnalytics"
                }
            },
            {
                "applovin_max", new[]
                {
                    "Assets/MaxSdk"
                }
            },
            {
                "ironsource_levelplay", new[]
                {
                    "Assets/IronSource",
                    "Assets/LevelPlay"
                }
            },
            {
                "facebook_sdk", new[]
                {
                    "Assets/FacebookSDK"
                }
            },
            {
                "bytebrew", new[]
                {
                    "Assets/ByteBrew",
                    "Assets/Resources/ByteBrewSettings.asset"
                }
            },
            {
                "amplitude", new[]
                {
                    "Assets/Amplitude"
                }
            },
            {
                "playfab", new[]
                {
                    "Assets/PlayFabSdk"
                }
            },
            {
                "firebase_analytics", new[]
                {
                    "Assets/Firebase",
                    "Assets/Plugins/Android/Firebase",
                    "Assets/Editor/Firebase"
                }
            },
            {
                "firebase_crashlytics", new[]
                {
                    "Assets/Firebase"
                }
            },
            {
                "firebase_remote_config", new[]
                {
                    "Assets/Firebase"
                }
            },
            {
                "firebase_auth", new[]
                {
                    "Assets/Firebase"
                }
            },
            {
                "firebase_installations", new[]
                {
                    "Assets/Firebase"
                }
            }
        };

        static SDKCleanupRegistry()
        {
            RegisterHook(new EDM4UCleanupHook());
            RegisterHook(new ByteBrewCleanupHook());
            RegisterHook(new GameAnalyticsCleanupHook());
        }

        public static void RegisterHook(ISDKCleanupHook hook)
        {
            if (hook != null && !string.IsNullOrEmpty(hook.SdkId))
            {
                _hooks[hook.SdkId] = hook;
            }
        }

        public static void ExecuteCleanup(string sdkId)
        {
            if (string.IsNullOrEmpty(sdkId)) return;

            if (_hooks.TryGetValue(sdkId, out var hook))
            {
                try
                {
                    hook.ExecuteCleanup();
                }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[SDKHub] Cleanup hook for '{sdkId}' threw an exception: {ex.Message}");
                }
            }
        }

        public static string[] GetFallbackPaths(string sdkId)
        {
            if (string.IsNullOrEmpty(sdkId)) return Array.Empty<string>();

            if (_fallbackPaths.TryGetValue(sdkId, out var paths))
            {
                return paths;
            }

            return Array.Empty<string>();
        }
    }
}
