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

namespace SKC.Editor.Assembly
{
    /// <summary>
    /// Dynamic Assembly Definition (ASMDEF) Orchestrator for SKCFramework.
    /// Generates, updates, and links modular ASMDEFs using clean name-based references
    /// to ensure zero GUID drift across projects and remote release downloads.
    /// </summary>
    public static class SKCAsmdefManager
    {
        private const string MasterAsmdefPath = "Assets/Plugins/SKCFramework/_Scripts/SKC.Framework.asmdef";
        private const string FrameworkRoot = "Assets/Plugins/SKCFramework/_Scripts";

        [Serializable]
        public class AsmdefDefinition
        {
            [JsonProperty("name")]
            public string Name { get; set; }

            [JsonProperty("rootNamespace")]
            public string RootNamespace { get; set; } = "";

            [JsonProperty("references")]
            public List<string> References { get; set; } = new List<string>();

            [JsonProperty("includePlatforms")]
            public List<string> IncludePlatforms { get; set; } = new List<string>();

            [JsonProperty("excludePlatforms")]
            public List<string> ExcludePlatforms { get; set; } = new List<string>();

            [JsonProperty("allowUnsafeCode")]
            public bool AllowUnsafeCode { get; set; } = false;

            [JsonProperty("overrideReferences")]
            public bool OverrideReferences { get; set; } = false;

            [JsonProperty("precompiledReferences")]
            public List<string> PrecompiledReferences { get; set; } = new List<string>();

            [JsonProperty("autoReferenced")]
            public bool AutoReferenced { get; set; } = true;

            [JsonProperty("defineConstraints")]
            public List<string> DefineConstraints { get; set; } = new List<string>();

            [JsonProperty("versionDefines")]
            public List<string> VersionDefines { get; set; } = new List<string>();

            [JsonProperty("noEngineReferences")]
            public bool NoEngineReferences { get; set; } = false;
        }

        /// <summary>
        /// Creates or updates a module-specific ASMDEF with name-based references.
        /// </summary>
        public static bool CreateOrUpdateModuleAsmdef(string assemblyName, string targetFolder, string[] dependencies, bool isEditor = false)
        {
            if (string.IsNullOrEmpty(assemblyName) || string.IsNullOrEmpty(targetFolder))
            {
                Debug.LogError("[SKCAsmdefManager] Assembly name and target folder must not be empty.");
                return false;
            }

            if (!Directory.Exists(targetFolder))
            {
                Directory.CreateDirectory(targetFolder);
            }

            string asmdefFilePath = Path.Combine(targetFolder, $"{assemblyName}.asmdef").Replace('\\', '/');

            AsmdefDefinition def = new AsmdefDefinition
            {
                Name = assemblyName,
                RootNamespace = "",
                AutoReferenced = true,
                AllowUnsafeCode = false,
                OverrideReferences = false,
                NoEngineReferences = false
            };

            if (isEditor)
            {
                def.IncludePlatforms.Add("Editor");
            }

            // Always add base third-party name-based dependencies
            var refs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (dependencies != null)
            {
                foreach (var dep in dependencies)
                {
                    if (!string.IsNullOrWhiteSpace(dep))
                    {
                        refs.Add(dep.Trim());
                    }
                }
            }

            def.References = refs.ToList();

            string json = JsonConvert.SerializeObject(def, Formatting.Indented);
            File.WriteAllText(asmdefFilePath, json);
            Debug.Log($"[SKCAsmdefManager] Created/Updated ASMDEF: {asmdefFilePath}");
            return true;
        }

