// Injected by FORGE into Assets/Editor before a player build.
// Unity CLI calls:  -executeMethod Forge.CLI.PerformBuild
// Output path arrives as -buildOutput (unity build --output-path) or -forgeOutput.
/* #if UNITY_EDITOR
using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Forge
{
    public static class CLI
    {
        public static void PerformBuild()
        {
            var args = Environment.GetCommandLineArgs();
            var output = Arg(args, "-buildOutput") ?? Arg(args, "-forgeOutput");
            var targetName = Arg(args, "-forgeTarget") ?? Arg(args, "-buildTarget") ?? "Android";
            var export = (Arg(args, "-forgeAndroidExport") ?? "apk").ToLowerInvariant();

            BuildTarget target;
            try
            {
                target = (BuildTarget)Enum.Parse(typeof(BuildTarget), targetName, true);
            }
            catch (Exception)
            {
                Debug.LogError("FORGE: Unknown build target '" + targetName + "'.");
                EditorApplication.Exit(2);
                return;
            }

            var group = BuildPipeline.GetBuildTargetGroup(target);
            if (string.IsNullOrEmpty(output))
                output = DefaultOutput(target, PlayerSettings.productName);

            var full = Path.GetFullPath(output);
            var parent = Directory.Exists(full) ? full : Path.GetDirectoryName(full);
            if (!string.IsNullOrEmpty(parent))
                Directory.CreateDirectory(parent);

            Debug.Log("FORGE: PerformBuild start");
            Debug.Log("FORGE: progress 30 Switching target " + target);
            EditorUtility.DisplayProgressBar("FORGE", "Switching build target", 0.3f);

            if (!SwitchTarget(target, group))
            {
                Debug.LogError("FORGE: Could not switch to " + target + ". Install that Unity module and try again.");
                EditorUtility.ClearProgressBar();
                EditorApplication.Exit(3);
                return;
            }

            if (target == BuildTarget.Android)
            {
                EditorUserBuildSettings.exportAsGoogleAndroidProject = export == "android-studio-project" || export == "gradle";
                EditorUserBuildSettings.buildAppBundle = export == "aab" || full.EndsWith(".aab", StringComparison.OrdinalIgnoreCase);
                Debug.Log("FORGE: Android export " + export);
            }

            var scenes = EditorBuildSettings.scenes.Where(s => s.enabled && !string.IsNullOrEmpty(s.path)).Select(s => s.path).ToArray();
            if (scenes.Length == 0)
            {
                scenes = AssetDatabase.FindAssets("t:Scene")
                    .Select(AssetDatabase.GUIDToAssetPath)
                    .Where(p => p.StartsWith("Assets/"))
                    .ToArray();
            }

            if (scenes.Length == 0)
            {
                Debug.LogError("FORGE: No scenes enabled in Build Settings and none found under Assets/.");
                EditorUtility.ClearProgressBar();
                EditorApplication.Exit(4);
                return;
            }

            Debug.Log("FORGE: progress 55 Building player");
            Debug.Log("FORGE: Scenes " + string.Join(", ", scenes));
            Debug.Log("FORGE: Output " + full);
            EditorUtility.DisplayProgressBar("FORGE", "Building player", 0.55f);

            var options = new BuildPlayerOptions
            {
                scenes = scenes,
                locationPathName = full,
                target = target,
                options = BuildOptions.None
            };
#pragma warning disable CS0618
            options.targetGroup = group;
#pragma warning restore CS0618

            var report = BuildPipeline.BuildPlayer(options);
            EditorUtility.ClearProgressBar();
            var summary = report.summary;
            Debug.Log("FORGE: progress 96 Packaging");
            Debug.Log("FORGE: Result=" + summary.result + " Errors=" + summary.totalErrors + " Warnings=" + summary.totalWarnings + " Size=" + summary.totalSize);

            if (summary.result != BuildResult.Succeeded)
            {
                Debug.LogError("FORGE: Build failed.");
                EditorApplication.Exit(1);
                return;
            }

            Debug.Log("FORGE: progress 100 Done");
            Debug.Log("Build Finished, Result: Success.");
        }

        static bool SwitchTarget(BuildTarget target, BuildTargetGroup group)
        {
            if (EditorUserBuildSettings.activeBuildTarget == target)
                return true;
#pragma warning disable CS0618
            return EditorUserBuildSettings.SwitchActiveBuildTarget(group, target);
#pragma warning restore CS0618
        }

        static string DefaultOutput(BuildTarget target, string product)
        {
            var safe = string.Join("_", (product ?? "Player").Split(Path.GetInvalidFileNameChars()));
            switch (target)
            {
                case BuildTarget.Android:
                    return Path.Combine("Builds", "Forge", safe + ".apk");
                case BuildTarget.iOS:
                    return Path.Combine("Builds", "Forge", safe + "-ios");
                case BuildTarget.WebGL:
                    return Path.Combine("Builds", "Forge", safe + "-web");
                case BuildTarget.StandaloneWindows:
                case BuildTarget.StandaloneWindows64:
                    return Path.Combine("Builds", "Forge", safe + ".exe");
                case BuildTarget.StandaloneOSX:
                    return Path.Combine("Builds", "Forge", safe + ".app");
                case BuildTarget.StandaloneLinux64:
                    return Path.Combine("Builds", "Forge", safe + ".x86_64");
                default:
                    return Path.Combine("Builds", "Forge", safe);
            }
        }

        static string Arg(string[] args, string name)
        {
            for (var i = 0; i < args.Length - 1; i++)
            {
                if (string.Equals(args[i], name, StringComparison.OrdinalIgnoreCase))
                    return args[i + 1];
                var prefix = name + "=";
                if (args[i].StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                    return args[i].Substring(prefix.Length);
            }
            return null;
        }
    }
}
#endif
*/  