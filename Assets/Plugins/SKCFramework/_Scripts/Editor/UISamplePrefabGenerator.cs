#if SKC_HAS_UI
/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System.IO;
using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using SKC.UI;
using SKC.UI.Data;
using SKC.UI.Samples;

namespace SKC.Editor
{
    [InitializeOnLoad]
    public static class UISamplePrefabGenerator
    {
        private const string PrefabFolderPath = "Assets/Resources/UI/Prefabs";
        private const string UIDataAssetPath = "Assets/Resources/UIData.asset";

        static UISamplePrefabGenerator()
        {
            EditorApplication.delayCall += AutoCheckAndGenerate;
        }

        private static void AutoCheckAndGenerate()
        {
            var uiData = Resources.Load<UIData>("UIData");
            if (uiData == null) return;

            var so = new SerializedObject(uiData);
            var prop = so.FindProperty("_panelPrefabs");
            bool missingOnDisk = !File.Exists($"{PrefabFolderPath}/SampleGameHUD.prefab") ||
                                !File.Exists($"{PrefabFolderPath}/SampleSettingsPopup.prefab") ||
                                !File.Exists($"{PrefabFolderPath}/SampleToastOverlay.prefab");

            if ((prop != null && prop.arraySize == 0) || missingOnDisk)
            {
                GenerateSamplePrefabs(silent: true);
            }
        }

        [MenuItem("SKCore/UI/Generate Sample UI Prefabs", priority = 50)]
        public static void MenuGenerateSamplePrefabs()
        {
            GenerateSamplePrefabs(silent: false);
        }

        public static void GenerateSamplePrefabs(bool silent = false)
        {
            if (!Directory.Exists(PrefabFolderPath))
            {
                Directory.CreateDirectory(PrefabFolderPath);
                AssetDatabase.Refresh();
            }

            var hudPrefab = CreateHUDPrefab();
            var popupPrefab = CreatePopupPrefab();
            var toastPrefab = CreateToastPrefab();

            RegisterToUIData(hudPrefab, popupPrefab, toastPrefab);

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();

            if (!silent)
            {
                EditorUtility.DisplayDialog("SKC UI Service",
                    "Sample UI prefabs (SampleGameHUD, SampleSettingsPopup, SampleToastOverlay) have been created and registered to UIData.asset successfully!",
                    "OK");
            }
            Debug.Log("<color=green>[UIService]</color> Sample UI Prefabs generated and registered to UIData successfully!");
        }

        private static SampleGameHUD CreateHUDPrefab()
        {
            string path = $"{PrefabFolderPath}/SampleGameHUD.prefab";
            var existing = AssetDatabase.LoadAssetAtPath<SampleGameHUD>(path);
            if (existing != null) return existing;

            var root = new GameObject("SampleGameHUD", typeof(RectTransform), typeof(CanvasGroup), typeof(SampleGameHUD));
            var rect = root.GetComponent<RectTransform>();
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;

            // Title
            var title = CreateTMPText(root.transform, "TitleText", "GAME HUD SCREEN", 44, new Vector2(0, -120), new Vector2(600, 80));
            var titleRect = title.GetComponent<RectTransform>();
            titleRect.anchorMin = new Vector2(0.5f, 1f);
            titleRect.anchorMax = new Vector2(0.5f, 1f);

            // Buttons
            var settingsBtn = CreateUIButton(root.transform, "SettingsButton", "Open Settings Popup", new Color(0.2f, 0.55f, 0.9f), new Vector2(0, 40), new Vector2(360, 80));
            var toastBtn = CreateUIButton(root.transform, "ToastButton", "Show Toast Notification", new Color(0.2f, 0.75f, 0.45f), new Vector2(0, -60), new Vector2(360, 80));

            var comp = root.GetComponent<SampleGameHUD>();
            var so = new SerializedObject(comp);
            so.FindProperty("_settingsButton").objectReferenceValue = settingsBtn;
            so.FindProperty("_showToastButton").objectReferenceValue = toastBtn;
            so.ApplyModifiedProperties();

            var prefab = PrefabUtility.SaveAsPrefabAsset(root, path);
            Object.DestroyImmediate(root);
            return prefab.GetComponent<SampleGameHUD>();
        }

