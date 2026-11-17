/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using UnityEditor;
using UnityEngine;
using SKC.Editor.Assembly;

namespace SKC.Editor.SDKHub
{
    /// <summary>
    /// Master Package Exporter and Catalog Manager for SKCFramework.
    /// Packages all 17 framework modules into clean, standalone .unitypackage files
    /// and generates packages_manifest.json for the Package Hub.
    /// </summary>
    public static class SKCPackageExporter
    {
        public const string DefaultExportFolder = "Builds/SKCPackages";
        public const string EmbeddedManifestPath = "Assets/Resources/SKCPackagesManifest.json";

        [Serializable]
        public class PackageManifest
        {
            [JsonProperty("schemaVersion")]
            public string SchemaVersion { get; set; } = "1.0.0";

            [JsonProperty("updatedAt")]
            public string UpdatedAt { get; set; } = DateTime.UtcNow.ToString("o");

            [JsonProperty("packages")]
            public List<PackageInfo> Packages { get; set; } = new List<PackageInfo>();
        }

        [Serializable]
        public class PackageInfo
        {
            [JsonProperty("id")]
            public string Id { get; set; }

            [JsonProperty("name")]
            public string Name { get; set; }

            [JsonProperty("version")]
            public string Version { get; set; } = "1.0.0";

            [JsonProperty("category")]
            public string Category { get; set; } = "Core";

            [JsonProperty("description")]
            public string Description { get; set; }

            [JsonProperty("defineSymbol")]
            public string DefineSymbol { get; set; }

            [JsonProperty("dependencies")]
            public List<string> Dependencies { get; set; } = new List<string>();

            [JsonProperty("assetPaths")]
            public List<string> AssetPaths { get; set; } = new List<string>();

            [JsonProperty("fileName")]
            public string FileName { get; set; }

            [JsonProperty("isCore")]
            public bool IsCore { get; set; } = false;

            [JsonProperty("asmdefName")]
            public string AsmdefName { get; set; }

            [JsonProperty("fileSizeBytes")]
            public long FileSizeBytes { get; set; }

            [JsonProperty("downloadUrl")]
            public string DownloadUrl { get; set; } = "";
        }

