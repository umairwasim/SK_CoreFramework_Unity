/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/
#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using UnityEditor.SceneManagement;
using UnityEngine.SceneManagement;
using System.IO; 
using SKC.Core; // For accessing SKCoreServiceSettings SO

// [InitializeOnLoad] attribute ensures static constructor is called when Unity Editor loads.
[InitializeOnLoad]
public class SKCBootstrapperSettings : EditorWindow
{
    // --- SKCoreServiceSettings Management ---
    private const string SettingsFileName = "SKCoreServiceSettings";
    private const string SettingsPath = "Assets/Resources/" + SettingsFileName + ".asset";

    private SKCoreServiceSettings _serviceSettings; // Loaded SO instance
    private Editor _settingsEditor; // Editor instance used to draw the SO

    // --- EditorPrefs Settings (Bootstrapper Logic) ---
    private const string BootSceneNameKey = "SKC_BootSceneName"; 
    private const string BootScenePathKey = "SKC_BootScenePath"; 
    private const string LaunchFromBootKey = "SKC_LaunchFromBoot";
    private const string LastActiveSceneKey = "Bootstrapper_LastScenePath"; 

    // Flag checking if settings are loaded from EditorPrefs
    private static bool settingsLoaded = false;
    
    private static string bootSceneName = "Boot"; 
    private static string bootScenePath = "";     
    private static bool launchFromBoot = true;    
    
    // Static constructor: Only subscribes to the event. Does not load EditorPrefs.
    static SKCBootstrapperSettings()
    {
        EditorApplication.playModeStateChanged += PlayModeStateChanged;
    }
    
    [MenuItem("SKCore/Bootstrapper/Settings Window", false, 10)]
    public static void ShowWindow()
    {
        GetWindow<SKCBootstrapperSettings>(false, "SKCore Bootstrapper", true);
    }
    
    private void OnEnable()
    {
        // Loads EditorPrefs when window is opened
        LoadBootstrapperSettings(); 
        LoadServiceSettings(); 
    }

    private void OnDisable()
    {
        if (_settingsEditor != null)
        {
            DestroyImmediate(_settingsEditor);
        }
    }
    
    // --- LOAD AND SAVE METHODS ---
    
    // Ensures settings are loaded before being called from static methods.
    private static void CheckAndLoadSettings()
    {
        if (!settingsLoaded)
        {
            LoadBootstrapperSettings();
        }
    }

    // Loads EditorPrefs settings
    private static void LoadBootstrapperSettings()
    {
        bootSceneName = EditorPrefs.GetString(BootSceneNameKey, "Boot");
        bootScenePath = EditorPrefs.GetString(BootScenePathKey, "");
        launchFromBoot = EditorPrefs.GetBool(LaunchFromBootKey, true);
        settingsLoaded = true;
    }

    // Saves EditorPrefs settings
    private static void SaveBootstrapperSettings()
    {
        EditorPrefs.SetString(BootSceneNameKey, bootSceneName);
        EditorPrefs.SetString(BootScenePathKey, bootScenePath);
        EditorPrefs.SetBool(LaunchFromBootKey, launchFromBoot);
    }
    
    // Loads Service Settings SO or creates it in Resources.
    private void LoadServiceSettings()
    {
        _serviceSettings = Resources.Load<SKCoreServiceSettings>(SettingsFileName);

        if (_serviceSettings == null)
        {
            // Create Resources folder if it doesn't exist
            if (!AssetDatabase.IsValidFolder("Assets/Resources"))
            {
                AssetDatabase.CreateFolder("Assets", "Resources");
            }

            _serviceSettings = ScriptableObject.CreateInstance<SKCoreServiceSettings>();
            
            AssetDatabase.CreateAsset(_serviceSettings, SettingsPath);
            AssetDatabase.SaveAssets();
            
            Debug.Log($"[Bootstrapper] Created new Service Settings file: {SettingsPath}");
        }

        if (_settingsEditor == null || _settingsEditor.target != _serviceSettings)
        {
            _settingsEditor = Editor.CreateEditor(_serviceSettings);
        }
    }


