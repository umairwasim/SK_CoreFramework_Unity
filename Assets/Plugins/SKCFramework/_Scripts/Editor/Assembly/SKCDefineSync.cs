/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEngine;
using SKC.Editor.SDKHub;

namespace SKC.Editor.Assembly
{
    /// <summary>
    /// Automatically ensures that only physically installed SKCFramework modules
    /// have their Scripting Define Symbols enabled in PlayerSettings and compiler .rsp files.
    /// </summary>
    [InitializeOnLoad]
    public static class SKCDefineSync
    {
        static SKCDefineSync()
        {
            EditorApplication.delayCall += EnsureDefines;
        }

        public static void EnsureDefines()
        {
            try
            {
                var catalog = SKCPackageExporter.GetPackageCatalog();
                var installed = catalog.Where(p => SKCPackageExporter.IsPackageFilesPresent(p)).ToList();
                var missing = catalog.Where(p => !SKCPackageExporter.IsPackageFilesPresent(p)).ToList();

                SyncTarget(NamedBuildTarget.Android, installed, missing);
                SyncTarget(NamedBuildTarget.Standalone, installed, missing);
                SyncTarget(NamedBuildTarget.iOS, installed, missing);

                SKCPackageExporter.SyncRspDefinesWithActivePackages(installed);
            }
            catch (Exception ex)
            {
                Debug.LogWarning("[SKCDefineSync] Error syncing defines: " + ex.Message);
            }
        }

        private static void SyncTarget(NamedBuildTarget target, List<SKCPackageExporter.PackageInfo> installed, List<SKCPackageExporter.PackageInfo> missing)
        {
            string current = PlayerSettings.GetScriptingDefineSymbols(target);
            var defines = new HashSet<string>(current.Split(';', StringSplitOptions.RemoveEmptyEntries));

            bool modified = false;

            // Add defines for installed packages
            foreach (var pkg in installed)
            {
                if (!string.IsNullOrEmpty(pkg.DefineSymbol) && defines.Add(pkg.DefineSymbol))
                {
                    modified = true;
                }
            }

            // Remove defines for missing packages
            foreach (var pkg in missing)
            {
                if (!string.IsNullOrEmpty(pkg.DefineSymbol) && defines.Remove(pkg.DefineSymbol))
                {
                    modified = true;
                }
            }

            if (modified)
            {
                string updated = string.Join(";", defines);
                PlayerSettings.SetScriptingDefineSymbols(target, updated);
                Debug.Log("[SKCDefineSync] Dynamically synchronized defines for " + target.TargetName + " based on disk presence.");
            }
        }
    }
}