        private static SampleSettingsPopup CreatePopupPrefab()
        {
            string path = $"{PrefabFolderPath}/SampleSettingsPopup.prefab";
            var existing = AssetDatabase.LoadAssetAtPath<SampleSettingsPopup>(path);
            if (existing != null) return existing;

            var root = new GameObject("SampleSettingsPopup", typeof(RectTransform), typeof(CanvasGroup), typeof(Image), typeof(SampleSettingsPopup));
            var rect = root.GetComponent<RectTransform>();
            rect.anchorMin = new Vector2(0.5f, 0.5f);
            rect.anchorMax = new Vector2(0.5f, 0.5f);
            rect.sizeDelta = new Vector2(650, 750);
            rect.anchoredPosition = Vector2.zero;

            var bgImg = root.GetComponent<Image>();
            bgImg.color = new Color(0.12f, 0.14f, 0.18f, 0.98f);

            // Title
            var title = CreateTMPText(root.transform, "TitleText", "SETTINGS", 42, new Vector2(0, 280), new Vector2(400, 60));

            // Buttons
            var musicBtn = CreateUIButton(root.transform, "ToggleMusicButton", "Toggle Music", new Color(0.28f, 0.32f, 0.42f), new Vector2(0, 140), new Vector2(400, 75));
            var soundBtn = CreateUIButton(root.transform, "ToggleSoundButton", "Toggle Sound", new Color(0.28f, 0.32f, 0.42f), new Vector2(0, 45), new Vector2(400, 75));
            var hapticBtn = CreateUIButton(root.transform, "ToggleHapticButton", "Toggle Haptics", new Color(0.28f, 0.32f, 0.42f), new Vector2(0, -50), new Vector2(400, 75));
            var closeBtn = CreateUIButton(root.transform, "CloseButton", "Close", new Color(0.85f, 0.25f, 0.25f), new Vector2(0, -180), new Vector2(300, 75));

            var comp = root.GetComponent<SampleSettingsPopup>();
            var so = new SerializedObject(comp);
            so.FindProperty("_closeButton").objectReferenceValue = closeBtn;
            so.FindProperty("_toggleMusicButton").objectReferenceValue = musicBtn;
            so.FindProperty("_toggleSoundButton").objectReferenceValue = soundBtn;
            so.FindProperty("_toggleHapticButton").objectReferenceValue = hapticBtn;
            so.ApplyModifiedProperties();

            var prefab = PrefabUtility.SaveAsPrefabAsset(root, path);
            Object.DestroyImmediate(root);
            return prefab.GetComponent<SampleSettingsPopup>();
        }

        private static SampleToastOverlay CreateToastPrefab()
        {
            string path = $"{PrefabFolderPath}/SampleToastOverlay.prefab";
            var existing = AssetDatabase.LoadAssetAtPath<SampleToastOverlay>(path);
            if (existing != null) return existing;

            var root = new GameObject("SampleToastOverlay", typeof(RectTransform), typeof(CanvasGroup), typeof(Image), typeof(SampleToastOverlay));
            var rect = root.GetComponent<RectTransform>();
            rect.anchorMin = new Vector2(0.5f, 0.2f);
            rect.anchorMax = new Vector2(0.5f, 0.2f);
            rect.sizeDelta = new Vector2(600, 110);
            rect.anchoredPosition = Vector2.zero;

            var bgImg = root.GetComponent<Image>();
            bgImg.color = new Color(0.08f, 0.08f, 0.1f, 0.88f);

            var toastText = CreateTMPText(root.transform, "ToastText", "Toast Message", 32, Vector2.zero, new Vector2(560, 80));

            var comp = root.GetComponent<SampleToastOverlay>();
            var so = new SerializedObject(comp);
            so.FindProperty("_toastText").objectReferenceValue = toastText;
            so.ApplyModifiedProperties();

            var prefab = PrefabUtility.SaveAsPrefabAsset(root, path);
            Object.DestroyImmediate(root);
            return prefab.GetComponent<SampleToastOverlay>();
        }

        private static void RegisterToUIData(params UIPanel[] panels)
        {
            var uiData = Resources.Load<UIData>("UIData");
            if (uiData == null)
            {
                uiData = ScriptableObject.CreateInstance<UIData>();
                AssetDatabase.CreateAsset(uiData, UIDataAssetPath);
            }

            var so = new SerializedObject(uiData);
            var prop = so.FindProperty("_panelPrefabs");
            prop.ClearArray();

            for (int i = 0; i < panels.Length; i++)
            {
                if (panels[i] == null) continue;
                prop.InsertArrayElementAtIndex(i);
                prop.GetArrayElementAtIndex(i).objectReferenceValue = panels[i];
            }

            so.ApplyModifiedProperties();
            EditorUtility.SetDirty(uiData);
        }

        private static Button CreateUIButton(Transform parent, string name, string label, Color bgColor, Vector2 anchoredPos, Vector2 size)
        {
            var obj = new GameObject(name, typeof(RectTransform), typeof(Image), typeof(Button));
            obj.transform.SetParent(parent, false);

            var rect = obj.GetComponent<RectTransform>();
            rect.anchoredPosition = anchoredPos;
            rect.sizeDelta = size;

            var img = obj.GetComponent<Image>();
            img.color = bgColor;

            var btn = obj.GetComponent<Button>();
            btn.targetGraphic = img;

            CreateTMPText(obj.transform, "Label", label, 28, Vector2.zero, size);
            return btn;
        }

        private static TextMeshProUGUI CreateTMPText(Transform parent, string name, string text, float fontSize, Vector2 anchoredPos, Vector2 size)
        {
            var obj = new GameObject(name, typeof(RectTransform), typeof(TextMeshProUGUI));
            obj.transform.SetParent(parent, false);

            var rect = obj.GetComponent<RectTransform>();
            rect.anchoredPosition = anchoredPos;
            rect.sizeDelta = size;

            var tmp = obj.GetComponent<TextMeshProUGUI>();
            tmp.text = text;
            tmp.fontSize = fontSize;
            tmp.alignment = TextAlignmentOptions.Center;
            tmp.color = Color.white;

            if (TMP_Settings.defaultFontAsset != null)
            {
                tmp.font = TMP_Settings.defaultFontAsset;
            }

            return tmp;
        }
    }
}
#endif