    private void OnGUI()
    {
        // --- Bootstrapper Settings ---
        EditorGUILayout.Space();
        EditorGUILayout.LabelField("Bootstrapper Settings", EditorStyles.boldLabel);
        
        // 1. Launch From Boot Toggle
        launchFromBoot = EditorGUILayout.Toggle("Force Launch from Boot Scene", launchFromBoot);
        
        // 2. BOOT SCENE SELECTION (Manual assignment with SceneAsset)
        GUI.enabled = launchFromBoot;
        SceneAsset bootSceneObject = AssetDatabase.LoadAssetAtPath<SceneAsset>(bootScenePath);
        
        bootSceneObject = (SceneAsset)EditorGUILayout.ObjectField("Boot Scene", bootSceneObject, typeof(SceneAsset), false);

        if (bootSceneObject != null)
        {
            string newPath = AssetDatabase.GetAssetPath(bootSceneObject);
            if (newPath != bootScenePath)
            {
                bootScenePath = newPath;
                bootSceneName = bootSceneObject.name;
                SaveBootstrapperSettings(); 
            }
        }
        else if (launchFromBoot && !string.IsNullOrEmpty(bootScenePath))
        {
            bootScenePath = "";
            bootSceneName = "Boot";
            SaveBootstrapperSettings();
        }
        GUI.enabled = true;
        
        // --- SKCore Service Settings (ScriptableObject) ---
        EditorGUILayout.Space(20);
        EditorGUILayout.LabelField("SKCore Service Initialization Settings", EditorStyles.boldLabel);
        
        if (_serviceSettings == null)
        {
            EditorGUILayout.HelpBox("SKCore Service Settings file could not be loaded. Please click the button below to reload or create it.", MessageType.Error);
            if (GUILayout.Button("Reload / Recreate Settings File"))
            {
                LoadServiceSettings();
            }
        }
        else
        {
            // Start change check
            EditorGUI.BeginChangeCheck(); 

            // Draw ScriptableObject UI in window
            _settingsEditor.OnInspectorGUI();
            
            // If any value changed, save the SO asset
            if (EditorGUI.EndChangeCheck())
            {
                EditorUtility.SetDirty(_serviceSettings); 
                AssetDatabase.SaveAssets(); 
                Debug.Log("[SKCBootstrapper] Service Settings updated.");
            }
        }
        
        EditorGUILayout.Space(10);
        if (GUILayout.Button("Save and Apply All Settings"))
        {
            SaveBootstrapperSettings(); 
            
            if (_serviceSettings != null)
            {
                EditorUtility.SetDirty(_serviceSettings);
                AssetDatabase.SaveAssets();
            }
            Debug.Log("All settings saved and applied successfully.");
        }
    }
    
    // --- Play Mode Management ---

    private static void PlayModeStateChanged(PlayModeStateChange state)
    {
        // Ensure settings are loaded before static method call
        CheckAndLoadSettings();
        
        if (launchFromBoot)
        {
            if (state == PlayModeStateChange.ExitingEditMode)
            {
                if (EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
                {
                    Scene lastActiveScene = EditorSceneManager.GetActiveScene();
                    EditorPrefs.SetString(LastActiveSceneKey, lastActiveScene.path);
                    
                    if (string.IsNullOrEmpty(bootScenePath))
                    {
                        Debug.LogError("[BOOTSTRAPPER] Boot Scene Path is empty! Please assign the Boot scene in the settings window.");
                        EditorApplication.ExitPlaymode();
                        return;
                    }
                    
                    EditorSceneManager.OpenScene(bootScenePath, OpenSceneMode.Single);
                }
                else
                {
                    EditorApplication.ExitPlaymode();
                }
            }
            else if (state == PlayModeStateChange.EnteredEditMode)
            {
                string storedPath = EditorPrefs.GetString(LastActiveSceneKey, "");
                
                if (!string.IsNullOrEmpty(storedPath))
                {
                    if (EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
                    {
                        if (File.Exists(storedPath))
                        {
                            EditorSceneManager.OpenScene(storedPath, OpenSceneMode.Single);
                            Debug.Log($"[BOOTSTRAPPER] Exited Play Mode. Restored previous scene: {Path.GetFileNameWithoutExtension(storedPath)}");
                        }
                        else
                        {
                            Debug.LogWarning($"[BOOTSTRAPPER] Previous scene file not found.");
                        }
                    }
                    
                    EditorPrefs.DeleteKey(LastActiveSceneKey);
                }
                else
                {
                    EditorPrefs.DeleteKey(LastActiveSceneKey);
                }
            }
        }
        else
        {
            if (state == PlayModeStateChange.ExitingEditMode)
            {
                Debug.Log("[BOOTSTRAPPER] 'Force Launch from Boot Scene' is disabled. Launching from current active scene.");
            }
            else if (state == PlayModeStateChange.EnteredEditMode)
            {
                Debug.Log("[BOOTSTRAPPER] 'Force Launch from Boot Scene' is disabled. Exited Play Mode.");
            }
        }
    }
}
#endif