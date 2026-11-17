#if SKC_HAS_LEVELS
/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;
using SKC.Levels;
using SKC.Levels.Samples;

namespace SKC.Editor
{
    /// <summary>
    /// Editor utility that automatically creates sample level prefabs and the default LevelSettings asset.
    /// </summary>
    [InitializeOnLoad]
    public static class LevelSampleGenerator
    {
        private const string LevelsFolderPath = "Assets/Resources/Levels";
        private const string SettingsAssetPath = "Assets/Resources/LevelSettings.asset";

        static LevelSampleGenerator()
        {
            EditorApplication.delayCall += AutoCheckAndGenerate;
        }

        private static void AutoCheckAndGenerate()
        {
            bool settingsMissing = !File.Exists(SettingsAssetPath);
            bool prefabsMissing = !File.Exists($"{LevelsFolderPath}/SampleLevel_1.prefab") ||
                                  !File.Exists($"{LevelsFolderPath}/SampleLevel_2.prefab") ||
                                  !File.Exists($"{LevelsFolderPath}/SampleLevel_3.prefab");

            if (settingsMissing || prefabsMissing)
            {
                GenerateSampleLevels(silent: true);
            }
        }

        [MenuItem("SKCore/Levels/Generate Sample Levels", priority = 52)]
        public static void MenuGenerateSampleLevels()
        {
            GenerateSampleLevels(silent: false);
        }

        public static void GenerateSampleLevels(bool silent = false)
        {
            if (!Directory.Exists("Assets/Resources"))
            {
                Directory.CreateDirectory("Assets/Resources");
            }

            if (!Directory.Exists(LevelsFolderPath))
            {
                Directory.CreateDirectory(LevelsFolderPath);
                AssetDatabase.Refresh();
            }

            var p1 = CreateOrUpdateLevelPrefab(1, "Forest Meadows", 150, new Color(0.2f, 0.7f, 0.3f));
            var p2 = CreateOrUpdateLevelPrefab(2, "Desert Dunes", 250, new Color(0.85f, 0.65f, 0.25f));
            var p3 = CreateOrUpdateLevelPrefab(3, "Cyber City", 500, new Color(0.15f, 0.4f, 0.85f));

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();

            RegisterToLevelSettings(p1, p2, p3);

            if (!silent)
            {
                EditorUtility.DisplayDialog("SKC Framework", "Sample Levels and LevelSettings generated successfully!", "OK");
            }
        }

        private static GameObject CreateOrUpdateLevelPrefab(int index, string theme, int targetScore, Color groundColor)
        {
            string prefabPath = $"{LevelsFolderPath}/SampleLevel_{index}.prefab";

            GameObject root = new GameObject($"SampleLevel_{index}");
            var levelComp = root.AddComponent<SampleGameLevel>();

            // Set serialized fields via SerializedObject
            var so = new SerializedObject(levelComp);
            var themeProp = so.FindProperty("_levelTheme");
            if (themeProp != null) themeProp.stringValue = theme;
            var scoreProp = so.FindProperty("_targetScore");
            if (scoreProp != null) scoreProp.intValue = targetScore;
            so.ApplyModifiedPropertiesWithoutUndo();

            // Create visual ground
            GameObject ground = GameObject.CreatePrimitive(PrimitiveType.Cube);
            ground.name = "Ground";
            ground.transform.SetParent(root.transform);
            ground.transform.localPosition = new Vector3(0, -0.1f, 0);
            ground.transform.localScale = new Vector3(10f + (index * 2f), 0.2f, 10f + (index * 2f));

            // Create decorative marker
            GameObject marker = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            marker.name = "ObjectivePillar";
            marker.transform.SetParent(root.transform);
            marker.transform.localPosition = new Vector3(0, 1f, 3f);
            marker.transform.localScale = new Vector3(0.8f, 1.5f, 0.8f);

            GameObject savedPrefab = PrefabUtility.SaveAsPrefabAsset(root, prefabPath);
            Object.DestroyImmediate(root);

            return savedPrefab;
        }

        private static void RegisterToLevelSettings(GameObject p1, GameObject p2, GameObject p3)
        {
            var settings = AssetDatabase.LoadAssetAtPath<LevelSettingsSO>(SettingsAssetPath);
            if (settings == null)
            {
                settings = ScriptableObject.CreateInstance<LevelSettingsSO>();
                settings.loadMode = LevelLoadMode.PrefabBased;
                settings.loopMode = LevelLoopMode.RandomShuffle;
                settings.loopStartIndex = 1;
                settings.avoidImmediateRepeat = true;
                settings.prefabResourcePath = "Levels";
                settings.prefabNameFormat = "SampleLevel_{0}";
                settings.sceneNameFormat = "Level_{0}";
                settings.useTransition = true;
                settings.exemptObjectNames = new List<string> { "SKCore", "Test", "[LevelContainer]" };
                settings.levelPrefabs = new List<GameObject> { p1, p2, p3 };

                AssetDatabase.CreateAsset(settings, SettingsAssetPath);
            }
            else
            {
                if (settings.exemptObjectNames == null) settings.exemptObjectNames = new List<string>();
                if (!settings.exemptObjectNames.Contains("[LevelContainer]")) settings.exemptObjectNames.Add("[LevelContainer]");
                settings.levelPrefabs.Clear();
                if (p1 != null) settings.levelPrefabs.Add(p1);
                if (p2 != null) settings.levelPrefabs.Add(p2);
                if (p3 != null) settings.levelPrefabs.Add(p3);
                EditorUtility.SetDirty(settings);
            }

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log("<color=#00FFAA>[LevelSampleGenerator]</color> Sample levels registered to LevelSettings.asset!");
        }
    }
}
#endif