        /// <summary>
        /// Complete catalog of all 17 SKC modular packages.
        /// </summary>
        public static List<PackageInfo> GetPackageCatalog()
        {
            var catalog = new List<PackageInfo>
            {
                new PackageInfo
                {
                    Id = "skc.core",
                    Name = "SKC Core Foundation",
                    Version = "1.0.0",
                    Category = "Core",
                    Description = "Service Locator (SKCore), Segmented SaveData, Event Bus, Logging, and ASMDEF Orchestration.",
                    DefineSymbol = "",
                    IsCore = true,
                    AsmdefName = "SKC.Core",
                    FileName = "SKC.Core.unitypackage",
                    Dependencies = new List<string>(),
                    AssetPaths = new List<string>
                    {
                        "Assets/Plugins/SKCFramework/_Scripts/Boot",
                        "Assets/Plugins/SKCFramework/_Scripts/SaveSystem",
                        "Assets/Plugins/SKCFramework/_Scripts/Events",
                        "Assets/Plugins/SKCFramework/_Scripts/Logging",
                        "Assets/Plugins/SKCFramework/_Scripts/Constant",
                        "Assets/Plugins/SKCFramework/_Scripts/Helpers",
                        "Assets/Plugins/SKCFramework/_Scripts/Singleton Pattern",
                        "Assets/Plugins/SKCFramework/_Scripts/Text",
                        "Assets/Plugins/SKCFramework/_Scripts/Utils",
                        "Assets/Plugins/SKCFramework/_Scripts/Editor",
                        "Assets/Plugins/SKCFramework/_Scripts/SKC.Framework.asmdef",
                        "Assets/Resources/LogSettings.asset",
                        "Assets/Resources/SKCoreServiceSettings.asset"
                    }
                },
                new PackageInfo
                {
                    Id = "skc.economy",
                    Name = "SKC Economy & Currencies",
                    Version = "1.0.0",
                    Category = "Economy",
                    Description = "Multi-currency wallet, safe arithmetic transactions, and UI Fly token visual effects.",
                    DefineSymbol = "SKC_HAS_ECONOMY",
                    AsmdefName = "SKC.Economy",
                    FileName = "SKC.Economy.unitypackage",
                    Dependencies = new List<string> { "skc.core" },
                    AssetPaths = new List<string>
                    {
                        "Assets/Plugins/SKCFramework/_Scripts/Economy",
                        "Assets/Resources/CurrencySettings.asset"
                    }
                },
                new PackageInfo
                {
                    Id = "skc.dailyrewards",
                    Name = "SKC Daily Rewards & Retention",
                    Version = "1.0.0",
                    Category = "Retention",
                    Description = "7-day cycle retention calendars, streak tracking, and time-travel simulation tools.",
                    DefineSymbol = "SKC_HAS_DAILY_REWARDS",
                    AsmdefName = "SKC.DailyRewards",
                    FileName = "SKC.DailyRewards.unitypackage",
                    Dependencies = new List<string> { "skc.core", "skc.economy", "skc.ui" },
                    AssetPaths = new List<string>
                    {
                        "Assets/Plugins/SKCFramework/_Scripts/DailyRewards",
                        "Assets/Resources/DailyRewardSettings.asset"
                    }
                },
                new PackageInfo
                {
                    Id = "skc.levels",
                    Name = "SKC Level Progression",
                    Version = "1.0.0",
                    Category = "Gameplay",
                    Description = "Dynamic level loading, looping rules, prefab caching, and outcome flow management.",
                    DefineSymbol = "SKC_HAS_LEVELS",
                    AsmdefName = "SKC.Levels",
                    FileName = "SKC.Levels.unitypackage",
                    Dependencies = new List<string> { "skc.core" },
                    AssetPaths = new List<string>
                    {
                        "Assets/Plugins/SKCFramework/_Scripts/Levels",
                        "Assets/Resources/LevelSettings.asset"
                    }
                },
                new PackageInfo
                {
                    Id = "skc.audio",
                    Name = "SKC Sound & Music Manager",
                    Version = "1.0.0",
                    Category = "Audio",
                    Description = "BGM cross-fading, 3D SFX playback, pooling integration, and runtime volume controls.",
                    DefineSymbol = "SKC_HAS_AUDIO",
                    AsmdefName = "SKC.Audio",
                    FileName = "SKC.Audio.unitypackage",
                    Dependencies = new List<string> { "skc.core" },
                    AssetPaths = new List<string>
                    {
                        "Assets/Plugins/SKCFramework/_Scripts/SoundManager",
                        "Assets/Plugins/SKCFramework/_Scripts/SOs/SoundData.cs",
                        "Assets/Resources/Sounds.asset"
                    }
                },
                new PackageInfo
                {
                    Id = "skc.haptics",
                    Name = "SKC Haptic Feedback",
                    Version = "1.0.0",
                    Category = "Feedback",
                    Description = "Cross-platform mobile haptics with iOS Taptic Engine & Android vibration fallbacks.",
                    DefineSymbol = "SKC_HAS_HAPTICS",
                    AsmdefName = "SKC.Haptics",
                    FileName = "SKC.Haptics.unitypackage",
                    Dependencies = new List<string> { "skc.core" },
                    AssetPaths = new List<string>
                    {
                        "Assets/Plugins/SKCFramework/_Scripts/Haptics"
                    }
                },
                new PackageInfo
                {
                    Id = "skc.pooling",
                    Name = "SKC Object Pooling",
                    Version = "1.0.0",
                    Category = "System",
                    Description = "Zero-GC GameObject pooling system with auto-expanding pools and warmup pre-allocation.",
                    DefineSymbol = "SKC_HAS_POOLING",
                    AsmdefName = "SKC.Pooling",
                    FileName = "SKC.Pooling.unitypackage",
                    Dependencies = new List<string> { "skc.core" },
                    AssetPaths = new List<string>
                    {
                        "Assets/Plugins/SKCFramework/_Scripts/Pooling",
                        "Assets/Resources/PoolList.asset"
                    }
                },
                new PackageInfo
                {
                    Id = "skc.transitions",
                    Name = "SKC Screen Transitions",
                    Version = "1.0.0",
                    Category = "UI",
                    Description = "Async scene and UI fades, curtains, and DOTween overlay animation sequences.",
                    DefineSymbol = "SKC_HAS_TRANSITIONS",
                    AsmdefName = "SKC.Transitions",
                    FileName = "SKC.Transitions.unitypackage",
                    Dependencies = new List<string> { "skc.core" },
                    AssetPaths = new List<string>
                    {
                        "Assets/Plugins/SKCFramework/_Scripts/Transitions"
                    }
                },
                new PackageInfo
                {
                    Id = "skc.ui",
                    Name = "SKC UI & Popups",
                    Version = "1.0.0",
                    Category = "UI",
                    Description = "Popup queue manager, view transitions, responsive layout adapters, and toast overlays.",
                    DefineSymbol = "SKC_HAS_UI",
                    AsmdefName = "SKC.UI",
                    FileName = "SKC.UI.unitypackage",
                    Dependencies = new List<string> { "skc.core" },
                    AssetPaths = new List<string>
                    {
                        "Assets/Plugins/SKCFramework/_Scripts/UI",
                        "Assets/Resources/UIData.asset"
                    }
                },
                new PackageInfo
                {
                    Id = "skc.inputs",
                    Name = "SKC Input Service",
                    Version = "1.0.0",
                    Category = "Input",
                    Description = "Unity New Input System abstraction with gesture detection and pointer event dispatching.",
                    DefineSymbol = "SKC_HAS_INPUTS",
                    AsmdefName = "SKC.Inputs",
                    FileName = "SKC.Inputs.unitypackage",
                    Dependencies = new List<string> { "skc.core" },
                    AssetPaths = new List<string>
                    {
                        "Assets/Plugins/SKCFramework/_Scripts/InputService"
                    }
                },
                new PackageInfo
                {
                    Id = "skc.ads",
                    Name = "SKC Ads Mediation",
                    Version = "1.0.0",
                    Category = "Monetization",
                    Description = "Mediation interfaces for Rewarded, Interstitial, and Banner ads with dummy simulation.",
                    DefineSymbol = "SKC_HAS_ADS",
                    AsmdefName = "SKC.Ads",
                    FileName = "SKC.Ads.unitypackage",
                    Dependencies = new List<string> { "skc.core" },
                    AssetPaths = new List<string>
                    {
                        "Assets/Plugins/SKCFramework/_Scripts/Ads"
                    }
                },
                new PackageInfo
                {
                    Id = "skc.analytics",
                    Name = "SKC Analytics Hub",
                    Version = "1.0.0",
                    Category = "Analytics",
                    Description = "Composite multi-provider analytics dispatcher for GameAnalytics, Firebase, and ByteBrew.",
                    DefineSymbol = "SKC_HAS_ANALYTICS",
                    AsmdefName = "SKC.Analytics",
                    FileName = "SKC.Analytics.unitypackage",
                    Dependencies = new List<string> { "skc.core" },
                    AssetPaths = new List<string>
                    {
                        "Assets/Plugins/SKCFramework/_Scripts/Analytics"
                    }
                },
                new PackageInfo
                {
                    Id = "skc.iap",
                    Name = "SKC In-App Purchasing & No-Ads",
                    Version = "1.0.0",
                    Category = "Monetization",
                    Description = "One-click No-Ads automation, entitlement restoration, and store receipt verification.",
                    DefineSymbol = "SKC_HAS_IAP",
                    AsmdefName = "SKC.IAP",
                    FileName = "SKC.IAP.unitypackage",
                    Dependencies = new List<string> { "skc.core" },
                    AssetPaths = new List<string>
                    {
                        "Assets/Plugins/SKCFramework/_Scripts/IAP"
                    }
                },
                new PackageInfo
                {
                    Id = "skc.privacy",
                    Name = "SKC Privacy & Consent (ATT / UMP)",
                    Version = "1.0.0",
                    Category = "Compliance",
                    Description = "Apple ATT and Google UMP/GDPR compliance workflows with automated dialog orchestration.",
                    DefineSymbol = "SKC_HAS_PRIVACY",
                    AsmdefName = "SKC.Privacy",
                    FileName = "SKC.Privacy.unitypackage",
                    Dependencies = new List<string> { "skc.core" },
                    AssetPaths = new List<string>
                    {
                        "Assets/Plugins/SKCFramework/_Scripts/Privacy"
                    }
                },
                new PackageInfo
                {
                    Id = "skc.review",
                    Name = "SKC In-App Review Prompt",
                    Version = "1.0.0",
                    Category = "Retention",
                    Description = "Google Play In-App Review & Apple SKStoreReviewController smart milestone triggers.",
                    DefineSymbol = "SKC_HAS_REVIEW",
                    AsmdefName = "SKC.Review",
                    FileName = "SKC.Review.unitypackage",
                    Dependencies = new List<string> { "skc.core" },
                    AssetPaths = new List<string>
                    {
                        "Assets/Plugins/SKCFramework/_Scripts/Review"
                    }
                },
                new PackageInfo
                {
                    Id = "skc.notifications",
                    Name = "SKC Local Retention Notifications",
                    Version = "1.0.0",
                    Category = "Retention",
                    Description = "Daily retention nudge reminders, streak protection alerts, and energy refills.",
                    DefineSymbol = "SKC_HAS_NOTIFICATIONS",
                    AsmdefName = "SKC.Notifications",
                    FileName = "SKC.Notifications.unitypackage",
                    Dependencies = new List<string> { "skc.core" },
                    AssetPaths = new List<string>
                    {
                        "Assets/Plugins/SKCFramework/_Scripts/Notifications"
                    }
                },
                new PackageInfo
                {
                    Id = "skc.telemetry",
                    Name = "SKC Telemetry & Funnels",
                    Version = "1.0.0",
                    Category = "Analytics",
                    Description = "Automated level duration, lag spike counter, and low-FPS funnel telemetry tracking.",
                    DefineSymbol = "SKC_HAS_TELEMETRY",
                    AsmdefName = "SKC.Telemetry",
                    FileName = "SKC.Telemetry.unitypackage",
                    Dependencies = new List<string> { "skc.core" },
                    AssetPaths = new List<string>
                    {
                        "Assets/Plugins/SKCFramework/_Scripts/Telemetry"
                    }
                }
            };

            foreach (var p in catalog)
            {
                if (string.IsNullOrEmpty(p.DownloadUrl) && !string.IsNullOrEmpty(p.FileName))
                {
                    p.DownloadUrl = $"https://github.com/SemihKC94/skc-unity-plugins/releases/download/v1.0.0/{p.FileName}";
                }
            }

            return catalog;
        }

