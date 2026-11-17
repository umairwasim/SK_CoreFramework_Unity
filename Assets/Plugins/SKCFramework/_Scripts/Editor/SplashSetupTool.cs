/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System.IO;
using TMPro;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using SKC.Boots;

namespace SKC.Editor
{
    public static class SplashSetupTool
    {
        private const string PrefabDir = "Assets/Resources/UI/Prefabs";
        private const string PrefabPath = "Assets/Resources/UI/Prefabs/SplashScreen.prefab";
        private const string BootScenePath = "Assets/GameFolder/Scenes/Boot.unity";
        private const string MainScenePath = "Assets/GameFolder/Scenes/MainScene.unity";

        [MenuItem("SKCore/Boot/Setup Animated Splash Screen in Boot Scene", priority = 10)]
        public static void SetupSplashScreen()
        {
            // 1. Ensure prefab folder exists
            if (!Directory.Exists(PrefabDir))
            {
                Directory.CreateDirectory(PrefabDir);
                AssetDatabase.Refresh();
            }

            // 2. Generate or update SplashScreen prefab
            var prefab = CreateOrUpdateSplashPrefab();

            // 3. Ensure Build Settings include Boot (index 0) and MainScene (index 1)
            ConfigureBuildSettings();

            // 4. Open Boot scene and place the splash screen
            SetupBootScene(prefab);

            EditorUtility.DisplayDialog("SKC Splash Screen Setup",
                "Animated Splash Screen has been updated with:\n\n- Progress Bar Fade-Out\n- Logo Scaling Animation\n- +2s Celebration Delay\n- SKCore.TransitionService integration!\n\nPress Play to watch the updated animation!",
                "OK");

            Debug.Log("<color=green>[SKC Splash]</color> Animated Splash Screen successfully updated with TransitionService and Logo Zoom!");
        }

        private static GameObject CreateOrUpdateSplashPrefab()
        {
            // Root Canvas
            var root = new GameObject("SplashScreen", typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster), typeof(CanvasGroup), typeof(SplashScreenController));
            
            var canvas = root.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 999;

            var scaler = root.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080, 1920);
            scaler.matchWidthOrHeight = 0.5f;

            var mainCg = root.GetComponent<CanvasGroup>();
            var controller = root.GetComponent<SplashScreenController>();

            // Full-screen background
            var bgObj = new GameObject("Background", typeof(RectTransform), typeof(Image));
            bgObj.transform.SetParent(root.transform, false);
            var bgRect = bgObj.GetComponent<RectTransform>();
            bgRect.anchorMin = Vector2.zero;
            bgRect.anchorMax = Vector2.one;
            bgRect.offsetMin = Vector2.zero;
            bgRect.offsetMax = Vector2.zero;
            var bgImg = bgObj.GetComponent<Image>();
            bgImg.color = new Color(0.06f, 0.08f, 0.12f, 1f); // Deep modern dark navy

            // Logo & Title Group
            var contentGroup = new GameObject("ContentGroup", typeof(RectTransform), typeof(CanvasGroup));
            contentGroup.transform.SetParent(root.transform, false);
            var contentRect = contentGroup.GetComponent<RectTransform>();
            contentRect.anchorMin = new Vector2(0.5f, 0.55f);
            contentRect.anchorMax = new Vector2(0.5f, 0.55f);
            contentRect.sizeDelta = new Vector2(600, 500);
            contentRect.anchoredPosition = Vector2.zero;
            var contentCg = contentGroup.GetComponent<CanvasGroup>();

            // Logo container
            var logoObj = new GameObject("Logo", typeof(RectTransform), typeof(CanvasGroup), typeof(Image));
            logoObj.transform.SetParent(contentGroup.transform, false);
            var logoRect = logoObj.GetComponent<RectTransform>();
            logoRect.sizeDelta = new Vector2(200, 200);
            logoRect.anchoredPosition = new Vector2(0, 100);
            var logoImg = logoObj.GetComponent<Image>();
            logoImg.color = new Color(0.22f, 0.74f, 0.97f, 1f); // Cyan accent
            var logoCg = logoObj.GetComponent<CanvasGroup>();

            // Logo inner icon/letter
            var logoLetter = CreateTMP(logoObj.transform, "LogoIcon", "S", 100, Vector2.zero, new Vector2(200, 200), Color.white, true);

