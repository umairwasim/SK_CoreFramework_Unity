/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.Networking;
using UnityEditor;
using UnityEditor.Build;

namespace SKC.Editor.SDKHub
{
    /// <summary>
    /// Handles downloading, importing, uninstalling, and scripting define symbol toggling
    /// for modular SDKs in the SKC Framework SDK Hub.
    /// </summary>
    public static class SDKPackageInstaller
    {
        public const string InteractiveImportPrefKey = "SKC_SDKHub_InteractiveImport";

        public static bool InteractiveImport
        {
            get => EditorPrefs.GetBool(InteractiveImportPrefKey, true);
            set => EditorPrefs.SetBool(InteractiveImportPrefKey, value);
        }

        public static bool IsInstalled(SDKItem item)
        {
            if (item == null) return false;

            // Check if folder / file exists in project
            if (!string.IsNullOrEmpty(item.detectionPath))
            {
                return Directory.Exists(item.detectionPath) || File.Exists(item.detectionPath);
            }

            // Only fallback to define symbol if detectionPath is not configured
            if (!string.IsNullOrEmpty(item.scriptingDefineSymbol))
            {
                return HasDefineSymbol(item.scriptingDefineSymbol);
            }

            return false;
        }

        public static bool HasDefineSymbol(string symbol)
        {
            if (string.IsNullOrEmpty(symbol)) return false;

            var targets = new HashSet<BuildTargetGroup>
            {
                EditorUserBuildSettings.selectedBuildTargetGroup,
                BuildPipeline.GetBuildTargetGroup(EditorUserBuildSettings.activeBuildTarget),
                BuildTargetGroup.Android,
                BuildTargetGroup.iOS,
                BuildTargetGroup.Standalone
            };

            foreach (var group in targets)
            {
                if (group == BuildTargetGroup.Unknown) continue;
                try
                {
                    var namedTarget = NamedBuildTarget.FromBuildTargetGroup(group);
                    string defines = PlayerSettings.GetScriptingDefineSymbols(namedTarget);
                    var list = defines.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries);
                    foreach (var d in list)
                    {
                        if (d.Trim() == symbol) return true;
                    }
                }
                catch { }
            }

            return false;
        }

        public static void SetDefineSymbol(string symbol, bool enable)
        {
            if (string.IsNullOrEmpty(symbol)) return;

            var targetsToUpdate = new HashSet<BuildTargetGroup>
            {
                EditorUserBuildSettings.selectedBuildTargetGroup,
                BuildPipeline.GetBuildTargetGroup(EditorUserBuildSettings.activeBuildTarget),
                BuildTargetGroup.Android,
                BuildTargetGroup.iOS,
                BuildTargetGroup.Standalone
            };

            bool anyChanged = false;
            foreach (var group in targetsToUpdate)
            {
                if (group == BuildTargetGroup.Unknown) continue;
                try
                {
                    var namedTarget = NamedBuildTarget.FromBuildTargetGroup(group);
                    string defines = PlayerSettings.GetScriptingDefineSymbols(namedTarget);
                    var list = new List<string>(defines.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries));

                    bool changed = false;
                    if (enable)
                    {
                        if (!list.Contains(symbol))
                        {
                            list.Add(symbol);
                            changed = true;
                        }
                    }
                    else
                    {
                        if (list.RemoveAll(s => s.Trim() == symbol) > 0)
                        {
                            changed = true;
                        }
                    }

                    if (changed)
                    {
                        string newDefines = string.Join(";", list);
                        PlayerSettings.SetScriptingDefineSymbols(namedTarget, newDefines);
                        anyChanged = true;
                    }
                }
                catch { }
            }