        /// <summary>
        /// Scans all SKC assembly definitions and rebuilds references in the master SKC.Framework.asmdef.
        /// </summary>
        public static void RebuildMasterAsmdef()
        {
            if (!File.Exists(MasterAsmdefPath))
            {
                Debug.LogWarning($"[SKCAsmdefManager] Master ASMDEF not found at {MasterAsmdefPath}");
                return;
            }

            try
            {
                AssetDatabase.StartAssetEditing();

                string rawJson = File.ReadAllText(MasterAsmdefPath);
                var masterDef = JsonConvert.DeserializeObject<AsmdefDefinition>(rawJson) ?? new AsmdefDefinition();
                masterDef.Name = "SKC.Framework";

                // Ensure base runtime references
                var refs = new HashSet<string>(masterDef.References ?? new List<string>(), StringComparer.OrdinalIgnoreCase);
                
                // Add UniTask, InputSystem, TextMeshPro, DOTween if missing
                if (!refs.Contains("UniTask") && !refs.Any(r => r.Contains("f51ebe6a0ceec4240a699833d6309b23")))
                    refs.Add("UniTask");
                if (!refs.Contains("DOTween.Modules"))
                    refs.Add("DOTween.Modules");

                masterDef.References = refs.ToList();

                string updatedJson = JsonConvert.SerializeObject(masterDef, Formatting.Indented);
                File.WriteAllText(MasterAsmdefPath, updatedJson);
                Debug.Log("[SKCAsmdefManager] Successfully refreshed Master ASMDEF.");
            }
            finally
            {
                AssetDatabase.StopAssetEditing();
                AssetDatabase.Refresh();
            }
        }

        /// <summary>
        /// Links all installed SKC assemblies or SKC.Framework to the developer's game ASMDEF.
        /// </summary>
        public static bool LinkToGameAssembly(string gameAsmdefPath)
        {
            if (string.IsNullOrEmpty(gameAsmdefPath) || !File.Exists(gameAsmdefPath))
            {
                Debug.LogError($"[SKCAsmdefManager] Target game ASMDEF not found: {gameAsmdefPath}");
                return false;
            }

            try
            {
                AssetDatabase.StartAssetEditing();

                string rawJson = File.ReadAllText(gameAsmdefPath);
                var gameDef = JsonConvert.DeserializeObject<AsmdefDefinition>(rawJson);
                if (gameDef == null)
                {
                    Debug.LogError("[SKCAsmdefManager] Failed to deserialize target game ASMDEF.");
                    return false;
                }

                var refs = new HashSet<string>(gameDef.References ?? new List<string>(), StringComparer.OrdinalIgnoreCase);

                // Add SKC.Framework if not present
                if (!refs.Contains("SKC.Framework") && !refs.Any(r => r.Contains("19fbce4f80e73644081748c38a1d04e5")))
                {
                    refs.Add("SKC.Framework");
                }

                // Add UniTask if not present
                if (!refs.Contains("UniTask") && !refs.Any(r => r.Contains("f51ebe6a0ceec4240a699833d6309b23")))
                {
                    refs.Add("UniTask");
                }

                gameDef.References = refs.ToList();
                string updatedJson = JsonConvert.SerializeObject(gameDef, Formatting.Indented);
                File.WriteAllText(gameAsmdefPath, updatedJson);
                Debug.Log($"[SKCAsmdefManager] Successfully linked SKC assemblies to: {gameAsmdefPath}");
                return true;
            }
            finally
            {
                AssetDatabase.StopAssetEditing();
                AssetDatabase.Refresh();
            }
        }

        /// <summary>
        /// Finds all game ASMDEFs in the project outside Plugins/SKCFramework.
        /// </summary>
        public static List<string> FindGameAsmdefPaths()
        {
            string[] guids = AssetDatabase.FindAssets("t:asmdef");
            List<string> results = new List<string>();

            foreach (var guid in guids)
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                if (string.IsNullOrEmpty(path)) continue;

                // Ignore SKCFramework internal asmdefs and package cache
                if (path.StartsWith("Assets/Plugins/SKCFramework") || path.StartsWith("Packages/"))
                    continue;

                results.Add(path);
            }

            return results;
        }

        /// <summary>
        /// Executes an action inside an AssetEditing batch block to prevent repetitive domain reloads.
        /// </summary>
        public static void BatchExecute(Action action)
        {
            if (action == null) return;
            try
            {
                AssetDatabase.StartAssetEditing();
                action.Invoke();
            }
            finally
            {
                AssetDatabase.StopAssetEditing();
                AssetDatabase.Refresh();
            }
        }
    }
}