        [MenuItem("SKCore/Packages/Export All 17 Packages", priority = 200)]
        public static void ExportAllPackagesMenu()
        {
            ExportAllPackages(DefaultExportFolder);
        }

        /// <summary>
        /// Exports all packages into the specified destination folder and generates packages_manifest.json.
        /// </summary>
        public static PackageManifest ExportAllPackages(string outputDirectory = DefaultExportFolder)
        {
            if (!Directory.Exists(outputDirectory))
            {
                Directory.CreateDirectory(outputDirectory);
            }

            var catalog = GetPackageCatalog();
            var manifest = new PackageManifest
            {
                SchemaVersion = "1.0.0",
                UpdatedAt = DateTime.UtcNow.ToString("o"),
                Packages = new List<PackageInfo>()
            };

            int successCount = 0;

            foreach (var pkg in catalog)
            {
                string targetFile = Path.Combine(outputDirectory, pkg.FileName).Replace('\\', '/');
                bool success = ExportPackage(pkg, targetFile);

                if (success && File.Exists(targetFile))
                {
                    pkg.FileSizeBytes = new FileInfo(targetFile).Length;
                    manifest.Packages.Add(pkg);
                    successCount++;
                }
                else
                {
                    Debug.LogWarning($"[SKCPackageExporter] Skipped or failed package: {pkg.Name}");
                }
            }

            // Write manifest to output directory
            string manifestJson = JsonConvert.SerializeObject(manifest, Formatting.Indented);
            string manifestPath = Path.Combine(outputDirectory, "packages_manifest.json").Replace('\\', '/');
            File.WriteAllText(manifestPath, manifestJson);

            // Also save embedded copy for offline Control Center access
            string resDir = Path.GetDirectoryName(EmbeddedManifestPath);
            if (!string.IsNullOrEmpty(resDir) && !Directory.Exists(resDir))
            {
                Directory.CreateDirectory(resDir);
            }
            File.WriteAllText(EmbeddedManifestPath, manifestJson);

            AssetDatabase.Refresh();
            Debug.Log($"[SKCPackageExporter] Successfully exported {successCount}/{catalog.Count} packages to '{outputDirectory}'. Manifest generated.");
            return manifest;
        }

