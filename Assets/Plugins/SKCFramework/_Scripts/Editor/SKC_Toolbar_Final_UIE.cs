#if UNITY_EDITOR
using System;
using UnityEditor;
using UnityEngine;

#if UNITY_6000_0_OR_NEWER
using UnityEditor.Toolbars;

public static class SKC_Toolbar_Final_UIE
{
    [MainToolbarElement("SKC/BootstrapperSettings", defaultDockPosition = MainToolbarDockPosition.Left)]
    public static MainToolbarElement CreateToolbarButton()
    {
        Texture2D icon = EditorGUIUtility.IconContent("Settings").image as Texture2D;
        var content = icon != null
            ? new MainToolbarContent(icon, "Open SKCore Bootstrapper Settings")
            : new MainToolbarContent("SKC", "Open SKCore Bootstrapper Settings");

        return new MainToolbarButton(content, () =>
        {
            if (Application.isPlaying)
            {
                Debug.LogWarning("SKC Toolbar: Settings window cannot be opened while in Play Mode.");
            }
            else
            {
                SKCBootstrapperSettings.ShowWindow();
            }
        });
    }
}
#else
using System.Reflection;
using UnityEngine.UIElements;

[InitializeOnLoad]
public static class SKC_Toolbar_Final_UIE
{
    private const float ICON_WIDTH = 25f;
    private const float ICON_HEIGHT = 30f;
    private const string SETTINGS_ICON_NAME = "Settings";
    private const string TOOLBAR_ROOT_NAME = "ToolbarZoneLeftAlign";
    
    static SKC_Toolbar_Final_UIE()
    {
        EditorApplication.delayCall += FindAndInjectButton;
    }

    private static void FindAndInjectButton()
    {
        EditorApplication.delayCall += () =>
        {
            var root = GetToolbarRootVisualElement();
            if (root == null)
            {
                Debug.LogWarning("[SKC Toolbar UIE] Toolbar root element not found. Retrying.");
                EditorApplication.delayCall += FindAndInjectButton; 
                return;
            }

            var toolbarZone = root.Q(TOOLBAR_ROOT_NAME);
            if (toolbarZone == null || toolbarZone.Q("SKCSettingsButton") != null)
            {
                return;
            }

            var button = new Button(OnToolbarButtonClicked)
            {
                text = "",
                name = "SKCSettingsButton",
                tooltip = "Open SKCore Bootstrapper Settings"
            };
            
            Texture2D iconTexture = EditorGUIUtility.IconContent(SETTINGS_ICON_NAME).image as Texture2D;
            if (iconTexture != null)
            {
                var iconElement = new Image
                {
                    image = iconTexture,
                    scaleMode = ScaleMode.ScaleToFit
                };
                iconElement.style.width = ICON_WIDTH;
                iconElement.style.height = ICON_HEIGHT;
                button.Add(iconElement);
                button.AddToClassList("unity-toolbar-button"); 
                button.AddToClassList("editor-toolbar-button");
            }
            
            button.style.width = ICON_WIDTH + 8;
            button.style.height = ICON_HEIGHT + 8;
            toolbarZone.Add(button);

            Debug.Log("[SKC Toolbar UIE] Button successfully added and iconified in toolbar.");
        };
    }

    private static void OnToolbarButtonClicked()
    {
        if (Application.isPlaying)
        {
            Debug.LogWarning("SKC Toolbar: Settings window cannot be opened while in Play Mode.");
        }
        else
        {
            SKCBootstrapperSettings.ShowWindow(); 
        }
    }

    private static VisualElement GetToolbarRootVisualElement()
    {
        try
        {
            var type = typeof(Editor).Assembly.GetType("UnityEditor.Toolbar");
            if (type == null) return null;
            var toolbars = Resources.FindObjectsOfTypeAll(type);
            if (toolbars.Length == 0) return null;
            var rootField = toolbars[0].GetType().GetField("m_Root", BindingFlags.NonPublic | BindingFlags.Instance);
            if (rootField == null)
            {
                var visualTreeProperty = toolbars[0].GetType().GetProperty("visualTree", BindingFlags.Public | BindingFlags.Instance);
                if (visualTreeProperty != null)
                {
                    return visualTreeProperty.GetValue(toolbars[0]) as VisualElement;
                }
            }
            return rootField?.GetValue(toolbars[0]) as VisualElement;
        }
        catch (Exception e)
        {
            Debug.LogError($"[SKC Toolbar UIE] Reflection error: {e.Message}");
            return null;
        }
    }
}
#endif
#endif