            // Title
            var titleText = CreateTMP(contentGroup.transform, "TitleText", "SKC STARTER", 52, new Vector2(0, -50), new Vector2(600, 70), Color.white, true);
            
            // Subtitle
            var subText = CreateTMP(contentGroup.transform, "SubtitleText", "ADVANCED UNITY FRAMEWORK", 22, new Vector2(0, -110), new Vector2(600, 40), new Color(0.6f, 0.68f, 0.76f, 1f), false);

            // Progress Bar Area with CanvasGroup (for smooth fade-out)
            var progressGroup = new GameObject("ProgressGroup", typeof(RectTransform), typeof(CanvasGroup));
            progressGroup.transform.SetParent(root.transform, false);
            var progRect = progressGroup.GetComponent<RectTransform>();
            progRect.anchorMin = new Vector2(0.5f, 0.18f);
            progRect.anchorMax = new Vector2(0.5f, 0.18f);
            progRect.sizeDelta = new Vector2(600, 120);
            progRect.anchoredPosition = Vector2.zero;
            var progressCg = progressGroup.GetComponent<CanvasGroup>();

            // Bar Background
            var barBgObj = new GameObject("ProgressBar_BG", typeof(RectTransform), typeof(Image));
            barBgObj.transform.SetParent(progressGroup.transform, false);
            var barBgRect = barBgObj.GetComponent<RectTransform>();
            barBgRect.sizeDelta = new Vector2(520, 20);
            barBgRect.anchoredPosition = Vector2.zero;
            var barBgImg = barBgObj.GetComponent<Image>();
            barBgImg.color = new Color(0.15f, 0.18f, 0.25f, 0.9f);

            // Bar Fill
            var barFillObj = new GameObject("ProgressBar_Fill", typeof(RectTransform), typeof(Image));
            barFillObj.transform.SetParent(barBgObj.transform, false);
            var barFillRect = barFillObj.GetComponent<RectTransform>();
            barFillRect.anchorMin = Vector2.zero;
            barFillRect.anchorMax = Vector2.one;
            barFillRect.offsetMin = Vector2.zero;
            barFillRect.offsetMax = Vector2.zero;
            var barFillImg = barFillObj.GetComponent<Image>();
            barFillImg.color = new Color(0.22f, 0.74f, 0.97f, 1f);
            barFillImg.type = Image.Type.Filled;
            barFillImg.fillMethod = Image.FillMethod.Horizontal;
            barFillImg.fillOrigin = 0;
            barFillImg.fillAmount = 0f;

            // Status Text
            var statusText = CreateTMP(progressGroup.transform, "StatusText", "Initializing Framework...", 22, new Vector2(-60, 36), new Vector2(400, 36), new Color(0.7f, 0.76f, 0.84f, 1f), false);
            statusText.alignment = TextAlignmentOptions.Left;

            // Percent Text
            var percentText = CreateTMP(progressGroup.transform, "PercentText", "0%", 22, new Vector2(210, 36), new Vector2(100, 36), new Color(0.22f, 0.74f, 0.97f, 1f), true);
            percentText.alignment = TextAlignmentOptions.Right;

            // Transition Curtain (Topmost child for SKCore.TransitionService)
            var curtainObj = new GameObject("TransitionCurtain", typeof(RectTransform), typeof(Image), typeof(CanvasGroup));
            curtainObj.transform.SetParent(root.transform, false);
            var curtainRect = curtainObj.GetComponent<RectTransform>();
            curtainRect.anchorMin = Vector2.zero;
            curtainRect.anchorMax = Vector2.one;
            curtainRect.offsetMin = Vector2.zero;
            curtainRect.offsetMax = Vector2.zero;
            var curtainImg = curtainObj.GetComponent<Image>();
            curtainImg.color = Color.black;
            var curtainCg = curtainObj.GetComponent<CanvasGroup>();
            curtainCg.alpha = 0f;
            curtainCg.blocksRaycasts = false;
            curtainCg.interactable = false;