        /// <summary>
        /// Exports a single package definition to a .unitypackage file.
        /// </summary>
        public static bool ExportPackage(PackageInfo pkg, string destinationPath)
        {
            if (pkg == null || pkg.AssetPaths == null || pkg.AssetPaths.Count == 0)
            {
                Debug.LogWarning($"[SKCPackageExporter] Invalid package info for export: {pkg?.Name}");
                return false;
            }

            // Filter for assets that actually exist
            List<string> existingAssets = new List<string>();
            foreach (var path in pkg.AssetPaths)
            {
                if (File.Exists(path) || Directory.Exists(path))
                {
                    existingAssets.Add(path);
                }
            }

            if (existingAssets.Count == 0)
            {
                Debug.LogWarning($"[SKCPackageExporter] No assets found on disk for package '{pkg.Name}'.");
                return false;
            }

            try
            {
                string dir = Path.GetDirectoryName(destinationPath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                AssetDatabase.ExportPackage(
                    existingAssets.ToArray(),
                    destinationPath,
                    ExportPackageOptions.Recurse
                );

                Debug.Log($"[SKCPackageExporter] Exported '{pkg.Name}' -> {destinationPath}");
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[SKCPackageExporter] Failed to export package '{pkg.Name}': {ex.Message}");
                return false;
            }
        }

        #region Scanning & File Presence Engine

        /// <summary>
        /// Checks whether the package assets physically exist on disk in the project.
        /// </summary>
        public static bool IsPackageFilesPresent(PackageInfo pkg)
        {
            if (pkg == null) return false;
            if (pkg.IsCore) return true;
            if (pkg.AssetPaths == null || pkg.AssetPaths.Count == 0) return false;

            foreach (var path in pkg.AssetPaths)
            {
                if (Directory.Exists(path) || File.Exists(path))
                {
                    return true;
                }
            }
            return false;
        }

        /// <summary>
        /// Checks whether the package is both present on disk and has its define symbol active in PlayerSettings.
        /// </summary>
        public static bool IsPackageActive(PackageInfo pkg)
        {
            if (pkg == null) return false;
            if (pkg.IsCore) return true;
            return IsPackageFilesPresent(pkg) && !string.IsNullOrEmpty(pkg.DefineSymbol) && SDKPackageInstaller.HasDefineSymbol(pkg.DefineSymbol);
        }

        public class ScanResult
        {
            public int TotalScanned { get; set; }
            public List<PackageInfo> InstalledPackages { get; set; } = new List<PackageInfo>();
            public List<PackageInfo> MissingPackages { get; set; } = new List<PackageInfo>();
            public List<string> AddedDefines { get; set; } = new List<string>();
            public List<string> RemovedDefines { get; set; } = new List<string>();
        }

        /// <summary>
        /// Scans the project disk for all 17 SKC packages, synchronizes PlayerSettings defines,
        /// synchronizes compiler .rsp response files, and updates packages_manifest.json.
        /// </summary>
        public static ScanResult ScanAllPackages()
        {
            var catalog = GetPackageCatalog();
            var result = new ScanResult { TotalScanned = catalog.Count };

            foreach (var pkg in catalog)
            {
                bool present = IsPackageFilesPresent(pkg);
                if (present)
                {
                    result.InstalledPackages.Add(pkg);
                    if (!string.IsNullOrEmpty(pkg.DefineSymbol) && !SDKPackageInstaller.HasDefineSymbol(pkg.DefineSymbol))
                    {
                        SDKPackageInstaller.SetDefineSymbol(pkg.DefineSymbol, true);
                        result.AddedDefines.Add(pkg.DefineSymbol);
                    }
                }
                else
                {
                    result.MissingPackages.Add(pkg);
                    if (!string.IsNullOrEmpty(pkg.DefineSymbol) && SDKPackageInstaller.HasDefineSymbol(pkg.DefineSymbol))
                    {
                        SDKPackageInstaller.SetDefineSymbol(pkg.DefineSymbol, false);
                        result.RemovedDefines.Add(pkg.DefineSymbol);
                    }
                }
            }

            // Synchronize .rsp response files
            SyncRspDefinesWithActivePackages(result.InstalledPackages);

            // Rebuild manifest
            RebuildManifestFromCurrentState(catalog);

            AssetDatabase.SaveAssets();
            Debug.Log($"[SKCPackageExporter] Scan complete: {result.InstalledPackages.Count}/{result.TotalScanned} installed.");
            return result;
        }

        /// <summary>
        /// Writes compiler .rsp files so Roslyn includes defines for all installed packages.
        /// </summary>
        public static void SyncRspDefinesWithActivePackages(List<PackageInfo> installedPackages)
        {
            try
            {
                var lines = new List<string>();
                foreach (var pkg in installedPackages)
                {
                    if (!string.IsNullOrEmpty(pkg.DefineSymbol))
                    {
                        lines.Add($"-define:{pkg.DefineSymbol}");
                    }
                }

                string rspContent = string.Join("\n", lines) + "\n";

                string[] rspPaths = new string[]
                {
                    "Assets/csc.rsp",
                    "Assets/Plugins/SKCFramework/SKC.Framework.rsp",
                    "Assets/Plugins/SKCFramework/_Scripts/SKC.Framework.rsp",
                    "Assets/Plugins/SKCFramework/_Scripts/Editor/SKC.Framework.Editor.rsp"
                };

                foreach (var p in rspPaths)
                {
                    string dir = Path.GetDirectoryName(p);
                    if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                    {
                        Directory.CreateDirectory(dir);
                    }
                    File.WriteAllText(p, rspContent);
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[SKCPackageExporter] Failed to sync .rsp files: {ex.Message}");
            }
        }

        /// <summary>
        /// Regenerates packages_manifest.json reflecting current disk and export status.
        /// </summary>
        public static void RebuildManifestFromCurrentState(List<PackageInfo> catalog)
        {
            try
            {
                var manifest = new PackageManifest
                {
                    SchemaVersion = "1.0.0",
                    UpdatedAt = DateTime.UtcNow.ToString("o"),
                    Packages = new List<PackageInfo>()
                };

                foreach (var pkg in catalog)
                {
                    string targetFile = Path.Combine(DefaultExportFolder, pkg.FileName).Replace('\\', '/');
                    if (File.Exists(targetFile))
                    {
                        pkg.FileSizeBytes = new FileInfo(targetFile).Length;
                    }
                    manifest.Packages.Add(pkg);
                }

                string manifestJson = JsonConvert.SerializeObject(manifest, Formatting.Indented);
                string manifestPath = Path.Combine(DefaultExportFolder, "packages_manifest.json").Replace('\\', '/');
                if (Directory.Exists(DefaultExportFolder))
                {
                    File.WriteAllText(manifestPath, manifestJson);
                }

                string resDir = Path.GetDirectoryName(EmbeddedManifestPath);
                if (!string.IsNullOrEmpty(resDir) && !Directory.Exists(resDir))
                {
                    Directory.CreateDirectory(resDir);
                }
                File.WriteAllText(EmbeddedManifestPath, manifestJson);
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[SKCPackageExporter] Failed to rebuild manifest: {ex.Message}");
            }
        }

        #endregion
    }
}