            if (anyChanged)
            {
                AssetDatabase.SaveAssets();
                string sign = enable ? "+" : "-";
                Debug.Log($"[SDKHub] Scripting Define Symbol '{sign}{symbol}' updated across build targets.");

                try
                {
                    var catalog = SKCPackageExporter.GetPackageCatalog();
                    var active = catalog.Where(p => HasDefineSymbol(p.DefineSymbol)).ToList();
                    SKCPackageExporter.SyncRspDefinesWithActivePackages(active);
                }
                catch { }
            }
        }

        public static void ToggleDefineSymbol(SDKItem item)
        {
            if (item == null || string.IsNullOrEmpty(item.scriptingDefineSymbol)) return;

            bool current = HasDefineSymbol(item.scriptingDefineSymbol);
            SetDefineSymbol(item.scriptingDefineSymbol, !current);
        }

        public static void DownloadAndInstall(SDKItem item, Action onDone = null)
        {
            if (item == null) return;

            // 1. UPM Package
            if (!string.IsNullOrEmpty(item.downloadUrl) && item.downloadUrl.StartsWith("com."))
            {
                Debug.Log($"[SDKHub] Adding UPM package: {item.downloadUrl}...");
                UnityEditor.PackageManager.Client.Add(item.downloadUrl);

                if (!string.IsNullOrEmpty(item.scriptingDefineSymbol))
                {
                    SetDefineSymbol(item.scriptingDefineSymbol, true);
                }

                onDone?.Invoke();
                return;
            }

            // 2. Direct .unitypackage download
            if (!string.IsNullOrEmpty(item.downloadUrl) &&
                (item.downloadUrl.EndsWith(".unitypackage", StringComparison.OrdinalIgnoreCase) ||
                 item.downloadUrl.Contains(".unitypackage?")))
            {
                DownloadAndImportUnityPackage(item, onDone);
                return;
            }

            // 3. Web portal / GitHub releases page link
            if (!string.IsNullOrEmpty(item.downloadUrl) &&
                (item.downloadUrl.StartsWith("http://") || item.downloadUrl.StartsWith("https://")))
            {
                bool open = EditorUtility.DisplayDialog(
                    $"Download {item.name}",
                    $"The download link for {item.name} points to an external release portal or repository.\n\n" +
                    $"Would you like to open it in your browser?\n\nURL: {item.downloadUrl}",
                    "Open Browser",
                    "Cancel"
                );

                if (open)
                {
                    Application.OpenURL(item.downloadUrl);
                }
                return;
            }

            EditorUtility.DisplayDialog("SDK Hub", $"No valid download URL configured for {item.name}.", "OK");
        }

        private static void DownloadAndImportUnityPackage(SDKItem item, Action onDone)
        {
            string tempDir = Application.temporaryCachePath;
            string tempPath = Path.Combine(tempDir, $"{item.id}_{item.version}.unitypackage");

            var request = UnityWebRequest.Get(item.downloadUrl);
            request.downloadHandler = new DownloadHandlerFile(tempPath);
            var asyncOp = request.SendWebRequest();

            EditorUtility.DisplayProgressBar($"Downloading {item.name}", "Connecting...", 0f);

            EditorApplication.CallbackFunction updateCallback = null;
            updateCallback = () =>
            {
                if (!asyncOp.isDone)
                {
                    EditorUtility.DisplayProgressBar(
                        $"Downloading {item.name}",
                        $"Downloading package ({asyncOp.progress * 100:F0}%)...",
                        asyncOp.progress
                    );
                    return;
                }

                EditorApplication.update -= updateCallback;
                EditorUtility.ClearProgressBar();

                if (request.result == UnityWebRequest.Result.Success)
                {
                    Debug.Log($"[SDKHub] Successfully downloaded {item.name} to {tempPath}. Parsing package manifest...");

                    // 1. Read all paths from unitypackage archive and save receipt
                    var paths = SDKPackageReceiptManager.ReadPathsFromUnityPackage(tempPath);
                    if (paths.Count > 0)
                    {
                        SDKPackageReceiptManager.SaveReceipt(item.id, item.version, paths);
                    }

                    Debug.Log($"[SDKHub] Starting package import for {item.name} ({paths.Count} files recorded in receipt)...");
                    AssetDatabase.ImportPackage(tempPath, InteractiveImport);

                    if (!string.IsNullOrEmpty(item.scriptingDefineSymbol))
                    {
                        SetDefineSymbol(item.scriptingDefineSymbol, true);
                    }

                    onDone?.Invoke();
                }
                else
                {
                    EditorUtility.DisplayDialog("Download Error", $"Failed to download {item.name}: {request.error}", "OK");
                    Debug.LogError($"[SDKHub] Failed to download {item.name}: {request.error}");
                }

                request.Dispose();
            };

            EditorApplication.update += updateCallback;
        }

        public static void Uninstall(SDKItem item, Action onDone = null)
        {
            if (item == null) return;

            bool confirm = EditorUtility.DisplayDialog(
                $"Clean Uninstall {item.name}",
                $"Are you sure you want to completely remove {item.name}?\n\n" +
                $"This will perform a 100% clean uninstallation:\n" +
                $"• All installed files & directories\n" +
                $"• Associated configuration & settings assets\n" +
                $"• Revert any template / Gradle modifications\n" +
                $"• Remove Scripting Define: {item.scriptingDefineSymbol}",
                "Yes, Clean Uninstall",
                "Cancel"
            );

            if (!confirm) return;

            EditorUtility.DisplayProgressBar("Uninstalling SDK", $"Cleaning {item.name}...", 0.2f);

            try
            {
                var pathsToDelete = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                // 1. Collect paths from Install Receipt if present
                var receipt = SDKPackageReceiptManager.LoadReceipt(item.id);
                if (receipt != null && receipt.installedPaths != null)
                {
                    foreach (var p in receipt.installedPaths)
                    {
                        if (!string.IsNullOrEmpty(p)) pathsToDelete.Add(p.Trim());
                    }
                }

                // 2. Collect detection path
                if (!string.IsNullOrEmpty(item.detectionPath))
                {
                    pathsToDelete.Add(item.detectionPath.Trim());
                }

                // 3. Collect curated fallback paths
                var fallbacks = SDKCleanupRegistry.GetFallbackPaths(item.id);
                foreach (var f in fallbacks)
                {
                    if (!string.IsNullOrEmpty(f)) pathsToDelete.Add(f.Trim());
                }

                // 4. Delete UPM package if applicable
                if (!string.IsNullOrEmpty(item.detectionPath) && item.detectionPath.StartsWith("Packages/"))
                {
                    string packageId = Path.GetFileName(item.detectionPath);
                    UnityEditor.PackageManager.Client.Remove(packageId);
                    Debug.Log($"[SDKHub] Requested removal of UPM package: {packageId}");
                }

                // 5. Delete all collected paths (files and directories)
                var sortedPaths = new List<string>(pathsToDelete);
                sortedPaths.Sort((a, b) => b.Length.CompareTo(a.Length));

                int deletedCount = 0;
                foreach (var relativePath in sortedPaths)
                {
                    if (string.IsNullOrEmpty(relativePath) || !SDKPackageReceiptManager.IsValidAssetPath(relativePath))
                        continue;

                    // Safety guard: Never delete root folders
                    if (relativePath == "Assets" || relativePath == "ProjectSettings" || relativePath == "Packages")
                        continue;

                    try
                    {
                        if (File.Exists(relativePath) || Directory.Exists(relativePath))
                        {
                            AssetDatabase.DeleteAsset(relativePath);
                            deletedCount++;
                        }
                    }
                    catch (Exception ex)
                    {
                        Debug.LogWarning($"[SDKHub] Error deleting asset '{relativePath}': {ex.Message}");
                    }
                }

                // 6. Execute specialized cleanup hook (e.g. EDM4U gradle cleaner, ByteBrew settings, GA resources)
                try
                {
                    SDKCleanupRegistry.ExecuteCleanup(item.id);
                }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[SDKHub] Error executing cleanup hook for {item.id}: {ex.Message}");
                }

                // 7. Clean up empty parent directories left behind
                try
                {
                    CleanEmptyParentDirectories(sortedPaths);
                }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[SDKHub] Error cleaning parent directories: {ex.Message}");
                }

                // 8. Delete receipt
                SDKPackageReceiptManager.DeleteReceipt(item.id);

                // 9. Remove Scripting Define Symbol across all targets
                if (!string.IsNullOrEmpty(item.scriptingDefineSymbol))
                {
                    SetDefineSymbol(item.scriptingDefineSymbol, false);
                }

                Debug.Log($"[SDKHub] Clean uninstallation of {item.name} completed successfully ({deletedCount} assets removed).");
            }
            finally
            {
                EditorUtility.ClearProgressBar();
                AssetDatabase.Refresh();
                onDone?.Invoke();
            }
        }

        private static void CleanEmptyParentDirectories(IEnumerable<string> paths)
        {
            var checkedDirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var path in paths)
            {
                if (string.IsNullOrEmpty(path) || !SDKPackageReceiptManager.IsValidAssetPath(path))
                    continue;

                try
                {
                    string dir = Path.GetDirectoryName(path)?.Replace("\\", "/");
                    while (!string.IsNullOrEmpty(dir) && dir != "Assets" && dir != "Packages" && dir != "ProjectSettings" && dir != "." && !checkedDirs.Contains(dir))
                    {
                        checkedDirs.Add(dir);
                        if (Directory.Exists(dir))
                        {
                            var entries = Directory.GetFileSystemEntries(dir);
                            if (entries.Length == 0)
                            {
                                AssetDatabase.DeleteAsset(dir);
                                Debug.Log($"[SDKHub] Removed empty folder: {dir}");
                            }
                        }
                        dir = Path.GetDirectoryName(dir)?.Replace("\\", "/");
                    }
                }
                catch
                {
                    // Ignore path parsing errors
                }
            }
        }

        public static void OpenDocumentation(SDKItem item)
        {
            if (item != null && !string.IsNullOrEmpty(item.documentationUrl))
            {
                Application.OpenURL(item.documentationUrl);
            }
        }

        public static List<string> GetOrphanDefines(SDKHubManifestData manifest = null)
        {
            var orphans = new List<string>();
            if (manifest == null)
            {
                manifest = SDKHubClient.GetCurrentManifest();
            }
            if (manifest?.items == null) return orphans;

            foreach (var item in manifest.items)
            {
                if (string.IsNullOrEmpty(item.scriptingDefineSymbol)) continue;
                if (HasDefineSymbol(item.scriptingDefineSymbol) && !IsInstalled(item))
                {
                    if (!orphans.Contains(item.scriptingDefineSymbol))
                        orphans.Add(item.scriptingDefineSymbol);
                }
            }
            return orphans;
        }

        public static void ClearOrphanDefines(SDKHubManifestData manifest = null)
        {
            var orphans = GetOrphanDefines(manifest);
            foreach (var sym in orphans)
            {
                SetDefineSymbol(sym, false);
            }
        }
    }
}