            // Bind Serialized Fields on SplashScreenController
            var so = new SerializedObject(controller);
            so.FindProperty("_mainCanvasGroup").objectReferenceValue = mainCg;
            so.FindProperty("_logoCanvasGroup").objectReferenceValue = logoCg;
            so.FindProperty("_contentCanvasGroup").objectReferenceValue = contentCg;
            so.FindProperty("_progressCanvasGroup").objectReferenceValue = progressCg;
            so.FindProperty("_transitionCurtain").objectReferenceValue = curtainCg;
            so.FindProperty("_logoRect").objectReferenceValue = logoRect;
            so.FindProperty("_titleText").objectReferenceValue = titleText;
            so.FindProperty("_subtitleText").objectReferenceValue = subText;
            so.FindProperty("_progressBarFill").objectReferenceValue = barFillImg;
            so.FindProperty("_statusText").objectReferenceValue = statusText;
            so.FindProperty("_percentText").objectReferenceValue = percentText;
            so.FindProperty("_loadingDuration").floatValue = 2.5f;
            so.FindProperty("_celebrationDelay").floatValue = 2.0f;
            so.FindProperty("_nextSceneName").stringValue = "MainScene";
            so.ApplyModifiedProperties();

            // Save Prefab
            var savedPrefab = PrefabUtility.SaveAsPrefabAsset(root, PrefabPath);
            Object.DestroyImmediate(root);
            return savedPrefab;
        }

        private static void SetupBootScene(GameObject splashPrefab)
        {
            var activeScene = SceneManager.GetActiveScene();
            bool wasBootOpen = activeScene.path == BootScenePath;

            if (!wasBootOpen)
            {
                EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo();
                EditorSceneManager.OpenScene(BootScenePath);
            }

            // Check if Main Camera exists
            var cam = Object.FindFirstObjectByType<Camera>();
            if (cam == null)
            {
                var camObj = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener));
                cam = camObj.GetComponent<Camera>();
                cam.clearFlags = CameraClearFlags.SolidColor;
                cam.backgroundColor = new Color(0.06f, 0.08f, 0.12f, 1f);
            }
            else
            {
                cam.clearFlags = CameraClearFlags.SolidColor;
                cam.backgroundColor = new Color(0.06f, 0.08f, 0.12f, 1f);
            }

            // Check if EventSystem exists
            if (Object.FindFirstObjectByType<EventSystem>() == null)
            {
                new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
            }

            // Clean up existing SplashScreen or BootGame if present
            var existingSplash = Object.FindFirstObjectByType<SplashScreenController>();
            if (existingSplash != null)
            {
                Object.DestroyImmediate(existingSplash.gameObject);
            }

            // Instantiate Splash prefab into scene
            var splashInstance = (GameObject)PrefabUtility.InstantiatePrefab(splashPrefab);
            splashInstance.name = "SplashScreen";

            EditorSceneManager.MarkSceneDirty(SceneManager.GetActiveScene());
            EditorSceneManager.SaveOpenScenes();
        }

        private static void ConfigureBuildSettings()
        {
            var scenes = EditorBuildSettings.scenes;
            bool hasBoot = false;
            bool hasMain = false;

            foreach (var s in scenes)
            {
                if (s.path == BootScenePath) hasBoot = true;
                if (s.path == MainScenePath) hasMain = true;
            }

            if (!hasBoot || !hasMain)
            {
                var newScenes = new EditorBuildSettingsScene[2];
                newScenes[0] = new EditorBuildSettingsScene(BootScenePath, true);
                newScenes[1] = new EditorBuildSettingsScene(MainScenePath, true);
                EditorBuildSettings.scenes = newScenes;
                Debug.Log("<color=green>[SKC Splash]</color> Updated Build Settings scenes: 0: Boot, 1: MainScene");
            }
        }

        private static TextMeshProUGUI CreateTMP(Transform parent, string name, string text, float fontSize, Vector2 anchoredPos, Vector2 size, Color color, bool bold)
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
            tmp.color = color;
            if (bold) tmp.fontStyle = FontStyles.Bold;

            var customFont = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>("Assets/GameFolder/Art/Fonts/LilitaOne-Regular SDF.asset");
            if (customFont != null)
            {
                tmp.font = customFont;
            }
            else if (TMP_Settings.defaultFontAsset != null)
            {
                tmp.font = TMP_Settings.defaultFontAsset;
            }

            return tmp;
        }
    }
}
