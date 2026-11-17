/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System;
using System.IO;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UIElements;
using UnityEditor.UIElements;
using Cysharp.Threading.Tasks;
using Newtonsoft.Json;
using SKC.Boots;
using SKC.Core;
#if SKC_HAS_ECONOMY
using SKC.Economy;
#endif
#if SKC_HAS_DAILY_REWARDS
using SKC.DailyRewards;
#endif
#if SKC_HAS_LEVELS
using SKC.Levels;
#endif
#if SKC_HAS_POOLING
using SKC.Pooling;
#endif
using SKC.Save;
using SKC.Services;
#if SKC_HAS_AUDIO
using SKC.Sounds;
#endif
#if SKC_HAS_UI
using SKC.UI;
using SKC.UI.Data;
using SKC.UI.Samples;
#endif
using SKC.Logging;
using SKC.Text;
using SKC.Editor.SDKHub;
using SKC.Editor.Assembly;
using SKC.Adapters;
#if SKC_HAS_IAP
using SKC.IAP;
#endif
#if SKC_HAS_PRIVACY
using SKC.Privacy;
#endif
#if SKC_HAS_REVIEW
using SKC.Review;
#endif
#if SKC_HAS_NOTIFICATIONS
using SKC.Notifications;
#endif
#if SKC_HAS_TELEMETRY
using SKC.Telemetry;
#endif

namespace SKC.Editor
{
    /// <summary>
    /// Master Control Center and Dashboard for the SKC Framework.
    /// Provides centralized management, inspector links, and real-time Play Mode debugging
    /// across Core, Economy, Daily Rewards, Levels, UI, Sound, Save, and Pools.
    /// Accessible via menu item: SKC > Control Center (Ctrl+Shift+K).
    /// </summary>
    public class SKCControlCenter : EditorWindow
    {
        private enum TabType
        {
            Overview = 0,
            Economy = 1,
            DailyRewards = 2,
            Levels = 3,
            UIAndPopups = 4,
            AudioAndSound = 5,
            SaveAndStorage = 6,
            ObjectPools = 7,
            SDKAndTools = 8,
            QuickTools = 9,
            PreFlight = 10
        }

        private TabType _selectedTab = TabType.Overview;
        private Vector2 _scrollPosition;
        private Vector2 _sidebarScrollPosition;
        private Vector2 _jsonScrollPosition;

#if SKC_HAS_ECONOMY
        // Custom Grant Fields (Economy Tab)
        private CurrencyType _grantCurrencyType = CurrencyType.Coin;
        private double _grantAmount = 1000;
#endif

#if SKC_HAS_DAILY_REWARDS
        // Simulator Fields (Daily Rewards Tab)
        private double _simulateCustomHours = 24;
#endif

#if SKC_HAS_LEVELS
        // Level Jumper Fields (Levels Tab)
        private int _targetJumpLevel = 1;
#endif

#if SKC_HAS_UI
        // Toast Tester Fields (UI Tab)
        private string _testToastMessage = "Hello from SKC Control Center!";
        private float _testToastDuration = 2.0f;
#endif

#if SKC_HAS_AUDIO
        // Audio Preview Fields
        private AudioSource _editorAudioSource;
#endif

        // SDK Hub Fields
        private SDKCategory _selectedSDKCategory = SDKCategory.All;
        private string _sdkSearchQuery = "";
        private bool _isFetchingRemoteManifest = false;
        private string _manifestStatusMessage = "";
        private MessageType _manifestStatusMessageType = MessageType.None;

        // Package Hub (Modular Packages) Fields
        private int _sdkHubSubTab = 0; // 0 = Third-Party SDKs, 1 = SKC Modular Packages (17)
        private string _pkgSearchQuery = "";
        private string _pkgSelectedCategory = "All";
        private int _selectedGameAsmdefIndex = 0;

        // GUI Styles Cache
        private GUIStyle _headerBoxStyle;
        private GUIStyle _headerTitleStyle;
        private GUIStyle _headerSubtitleStyle;
        private GUIStyle _tabButtonStyle;
        private GUIStyle _selectedTabButtonStyle;
        private GUIStyle _sectionHeaderStyle;
        private GUIStyle _subHeaderStyle;
        private GUIStyle _cardBoxStyle;
        private GUIStyle _badgeActiveStyle;
        private GUIStyle _badgeInactiveStyle;
        private GUIStyle _badgeWarningStyle;
        private GUIStyle _jsonTextAreaStyle;
        private bool _stylesInitialized = false;

        // UI Toolkit Command Deck Fields
        private VisualElement _rootElement;
        private VisualElement _contentViewport;
        private VisualElement _overviewElement;
        private IMGUIContainer _imguiContainer;
        private Label _hudEnvText;
        private VisualElement _hudEnvBadge;
        private Label _archTitleLabel;
        private Label _archSubtitleLabel;
        private Label _archPillLabel;
        private Label _saveStatusBadge;
        private Label _eventStatusBadge;
        private Label _schedulerStatusBadge;

        private Button _btnRailOverview;
        private Button _btnRailSave;
        private Button _btnRailSDKHub;
        private Button _btnRailTools;
        private Button _btnRailPreFlight;
        private readonly List<Button> _railButtons = new List<Button>();
        private readonly Dictionary<TabType, Button> _customRailButtons = new Dictionary<TabType, Button>();
        private TabType _lastDrawnTab = TabType.Overview;

        [MenuItem("SKCore/Control Center %#k", priority = 0)]
        public static void ShowWindow()
        {
            var window = GetWindow<SKCControlCenter>("SKCore Control Center");
            window.minSize = new Vector2(880f, 620f);
            window.Show();
        }

        private void OnEnable()
        {
            _stylesInitialized = false;
        }

        private void OnDisable()
        {
#if SKC_HAS_AUDIO
            StopEditorAudio();
#endif
        }

        private void OnInspectorUpdate()
        {
            if (_selectedTab != _lastDrawnTab)
            {
                _lastDrawnTab = _selectedTab;
                SwitchTab(_selectedTab);
            }

            UpdateEnvironmentBadge();

            // Repaint continuously in Play Mode for live countdowns and currency counters
            if (EditorApplication.isPlaying)
            {
                if (_selectedTab == TabType.Overview)
                {
                    RefreshOverviewState();
                }
                Repaint();
            }
        }

        private void InitStyles()
        {
            if (_stylesInitialized && _headerBoxStyle != null) return;

            _headerBoxStyle = new GUIStyle(GUI.skin.box)
            {
                padding = new RectOffset(16, 16, 12, 12),
                margin = new RectOffset(0, 0, 0, 8)
            };

            _headerTitleStyle = new GUIStyle(EditorStyles.boldLabel)
            {
                fontSize = 18,
                normal = { textColor = new Color(1f, 0.82f, 0.2f) } // Gold
            };

            _headerSubtitleStyle = new GUIStyle(EditorStyles.miniLabel)
            {
                fontSize = 11,
                normal = { textColor = new Color(0.7f, 0.78f, 0.88f) }
            };

            _tabButtonStyle = new GUIStyle(EditorStyles.toolbarButton)
            {
                fontSize = 12,
                fixedHeight = 36,
                alignment = TextAnchor.MiddleLeft,
                padding = new RectOffset(12, 8, 0, 0),
                margin = new RectOffset(0, 0, 2, 2)
            };

            _selectedTabButtonStyle = new GUIStyle(_tabButtonStyle)
            {
                fontStyle = FontStyle.Bold,
                normal = { textColor = new Color(1f, 0.85f, 0.25f), background = Texture2D.grayTexture }
            };

            _sectionHeaderStyle = new GUIStyle(EditorStyles.boldLabel)
            {
                fontSize = 15,
                margin = new RectOffset(0, 0, 8, 4),
                normal = { textColor = new Color(0.95f, 0.95f, 1f) }
            };

            _subHeaderStyle = new GUIStyle(EditorStyles.boldLabel)
            {
                fontSize = 12,
                margin = new RectOffset(0, 0, 6, 2),
                normal = { textColor = new Color(0.8f, 0.88f, 0.98f) }
            };

            _cardBoxStyle = new GUIStyle(EditorStyles.helpBox)
            {
                padding = new RectOffset(14, 14, 12, 12),
                margin = new RectOffset(0, 0, 4, 10)
            };

            _badgeActiveStyle = new GUIStyle(EditorStyles.miniLabel)
            {
                alignment = TextAnchor.MiddleCenter,
                fontStyle = FontStyle.Bold,
                fontSize = 10,
                normal = { textColor = new Color(0.1f, 0.95f, 0.4f) }
            };

            _badgeInactiveStyle = new GUIStyle(_badgeActiveStyle)
            {
                normal = { textColor = new Color(0.7f, 0.7f, 0.7f) }
            };

            _badgeWarningStyle = new GUIStyle(_badgeActiveStyle)
            {
                normal = { textColor = new Color(1f, 0.65f, 0.15f) }
            };

            _jsonTextAreaStyle = new GUIStyle(EditorStyles.textArea)
            {
                fontSize = 11,
                wordWrap = true
            };

            _stylesInitialized = true;
        }

        #region UI Toolkit Command Deck

        public void CreateGUI()
        {
            _rootElement = rootVisualElement;
            _rootElement.Clear();

            // 1. Load Stylesheet
            var styleSheet = AssetDatabase.LoadAssetAtPath<StyleSheet>("Assets/Plugins/SKCFramework/_Scripts/Editor/UI/SKCCommandDeck.uss");
            if (styleSheet != null)
            {
                _rootElement.styleSheets.Add(styleSheet);
            }

            // 2. Load Window Shell UXML
            var windowTree = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>("Assets/Plugins/SKCFramework/_Scripts/Editor/UI/SKCCommandDeck.uxml");
            if (windowTree == null)
            {
                _imguiContainer = new IMGUIContainer(DrawIMGUIContent);
                _imguiContainer.style.flexGrow = 1;
                _rootElement.Add(_imguiContainer);
                return;
            }

            windowTree.CloneTree(_rootElement);

            // 3. UI References
            _contentViewport = _rootElement.Q<VisualElement>("content-viewport");
            _hudEnvText = _rootElement.Q<Label>("hud-env-text");
            _hudEnvBadge = _rootElement.Q<VisualElement>("hud-env-badge");

            // 4. Rail Navigation Buttons
            _railButtons.Clear();
            _customRailButtons.Clear();

            _btnRailOverview = _rootElement.Q<Button>("rail-btn-overview");
            _btnRailSave = _rootElement.Q<Button>("rail-btn-save");
            _btnRailSDKHub = _rootElement.Q<Button>("rail-btn-sdkhub");
            _btnRailTools = _rootElement.Q<Button>("rail-btn-tools");
            _btnRailPreFlight = _rootElement.Q<Button>("rail-btn-preflight");

            if (_btnRailOverview != null) { _railButtons.Add(_btnRailOverview); _btnRailOverview.clicked += () => SwitchTab(TabType.Overview); }
            if (_btnRailSave != null) { _railButtons.Add(_btnRailSave); _btnRailSave.clicked += () => SwitchTab(TabType.SaveAndStorage); }
            if (_btnRailSDKHub != null) { _railButtons.Add(_btnRailSDKHub); _btnRailSDKHub.clicked += () => SwitchTab(TabType.SDKAndTools); }
            if (_btnRailTools != null) { _railButtons.Add(_btnRailTools); _btnRailTools.clicked += () => SwitchTab(TabType.QuickTools); }
            if (_btnRailPreFlight != null) { _railButtons.Add(_btnRailPreFlight); _btnRailPreFlight.clicked += () => SwitchTab(TabType.PreFlight); }

            var railGroup = _rootElement.Q<VisualElement>("rail-top-group");
            if (railGroup != null)
            {
#if SKC_HAS_ECONOMY
                AddCustomRailButton(railGroup, "💰", "Economy & Balance", TabType.Economy);
#endif
#if SKC_HAS_DAILY_REWARDS
                AddCustomRailButton(railGroup, "🎁", "Daily Rewards", TabType.DailyRewards);
#endif
#if SKC_HAS_LEVELS
                AddCustomRailButton(railGroup, "🗺️", "Levels & Progress", TabType.Levels);
#endif
#if SKC_HAS_UI
                AddCustomRailButton(railGroup, "🖼️", "UI & Popups", TabType.UIAndPopups);
#endif
#if SKC_HAS_AUDIO
                AddCustomRailButton(railGroup, "🎵", "Audio & Sound", TabType.AudioAndSound);
#endif
#if SKC_HAS_POOLING
                AddCustomRailButton(railGroup, "🏊", "Object Pools", TabType.ObjectPools);
#endif
            }

            // 5. Bottom Quick Dock Actions
            var btnSaveFolder = _rootElement.Q<Button>("dock-btn-save-folder");
            if (btnSaveFolder != null)
            {
                btnSaveFolder.clicked += () => EditorUtility.RevealInFinder(Application.persistentDataPath);
            }

            var btnWipeSave = _rootElement.Q<Button>("dock-btn-wipe-save");
            if (btnWipeSave != null)
            {
                btnWipeSave.clicked += () =>
                {
                    if (EditorUtility.DisplayDialog("Confirm Delete Save", "Are you sure you want to delete the game save file?", "Delete", "Cancel"))
                    {
                        DeleteSaveFile();
                    }
                };
            }

            var btnTestLog = _rootElement.Q<Button>("dock-btn-test-log");
            if (btnTestLog != null)
            {
                btnTestLog.clicked += () => SKCLog.Info(LogTag.Core, "🪵 Test log emitted from SKC Command Deck!");
            }

            var btnCoreSettings = _rootElement.Q<Button>("dock-btn-core-settings");
            if (btnCoreSettings != null)
            {
                btnCoreSettings.clicked += () => PingResourceAsset("SKCoreServiceSettings");
            }

            // 6. Viewport Children Setup (Overview UI Toolkit + IMGUI Tab Container)
            if (_contentViewport != null)
            {
                var overviewTree = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>("Assets/Plugins/SKCFramework/_Scripts/Editor/UI/OverviewTab_CommandDeck.uxml");
                if (overviewTree != null)
                {
                    _overviewElement = overviewTree.Instantiate();
                    _overviewElement.style.flexGrow = 1;
                    SetupOverviewBindings(_overviewElement);
                    _contentViewport.Add(_overviewElement);
                }

                _imguiContainer = new IMGUIContainer(DrawIMGUIContent);
                _imguiContainer.style.flexGrow = 1;
                _imguiContainer.style.paddingLeft = 14;
                _imguiContainer.style.paddingRight = 14;
                _imguiContainer.style.paddingTop = 12;
                _imguiContainer.style.paddingBottom = 12;
                _contentViewport.Add(_imguiContainer);
            }

            UpdateEnvironmentBadge();
            SwitchTab(_selectedTab);
        }

        private void AddCustomRailButton(VisualElement parent, string icon, string tooltip, TabType tab)
        {
            var btn = new Button(() => SwitchTab(tab))
            {
                tooltip = tooltip
            };
            btn.AddToClassList("rail-button");
            var label = new Label(icon);
            label.AddToClassList("rail-icon-text");
            btn.Add(label);

            parent.Add(btn);
            _railButtons.Add(btn);
            _customRailButtons[tab] = btn;
        }

        private void SwitchTab(TabType tab)
        {
            _selectedTab = tab;
            _lastDrawnTab = tab;

            foreach (var b in _railButtons)
            {
                b.RemoveFromClassList("rail-button-active");
            }

            switch (tab)
            {
                case TabType.Overview:
                    _btnRailOverview?.AddToClassList("rail-button-active");
                    break;
                case TabType.SaveAndStorage:
                    _btnRailSave?.AddToClassList("rail-button-active");
                    break;
                case TabType.SDKAndTools:
                    _btnRailSDKHub?.AddToClassList("rail-button-active");
                    break;
                case TabType.QuickTools:
                    _btnRailTools?.AddToClassList("rail-button-active");
                    break;
                case TabType.PreFlight:
                    _btnRailPreFlight?.AddToClassList("rail-button-active");
                    break;
                default:
                    if (_customRailButtons.TryGetValue(tab, out var customBtn) && customBtn != null)
                    {
                        customBtn.AddToClassList("rail-button-active");
                    }
                    break;
            }

            if (_overviewElement != null)
            {
                _overviewElement.style.display = (tab == TabType.Overview) ? DisplayStyle.Flex : DisplayStyle.None;
            }

            if (_imguiContainer != null)
            {
                _imguiContainer.style.display = (tab != TabType.Overview) ? DisplayStyle.Flex : DisplayStyle.None;
                _imguiContainer.MarkDirtyLayout();
            }

            if (tab == TabType.Overview)
            {
                RefreshOverviewState();
            }
        }

        private void UpdateEnvironmentBadge()
        {
            if (_hudEnvText == null) return;

            bool isPlaying = EditorApplication.isPlaying;
            _hudEnvText.text = isPlaying ? "LIVE PLAY MODE" : "EDIT MODE";
            if (_hudEnvBadge != null)
            {
                _hudEnvBadge.style.backgroundColor = isPlaying 
                    ? new StyleColor(new Color(0.06f, 0.72f, 0.5f, 0.15f))
                    : new StyleColor(new Color(0.96f, 0.62f, 0.07f, 0.15f));
                _hudEnvBadge.style.borderTopColor = isPlaying ? new StyleColor(new Color(0.06f, 0.72f, 0.5f, 0.4f)) : new StyleColor(new Color(0.96f, 0.62f, 0.07f, 0.4f));
                _hudEnvBadge.style.borderBottomColor = _hudEnvBadge.style.borderTopColor;
                _hudEnvBadge.style.borderLeftColor = _hudEnvBadge.style.borderTopColor;
                _hudEnvBadge.style.borderRightColor = _hudEnvBadge.style.borderTopColor;
            }
            if (_hudEnvText != null)
            {
                _hudEnvText.style.color = isPlaying ? new StyleColor(new Color(0.06f, 0.72f, 0.5f, 1f)) : new StyleColor(new Color(0.96f, 0.62f, 0.07f, 1f));
            }
        }

        private void SetupOverviewBindings(VisualElement overview)
        {
            _archTitleLabel = overview.Q<Label>("label-arch-title");
            _archSubtitleLabel = overview.Q<Label>("label-arch-subtitle");
            _archPillLabel = overview.Q<Label>("label-arch-pill");
            _saveStatusBadge = overview.Q<Label>("badge-status-save");
            _eventStatusBadge = overview.Q<Label>("badge-status-event");
            _schedulerStatusBadge = overview.Q<Label>("badge-status-scheduler");

            // Open SDK Hub Button
            var btnSdkHub = overview.Q<Button>("btn-open-sdkhub");
            if (btnSdkHub != null)
            {
                btnSdkHub.clicked += () =>
                {
                    _sdkHubSubTab = 1;
                    SwitchTab(TabType.SDKAndTools);
                };
            }

            // Ping Log Settings Button
            var btnPingLog = overview.Q<Button>("btn-ping-log-settings");
            if (btnPingLog != null)
            {
                btnPingLog.clicked += () => PingResourceAsset("LogSettings");
            }

            // SKCoreServiceSettings Toggles
            var settings = Resources.Load<SKCoreServiceSettings>("SKCoreServiceSettings");
            if (settings != null)
            {
                var toggleSave = overview.Q<Toggle>("toggle-save-service");
                if (toggleSave != null)
                {
                    toggleSave.SetValueWithoutNotify(settings.enableSaveService);
                    toggleSave.RegisterValueChangedCallback(evt =>
                    {
                        settings.enableSaveService = evt.newValue;
                        EditorUtility.SetDirty(settings);
                        AssetDatabase.SaveAssets();
                    });
                }

                var toggleEvent = overview.Q<Toggle>("toggle-event-service");
                if (toggleEvent != null)
                {
                    toggleEvent.SetValueWithoutNotify(settings.enableEventService);
                    toggleEvent.RegisterValueChangedCallback(evt =>
                    {
                        settings.enableEventService = evt.newValue;
                        EditorUtility.SetDirty(settings);
                        AssetDatabase.SaveAssets();
                    });
                }

                var toggleScheduler = overview.Q<Toggle>("toggle-scheduler-service");
                if (toggleScheduler != null)
                {
                    toggleScheduler.SetValueWithoutNotify(settings.enableSchedulerService);
                    toggleScheduler.RegisterValueChangedCallback(evt =>
                    {
                        settings.enableSchedulerService = evt.newValue;
                        EditorUtility.SetDirty(settings);
                        AssetDatabase.SaveAssets();
                    });
                }
            }

            // LogSettings Controls
            var logSettings = GetOrCreateLogSettings();
            var toggleLog = overview.Q<Toggle>("toggle-enable-logging");
            var toggleColor = overview.Q<Toggle>("toggle-color-tags");
            var toggleTime = overview.Q<Toggle>("toggle-timestamps");
            var btnDev = overview.Q<Button>("btn-profile-dev");
            var btnProd = overview.Q<Button>("btn-profile-prod");

            Action updateProfileUI = () =>
            {
                if (logSettings == null || btnDev == null || btnProd == null) return;
                bool isDev = logSettings.profile == BuildLoggingProfile.Development;
                if (isDev)
                {
                    btnDev.AddToClassList("deck-btn-primary");
                    btnDev.RemoveFromClassList("deck-btn-secondary");
                    btnProd.AddToClassList("deck-btn-secondary");
                    btnProd.RemoveFromClassList("deck-btn-primary");
                }
                else
                {
                    btnProd.AddToClassList("deck-btn-primary");
                    btnProd.RemoveFromClassList("deck-btn-secondary");
                    btnDev.AddToClassList("deck-btn-secondary");
                    btnDev.RemoveFromClassList("deck-btn-primary");
                }
            };

            if (logSettings != null)
            {
                if (toggleLog != null)
                {
                    toggleLog.SetValueWithoutNotify(logSettings.enableLogging);
                    toggleLog.RegisterValueChangedCallback(evt =>
                    {
                        logSettings.enableLogging = evt.newValue;
                        EditorUtility.SetDirty(logSettings);
                        AssetDatabase.SaveAssets();
                    });
                }

                // Min Log Level Dropdown
                var minLevelContainer = overview.Q<VisualElement>("container-min-log-level");
                if (minLevelContainer != null)
                {
                    minLevelContainer.Clear();
                    var minLevelField = new EnumField("Min Level:", logSettings.minLogLevel);
                    minLevelField.style.fontSize = 11;
                    minLevelField.style.width = 175;
                    minLevelField.RegisterValueChangedCallback(evt =>
                    {
                        logSettings.minLogLevel = (LogLevel)evt.newValue;
                        EditorUtility.SetDirty(logSettings);
                        AssetDatabase.SaveAssets();
                    });
                    minLevelContainer.Add(minLevelField);
                }

                if (toggleColor != null)
                {
                    toggleColor.SetValueWithoutNotify(logSettings.useRichTextColor);
                    toggleColor.RegisterValueChangedCallback(evt =>
                    {
                        logSettings.useRichTextColor = evt.newValue;
                        EditorUtility.SetDirty(logSettings);
                        AssetDatabase.SaveAssets();
                    });
                }

                if (toggleTime != null)
                {
                    toggleTime.SetValueWithoutNotify(logSettings.showTimestamp);
                    toggleTime.RegisterValueChangedCallback(evt =>
                    {
                        logSettings.showTimestamp = evt.newValue;
                        EditorUtility.SetDirty(logSettings);
                        AssetDatabase.SaveAssets();
                    });
                }

                updateProfileUI();

                if (btnDev != null)
                {
                    btnDev.clicked += () =>
                    {
                        logSettings.profile = BuildLoggingProfile.Development;
                        logSettings.enableLogging = true;
                        EditorUtility.SetDirty(logSettings);
                        AssetDatabase.SaveAssets();
                        toggleLog?.SetValueWithoutNotify(true);
                        updateProfileUI();
                    };
                }

                if (btnProd != null)
                {
                    btnProd.clicked += () =>
                    {
                        logSettings.profile = BuildLoggingProfile.Production;
                        EditorUtility.SetDirty(logSettings);
                        AssetDatabase.SaveAssets();
                        updateProfileUI();
                    };
                }

                // Channel Filters Grid
                var gridContainer = overview.Q<VisualElement>("channels-grid-container");
                var channelToggles = new List<Toggle>();

                if (gridContainer != null && logSettings.tagConfigs != null)
                {
                    gridContainer.Clear();
                    channelToggles.Clear();

                    foreach (var cfg in logSettings.tagConfigs)
                    {
                        var itemBox = new VisualElement();
                        itemBox.AddToClassList("channel-item-box");

                        var dot = new VisualElement();
                        dot.AddToClassList("channel-dot");
                        if (ColorUtility.TryParseHtmlString(cfg.hexColor, out var parsedCol))
                        {
                            dot.style.backgroundColor = parsedCol;
                        }
                        else
                        {
                            dot.style.backgroundColor = Color.white;
                        }

                        var toggle = new Toggle(cfg.tag.ToString())
                        {
                            value = cfg.isEnabled
                        };
                        toggle.AddToClassList("channel-toggle");

                        var localCfg = cfg;
                        toggle.RegisterValueChangedCallback(evt =>
                        {
                            localCfg.isEnabled = evt.newValue;
                            EditorUtility.SetDirty(logSettings);
                            AssetDatabase.SaveAssets();
                        });

                        itemBox.Add(dot);
                        itemBox.Add(toggle);
                        gridContainer.Add(itemBox);
                        channelToggles.Add(toggle);
                    }
                }

                var btnEnableAll = overview.Q<Button>("btn-enable-all-channels");
                if (btnEnableAll != null)
                {
                    btnEnableAll.clicked += () =>
                    {
                        logSettings.EnableAllTags();
                        EditorUtility.SetDirty(logSettings);
                        AssetDatabase.SaveAssets();
                        for (int i = 0; i < channelToggles.Count && i < logSettings.tagConfigs.Count; i++)
                        {
                            channelToggles[i].SetValueWithoutNotify(true);
                        }
                    };
                }

                var btnMuteAll = overview.Q<Button>("btn-mute-all-channels");
                if (btnMuteAll != null)
                {
                    btnMuteAll.clicked += () =>
                    {
                        logSettings.MuteAllTags();
                        EditorUtility.SetDirty(logSettings);
                        AssetDatabase.SaveAssets();
                        for (int i = 0; i < channelToggles.Count && i < logSettings.tagConfigs.Count; i++)
                        {
                            channelToggles[i].SetValueWithoutNotify(false);
                        }
                    };
                }

                // Send Test Logs Button
                var btnSendTestLogs = overview.Q<Button>("btn-send-test-logs");
                if (btnSendTestLogs != null)
                {
                    btnSendTestLogs.clicked += () =>
                    {
                        SKCLog.Info(LogTag.Core, "Core service initialized.");
                        SKCLog.Info(LogTag.Economy, "Granted 500 Coins with Bezier Fly.");
                        SKCLog.Info(LogTag.Levels, "Loaded Level 3 (Physical Index 3).");
                        SKCLog.Info(LogTag.UI, "Opened DailyRewardPopup via queue.");
                        SKCLog.Info(LogTag.SDK, "Firebase & GameAnalytics initialized.");
                        SKCLog.Info(LogTag.Analytics, "Tracked event: level_completed.");
                        SKCLog.Info(LogTag.Ads, "Rewarded video ad loaded.");
                        SKCLog.Warning(LogTag.General, "Sample Warning logged.");
                    };
                }

                // Sync Scripting Define Symbols Button
                var btnSyncDefines = overview.Q<Button>("btn-sync-define-symbols");
                if (btnSyncDefines != null)
                {
                    btnSyncDefines.clicked += () =>
                    {
                        SyncLoggingDefineSymbols(logSettings.profile == BuildLoggingProfile.Development);
                    };
                }
            }

            RefreshOverviewState();
        }

        private void RefreshOverviewState()
        {
            int installedModularCount = 0;
#if SKC_HAS_POOLING
            installedModularCount++;
#endif
#if SKC_HAS_AUDIO
            installedModularCount++;
#endif
#if SKC_HAS_HAPTICS
            installedModularCount++;
#endif
#if SKC_HAS_TRANSITIONS
            installedModularCount++;
#endif
#if SKC_HAS_LEVELS
            installedModularCount++;
#endif
#if SKC_HAS_ECONOMY
            installedModularCount++;
#endif
#if SKC_HAS_DAILY_REWARDS
            installedModularCount++;
#endif
#if SKC_HAS_UI
            installedModularCount++;
#endif
#if SKC_HAS_INPUTS
            installedModularCount++;
#endif
#if SKC_HAS_IAP
            installedModularCount++;
#endif
#if SKC_HAS_PRIVACY
            installedModularCount++;
#endif
#if SKC_HAS_REVIEW
            installedModularCount++;
#endif
#if SKC_HAS_NOTIFICATIONS
            installedModularCount++;
#endif
#if SKC_HAS_TELEMETRY
            installedModularCount++;
#endif
#if SKC_HAS_ADS
            installedModularCount++;
#endif
#if SKC_HAS_ANALYTICS
            installedModularCount++;
#endif

            if (_archTitleLabel != null)
            {
                _archTitleLabel.text = installedModularCount == 0
                    ? "Architecture State: Pure Service Locator (Minimal Core)"
                    : $"Architecture State: Modular Framework ({installedModularCount}/16 Packages Active)";
            }

            if (_archSubtitleLabel != null)
            {
                _archSubtitleLabel.text = installedModularCount == 0
                    ? "0 / 16 Optional Modular Packages installed · Minimal runtime footprint"
                    : $"{installedModularCount} / 16 Modular Packages installed and active in assembly definitions";
            }

            if (_archPillLabel != null)
            {
                _archPillLabel.text = installedModularCount == 0 ? "PURE LOCATOR ACTIVE" : "MODULAR ACTIVE";
            }

            bool isPlaying = EditorApplication.isPlaying;
            if (_saveStatusBadge != null)
                _saveStatusBadge.text = isPlaying && SKCore.Save != null ? "ACTIVE" : "READY";
            if (_eventStatusBadge != null)
                _eventStatusBadge.text = isPlaying && SKCore.Events != null ? "ACTIVE" : "READY";
            if (_schedulerStatusBadge != null)
                _schedulerStatusBadge.text = isPlaying && SKCore.SchedulerService != null ? "ACTIVE" : "READY";
        }

        #endregion

        private void DrawIMGUIContent()
        {
            InitStyles();

            _scrollPosition = EditorGUILayout.BeginScrollView(_scrollPosition, GUILayout.ExpandWidth(true), GUILayout.ExpandHeight(true));
            {
                EditorGUILayout.BeginVertical(GUILayout.MinHeight(500));
                {
                    switch (_selectedTab)
                    {
                        case TabType.Overview:
                            DrawOverviewTab();
                            break;
#if SKC_HAS_ECONOMY
                        case TabType.Economy:
                            DrawEconomyTab();
                            break;
#endif
#if SKC_HAS_DAILY_REWARDS
                        case TabType.DailyRewards:
                            DrawDailyRewardsTab();
                            break;
#endif
#if SKC_HAS_LEVELS
                        case TabType.Levels:
                            DrawLevelsTab();
                            break;
#endif
#if SKC_HAS_UI
                        case TabType.UIAndPopups:
                            DrawUITab();
                            break;
#endif
#if SKC_HAS_AUDIO
                        case TabType.AudioAndSound:
                            DrawAudioTab();
                            break;
#endif
                        case TabType.SaveAndStorage:
                            DrawSaveTab();
                            break;
#if SKC_HAS_POOLING
                        case TabType.ObjectPools:
                            DrawPoolsTab();
                            break;
#endif
                        case TabType.SDKAndTools:
                            DrawSDKHubTab();
                            break;
                        case TabType.QuickTools:
                            DrawQuickToolsTab();
                            break;
                        case TabType.PreFlight:
                            DrawPreFlightTab();
                            break;
                    }
                }
                EditorGUILayout.EndVertical();
            }
            EditorGUILayout.EndScrollView();
        }

        #region Header Banner

        private void DrawHeaderBanner()
        {
            EditorGUILayout.BeginVertical(_headerBoxStyle);
            {
                EditorGUILayout.BeginHorizontal();
                {
                    // Title and Subtitle
                    EditorGUILayout.BeginVertical();
                    {
                        EditorGUILayout.LabelField("⚡ SKC FRAMEWORK CONTROL CENTER", _headerTitleStyle);
                        EditorGUILayout.LabelField("Unified Architecture, Services & Runtime Management Suite", _headerSubtitleStyle);
                    }
                    EditorGUILayout.EndVertical();

                    GUILayout.FlexibleSpace();

                    // Play Mode Status Pill Badge
                    if (EditorApplication.isPlaying)
                    {
                        GUI.backgroundColor = new Color(0.15f, 0.8f, 0.35f);
                        GUILayout.Box("▶  LIVE RUNTIME (PLAY MODE)", GUILayout.Height(28), GUILayout.Width(190));
                    }
                    else
                    {
                        GUI.backgroundColor = new Color(0.35f, 0.42f, 0.52f);
                        GUILayout.Box("■  CONFIG & ASSETS (EDIT MODE)", GUILayout.Height(28), GUILayout.Width(190));
                    }
                    GUI.backgroundColor = Color.white;

                    // Quick Header Action Buttons
                    if (GUILayout.Button("📂 Save Folder", EditorStyles.toolbarButton, GUILayout.Height(28)))
                    {
                        EditorUtility.RevealInFinder(Application.persistentDataPath);
                    }

                    if (GUILayout.Button("🗑️ Delete Save", EditorStyles.toolbarButton, GUILayout.Height(28)))
                    {
                        if (EditorUtility.DisplayDialog("Confirm Delete Save", "Are you sure you want to delete the game save file?", "Delete", "Cancel"))
                        {
                            DeleteSaveFile();
                        }
                    }

                    if (GUILayout.Button("⚙️ Core Settings", EditorStyles.toolbarButton, GUILayout.Height(28)))
                    {
                        PingResourceAsset("SKCoreServiceSettings");
                    }
                }
                EditorGUILayout.EndHorizontal();
            }
            EditorGUILayout.EndVertical();
        }

        #endregion

        #region Left Navigation Sidebar

        private void DrawSidebar()
        {
            EditorGUILayout.BeginVertical(GUILayout.Width(190), GUILayout.ExpandHeight(true));
            {
                _sidebarScrollPosition = EditorGUILayout.BeginScrollView(_sidebarScrollPosition);
                {
                    DrawTabButton(TabType.Overview, "⚙️  Overview & Core");
#if SKC_HAS_ECONOMY
                    DrawTabButton(TabType.Economy, "💰  Economy & Balance");
#endif
#if SKC_HAS_DAILY_REWARDS
                    DrawTabButton(TabType.DailyRewards, "🎁  Daily Rewards");
#endif
#if SKC_HAS_LEVELS
                    DrawTabButton(TabType.Levels, "🗺️  Levels & Progress");
#endif
#if SKC_HAS_UI
                    DrawTabButton(TabType.UIAndPopups, "🖼️  UI & Popups");
#endif
#if SKC_HAS_AUDIO
                    DrawTabButton(TabType.AudioAndSound, "🎵  Audio & Sound");
#endif
                    DrawTabButton(TabType.SaveAndStorage, "💾  Save & Storage");
#if SKC_HAS_POOLING
                    DrawTabButton(TabType.ObjectPools, "🏊  Object Pools");
#endif
                    DrawTabButton(TabType.SDKAndTools, "🌐  SDK & Tools Hub");
                    DrawTabButton(TabType.QuickTools, "⚡  Quick Tools");
                    DrawTabButton(TabType.PreFlight, "🛫  Pre-Flight Checklist");
                }
                EditorGUILayout.EndScrollView();
            }
            EditorGUILayout.EndVertical();
        }

        private void DrawTabButton(TabType tab, string label)
        {
            bool isSelected = _selectedTab == tab;
            GUIStyle style = isSelected ? _selectedTabButtonStyle : _tabButtonStyle;

            if (isSelected)
            {
                GUI.backgroundColor = new Color(0.2f, 0.45f, 0.75f);
            }

            if (GUILayout.Button(label, style))
            {
                _selectedTab = tab;
                GUI.FocusControl(null);
            }

            GUI.backgroundColor = Color.white;
        }

        #endregion

        #region Tab 1: Overview & Services

        private void DrawOverviewTab()
        {
            DrawSectionHeader("⚙️ Framework Overview & Service Registry", "Monitors service lifecycle, execution health, and configuration flags.");

            // 0. Architecture Mode Banner
            int installedModularCount = 0;
#if SKC_HAS_POOLING
            installedModularCount++;
#endif
#if SKC_HAS_AUDIO
            installedModularCount++;
#endif
#if SKC_HAS_HAPTICS
            installedModularCount++;
#endif
#if SKC_HAS_TRANSITIONS
            installedModularCount++;
#endif
#if SKC_HAS_LEVELS
            installedModularCount++;
#endif
#if SKC_HAS_ECONOMY
            installedModularCount++;
#endif
#if SKC_HAS_DAILY_REWARDS
            installedModularCount++;
#endif
#if SKC_HAS_UI
            installedModularCount++;
#endif
#if SKC_HAS_INPUTS
            installedModularCount++;
#endif
#if SKC_HAS_IAP
            installedModularCount++;
#endif
#if SKC_HAS_PRIVACY
            installedModularCount++;
#endif
#if SKC_HAS_REVIEW
            installedModularCount++;
#endif
#if SKC_HAS_NOTIFICATIONS
            installedModularCount++;
#endif
#if SKC_HAS_TELEMETRY
            installedModularCount++;
#endif
#if SKC_HAS_ADS
            installedModularCount++;
#endif
#if SKC_HAS_ANALYTICS
            installedModularCount++;
#endif

            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.BeginHorizontal();
                {
                    if (installedModularCount == 0)
                    {
                        EditorGUILayout.LabelField("🎯 Architecture Mode: Pure Service Locator (Minimal Core)", _subHeaderStyle);
                        GUILayout.FlexibleSpace();
                        GUILayout.Label("PURE LOCATOR ACTIVE", _badgeActiveStyle, GUILayout.Width(160));
                    }
                    else
                    {
                        EditorGUILayout.LabelField($"🧩 Architecture Mode: Modular Framework ({installedModularCount}/16 Packages Active)", _subHeaderStyle);
                        GUILayout.FlexibleSpace();
                        GUILayout.Label("MODULAR EXPANDED", _badgeActiveStyle, GUILayout.Width(160));
                    }
                }
                EditorGUILayout.EndHorizontal();

                EditorGUILayout.Space(2);
                if (installedModularCount == 0)
                {
                    EditorGUILayout.HelpBox(
                        "Your project is operating in pure Service Locator mode. Only lightweight core systems " +
                        "(SKCore, Event Bus, Segmented SaveData, Logging, and Scheduler) are compiled. " +
                        "Zero unnecessary packages or memory overhead.",
                        MessageType.Info
                    );

                    EditorGUILayout.BeginHorizontal();
                    {
                        GUILayout.FlexibleSpace();
                        if (GUILayout.Button("📦 Browse & Install Modular Packages (SDK Hub)", EditorStyles.miniButton, GUILayout.Width(310), GUILayout.Height(24)))
                        {
                            _selectedTab = TabType.SDKAndTools;
                            _sdkHubSubTab = 1;
                        }
                    }
                    EditorGUILayout.EndHorizontal();
                }
                else
                {
                    EditorGUILayout.BeginHorizontal();
                    {
                        EditorGUILayout.LabelField($"Active modular packages: {installedModularCount} installed. Uninstalled modules produce zero binary overhead.", EditorStyles.miniLabel);
                        GUILayout.FlexibleSpace();
                        if (GUILayout.Button("📦 Manage Packages", EditorStyles.miniButton, GUILayout.Width(140)))
                        {
                            _selectedTab = TabType.SDKAndTools;
                            _sdkHubSubTab = 1;
                        }
                    }
                    EditorGUILayout.EndHorizontal();
                }
            }
            EditorGUILayout.EndVertical();

            // 1. Live Service Status Matrix
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.LabelField("Service Runtime Lifecycle Matrix", _subHeaderStyle);

                if (!EditorApplication.isPlaying)
                {
                    EditorGUILayout.BeginHorizontal(EditorStyles.toolbar);
                    {
                        EditorGUILayout.LabelField("Service Contract", EditorStyles.boldLabel, GUILayout.Width(180));
                        EditorGUILayout.LabelField("Category", EditorStyles.boldLabel, GUILayout.Width(110));
                        EditorGUILayout.LabelField("Status", EditorStyles.boldLabel, GUILayout.Width(120));
                        EditorGUILayout.LabelField("Note", EditorStyles.boldLabel);
                    }
                    EditorGUILayout.EndHorizontal();

                    DrawStandbyServiceRow("SaveService", "Core Foundation");
                    DrawStandbyServiceRow("EventService", "Core Foundation");
                    DrawStandbyServiceRow("SchedulerService", "Core Foundation");

#if SKC_HAS_POOLING
                    DrawStandbyServiceRow("PoolService", "Modular Package");
#endif
#if SKC_HAS_AUDIO
                    DrawStandbyServiceRow("SoundService", "Modular Package");
#endif
#if SKC_HAS_HAPTICS
                    DrawStandbyServiceRow("HapticService", "Modular Package");
#endif
#if SKC_HAS_TRANSITIONS
                    DrawStandbyServiceRow("TransitionService", "Modular Package");
#endif
#if SKC_HAS_LEVELS
                    DrawStandbyServiceRow("LevelService", "Modular Package");
#endif
#if SKC_HAS_ECONOMY
                    DrawStandbyServiceRow("CurrencyService", "Modular Package");
#endif
#if SKC_HAS_DAILY_REWARDS
                    DrawStandbyServiceRow("DailyRewardService", "Modular Package");
#endif
#if SKC_HAS_UI
                    DrawStandbyServiceRow("UIService", "Modular Package");
#endif
#if SKC_HAS_IAP
                    DrawStandbyServiceRow("IAPService", "Modular Package");
#endif
#if SKC_HAS_PRIVACY
                    DrawStandbyServiceRow("PrivacyService", "Modular Package");
#endif
#if SKC_HAS_REVIEW
                    DrawStandbyServiceRow("ReviewService", "Modular Package");
#endif
#if SKC_HAS_NOTIFICATIONS
                    DrawStandbyServiceRow("NotificationService", "Modular Package");
#endif
#if SKC_HAS_TELEMETRY
                    DrawStandbyServiceRow("LevelTelemetryTracker", "Modular Package");
#endif

                    EditorGUILayout.Space(4);
                    EditorGUILayout.HelpBox("Enter Play Mode to inspect live initialization timing, dynamic runtime registrations (SKCore.Register<T>), and memory metrics.", MessageType.None);
                }
                else
                {
                    EditorGUILayout.BeginHorizontal(EditorStyles.toolbar);
                    {
                        EditorGUILayout.LabelField("Service Name", EditorStyles.boldLabel, GUILayout.Width(180));
                        EditorGUILayout.LabelField("Status", EditorStyles.boldLabel, GUILayout.Width(110));
                        EditorGUILayout.LabelField("Init Duration", EditorStyles.boldLabel, GUILayout.Width(110));
                        EditorGUILayout.LabelField("Type", EditorStyles.boldLabel);
                    }
                    EditorGUILayout.EndHorizontal();

                    DrawServiceRow("SaveService", SKCore.Save);
                    DrawServiceRow("EventService", SKCore.Events);
                    DrawServiceRow("SchedulerService", SKCore.SchedulerService);
#if SKC_HAS_POOLING
                    DrawServiceRow("PoolService", SKCore.PoolService);
#endif
#if SKC_HAS_AUDIO
                    DrawServiceRow("SoundService", SKCore.SoundService);
#endif
#if SKC_HAS_HAPTICS
                    DrawServiceRow("HapticService", SKCore.HapticService);
#endif
#if SKC_HAS_TRANSITIONS
                    DrawServiceRow("TransitionService", SKCore.TransitionService);
#endif
#if SKC_HAS_LEVELS
                    DrawServiceRow("LevelService", SKCore.LevelService);
#endif
#if SKC_HAS_ECONOMY
                    DrawServiceRow("CurrencyService", SKCore.CurrencyService);
#endif
#if SKC_HAS_DAILY_REWARDS
                    DrawServiceRow("DailyRewardService", SKCore.DailyRewardService);
#endif
#if SKC_HAS_UI
                    DrawServiceRow("UIService", SKCore.UIService);
#endif
#if SKC_HAS_IAP
                    DrawServiceRow("IAPService", SKCore.IAPService);
#endif
#if SKC_HAS_PRIVACY
                    DrawServiceRow("PrivacyService", SKCore.PrivacyService);
#endif
#if SKC_HAS_REVIEW
                    DrawServiceRow("ReviewService", SKCore.ReviewService);
#endif
#if SKC_HAS_NOTIFICATIONS
                    DrawServiceRow("NotificationService", SKCore.NotificationService);
#endif
#if SKC_HAS_TELEMETRY
                    DrawServiceRow("LevelTelemetryTracker", SKCore.LevelTelemetryTracker);
#endif

                    // Dynamically Registered Custom Services (Pure Locator runtime extensions)
                    if (SKCore.DynamicServices != null)
                    {
                        foreach (var kvp in SKCore.DynamicServices)
                        {
                            if (kvp.Value == null) continue;
                            string typeName = kvp.Key.Name;
                            if (typeName == "SaveService" || typeName == "EventService" || typeName == "SchedulerService" ||
                                typeName == "ISaveService" || typeName == "IEventService" ||
                                typeName == "PoolService" || typeName == "SoundService" || typeName == "HapticService" ||
                                typeName == "TransitionService" || typeName == "SceneService" || typeName == "LevelService" ||
                                typeName == "CurrencyService" || typeName == "DailyRewardService" || typeName == "UIService" ||
                                typeName == "IAPService" || typeName == "PrivacyService" || typeName == "ReviewService" ||
                                typeName == "NotificationService" || typeName == "LevelTelemetryTracker")
                            {
                                continue;
                            }
                            DrawServiceRow($"[Custom] {typeName}", kvp.Value);
                        }
                    }
                }
            }
            EditorGUILayout.EndVertical();

            // 2. Core Service Flags Configuration
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.BeginHorizontal();
                {
                    EditorGUILayout.LabelField("⚡ Core Foundation Service Flags (SKCoreServiceSettings.asset)", _subHeaderStyle);
                    GUILayout.FlexibleSpace();
                    if (GUILayout.Button("Ping Asset", EditorStyles.miniButton, GUILayout.Width(80)))
                    {
                        PingResourceAsset("SKCoreServiceSettings");
                    }
                }
                EditorGUILayout.EndHorizontal();

                var settings = Resources.Load<SKCoreServiceSettings>("SKCoreServiceSettings");
                if (settings == null)
                {
                    EditorGUILayout.HelpBox("SKCoreServiceSettings.asset not found in Resources folder!", MessageType.Warning);
                }
                else
                {
                    EditorGUI.BeginChangeCheck();

                    // Only Real Core Foundation Services
                    EditorGUILayout.BeginHorizontal();
                    settings.enableSaveService = EditorGUILayout.ToggleLeft("Save Service", settings.enableSaveService, GUILayout.Width(160));
                    settings.enableEventService = EditorGUILayout.ToggleLeft("Event Service", settings.enableEventService, GUILayout.Width(160));
                    settings.enableSchedulerService = EditorGUILayout.ToggleLeft("Scheduler Service", settings.enableSchedulerService, GUILayout.Width(160));
                    EditorGUILayout.EndHorizontal();

                    // Only Show Modular Flags if the corresponding package is ACTUALLY installed
                    if (installedModularCount > 0)
                    {
                        EditorGUILayout.Space(8);
                        EditorGUILayout.LabelField($"Installed Modular Service Flags ({installedModularCount} active):", EditorStyles.boldLabel);

                        EditorGUILayout.BeginHorizontal();
                        int col = 0;
#if SKC_HAS_POOLING
                        settings.enablePoolService = EditorGUILayout.ToggleLeft("Pool Service", settings.enablePoolService, GUILayout.Width(160));
                        col++; if (col % 3 == 0) { EditorGUILayout.EndHorizontal(); EditorGUILayout.BeginHorizontal(); }
#endif
#if SKC_HAS_AUDIO
                        settings.enableSoundService = EditorGUILayout.ToggleLeft("Sound Service", settings.enableSoundService, GUILayout.Width(160));
                        col++; if (col % 3 == 0) { EditorGUILayout.EndHorizontal(); EditorGUILayout.BeginHorizontal(); }
#endif
#if SKC_HAS_HAPTICS
                        settings.enableHapticService = EditorGUILayout.ToggleLeft("Haptic Service", settings.enableHapticService, GUILayout.Width(160));
                        col++; if (col % 3 == 0) { EditorGUILayout.EndHorizontal(); EditorGUILayout.BeginHorizontal(); }
#endif
#if SKC_HAS_TRANSITIONS
                        settings.enableTransitionService = EditorGUILayout.ToggleLeft("Transition Service", settings.enableTransitionService, GUILayout.Width(160));
                        col++; if (col % 3 == 0) { EditorGUILayout.EndHorizontal(); EditorGUILayout.BeginHorizontal(); }
                        settings.enableSceneService = EditorGUILayout.ToggleLeft("Scene Service", settings.enableSceneService, GUILayout.Width(160));
                        col++; if (col % 3 == 0) { EditorGUILayout.EndHorizontal(); EditorGUILayout.BeginHorizontal(); }
#endif
#if SKC_HAS_LEVELS
                        settings.enableLevelService = EditorGUILayout.ToggleLeft("Level Service", settings.enableLevelService, GUILayout.Width(160));
                        col++; if (col % 3 == 0) { EditorGUILayout.EndHorizontal(); EditorGUILayout.BeginHorizontal(); }
#endif
#if SKC_HAS_ECONOMY
                        settings.enableCurrencyService = EditorGUILayout.ToggleLeft("Currency Service", settings.enableCurrencyService, GUILayout.Width(160));
                        col++; if (col % 3 == 0) { EditorGUILayout.EndHorizontal(); EditorGUILayout.BeginHorizontal(); }
#endif
#if SKC_HAS_DAILY_REWARDS
                        settings.enableDailyRewardService = EditorGUILayout.ToggleLeft("Daily Reward", settings.enableDailyRewardService, GUILayout.Width(160));
                        col++; if (col % 3 == 0) { EditorGUILayout.EndHorizontal(); EditorGUILayout.BeginHorizontal(); }
#endif
#if SKC_HAS_UI
                        settings.enableUIService = EditorGUILayout.ToggleLeft("UI Service", settings.enableUIService, GUILayout.Width(160));
                        col++; if (col % 3 == 0) { EditorGUILayout.EndHorizontal(); EditorGUILayout.BeginHorizontal(); }
#endif
#if SKC_HAS_INPUTS
                        settings.enableInputService = EditorGUILayout.ToggleLeft("Input Service", settings.enableInputService, GUILayout.Width(160));
                        col++; if (col % 3 == 0) { EditorGUILayout.EndHorizontal(); EditorGUILayout.BeginHorizontal(); }
#endif
#if SKC_HAS_IAP
                        settings.enableIAPService = EditorGUILayout.ToggleLeft("IAP / No-Ads", settings.enableIAPService, GUILayout.Width(160));
                        col++; if (col % 3 == 0) { EditorGUILayout.EndHorizontal(); EditorGUILayout.BeginHorizontal(); }
#endif
#if SKC_HAS_PRIVACY
                        settings.enablePrivacyService = EditorGUILayout.ToggleLeft("Privacy (ATT/UMP)", settings.enablePrivacyService, GUILayout.Width(160));
                        col++; if (col % 3 == 0) { EditorGUILayout.EndHorizontal(); EditorGUILayout.BeginHorizontal(); }
#endif
#if SKC_HAS_REVIEW
                        settings.enableReviewService = EditorGUILayout.ToggleLeft("In-App Review", settings.enableReviewService, GUILayout.Width(160));
                        col++; if (col % 3 == 0) { EditorGUILayout.EndHorizontal(); EditorGUILayout.BeginHorizontal(); }
#endif
#if SKC_HAS_NOTIFICATIONS
                        settings.enableNotificationService = EditorGUILayout.ToggleLeft("Local Notifications", settings.enableNotificationService, GUILayout.Width(160));
                        col++; if (col % 3 == 0) { EditorGUILayout.EndHorizontal(); EditorGUILayout.BeginHorizontal(); }
#endif
#if SKC_HAS_TELEMETRY
                        settings.enableTelemetryTracker = EditorGUILayout.ToggleLeft("0-GC Telemetry", settings.enableTelemetryTracker, GUILayout.Width(160));
                        col++; if (col % 3 == 0) { EditorGUILayout.EndHorizontal(); EditorGUILayout.BeginHorizontal(); }
#endif
                        if (col % 3 != 0) EditorGUILayout.EndHorizontal();
                    }

                    if (EditorGUI.EndChangeCheck())
                    {
                        EditorUtility.SetDirty(settings);
                        AssetDatabase.SaveAssets();
                    }
                }
            }
            EditorGUILayout.EndVertical();

            // 3. Log & Diagnostics Manager (LogSettings.asset)
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.BeginHorizontal();
                {
                    EditorGUILayout.LabelField("🪵 Log & Diagnostics Manager (LogSettings.asset)", _subHeaderStyle);
                    GUILayout.FlexibleSpace();
                    if (GUILayout.Button("Ping Asset", EditorStyles.miniButton, GUILayout.Width(80)))
                    {
                        PingResourceAsset("LogSettings");
                    }
                }
                EditorGUILayout.EndHorizontal();

                var logSettings = GetOrCreateLogSettings();
                if (logSettings != null)
                {
                    EditorGUI.BeginChangeCheck();

                    // Profile Toggle Bar
                    EditorGUILayout.BeginHorizontal();
                    {
                        EditorGUILayout.LabelField("Active Build Profile:", EditorStyles.boldLabel, GUILayout.Width(140));

                        bool isDev = logSettings.profile == BuildLoggingProfile.Development;
                        GUI.backgroundColor = isDev ? new Color(0.2f, 0.85f, 0.4f) : Color.gray;
                        if (GUILayout.Button("🟢 DEVELOPMENT MODE (Verbose)", EditorStyles.miniButtonLeft, GUILayout.Height(26)))
                        {
                            logSettings.profile = BuildLoggingProfile.Development;
                            logSettings.enableLogging = true;
                        }

                        GUI.backgroundColor = !isDev ? new Color(0.95f, 0.3f, 0.25f) : Color.gray;
                        if (GUILayout.Button("🔴 PRODUCTION MODE (Muted)", EditorStyles.miniButtonRight, GUILayout.Height(26)))
                        {
                            logSettings.profile = BuildLoggingProfile.Production;
                        }
                        GUI.backgroundColor = Color.white;
                    }
                    EditorGUILayout.EndHorizontal();

                    EditorGUILayout.Space(6);

                    // Master Controls
                    EditorGUILayout.BeginHorizontal();
                    {
                        logSettings.enableLogging = EditorGUILayout.ToggleLeft("Enable Logging", logSettings.enableLogging, GUILayout.Width(130));
                        EditorGUILayout.LabelField("Min Level:", GUILayout.Width(70));
                        logSettings.minLogLevel = (LogLevel)EditorGUILayout.EnumPopup(logSettings.minLogLevel, GUILayout.Width(90));
                        logSettings.useRichTextColor = EditorGUILayout.ToggleLeft("Color Tags", logSettings.useRichTextColor, GUILayout.Width(90));
                        logSettings.showTimestamp = EditorGUILayout.ToggleLeft("Timestamps", logSettings.showTimestamp, GUILayout.Width(95));
                    }
                    EditorGUILayout.EndHorizontal();

                    EditorGUILayout.Space(8);

                    // Channels Grid
                    EditorGUILayout.BeginHorizontal();
                    {
                        EditorGUILayout.LabelField("Channel Filters (Mute / Unmute):", EditorStyles.boldLabel);
                        GUILayout.FlexibleSpace();
                        if (GUILayout.Button("Enable All", EditorStyles.miniButton, GUILayout.Width(75)))
                        {
                            logSettings.EnableAllTags();
                        }
                        if (GUILayout.Button("Mute All", EditorStyles.miniButton, GUILayout.Width(75)))
                        {
                            logSettings.MuteAllTags();
                        }
                    }
                    EditorGUILayout.EndHorizontal();

                    if (logSettings.tagConfigs != null && logSettings.tagConfigs.Count > 0)
                    {
                        int columns = 4;
                        for (int i = 0; i < logSettings.tagConfigs.Count; i += columns)
                        {
                            EditorGUILayout.BeginHorizontal();
                            for (int c = 0; c < columns; c++)
                            {
                                int idx = i + c;
                                if (idx < logSettings.tagConfigs.Count)
                                {
                                    var cfg = logSettings.tagConfigs[idx];
                                    string hex = !string.IsNullOrEmpty(cfg.hexColor) ? cfg.hexColor : "#FFFFFF";
                                    string label = $"<color={hex}>●</color> {cfg.tag}";
                                    cfg.isEnabled = EditorGUILayout.ToggleLeft(label, cfg.isEnabled, new GUIStyle(EditorStyles.label) { richText = true }, GUILayout.Width(140));
                                }
                            }
                            EditorGUILayout.EndHorizontal();
                        }
                    }

                    EditorGUILayout.Space(6);
                    EditorGUILayout.BeginHorizontal();
                    {
                        if (GUILayout.Button("⚡ Send Test Logs to Console", EditorStyles.miniButton, GUILayout.Width(200)))
                        {
                            SKCLog.Info(LogTag.Core, "Core service initialized.");
                            SKCLog.Info(LogTag.Economy, "Granted 500 Coins with Bezier Fly.");
                            SKCLog.Info(LogTag.Levels, "Loaded Level 3 (Physical Index 3).");
                            SKCLog.Info(LogTag.UI, "Opened DailyRewardPopup via queue.");
                            SKCLog.Info(LogTag.SDK, "Firebase & GameAnalytics initialized.");
                            SKCLog.Info(LogTag.Analytics, "Tracked event: level_completed.");
                            SKCLog.Info(LogTag.Ads, "Rewarded video ad loaded.");
                            SKCLog.Warning(LogTag.General, "Sample Warning logged.");
                        }

                        GUILayout.FlexibleSpace();

                        if (GUILayout.Button("Sync Scripting Define Symbols", EditorStyles.miniButton, GUILayout.Width(220)))
                        {
                            SyncLoggingDefineSymbols(logSettings.profile == BuildLoggingProfile.Development);
                        }
                    }
                    EditorGUILayout.EndHorizontal();

                    if (EditorGUI.EndChangeCheck())
                    {
                        EditorUtility.SetDirty(logSettings);
                        AssetDatabase.SaveAssets();
                    }
                }
            }
            EditorGUILayout.EndVertical();
        }

        private void DrawServiceRow(string name, IService service)
        {
            EditorGUILayout.BeginHorizontal();
            {
                EditorGUILayout.LabelField(name, GUILayout.Width(180));

                if (service == null)
                {
                    EditorGUILayout.LabelField("NULL / DISABLED", _badgeInactiveStyle, GUILayout.Width(110));
                    EditorGUILayout.LabelField("-", GUILayout.Width(110));
                }
                else if (service.IsInitialized)
                {
                    EditorGUILayout.LabelField("ACTIVE", _badgeActiveStyle, GUILayout.Width(110));
                    EditorGUILayout.LabelField($"{service.InitializeDuration.TotalMilliseconds:F1} ms", GUILayout.Width(110));
                }
                else
                {
                    EditorGUILayout.LabelField("INITIALIZING", _badgeWarningStyle, GUILayout.Width(110));
                    EditorGUILayout.LabelField("...", GUILayout.Width(110));
                }

                GUILayout.FlexibleSpace();
            }
            EditorGUILayout.EndHorizontal();
        }

        private void DrawStandbyServiceRow(string name, string category)
        {
            EditorGUILayout.BeginHorizontal();
            {
                EditorGUILayout.LabelField(name, GUILayout.Width(180));
                EditorGUILayout.LabelField(category, EditorStyles.miniLabel, GUILayout.Width(110));
                EditorGUILayout.LabelField("READY (STANDBY)", _badgeActiveStyle, GUILayout.Width(120));
                EditorGUILayout.LabelField("Initializes on BootScene", EditorStyles.miniLabel);
                GUILayout.FlexibleSpace();
            }
            EditorGUILayout.EndHorizontal();
        }

        #endregion

#if SKC_HAS_ECONOMY
        #region Tab 2: Economy & Balance

        private void DrawEconomyTab()
        {
            DrawSectionHeader("💰 Economy & Currency Manager", "Inspect live player balances, grant test currencies, and customize fly visual parameters.");

            // 1. Live Runtime Balances
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.LabelField("Live Runtime Balances (Play Mode)", _subHeaderStyle);

                if (!EditorApplication.isPlaying || SKCore.CurrencyService == null)
                {
                    EditorGUILayout.HelpBox("Live balances require Play Mode. Enter Play Mode to inspect and adjust currency amounts in real time.", MessageType.Info);
                }
                else
                {
                    double softBal = SKCore.CurrencyService.Get(CurrencyType.Coin);
                    double hardBal = SKCore.CurrencyService.Get(CurrencyType.Gem);

                    // Soft Currency (Coins)
                    EditorGUILayout.BeginHorizontal(EditorStyles.helpBox);
                    {
                        EditorGUILayout.LabelField("🪙 Soft Currency (Coin):", EditorStyles.boldLabel, GUILayout.Width(170));
                        EditorGUILayout.LabelField($"{CurrencyFormatter.Format(softBal)}", EditorStyles.boldLabel, GUILayout.Width(120));

                        if (GUILayout.Button("+100", EditorStyles.miniButton)) SKCore.CurrencyService.Add(CurrencyType.Coin, 100);
                        if (GUILayout.Button("+1,000", EditorStyles.miniButton)) SKCore.CurrencyService.Add(CurrencyType.Coin, 1000);
                        if (GUILayout.Button("+10,000", EditorStyles.miniButton)) SKCore.CurrencyService.Add(CurrencyType.Coin, 10000);
                        if (GUILayout.Button("-500", EditorStyles.miniButton)) SKCore.CurrencyService.TrySpend(CurrencyType.Coin, 500);
                        if (GUILayout.Button("Zero", EditorStyles.miniButton)) SKCore.CurrencyService.Set(CurrencyType.Coin, 0);
                    }
                    EditorGUILayout.EndHorizontal();

                    // Hard Currency (Gems)
                    EditorGUILayout.BeginHorizontal(EditorStyles.helpBox);
                    {
                        EditorGUILayout.LabelField("💎 Hard Currency (Gem):", EditorStyles.boldLabel, GUILayout.Width(170));
                        EditorGUILayout.LabelField($"{CurrencyFormatter.Format(hardBal)}", EditorStyles.boldLabel, GUILayout.Width(120));

                        if (GUILayout.Button("+10", EditorStyles.miniButton)) SKCore.CurrencyService.Add(CurrencyType.Gem, 10);
                        if (GUILayout.Button("+100", EditorStyles.miniButton)) SKCore.CurrencyService.Add(CurrencyType.Gem, 100);
                        if (GUILayout.Button("+1,000", EditorStyles.miniButton)) SKCore.CurrencyService.Add(CurrencyType.Gem, 1000);
                        if (GUILayout.Button("-50", EditorStyles.miniButton)) SKCore.CurrencyService.TrySpend(CurrencyType.Gem, 50);
                        if (GUILayout.Button("Zero", EditorStyles.miniButton)) SKCore.CurrencyService.Set(CurrencyType.Gem, 0);
                    }
                    EditorGUILayout.EndHorizontal();

                    // Custom Grant/Deduct Tool
                    EditorGUILayout.Space(6);
                    EditorGUILayout.LabelField("Custom Amount Grant / Deduct", EditorStyles.boldLabel);
                    EditorGUILayout.BeginHorizontal();
                    {
                        _grantCurrencyType = (CurrencyType)EditorGUILayout.EnumPopup(_grantCurrencyType, GUILayout.Width(100));
                        _grantAmount = EditorGUILayout.DoubleField(_grantAmount, GUILayout.Width(140));

                        if (GUILayout.Button("Add (+)", GUILayout.Width(90)))
                        {
                            SKCore.CurrencyService.Add(_grantCurrencyType, _grantAmount);
                        }
                        if (GUILayout.Button("Spend (-)", GUILayout.Width(90)))
                        {
                            SKCore.CurrencyService.TrySpend(_grantCurrencyType, _grantAmount);
                        }
                        if (GUILayout.Button("Set (=)", GUILayout.Width(90)))
                        {
                            SKCore.CurrencyService.Set(_grantCurrencyType, _grantAmount);
                        }
                    }
                    EditorGUILayout.EndHorizontal();
                }
            }
            EditorGUILayout.EndVertical();

            // 2. Currency Settings Asset Inspector
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.BeginHorizontal();
                {
                    EditorGUILayout.LabelField("Currency Settings (CurrencySettings.asset)", _subHeaderStyle);
                    GUILayout.FlexibleSpace();
                    if (GUILayout.Button("Ping Asset", EditorStyles.miniButton, GUILayout.Width(80)))
                    {
                        PingResourceAsset("CurrencySettings");
                    }
                }
                EditorGUILayout.EndHorizontal();

                var settings = Resources.Load<CurrencySettingsSO>("CurrencySettings");
                if (settings == null)
                {
                    EditorGUILayout.HelpBox("CurrencySettings.asset not found in Resources folder!", MessageType.Warning);
                }
                else
                {
                    EditorGUILayout.LabelField($"Default Token Count: {settings.defaultTokenCount}");
                    EditorGUILayout.LabelField($"Default Fly Duration: {settings.flyDuration:F2}s");
                    EditorGUILayout.LabelField($"Default Burst Radius: {settings.burstRadius:F1}px");
                    EditorGUILayout.LabelField($"Fly Ease Curve: {settings.flyEase}");
                }
            }
            EditorGUILayout.EndVertical();
        }

        #endregion
#endif

#if SKC_HAS_DAILY_REWARDS
        #region Tab 3: Daily Rewards

        private void DrawDailyRewardsTab()
        {
            DrawSectionHeader("🎁 Daily Rewards & Retention", "Test 7-day or custom retention cycles, simulated time-travel, and streak tracking.");

            // 1. Live Runtime Status
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.LabelField("Live Retention Status (Play Mode)", _subHeaderStyle);

                if (!EditorApplication.isPlaying || SKCore.DailyRewardService == null)
                {
                    EditorGUILayout.HelpBox("DailyRewardService runtime inspection requires Play Mode.", MessageType.Info);
                }
                else
                {
                    var service = SKCore.DailyRewardService;
                    bool isReady = service.IsRewardAvailable;
                    int day = service.CurrentCycleDayIndex + 1;
                    int streak = service.CurrentStreak;
                    TimeSpan remaining = service.TimeUntilNextReward;

                    EditorGUILayout.BeginHorizontal();
                    {
                        EditorGUILayout.LabelField($"Day in Cycle: <b>Day {day}</b>", new GUIStyle(EditorStyles.label) { richText = true }, GUILayout.Width(150));
                        EditorGUILayout.LabelField($"Current Streak: <b>{streak} Days</b>", new GUIStyle(EditorStyles.label) { richText = true }, GUILayout.Width(150));

                        if (isReady)
                        {
                            EditorGUILayout.LabelField("STATUS: READY TO CLAIM!", _badgeActiveStyle, GUILayout.Width(180));
                        }
                        else
                        {
                            EditorGUILayout.LabelField($"LOCKED (In {remaining.Hours:D2}h {remaining.Minutes:D2}m {remaining.Seconds:D2}s)", _badgeWarningStyle, GUILayout.Width(180));
                        }
                    }
                    EditorGUILayout.EndHorizontal();

                    EditorGUILayout.Space(6);
                    EditorGUILayout.LabelField("Actions & Fast-Forward Simulator", _subHeaderStyle);

                    EditorGUILayout.BeginHorizontal();
                    {
                        if (GUILayout.Button("Show Popup", GUILayout.Height(26)))
                        {
                            service.ShowRewardPopup();
                        }
                        if (GUILayout.Button("Claim Today", GUILayout.Height(26)))
                        {
                            service.ClaimCurrentRewardAsync(doubleWithAd: false).Forget();
                        }
                        if (GUILayout.Button("Claim 2X (Ad)", GUILayout.Height(26)))
                        {
                            service.ClaimCurrentRewardAsync(doubleWithAd: true).Forget();
                        }
                        if (GUILayout.Button("Reset Progress", GUILayout.Height(26)))
                        {
                            service.ResetRewardDataAsync().Forget();
                        }
                    }
                    EditorGUILayout.EndHorizontal();

                    EditorGUILayout.Space(4);
                    EditorGUILayout.BeginHorizontal();
                    {
                        if (GUILayout.Button("+1 Hour", EditorStyles.miniButton)) service.SimulateAdvanceHoursAsync(1).Forget();
                        if (GUILayout.Button("+6 Hours", EditorStyles.miniButton)) service.SimulateAdvanceHoursAsync(6).Forget();
                        if (GUILayout.Button("+12 Hours", EditorStyles.miniButton)) service.SimulateAdvanceHoursAsync(12).Forget();
                        if (GUILayout.Button("+24h (Next Day)", EditorStyles.miniButton)) service.SimulateAdvanceHoursAsync(24).Forget();

                        _simulateCustomHours = EditorGUILayout.DoubleField(_simulateCustomHours, GUILayout.Width(60));
                        if (GUILayout.Button("Simulate (+h)", EditorStyles.miniButton, GUILayout.Width(100)))
                        {
                            service.SimulateAdvanceHoursAsync(_simulateCustomHours).Forget();
                        }
                    }
                    EditorGUILayout.EndHorizontal();
                }
            }
            EditorGUILayout.EndVertical();

            // 2. Settings Asset Preview
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.BeginHorizontal();
                {
                    EditorGUILayout.LabelField("Daily Reward Settings (DailyRewardSettings.asset)", _subHeaderStyle);
                    GUILayout.FlexibleSpace();
                    if (GUILayout.Button("Ping Asset", EditorStyles.miniButton, GUILayout.Width(80)))
                    {
                        PingResourceAsset("DailyRewardSettings");
                    }
                }
                EditorGUILayout.EndHorizontal();

                var settings = Resources.Load<DailyRewardSettingsSO>("DailyRewardSettings");
                if (settings == null)
                {
                    EditorGUILayout.HelpBox("DailyRewardSettings.asset not found in Resources!", MessageType.Warning);
                }
                else
                {
                    EditorGUILayout.LabelField($"Cycle Mode: {settings.cycleMode}");
                    EditorGUILayout.LabelField($"Time Mode: {settings.timeMode}");
                    EditorGUILayout.LabelField($"Missed Day Policy: {settings.missedDayPolicy}");

                    EditorGUILayout.Space(4);
                    EditorGUILayout.LabelField("Configured Reward Days:", EditorStyles.boldLabel);

                    if (settings.rewards != null)
                    {
                        for (int i = 0; i < settings.rewards.Count; i++)
                        {
                            var r = settings.rewards[i];
                            string peakBadge = r.isPeakReward ? " [★ PEAK MILESTONE]" : "";
                            EditorGUILayout.LabelField($"  Day {i + 1}: {r.title} — {r.amount} {r.currencyType}{peakBadge}");
                        }
                    }
                }
            }
            EditorGUILayout.EndVertical();
        }

        #endregion
#endif

#if SKC_HAS_LEVELS
        #region Tab 4: Levels & Progress

        private void DrawLevelsTab()
        {
            DrawSectionHeader("🗺️ Level Progression & Management", "Jump to any level, inspect active level prefabs, and trigger level outcomes.");

            // 1. Live Runtime Status & Skipper
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.LabelField("Live Level Management (Play Mode)", _subHeaderStyle);

                if (!EditorApplication.isPlaying || SKCore.LevelService == null)
                {
                    EditorGUILayout.HelpBox("Level controls require Play Mode. Enter Play Mode to inspect and switch levels.", MessageType.Info);
                }
                else
                {
                    var levelService = SKCore.LevelService;
                    int curLvl = levelService.DisplayLevelNumber;
                    int physLvl = levelService.PhysicalIndex;
                    var state = levelService.CurrentState;

                    EditorGUILayout.BeginHorizontal();
                    {
                        EditorGUILayout.LabelField($"Current Display Level: <b>Level {curLvl}</b>", new GUIStyle(EditorStyles.label) { richText = true }, GUILayout.Width(200));
                        EditorGUILayout.LabelField($"Physical Prefab Index: <b>{physLvl}</b>", new GUIStyle(EditorStyles.label) { richText = true }, GUILayout.Width(200));
                        EditorGUILayout.LabelField($"State: <b>{state}</b>", new GUIStyle(EditorStyles.label) { richText = true });
                    }
                    EditorGUILayout.EndHorizontal();

                    EditorGUILayout.Space(6);
                    EditorGUILayout.BeginHorizontal();
                    {
                        if (GUILayout.Button("◀ Previous Level", GUILayout.Height(28)))
                        {
                            levelService.LoadLevelAsync(Mathf.Max(1, curLvl - 1)).Forget();
                        }
                        if (GUILayout.Button("🔄 Reload Level", GUILayout.Height(28)))
                        {
                            levelService.RestartLevelAsync().Forget();
                        }
                        if (GUILayout.Button("Next Level ▶", GUILayout.Height(28)))
                        {
                            levelService.NextLevelAsync().Forget();
                        }
                    }
                    EditorGUILayout.EndHorizontal();

                    EditorGUILayout.Space(4);
                    EditorGUILayout.BeginHorizontal();
                    {
                        EditorGUILayout.LabelField("Direct Level Jump:", GUILayout.Width(130));
                        _targetJumpLevel = EditorGUILayout.IntField(_targetJumpLevel, GUILayout.Width(70));

                        if (GUILayout.Button("Jump to Level", GUILayout.Width(120)))
                        {
                            levelService.LoadLevelAsync(_targetJumpLevel).Forget();
                        }

                        GUILayout.FlexibleSpace();

                        if (GUILayout.Button("Start", EditorStyles.miniButton, GUILayout.Width(70))) levelService.StartLevel();
                        if (GUILayout.Button("Win", EditorStyles.miniButton, GUILayout.Width(70))) levelService.CompleteCurrentLevel();
                        if (GUILayout.Button("Fail", EditorStyles.miniButton, GUILayout.Width(70))) levelService.FailCurrentLevel();
                    }
                    EditorGUILayout.EndHorizontal();
                }
            }
            EditorGUILayout.EndVertical();

            // 2. Settings & Database Info
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.BeginHorizontal();
                {
                    EditorGUILayout.LabelField("Level Settings (LevelSettings.asset)", _subHeaderStyle);
                    GUILayout.FlexibleSpace();
                    if (GUILayout.Button("Ping Asset", EditorStyles.miniButton, GUILayout.Width(80)))
                    {
                        PingResourceAsset("LevelSettings");
                    }
                }
                EditorGUILayout.EndHorizontal();

                var settings = Resources.Load<LevelSettingsSO>("LevelSettings");
                if (settings == null)
                {
                    EditorGUILayout.HelpBox("LevelSettings.asset not found in Resources folder!", MessageType.Warning);
                }
                else
                {
                    EditorGUILayout.LabelField($"Load Mode: {settings.loadMode}");
                    EditorGUILayout.LabelField($"Loop Mode: {settings.loopMode}");
                    EditorGUILayout.LabelField($"Loop Start Index: {settings.loopStartIndex}");
                    EditorGUILayout.LabelField($"Total Authored Levels: {settings.TotalAuthoredLevels}");

                    if (settings.levelPrefabs != null)
                    {
                        EditorGUILayout.LabelField($"Configured Level Prefabs: {settings.levelPrefabs.Count}");
                    }
                }
            }
            EditorGUILayout.EndVertical();
        }

        #endregion
#endif

#if SKC_HAS_UI
        #region Tab 5: UI & Popups

        private void DrawUITab()
        {
            DrawSectionHeader("🖼️ UI Management & Popup Tester", "Test popup queuing, trigger toasts, and inspect registered UI Data assets.");

            // 1. Live Popup & Toast Tester
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.LabelField("Live UI Testing (Play Mode)", _subHeaderStyle);

                if (!EditorApplication.isPlaying || SKCore.UIService == null)
                {
                    EditorGUILayout.HelpBox("UI testing requires Play Mode. Enter Play Mode to trigger screens, popups, and toast overlays.", MessageType.Info);
                }
                else
                {
                    EditorGUILayout.LabelField("Popup Trigger Buttons:", EditorStyles.boldLabel);
                    EditorGUILayout.BeginHorizontal();
                    {
#if SKC_HAS_DAILY_REWARDS
                        if (GUILayout.Button("Show DailyRewardPopup", GUILayout.Height(28)))
                        {
                            SKCore.UIService.ShowPopup<DailyRewardPopup>().Forget();
                        }
#endif
                        if (GUILayout.Button("Show SampleSettingsPopup", GUILayout.Height(28)))
                        {
                            SKCore.UIService.ShowPopup<SampleSettingsPopup>().Forget();
                        }
                        if (GUILayout.Button("Close All Popups", GUILayout.Height(28)))
                        {
                            SKCore.UIService.CloseAllPopups().Forget();
                        }
                    }
                    EditorGUILayout.EndHorizontal();

                    EditorGUILayout.Space(8);
                    EditorGUILayout.LabelField("Toast Notification Tester:", EditorStyles.boldLabel);
                    EditorGUILayout.BeginHorizontal();
                    {
                        _testToastMessage = EditorGUILayout.TextField(_testToastMessage, GUILayout.Width(300));
                        EditorGUILayout.LabelField("Duration (s):", GUILayout.Width(80));
                        _testToastDuration = EditorGUILayout.Slider(_testToastDuration, 0.5f, 5.0f, GUILayout.Width(150));

                        if (GUILayout.Button("Send Toast", GUILayout.Width(100)))
                        {
                            SKCore.UIService.ShowOverlay<SampleToastOverlay>(_testToastMessage).Forget();
                        }
                    }
                    EditorGUILayout.EndHorizontal();
                }
            }
            EditorGUILayout.EndVertical();

            // 2. UIData Registered Panels
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.BeginHorizontal();
                {
                    EditorGUILayout.LabelField("Registered UI Prefabs (UIData.asset)", _subHeaderStyle);
                    GUILayout.FlexibleSpace();
                    if (GUILayout.Button("Ping Asset", EditorStyles.miniButton, GUILayout.Width(80)))
                    {
                        PingResourceAsset("UIData");
                    }
                }
                EditorGUILayout.EndHorizontal();

                var uiData = Resources.Load<UIData>("UIData");
                if (uiData == null)
                {
                    EditorGUILayout.HelpBox("UIData.asset not found in Resources!", MessageType.Warning);
                }
                else
                {
                    var serializedData = new SerializedObject(uiData);
                    var prefabsProp = serializedData.FindProperty("_panelPrefabs");

                    if (prefabsProp != null && prefabsProp.isArray)
                    {
                        EditorGUILayout.LabelField($"Total Registered Panels: {prefabsProp.arraySize}", EditorStyles.boldLabel);
                        for (int i = 0; i < prefabsProp.arraySize; i++)
                        {
                            var element = prefabsProp.GetArrayElementAtIndex(i);
                            if (element.objectReferenceValue != null)
                            {
                                EditorGUILayout.LabelField($"  • {element.objectReferenceValue.name} ({element.objectReferenceValue.GetType().Name})");
                            }
                        }
                    }
                }
            }
            EditorGUILayout.EndVertical();
        }

        #endregion
#endif

#if SKC_HAS_AUDIO
        #region Tab 6: Audio & Sound

        private void DrawAudioTab()
        {
            DrawSectionHeader("🎵 Audio & Sound Management", "Audition sound clips directly in the Editor and manage BGM/SFX volumes in Play Mode.");

            // 1. Live Runtime Audio Controls
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.LabelField("Runtime Audio Controls (Play Mode)", _subHeaderStyle);

                if (!EditorApplication.isPlaying || SKCore.SoundService == null)
                {
                    EditorGUILayout.HelpBox("Enter Play Mode to test runtime BGM/SFX volume sliders and mute toggles.", MessageType.Info);
                }
                else
                {
                    EditorGUILayout.BeginHorizontal();
                    {
                        if (GUILayout.Button("Play BGM (TestBG)", GUILayout.Height(26)))
                        {
                            SKCore.SoundService.PlayBGM("TestBG");
                        }
                        if (GUILayout.Button("Pause BGM", GUILayout.Height(26)))
                        {
                            SKCore.SoundService.PauseBGM();
                        }
                        if (GUILayout.Button("Resume BGM", GUILayout.Height(26)))
                        {
                            SKCore.SoundService.ResumeBGM();
                        }
                        if (GUILayout.Button("Play SFX (TestSound)", GUILayout.Height(26)))
                        {
                            SKCore.SoundService.Play("TestSound");
                        }
                    }
                    EditorGUILayout.EndHorizontal();
                }
            }
            EditorGUILayout.EndVertical();

            // 2. Sound Library Audition Box
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.BeginHorizontal();
                {
                    EditorGUILayout.LabelField("Sound Library (Sounds.asset)", _subHeaderStyle);
                    GUILayout.FlexibleSpace();
                    if (GUILayout.Button("Ping Asset", EditorStyles.miniButton, GUILayout.Width(80)))
                    {
                        PingResourceAsset("Sounds");
                    }
                }
                EditorGUILayout.EndHorizontal();

                var soundData = Resources.Load<SoundData>("Sounds");
                if (soundData == null)
                {
                    EditorGUILayout.HelpBox("Sounds.asset not found in Resources!", MessageType.Warning);
                }
                else if (soundData.SoundClips != null)
                {
                    EditorGUILayout.LabelField($"Registered Sound Clips: {soundData.SoundClips.Length}", EditorStyles.boldLabel);

                    for (int i = 0; i < soundData.SoundClips.Length; i++)
                    {
                        var clipElement = soundData.SoundClips[i];
                        if (clipElement == null) continue;

                        string cName = !string.IsNullOrEmpty(clipElement.Name) ? clipElement.Name : $"Clip {i}";
                        AudioClip clipObj = clipElement.Clip;
                        float vol = clipElement.Volume;
                        var soundType = clipElement.SoundType;

                        EditorGUILayout.BeginHorizontal(EditorStyles.helpBox);
                        {
                            EditorGUILayout.LabelField($"🔊 {cName}", EditorStyles.boldLabel, GUILayout.Width(160));
                            EditorGUILayout.LabelField($"Type: {soundType}", GUILayout.Width(100));
                            EditorGUILayout.LabelField($"Vol: {vol:F2}", GUILayout.Width(70));

                            if (clipObj != null)
                            {
                                if (GUILayout.Button("▶ Play", EditorStyles.miniButton, GUILayout.Width(60)))
                                {
                                    PlayEditorAudio(clipObj, vol);
                                }
                            }

                            if (GUILayout.Button("⏹ Stop", EditorStyles.miniButton, GUILayout.Width(60)))
                            {
                                StopEditorAudio();
                            }
                        }
                        EditorGUILayout.EndHorizontal();
                    }
                }
            }
            EditorGUILayout.EndVertical();
        }

        private void PlayEditorAudio(AudioClip clip, float volume)
        {
            StopEditorAudio();
            if (clip == null) return;

            var go = EditorUtility.CreateGameObjectWithHideFlags("TempEditorAudioSource", HideFlags.HideAndDontSave);
            _editorAudioSource = go.AddComponent<AudioSource>();
            _editorAudioSource.clip = clip;
            _editorAudioSource.volume = volume;
            _editorAudioSource.Play();
        }

        private void StopEditorAudio()
        {
            if (_editorAudioSource != null)
            {
                if (_editorAudioSource.gameObject != null)
                {
                    DestroyImmediate(_editorAudioSource.gameObject);
                }
                _editorAudioSource = null;
            }
        }

        #endregion
#endif

        #region Tab 7: Save & Storage

        private void DrawSaveTab()
        {
            DrawSectionHeader("💾 Save & Storage Inspector", "Examine persistent game data on disk, format raw JSON, and execute manual save/wipe routines.");

            string savePath = Path.Combine(Application.persistentDataPath, "gamedata.sav");
            bool fileExists = File.Exists(savePath);

            // 1. File Status & Operations
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.LabelField("Save File Disk Status", _subHeaderStyle);
                EditorGUILayout.LabelField($"Path: {savePath}");

                if (fileExists)
                {
                    var fileInfo = new FileInfo(savePath);
                    EditorGUILayout.LabelField($"Status: <b>EXISTS</b> ({fileInfo.Length} bytes, Last Modified: {fileInfo.LastWriteTime})", new GUIStyle(EditorStyles.label) { richText = true });
                }
                else
                {
                    EditorGUILayout.LabelField("Status: <color=yellow>NO SAVE FILE FOUND (Default save will be generated on boot)</color>", new GUIStyle(EditorStyles.label) { richText = true });
                }

                EditorGUILayout.Space(6);
                EditorGUILayout.BeginHorizontal();
                {
                    if (GUILayout.Button("📂 Reveal in Explorer", GUILayout.Height(28)))
                    {
                        EditorUtility.RevealInFinder(Application.persistentDataPath);
                    }

                    if (GUILayout.Button("🗑️ Delete Save File", GUILayout.Height(28)))
                    {
                        if (EditorUtility.DisplayDialog("Confirm Save Wipe", "Are you sure you want to delete the game save file?", "Delete", "Cancel"))
                        {
                            DeleteSaveFile();
                        }
                    }

                    if (EditorApplication.isPlaying && SKCore.SaveService != null)
                    {
                        if (GUILayout.Button("💾 Save Game Now", GUILayout.Height(28)))
                        {
                            SKCore.SaveService.SaveCurrentGameData();
                        }
                        if (GUILayout.Button("🔄 Reload from Disk", GUILayout.Height(28)))
                        {
                            SKCore.SaveService.Initialize(null, null).Forget();
                        }
                    }
                }
                EditorGUILayout.EndHorizontal();
            }
            EditorGUILayout.EndVertical();

            // 2. Formatted JSON Viewer
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.LabelField("Current Save Data (Formatted JSON)", _subHeaderStyle);

                string jsonContent = string.Empty;

                if (EditorApplication.isPlaying && SKCore.SaveService?.CurrentGameData != null)
                {
                    jsonContent = JsonConvert.SerializeObject(SKCore.SaveService.CurrentGameData, Formatting.Indented);
                }
                else if (fileExists)
                {
                    try
                    {
                        string rawJson = File.ReadAllText(savePath);
                        object parsed = JsonConvert.DeserializeObject(rawJson);
                        jsonContent = JsonConvert.SerializeObject(parsed, Formatting.Indented);
                    }
                    catch (Exception ex)
                    {
                        jsonContent = $"Error reading save file: {ex.Message}";
                    }
                }
                else
                {
                    jsonContent = "// No save file on disk. Enter Play Mode or save a game to inspect JSON.";
                }

                _jsonScrollPosition = EditorGUILayout.BeginScrollView(_jsonScrollPosition, GUILayout.Height(240));
                {
                    EditorGUILayout.TextArea(jsonContent, _jsonTextAreaStyle, GUILayout.ExpandHeight(true));
                }
                EditorGUILayout.EndScrollView();
            }
            EditorGUILayout.EndVertical();
        }

        private void DeleteSaveFile()
        {
            string savePath = Path.Combine(Application.persistentDataPath, "gamedata.sav");
            if (File.Exists(savePath))
            {
                File.Delete(savePath);
                Debug.Log($"[SKCControlCenter] Save file deleted at: {savePath}");
            }
            if (EditorApplication.isPlaying && SKCore.SaveService != null)
            {
                SKCore.SaveService.DeleteSaveGame();
            }
            Repaint();
        }

        #endregion

#if SKC_HAS_POOLING
        #region Tab 8: Object Pools

        private void DrawPoolsTab()
        {
            DrawSectionHeader("🏊 Object Pools & Memory", "Inspect registered pool tags, initial capacities, and live runtime pooled instances.");

            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.BeginHorizontal();
                {
                    EditorGUILayout.LabelField("Registered Object Pools (PoolList.asset)", _subHeaderStyle);
                    GUILayout.FlexibleSpace();
                    if (GUILayout.Button("Ping Asset", EditorStyles.miniButton, GUILayout.Width(80)))
                    {
                        PingResourceAsset("PoolList");
                    }
                }
                EditorGUILayout.EndHorizontal();

                var poolList = Resources.Load<PoolList>("PoolList");
                if (poolList == null)
                {
                    EditorGUILayout.HelpBox("PoolList.asset not found in Resources!", MessageType.Warning);
                }
                else if (poolList.Pools != null)
                {
                    EditorGUILayout.LabelField($"Total Configured Pools: {poolList.Pools.Count}", EditorStyles.boldLabel);

                    EditorGUILayout.BeginHorizontal(EditorStyles.toolbar);
                    {
                        EditorGUILayout.LabelField("Tag", EditorStyles.boldLabel, GUILayout.Width(180));
                        EditorGUILayout.LabelField("Prefab", EditorStyles.boldLabel, GUILayout.Width(200));
                        EditorGUILayout.LabelField("Initial Size", EditorStyles.boldLabel, GUILayout.Width(100));
                        EditorGUILayout.LabelField("Can Grow", EditorStyles.boldLabel, GUILayout.Width(80));
                    }
                    EditorGUILayout.EndHorizontal();

                    for (int i = 0; i < poolList.Pools.Count; i++)
                    {
                        var pool = poolList.Pools[i];
                        if (pool == null || pool.settings == null) continue;

                        EditorGUILayout.BeginHorizontal();
                        {
                            EditorGUILayout.LabelField(pool.settings.poolTag ?? $"Pool {i}", GUILayout.Width(180));
                            EditorGUILayout.LabelField(pool.settings.prefab != null ? pool.settings.prefab.name : "<None>", GUILayout.Width(200));
                            EditorGUILayout.LabelField(pool.settings.initialPoolSize.ToString(), GUILayout.Width(100));
                            EditorGUILayout.LabelField(pool.settings.canGrow ? "Yes" : "No", GUILayout.Width(80));
                        }
                        EditorGUILayout.EndHorizontal();
                    }
                }
            }
            EditorGUILayout.EndVertical();
        }

        #endregion
#endif

        #region Tab 8: SDK & Tools Hub

        private void DrawSDKHubTab()
        {
            DrawSectionHeader("🌐 SDK & Packages Hub", "Modular package and third-party SDK management. 1-click install, clean uninstall, ASMDEF linking, and zero Git conflicts.");

            EditorGUILayout.BeginHorizontal(EditorStyles.toolbar);
            {
                if (GUILayout.Toggle(_sdkHubSubTab == 0, "🌐 Third-Party SDKs (Ads/Analytics)", EditorStyles.toolbarButton, GUILayout.Width(220)))
                {
                    _sdkHubSubTab = 0;
                }
                if (GUILayout.Toggle(_sdkHubSubTab == 1, "📦 SKC Modular Packages (17)", EditorStyles.toolbarButton, GUILayout.Width(200)))
                {
                    _sdkHubSubTab = 1;
                }
                GUILayout.FlexibleSpace();
            }
            EditorGUILayout.EndHorizontal();
            EditorGUILayout.Space(6);

            if (_sdkHubSubTab == 1)
            {
                DrawSKCModularPackagesView();
                return;
            }

            // 1. Remote Manifest & Cloud Endpoint Bar
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.LabelField("Cloud Manifest & Remote Repository Endpoint", _subHeaderStyle);

                EditorGUILayout.BeginHorizontal();
                {
                    EditorGUILayout.LabelField("Manifest URL:", GUILayout.Width(90));
                    SDKHubClient.ManifestUrl = EditorGUILayout.TextField(SDKHubClient.ManifestUrl);

                    GUI.enabled = !_isFetchingRemoteManifest;
                    if (GUILayout.Button(_isFetchingRemoteManifest ? "Fetching..." : "🔄 Refresh", GUILayout.Width(90)))
                    {
                        _isFetchingRemoteManifest = true;
                        _manifestStatusMessage = "Fetching remote manifest...";
                        _manifestStatusMessageType = MessageType.Info;

                        SDKHubClient.FetchRemoteManifest(
                            manifest =>
                            {
                                _isFetchingRemoteManifest = false;
                                _manifestStatusMessage = $"Successfully synced manifest v{manifest.manifestVersion} with {manifest.items.Count} items! (Updated: {manifest.lastUpdated})";
                                _manifestStatusMessageType = MessageType.Info;
                                Repaint();
                            },
                            error =>
                            {
                                _isFetchingRemoteManifest = false;
                                _manifestStatusMessage = $"Sync failed: {error}. Using local/cached catalog.";
                                _manifestStatusMessageType = MessageType.Warning;
                                Repaint();
                            }
                        );
                    }
                    GUI.enabled = true;

                    if (GUILayout.Button("Reset", EditorStyles.miniButton, GUILayout.Width(50)))
                    {
                        SDKHubClient.ManifestUrl = SDKHubClient.FallbackManifestUrl;
                    }
                }
                EditorGUILayout.EndHorizontal();

                if (!string.IsNullOrEmpty(_manifestStatusMessage))
                {
                    EditorGUILayout.Space(2);
                    EditorGUILayout.HelpBox(_manifestStatusMessage, _manifestStatusMessageType);
                }

                EditorGUILayout.Space(4);
                EditorGUILayout.BeginHorizontal();
                {
                    SDKPackageInstaller.InteractiveImport = EditorGUILayout.ToggleLeft(
                        "Show Unity Package Import Dialog (Allows unchecking duplicate EDM4U / inspecting files)",
                        SDKPackageInstaller.InteractiveImport,
                        EditorStyles.boldLabel
                    );
                }
                EditorGUILayout.EndHorizontal();

                if (SDKPackageInstaller.InteractiveImport)
                {
                    EditorGUILayout.HelpBox("💡 Interactive Import Active: Unity will open the import dialog with checkboxes. If 'edm4u-1.2.189' is already installed, simply uncheck the 'ExternalDependencyManager' folder to keep your clean version.", MessageType.None);
                }
            }
            EditorGUILayout.EndVertical();

            // 2. Filter Toolbar (Categories & Search Query)
            EditorGUILayout.BeginHorizontal(EditorStyles.toolbar);
            {
                // Category tabs
                var categories = (SDKCategory[])Enum.GetValues(typeof(SDKCategory));
                foreach (var cat in categories)
                {
                    bool isSelected = _selectedSDKCategory == cat;
                    if (GUILayout.Toggle(isSelected, cat.ToString(), EditorStyles.toolbarButton, GUILayout.Width(80)) != isSelected)
                    {
                        _selectedSDKCategory = cat;
                        GUI.FocusControl(null);
                    }
                }

                GUILayout.FlexibleSpace();

                // Search box
                EditorGUILayout.LabelField("🔍 Search:", GUILayout.Width(65));
                _sdkSearchQuery = EditorGUILayout.TextField(_sdkSearchQuery, EditorStyles.toolbarSearchField, GUILayout.Width(180));
                if (!string.IsNullOrEmpty(_sdkSearchQuery))
                {
                    if (GUILayout.Button("X", EditorStyles.toolbarButton, GUILayout.Width(20)))
                    {
                        _sdkSearchQuery = "";
                        GUI.FocusControl(null);
                    }
                }
            }
            EditorGUILayout.EndHorizontal();

            EditorGUILayout.Space(6);

            // 3. SDK Catalog Items
            var manifestData = SDKHubClient.GetCurrentManifest();
            if (manifestData == null || manifestData.items == null || manifestData.items.Count == 0)
            {
                EditorGUILayout.HelpBox("No SDKs found in manifest. Click 'Refresh' above to fetch the latest catalog.", MessageType.Info);
                return;
            }

            int matchCount = 0;
            for (int i = 0; i < manifestData.items.Count; i++)
            {
                var item = manifestData.items[i];
                if (item == null) continue;

                // Category filter
                if (_selectedSDKCategory != SDKCategory.All && item.category != _selectedSDKCategory)
                {
                    continue;
                }

                // Search filter
                if (!string.IsNullOrEmpty(_sdkSearchQuery))
                {
                    string q = _sdkSearchQuery.ToLowerInvariant();
                    bool match = (item.name != null && item.name.ToLowerInvariant().Contains(q)) ||
                                 (item.description != null && item.description.ToLowerInvariant().Contains(q)) ||
                                 (item.author != null && item.author.ToLowerInvariant().Contains(q)) ||
                                 (item.id != null && item.id.ToLowerInvariant().Contains(q));
                    if (!match) continue;
                }

                matchCount++;
                DrawSDKItemCard(item);
            }

            if (matchCount == 0)
            {
                EditorGUILayout.HelpBox("No SDKs matched the current category and search filter.", MessageType.Info);
            }

            // 4. Architecture Info Box
            EditorGUILayout.Space(10);
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.LabelField("💡 SKCFramework Plug-and-Play Architecture", EditorStyles.boldLabel);
                EditorGUILayout.LabelField(
                    "All third-party SDKs are decoupled through abstraction interfaces (IAdsService, IAnalyticsService).\n" +
                    "• When an SDK is not installed or toggled off, SKCore.Ads & SKCore.Analytics automatically fallback to safe Dummy services.\n" +
                    "• UI buttons (e.g. Rewarded Video, Daily 2X) and game events run with ZERO compile errors.\n" +
                    "• When MAX or Firebase is installed, adapter scripts register natively without modifying core gameplay code.",
                    EditorStyles.wordWrappedMiniLabel
                );
            }
            EditorGUILayout.EndVertical();
        }

        private void DrawSDKItemCard(SDKItem item)
        {
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                bool isInstalled = SDKPackageInstaller.IsInstalled(item);
                bool hasDefine = SDKPackageInstaller.HasDefineSymbol(item.scriptingDefineSymbol);

                // Row 1: Title, Version, Category, and Install Status
                EditorGUILayout.BeginHorizontal();
                {
                    // Item Name
                    EditorGUILayout.LabelField(item.name ?? item.id, EditorStyles.boldLabel, GUILayout.Width(220));

                    // Version & Author
                    string metaInfo = $"v{item.version ?? "1.0"} • by {item.author ?? "Unknown"}";
                    EditorGUILayout.LabelField(metaInfo, EditorStyles.miniLabel, GUILayout.Width(180));

                    // Category Tag
                    GUILayout.Box($"[{item.category}]", EditorStyles.miniButton, GUILayout.Height(18));

                    GUILayout.FlexibleSpace();

                    // Status Badge
                    if (isInstalled)
                    {
                        GUI.backgroundColor = new Color(0.2f, 0.85f, 0.4f);
                        GUILayout.Box("✓ INSTALLED", GUILayout.Width(100), GUILayout.Height(20));
                    }
                    else if (hasDefine)
                    {
                        GUI.backgroundColor = new Color(0.95f, 0.6f, 0.2f);
                        GUILayout.Box("⚠️ ORPHAN DEFINE", GUILayout.Width(130), GUILayout.Height(20));
                    }
                    else
                    {
                        GUI.backgroundColor = new Color(0.45f, 0.48f, 0.55f);
                        GUILayout.Box("○ NOT INSTALLED", GUILayout.Width(110), GUILayout.Height(20));
                    }
                    GUI.backgroundColor = Color.white;
                }
                EditorGUILayout.EndHorizontal();

                EditorGUILayout.Space(4);

                // Row 2: Description
                if (!string.IsNullOrEmpty(item.description))
                {
                    EditorGUILayout.LabelField(item.description, EditorStyles.wordWrappedLabel);
                    EditorGUILayout.Space(4);
                }

                // Row 3: Detection Path & Define Symbol Info
                EditorGUILayout.BeginHorizontal();
                {
                    string pathLabel = string.IsNullOrEmpty(item.detectionPath) ? "" : $"📁 {item.detectionPath}";
                    string defineLabel = string.IsNullOrEmpty(item.scriptingDefineSymbol) ? "" : $"🏷️ #{item.scriptingDefineSymbol}";
                    EditorGUILayout.LabelField($"{pathLabel}   {defineLabel}", EditorStyles.miniLabel);
                }
                EditorGUILayout.EndHorizontal();

                EditorGUILayout.Space(6);

                // Row 4: Action Buttons
                EditorGUILayout.BeginHorizontal();
                {
                    if (isInstalled)
                    {
                        // Clean Uninstall button
                        GUI.backgroundColor = new Color(0.95f, 0.35f, 0.35f);
                        if (GUILayout.Button("🗑️ Clean Uninstall", GUILayout.Height(24), GUILayout.Width(125)))
                        {
                            SDKPackageInstaller.Uninstall(item, () => Repaint());
                        }
                        GUI.backgroundColor = Color.white;

                        // Scripting Define toggle
                        if (!string.IsNullOrEmpty(item.scriptingDefineSymbol))
                        {
                            string toggleText = hasDefine ? "Disable Define Symbol" : "Enable Define Symbol";
                            if (GUILayout.Button(toggleText, EditorStyles.miniButton, GUILayout.Height(24), GUILayout.Width(150)))
                            {
                                SDKPackageInstaller.ToggleDefineSymbol(item);
                            }
                        }
                    }
                    else
                    {
                        // Download & Install button
                        GUI.backgroundColor = new Color(0.2f, 0.65f, 0.95f);
                        if (GUILayout.Button("⬇️ Download & Install", GUILayout.Height(24), GUILayout.Width(150)))
                        {
                            SDKPackageInstaller.DownloadAndInstall(item, () => Repaint());
                        }
                        GUI.backgroundColor = Color.white;

                        // If files are missing but define symbol was left behind, allow cleaning it
                        if (hasDefine && !string.IsNullOrEmpty(item.scriptingDefineSymbol))
                        {
                            GUI.backgroundColor = new Color(0.95f, 0.6f, 0.2f);
                            if (GUILayout.Button("⚠️ Clear Orphan Define", EditorStyles.miniButton, GUILayout.Height(24), GUILayout.Width(150)))
                            {
                                SDKPackageInstaller.SetDefineSymbol(item.scriptingDefineSymbol, false);
                            }
                            GUI.backgroundColor = Color.white;
                        }
                    }

                    GUILayout.FlexibleSpace();

                    // Documentation
                    if (!string.IsNullOrEmpty(item.documentationUrl))
                    {
                        if (GUILayout.Button("📖 Docs", EditorStyles.miniButton, GUILayout.Height(24), GUILayout.Width(70)))
                        {
                            SDKPackageInstaller.OpenDocumentation(item);
                        }
                    }

                    // Source link
                    if (!string.IsNullOrEmpty(item.downloadUrl) && item.downloadUrl.StartsWith("http"))
                    {
                        if (GUILayout.Button("🔗 Portal / URL", EditorStyles.miniButton, GUILayout.Height(24), GUILayout.Width(100)))
                        {
                            Application.OpenURL(item.downloadUrl);
                        }
                    }
                }
                EditorGUILayout.EndHorizontal();

                // Row 5: SDK Credentials & Service Locater Binding Box
                if (isInstalled)
                {
                    DrawSDKConfigurationBox(item, hasDefine);
                }
            }
            EditorGUILayout.EndVertical();
        }

        private void DrawSDKConfigurationBox(SDKItem item, bool hasDefine)
        {
            var settings = SDKAdapterSettings.Instance;
            if (settings == null) return;

            string id = item.id?.ToLowerInvariant() ?? "";
            bool isConfigurable = id.Contains("max") || id.Contains("ironsource") || id.Contains("gameanalytics") ||
                                  id.Contains("bytebrew") || id.Contains("amplitude") || id.Contains("facebook") ||
                                  id.Contains("playfab") || id.Contains("firebase");

            if (!isConfigurable && string.IsNullOrEmpty(item.scriptingDefineSymbol))
            {
                return;
            }

            EditorGUILayout.Space(6);
            EditorGUI.indentLevel++;
            EditorGUILayout.BeginVertical(EditorStyles.helpBox);
            {
                EditorGUILayout.BeginHorizontal();
                {
                    EditorGUILayout.LabelField($"⚙️ {item.name} Configuration & SKCore Binding", EditorStyles.boldLabel);
                    if (hasDefine)
                    {
                        GUI.backgroundColor = new Color(0.2f, 0.85f, 0.4f);
                        GUILayout.Box("● ACTIVE IN SKCORE", GUILayout.Width(130), GUILayout.Height(18));
                        GUI.backgroundColor = Color.white;
                    }
                    else
                    {
                        GUI.backgroundColor = new Color(0.95f, 0.7f, 0.2f);
                        GUILayout.Box("○ STANDALONE (NOT BOUND)", GUILayout.Width(170), GUILayout.Height(18));
                        GUI.backgroundColor = Color.white;
                    }
                }
                EditorGUILayout.EndHorizontal();

                EditorGUILayout.Space(4);

                EditorGUI.BeginChangeCheck();

                if (id.Contains("max"))
                {
                    settings.maxSdkKey = EditorGUILayout.TextField("SDK Key", settings.maxSdkKey);
                    EditorGUILayout.Space(2);
                    EditorGUILayout.LabelField("Android Ad Units:", EditorStyles.miniBoldLabel);
                    settings.maxRewardedUnitIdAndroid = EditorGUILayout.TextField("  Rewarded ID", settings.maxRewardedUnitIdAndroid);
                    settings.maxInterstitialUnitIdAndroid = EditorGUILayout.TextField("  Interstitial ID", settings.maxInterstitialUnitIdAndroid);
                    settings.maxBannerUnitIdAndroid = EditorGUILayout.TextField("  Banner ID", settings.maxBannerUnitIdAndroid);
                    EditorGUILayout.Space(2);
                    EditorGUILayout.LabelField("iOS Ad Units:", EditorStyles.miniBoldLabel);
                    settings.maxRewardedUnitIdIOS = EditorGUILayout.TextField("  Rewarded ID", settings.maxRewardedUnitIdIOS);
                    settings.maxInterstitialUnitIdIOS = EditorGUILayout.TextField("  Interstitial ID", settings.maxInterstitialUnitIdIOS);
                    settings.maxBannerUnitIdIOS = EditorGUILayout.TextField("  Banner ID", settings.maxBannerUnitIdIOS);
                }
                else if (id.Contains("ironsource"))
                {
                    settings.ironSourceAppKeyAndroid = EditorGUILayout.TextField("App Key (Android)", settings.ironSourceAppKeyAndroid);
                    settings.ironSourceAppKeyIOS = EditorGUILayout.TextField("App Key (iOS)", settings.ironSourceAppKeyIOS);
                }
                else if (id.Contains("gameanalytics"))
                {
                    settings.gaGameKeyAndroid = EditorGUILayout.TextField("Game Key (Android)", settings.gaGameKeyAndroid);
                    settings.gaSecretKeyAndroid = EditorGUILayout.TextField("Secret Key (Android)", settings.gaSecretKeyAndroid);
                    EditorGUILayout.Space(2);
                    settings.gaGameKeyIOS = EditorGUILayout.TextField("Game Key (iOS)", settings.gaGameKeyIOS);
                    settings.gaSecretKeyIOS = EditorGUILayout.TextField("Secret Key (iOS)", settings.gaSecretKeyIOS);
                }
                else if (id.Contains("bytebrew"))
                {
                    settings.byteBrewGameIdAndroid = EditorGUILayout.TextField("Game ID (Android)", settings.byteBrewGameIdAndroid);
                    settings.byteBrewSdkKeyAndroid = EditorGUILayout.TextField("SDK Key (Android)", settings.byteBrewSdkKeyAndroid);
                    EditorGUILayout.Space(2);
                    settings.byteBrewGameIdIOS = EditorGUILayout.TextField("Game ID (iOS)", settings.byteBrewGameIdIOS);
                    settings.byteBrewSdkKeyIOS = EditorGUILayout.TextField("SDK Key (iOS)", settings.byteBrewSdkKeyIOS);
                }
                else if (id.Contains("amplitude"))
                {
                    settings.amplitudeApiKey = EditorGUILayout.TextField("API Key", settings.amplitudeApiKey);
                }
                else if (id.Contains("facebook"))
                {
                    settings.facebookAppId = EditorGUILayout.TextField("App ID", settings.facebookAppId);
                    settings.facebookClientToken = EditorGUILayout.TextField("Client Token", settings.facebookClientToken);
                }
                else if (id.Contains("playfab"))
                {
                    settings.playFabTitleId = EditorGUILayout.TextField("Title ID", settings.playFabTitleId);
                }
                else if (id.Contains("firebase"))
                {
                    bool hasJson = settings.HasGoogleServicesJson;
                    bool hasPlist = settings.HasGoogleServiceInfoPlist;

                    EditorGUILayout.LabelField("Firebase Configuration Files Status:", EditorStyles.miniBoldLabel);
                    EditorGUILayout.LabelField(hasJson ? "  ✓ Assets/google-services.json (Android: OK)" : "  ⚠️ Assets/google-services.json missing! Place in Assets/ folder.");
                    EditorGUILayout.LabelField(hasPlist ? "  ✓ Assets/GoogleService-Info.plist (iOS: OK)" : "  ⚠️ Assets/GoogleService-Info.plist missing! Place in Assets/ folder.");
                }

                if (EditorGUI.EndChangeCheck())
                {
                    EditorUtility.SetDirty(settings);
                    if (id.Contains("bytebrew"))
                    {
                        SyncByteBrewSettingsToAsset(settings);
                    }
                }

                EditorGUILayout.Space(4);

                if (!string.IsNullOrEmpty(item.scriptingDefineSymbol))
                {
                    EditorGUILayout.BeginHorizontal();
                    {
                        if (!hasDefine)
                        {
                            GUI.backgroundColor = new Color(0.2f, 0.75f, 0.35f);
                            if (GUILayout.Button($"🔗 Connect into SKCore Services (#{item.scriptingDefineSymbol})", GUILayout.Height(24)))
                            {
                                EditorUtility.SetDirty(settings);
                                if (id.Contains("bytebrew"))
                                {
                                    SyncByteBrewSettingsToAsset(settings);
                                }
                                AssetDatabase.SaveAssets();
                                SDKPackageInstaller.ToggleDefineSymbol(item);
                            }
                            GUI.backgroundColor = Color.white;
                        }
                        else
                        {
                            GUI.backgroundColor = new Color(0.9f, 0.4f, 0.4f);
                            if (GUILayout.Button($"Disconnect from SKCore (#{item.scriptingDefineSymbol})", GUILayout.Height(22)))
                            {
                                SDKPackageInstaller.ToggleDefineSymbol(item);
                            }
                            GUI.backgroundColor = Color.white;
                        }
                    }
                    EditorGUILayout.EndHorizontal();
                }
            }
            EditorGUILayout.EndVertical();
            EditorGUI.indentLevel--;
        }

        private static void SyncByteBrewSettingsToAsset(SDKAdapterSettings settings)
        {
            if (settings == null) return;

            var asset = AssetDatabase.LoadAssetAtPath<ScriptableObject>("Assets/ByteBrewSDK/Resources/ByteBrewSettings.asset");
            if (asset == null)
            {
                asset = Resources.Load<ScriptableObject>("ByteBrewSettings");
            }
            if (asset == null) return;

            var so = new SerializedObject(asset);
            so.Update();

            var androidGameIdProp = so.FindProperty("androidGameID");
            var androidSdkKeyProp = so.FindProperty("androidSDKKey");
            var androidEnabledProp = so.FindProperty("androidEnabled");

            var iosGameIdProp = so.FindProperty("iosGameID");
            var iosSdkKeyProp = so.FindProperty("iosSDKKey");
            var iosEnabledProp = so.FindProperty("iosEnabled");

            if (androidGameIdProp != null) androidGameIdProp.stringValue = settings.byteBrewGameIdAndroid ?? "";
            if (androidSdkKeyProp != null) androidSdkKeyProp.stringValue = settings.byteBrewSdkKeyAndroid ?? "";
            if (androidEnabledProp != null) androidEnabledProp.boolValue = !string.IsNullOrEmpty(settings.byteBrewGameIdAndroid) && !string.IsNullOrEmpty(settings.byteBrewSdkKeyAndroid);

            if (iosGameIdProp != null) iosGameIdProp.stringValue = settings.byteBrewGameIdIOS ?? "";
            if (iosSdkKeyProp != null) iosSdkKeyProp.stringValue = settings.byteBrewSdkKeyIOS ?? "";
            if (iosEnabledProp != null) iosEnabledProp.boolValue = !string.IsNullOrEmpty(settings.byteBrewGameIdIOS) && !string.IsNullOrEmpty(settings.byteBrewSdkKeyIOS);

            so.ApplyModifiedProperties();
            EditorUtility.SetDirty(asset);
            AssetDatabase.SaveAssets();
        }

        #region Sub-View: SKC Modular Packages (17)

        private void DrawSKCModularPackagesView()
        {
            // 1. Quick Actions Card
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.LabelField("⚡ Framework Package Operations", _subHeaderStyle);
                EditorGUILayout.BeginHorizontal();
                {
                    GUI.backgroundColor = new Color(0.25f, 0.72f, 1.0f);
                    if (GUILayout.Button("🔍 Scan Installed Services", GUILayout.Height(30), GUILayout.Width(190)))
                    {
                        var scan = SKCPackageExporter.ScanAllPackages();
                        string installedList = string.Join("\n• ", scan.InstalledPackages.Select(p => $"{p.Name} (v{p.Version})"));
                        string missingList = scan.MissingPackages.Count > 0
                            ? "\n\nMissing / Uninstalled:\n• " + string.Join("\n• ", scan.MissingPackages.Select(p => p.Name))
                            : "\n\nAll 17 modular packages are installed!";

                        EditorUtility.DisplayDialog(
                            "Service Scan Complete",
                            $"Scan Results:\n" +
                            $"• Total Catalog Packages: {scan.TotalScanned}\n" +
                            $"• Installed & Active: {scan.InstalledPackages.Count}\n" +
                            $"• Missing / Inactive: {scan.MissingPackages.Count}\n\n" +
                            $"Installed Services:\n• {installedList}" +
                            missingList +
                            $"\n\nScripting define symbols and compiler .rsp files have been synchronized.",
                            "OK"
                        );
                    }
                    GUI.backgroundColor = Color.white;

                    if (GUILayout.Button("📦 Export All 17 Packages", GUILayout.Height(30)))
                    {
                        var manifest = SKCPackageExporter.ExportAllPackages();
                        EditorUtility.DisplayDialog("Export Complete", $"Exported {manifest.Packages.Count} packages to '{SKCPackageExporter.DefaultExportFolder}'!\n\nManifest saved.", "OK");
                    }

                    if (GUILayout.Button("🔨 Rebuild Master ASMDEF", GUILayout.Height(30)))
                    {
                        SKCAsmdefManager.RebuildMasterAsmdef();
                        EditorUtility.DisplayDialog("ASMDEF Rebuilt", "Master SKC.Framework.asmdef has been rebuilt successfully.", "OK");
                    }

                    if (GUILayout.Button("📂 Open Package Folder", GUILayout.Height(30)))
                    {
                        if (!Directory.Exists(SKCPackageExporter.DefaultExportFolder))
                        {
                            Directory.CreateDirectory(SKCPackageExporter.DefaultExportFolder);
                        }
                        EditorUtility.RevealInFinder(SKCPackageExporter.DefaultExportFolder);
                    }
                }
                EditorGUILayout.EndHorizontal();

                // Game ASMDEF Linker Row
                EditorGUILayout.Space(4);
                var gameAsmdefs = SKCAsmdefManager.FindGameAsmdefPaths();
                EditorGUILayout.BeginHorizontal(EditorStyles.helpBox);
                {
                    EditorGUILayout.LabelField("Link to Game ASMDEF:", EditorStyles.boldLabel, GUILayout.Width(150));
                    if (gameAsmdefs == null || gameAsmdefs.Count == 0)
                    {
                        EditorGUILayout.LabelField("No game asmdefs found outside SKCFramework.", EditorStyles.miniLabel);
                    }
                    else
                    {
                        if (_selectedGameAsmdefIndex < 0 || _selectedGameAsmdefIndex >= gameAsmdefs.Count)
                            _selectedGameAsmdefIndex = 0;

                        string[] names = gameAsmdefs.Select(p => Path.GetFileName(p)).ToArray();
                        _selectedGameAsmdefIndex = EditorGUILayout.Popup(_selectedGameAsmdefIndex, names, GUILayout.Width(220));

                        if (GUILayout.Button("🔗 Link Now", GUILayout.Width(100)))
                        {
                            string targetPath = gameAsmdefs[_selectedGameAsmdefIndex];
                            if (SKCAsmdefManager.LinkToGameAssembly(targetPath))
                            {
                                EditorUtility.DisplayDialog("Link Success", $"Successfully linked SKC.Framework to '{targetPath}'!", "OK");
                            }
                        }
                    }
                }
                EditorGUILayout.EndHorizontal();
            }
            EditorGUILayout.EndVertical();

            // 2. Filter & Category Toolbar
            EditorGUILayout.BeginHorizontal(EditorStyles.toolbar);
            {
                string[] categories = new[] { "All", "Core", "Gameplay", "Economy", "Retention", "UI", "Audio", "Monetization", "Compliance", "Feedback", "Input", "System" };
                foreach (var cat in categories)
                {
                    bool isSelected = _pkgSelectedCategory == cat;
                    if (GUILayout.Toggle(isSelected, cat, EditorStyles.toolbarButton, GUILayout.Width(75)) != isSelected)
                    {
                        _pkgSelectedCategory = cat;
                    }
                }

                GUILayout.FlexibleSpace();
                EditorGUILayout.LabelField("🔍 Search:", GUILayout.Width(60));
                _pkgSearchQuery = EditorGUILayout.TextField(_pkgSearchQuery, EditorStyles.toolbarSearchField, GUILayout.Width(160));
                if (!string.IsNullOrEmpty(_pkgSearchQuery) && GUILayout.Button("X", EditorStyles.toolbarButton, GUILayout.Width(20)))
                {
                    _pkgSearchQuery = "";
                }
            }
            EditorGUILayout.EndHorizontal();

            EditorGUILayout.Space(6);

            // 3. Package Cards
            var catalog = SKCPackageExporter.GetPackageCatalog();
            int displayedCount = 0;

            foreach (var pkg in catalog)
            {
                // Category Filter
                if (_pkgSelectedCategory != "All" && !string.Equals(pkg.Category, _pkgSelectedCategory, StringComparison.OrdinalIgnoreCase))
                    continue;

                // Search Filter
                if (!string.IsNullOrEmpty(_pkgSearchQuery))
                {
                    bool match = pkg.Name.IndexOf(_pkgSearchQuery, StringComparison.OrdinalIgnoreCase) >= 0 ||
                                 pkg.Id.IndexOf(_pkgSearchQuery, StringComparison.OrdinalIgnoreCase) >= 0 ||
                                 pkg.Description.IndexOf(_pkgSearchQuery, StringComparison.OrdinalIgnoreCase) >= 0;
                    if (!match) continue;
                }

                displayedCount++;
                DrawModularPackageCard(pkg, catalog);
            }

            if (displayedCount == 0)
            {
                EditorGUILayout.HelpBox("No packages found matching filter criteria.", MessageType.Info);
            }
        }

        private void DrawModularPackageCard(SKCPackageExporter.PackageInfo pkg, List<SKCPackageExporter.PackageInfo> catalog)
        {
            bool isFilesPresent = SKCPackageExporter.IsPackageFilesPresent(pkg);
            bool isDefineActive = !string.IsNullOrEmpty(pkg.DefineSymbol) && SDKPackageInstaller.HasDefineSymbol(pkg.DefineSymbol);
            string packageFilePath = Path.Combine(SKCPackageExporter.DefaultExportFolder, pkg.FileName).Replace('\\', '/');
            bool hasExportedPackage = File.Exists(packageFilePath);

            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                // Top row: Title, Category, Status Badge
                EditorGUILayout.BeginHorizontal();
                {
                    EditorGUILayout.LabelField($"📦 {pkg.Name} <color=#90CAF9>(v{pkg.Version})</color>", new GUIStyle(EditorStyles.boldLabel) { richText = true, fontSize = 13 }, GUILayout.Width(320));
                    GUILayout.Box(pkg.Category, EditorStyles.miniButton, GUILayout.Width(90));
                    GUILayout.FlexibleSpace();

                    if (pkg.IsCore)
                    {
                        EditorGUILayout.LabelField("CORE FOUNDATION", _badgeActiveStyle, GUILayout.Width(160));
                    }
                    else if (isFilesPresent && isDefineActive)
                    {
                        EditorGUILayout.LabelField("INSTALLED & ACTIVE", _badgeActiveStyle, GUILayout.Width(160));
                    }
                    else if (isFilesPresent && !isDefineActive)
                    {
                        EditorGUILayout.LabelField("DISABLED (FILES PRESENT)", _badgeInactiveStyle, GUILayout.Width(160));
                    }
                    else
                    {
                        EditorGUILayout.LabelField("NOT INSTALLED", _badgeInactiveStyle, GUILayout.Width(160));
                    }
                }
                EditorGUILayout.EndHorizontal();

                // Description
                EditorGUILayout.LabelField(pkg.Description, EditorStyles.wordWrappedMiniLabel);

                // Dependencies and Define Info
                EditorGUILayout.BeginHorizontal();
                {
                    string deps = (pkg.Dependencies != null && pkg.Dependencies.Count > 0)
                        ? string.Join(", ", pkg.Dependencies)
                        : "None";
                    EditorGUILayout.LabelField($"Dependencies: <b>{deps}</b>", new GUIStyle(EditorStyles.miniLabel) { richText = true }, GUILayout.Width(300));

                    if (!string.IsNullOrEmpty(pkg.DefineSymbol))
                    {
                        EditorGUILayout.LabelField($"Define: <color=#CE93D8>{pkg.DefineSymbol}</color>", new GUIStyle(EditorStyles.miniLabel) { richText = true });
                    }
                }
                EditorGUILayout.EndHorizontal();

                EditorGUILayout.Space(4);

                // Action Buttons Row
                EditorGUILayout.BeginHorizontal();
                {
                    if (pkg.IsCore)
                    {
                        EditorGUILayout.LabelField("Essential foundation module (always active).", EditorStyles.miniLabel);
                    }
                    else if (!isFilesPresent)
                    {
                        GUI.backgroundColor = new Color(0.3f, 0.8f, 0.4f);
                        if (GUILayout.Button("⬇️ Install Package", GUILayout.Width(130), GUILayout.Height(24)))
                        {
                            InstallOrEnablePackage(pkg, catalog);
                        }
                        GUI.backgroundColor = Color.white;
                    }
                    else if (!isDefineActive)
                    {
                        GUI.backgroundColor = new Color(0.3f, 0.8f, 0.4f);
                        if (GUILayout.Button("⚡ Enable Module", GUILayout.Width(120), GUILayout.Height(24)))
                        {
                            InstallOrEnablePackage(pkg, catalog);
                        }
                        GUI.backgroundColor = new Color(0.95f, 0.4f, 0.4f);
                        if (GUILayout.Button("🗑️ Delete Assets", GUILayout.Width(110), GUILayout.Height(24)))
                        {
                            UninstallOrDisablePackage(pkg, catalog);
                        }
                        GUI.backgroundColor = Color.white;
                    }
                    else
                    {
                        GUI.backgroundColor = new Color(0.95f, 0.4f, 0.4f);
                        if (GUILayout.Button("🗑️ Clean Uninstall", GUILayout.Width(130), GUILayout.Height(24)))
                        {
                            UninstallOrDisablePackage(pkg, catalog);
                        }
                        GUI.backgroundColor = Color.white;
                    }

                    GUILayout.FlexibleSpace();

                    if (GUILayout.Button("📦 Export Package", GUILayout.Width(120), GUILayout.Height(24)))
                    {
                        string targetPath = Path.Combine(SKCPackageExporter.DefaultExportFolder, pkg.FileName);
                        if (SKCPackageExporter.ExportPackage(pkg, targetPath))
                        {
                            EditorUtility.DisplayDialog("Export Complete", $"Exported '{pkg.Name}' to:\n{targetPath}", "OK");
                        }
                    }

                    if (hasExportedPackage)
                    {
                        long size = new FileInfo(packageFilePath).Length;
                        EditorGUILayout.LabelField($"({size / 1024} KB)", EditorStyles.miniLabel, GUILayout.Width(60));
                    }
                }
                EditorGUILayout.EndHorizontal();
            }
            EditorGUILayout.EndVertical();
        }

        private void InstallOrEnablePackage(SKCPackageExporter.PackageInfo pkg, List<SKCPackageExporter.PackageInfo> catalog)
        {
            // Check missing dependencies
            List<string> missingDeps = new List<string>();
            if (pkg.Dependencies != null)
            {
                foreach (var depId in pkg.Dependencies)
                {
                    if (string.Equals(depId, "skc.core", StringComparison.OrdinalIgnoreCase)) continue;
                    var depPkg = catalog.FirstOrDefault(p => string.Equals(p.Id, depId, StringComparison.OrdinalIgnoreCase));
                    if (depPkg != null && !SKCPackageExporter.IsPackageActive(depPkg))
                    {
                        missingDeps.Add(depPkg.Name);
                    }
                }
            }

            if (missingDeps.Count > 0)
            {
                string list = string.Join("\n• ", missingDeps);
                bool proceed = EditorUtility.DisplayDialog(
                    "Missing Dependencies",
                    $"Package '{pkg.Name}' requires the following dependencies:\n• {list}\n\nWould you like to install and enable these dependencies automatically?",
                    "Install Dependencies & Proceed",
                    "Cancel"
                );

                if (!proceed) return;

                // Enable/import dependency packages
                foreach (var depId in pkg.Dependencies)
                {
                    var depPkg = catalog.FirstOrDefault(p => string.Equals(p.Id, depId, StringComparison.OrdinalIgnoreCase));
                    if (depPkg != null)
                    {
                        string depPkgPath = Path.Combine(SKCPackageExporter.DefaultExportFolder, depPkg.FileName).Replace('\\', '/');
                        if (!SKCPackageExporter.IsPackageFilesPresent(depPkg) && File.Exists(depPkgPath))
                        {
                            AssetDatabase.ImportPackage(depPkgPath, false);
                        }
                        if (!string.IsNullOrEmpty(depPkg.DefineSymbol))
                        {
                            SDKPackageInstaller.SetDefineSymbol(depPkg.DefineSymbol, true);
                        }
                    }
                }
            }

            // Enable define symbol FIRST before importing so compiler already has the define symbol
            if (!string.IsNullOrEmpty(pkg.DefineSymbol))
            {
                SDKPackageInstaller.SetDefineSymbol(pkg.DefineSymbol, true);
            }

            // If files missing, import archive
            string pkgPath = Path.Combine(SKCPackageExporter.DefaultExportFolder, pkg.FileName).Replace('\\', '/');
            if (!SKCPackageExporter.IsPackageFilesPresent(pkg))
            {
                if (File.Exists(pkgPath))
                {
                    AssetDatabase.ImportPackage(pkgPath, false);
                }
                else if (!string.IsNullOrEmpty(pkg.DownloadUrl))
                {
                    bool download = EditorUtility.DisplayDialog(
                        "Download Package",
                        $"Package archive '{pkg.FileName}' was not found locally in Builds/SKCPackages/.\n\nWould you like to download it directly from GitHub Releases and install?\n\nURL:\n{pkg.DownloadUrl}",
                        "Download & Install",
                        "Cancel"
                    );

                    if (download)
                    {
                        DownloadAndImportPackage(pkg, pkgPath, () =>
                        {
                            SKCPackageExporter.ScanAllPackages();
                            AssetDatabase.Refresh();
                            EditorUtility.DisplayDialog("Package Installed", $"Package '{pkg.Name}' has been successfully downloaded from GitHub Releases and installed!", "OK");
                            Repaint();
                        });
                        return;
                    }
                    return;
                }
                else
                {
                    EditorUtility.DisplayDialog("Package Archive Not Found", $"Could not find package archive at:\n{pkgPath}\n\nPlease export the package or place the archive in Builds/SKCPackages/.", "OK");
                    return;
                }
            }

            SKCPackageExporter.ScanAllPackages();
            AssetDatabase.Refresh();

            EditorUtility.DisplayDialog("Package Installed", $"Package '{pkg.Name}' has been successfully installed and enabled!", "OK");
        }

        private void DownloadAndImportPackage(SKCPackageExporter.PackageInfo pkg, string targetPath, Action onComplete)
        {
            string dir = Path.GetDirectoryName(targetPath);
            if (!Directory.Exists(dir) && !string.IsNullOrEmpty(dir))
            {
                Directory.CreateDirectory(dir);
            }

            var request = UnityWebRequest.Get(pkg.DownloadUrl);
            request.downloadHandler = new DownloadHandlerFile(targetPath);
            var asyncOp = request.SendWebRequest();

            EditorUtility.DisplayProgressBar($"Downloading {pkg.Name}", "Connecting to GitHub Releases...", 0f);

            EditorApplication.CallbackFunction updateCallback = null;
            updateCallback = () =>
            {
                if (!asyncOp.isDone)
                {
                    EditorUtility.DisplayProgressBar(
                        $"Downloading {pkg.Name}",
                        $"Downloading package ({asyncOp.progress * 100:F0}%)...",
                        asyncOp.progress
                    );
                    return;
                }

                EditorApplication.update -= updateCallback;
                EditorUtility.ClearProgressBar();

                if (request.result == UnityWebRequest.Result.Success)
                {
                    Debug.Log($"[SKCControlCenter] Successfully downloaded {pkg.Name} from GitHub Releases to {targetPath}");
                    AssetDatabase.ImportPackage(targetPath, false);
                    onComplete?.Invoke();
                }
                else
                {
                    EditorUtility.DisplayDialog("Download Error", $"Failed to download {pkg.Name} from GitHub Releases:\n{request.error}\n\nURL: {pkg.DownloadUrl}", "OK");
                    Debug.LogError($"[SKCControlCenter] Failed to download {pkg.Name}: {request.error}");
                }

                request.Dispose();
            };

            EditorApplication.update += updateCallback;
        }

        private void UninstallOrDisablePackage(SKCPackageExporter.PackageInfo pkg, List<SKCPackageExporter.PackageInfo> catalog)
        {
            // Check downstream dependents
            List<string> dependents = new List<string>();
            foreach (var other in catalog)
            {
                if (other.Id == pkg.Id) continue;
                bool otherActive = SKCPackageExporter.IsPackageActive(other);
                if (otherActive && other.Dependencies != null && other.Dependencies.Any(d => string.Equals(d, pkg.Id, StringComparison.OrdinalIgnoreCase)))
                {
                    dependents.Add(other.Name);
                }
            }

            if (dependents.Count > 0)
            {
                string list = string.Join("\n• ", dependents);
                EditorUtility.DisplayDialog(
                    "Cannot Uninstall Package",
                    $"The following installed packages depend on '{pkg.Name}':\n• {list}\n\nPlease uninstall or disable these dependent packages first.",
                    "OK"
                );
                return;
            }

            int choice = EditorUtility.DisplayDialogComplex(
                $"Uninstall {pkg.Name}",
                $"How would you like to uninstall '{pkg.Name}'?\n\n" +
                $"• Delete Assets & Uninstall:\nRemoves all module files from your project and disables define '{pkg.DefineSymbol}'.\n(A backup .unitypackage is automatically preserved in Builds/SKCPackages/ so you can reinstall it anytime!)\n\n" +
                $"• Disable Only:\nKeeps files in the project but turns off define '{pkg.DefineSymbol}' (Zero GC, zero runtime impact).",
                "Delete Assets & Uninstall", // 0
                "Cancel",                     // 1
                "Disable Only"                // 2
            );

            if (choice == 1) return; // Cancel

            if (choice == 0) // Delete Assets & Uninstall
            {
                // 1. Ensure backup archive exists
                string backupPkgPath = Path.Combine(SKCPackageExporter.DefaultExportFolder, pkg.FileName);
                if (!File.Exists(backupPkgPath))
                {
                    SKCPackageExporter.ExportPackage(pkg, backupPkgPath);
                }

                // 2. Remove define symbol
                if (!string.IsNullOrEmpty(pkg.DefineSymbol))
                {
                    SDKPackageInstaller.SetDefineSymbol(pkg.DefineSymbol, false);
                }

                // 3. Delete files & folders from project
                int deletedCount = 0;
                foreach (var path in pkg.AssetPaths)
                {
                    if (File.Exists(path) || Directory.Exists(path))
                    {
                        if (AssetDatabase.DeleteAsset(path))
                        {
                            deletedCount++;
                        }
                    }
                }

                // 4. Rescan and refresh
                SKCPackageExporter.ScanAllPackages();
                AssetDatabase.Refresh();

                EditorUtility.DisplayDialog(
                    "Package Uninstalled",
                    $"Package '{pkg.Name}' has been completely uninstalled ({deletedCount} assets removed).\n\nA backup copy is preserved in Builds/SKCPackages/{pkg.FileName}.",
                    "OK"
                );
            }
            else if (choice == 2) // Disable Only
            {
                if (!string.IsNullOrEmpty(pkg.DefineSymbol))
                {
                    SDKPackageInstaller.SetDefineSymbol(pkg.DefineSymbol, false);
                }

                SKCPackageExporter.ScanAllPackages();
                AssetDatabase.Refresh();

                EditorUtility.DisplayDialog(
                    "Package Disabled",
                    $"Package '{pkg.Name}' define symbol has been disabled. The files remain in your project.",
                    "OK"
                );
            }
        }

        #endregion

        #endregion

        #region Tab 9: Quick Tools & Scenes

        private void DrawQuickToolsTab()
        {
            DrawSectionHeader("⚡ Quick Tools & Scene Switcher", "Rapid development shortcuts for switching scenes, clearing cache, and inspecting framework stats.");

            // 1. Scene Switcher
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.LabelField("Rapid Scene Switcher", _subHeaderStyle);

                EditorGUILayout.BeginHorizontal();
                {
                    if (GUILayout.Button("🚀 Open BootScene", GUILayout.Height(32)))
                    {
                        OpenSceneIfExists("Assets/Plugins/SKCFramework/Scenes/BootScene.unity");
                    }
                    if (GUILayout.Button("🎮 Open MainScene", GUILayout.Height(32)))
                    {
                        OpenSceneIfExists("Assets/Plugins/SKCFramework/Scenes/MainScene.unity");
                    }
                }
                EditorGUILayout.EndHorizontal();
            }
            EditorGUILayout.EndVertical();

            // 2. Cache & Cleanup Utilities
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.LabelField("Cache & Cleanup Tools", _subHeaderStyle);

                EditorGUILayout.BeginHorizontal();
                {
                    if (GUILayout.Button("Clear PlayerPrefs", GUILayout.Height(28)))
                    {
                        PlayerPrefs.DeleteAll();
                        PlayerPrefs.Save();
                        Debug.Log("[SKCControlCenter] PlayerPrefs deleted.");
                    }
                    if (GUILayout.Button("Clear All Persistent Files", GUILayout.Height(28)))
                    {
                        if (EditorUtility.DisplayDialog("Clear Persistent Data", "Delete all files in persistentDataPath?", "Yes", "Cancel"))
                        {
                            DeleteSaveFile();
                        }
                    }
                    if (GUILayout.Button("Unload Unused Assets", GUILayout.Height(28)))
                    {
                        Resources.UnloadUnusedAssets();
                        GC.Collect();
                        Debug.Log("[SKCControlCenter] Unused assets unloaded and GC run.");
                    }
                }
                EditorGUILayout.EndHorizontal();
            }
            EditorGUILayout.EndVertical();
        }

        private void OpenSceneIfExists(string path)
        {
            if (File.Exists(path))
            {
                if (EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
                {
                    EditorSceneManager.OpenScene(path);
                }
            }
            else
            {
                // Fallback: search for scene by name in AssetDatabase
                string sceneName = Path.GetFileNameWithoutExtension(path);
                string[] guids = AssetDatabase.FindAssets($"t:Scene {sceneName}");
                if (guids.Length > 0)
                {
                    string foundPath = AssetDatabase.GUIDToAssetPath(guids[0]);
                    if (EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
                    {
                        EditorSceneManager.OpenScene(foundPath);
                    }
                }
                else
                {
                    Debug.LogWarning($"[SKCControlCenter] Scene not found at path: {path}");
                }
            }
        }

        #endregion

        #region Helper Methods

        private void DrawSectionHeader(string title, string description)
        {
            EditorGUILayout.LabelField(title, _sectionHeaderStyle);
            EditorGUILayout.LabelField(description, EditorStyles.miniLabel);
            EditorGUILayout.Space(6);
        }

        private void PingResourceAsset(string resourceName)
        {
            var asset = Resources.Load<UnityEngine.Object>(resourceName);
            if (asset != null)
            {
                EditorGUIUtility.PingObject(asset);
                Selection.activeObject = asset;
            }
            else
            {
                Debug.LogWarning($"[SKCControlCenter] Resource asset '{resourceName}' not found in Resources folder.");
            }
        }

        private LogSettingsSO GetOrCreateLogSettings()
        {
            var settings = Resources.Load<LogSettingsSO>("LogSettings");
            if (settings == null)
            {
                if (!Directory.Exists("Assets/Resources"))
                {
                    Directory.CreateDirectory("Assets/Resources");
                }
                settings = ScriptableObject.CreateInstance<LogSettingsSO>();
                settings.PopulateDefaultTagConfigs();
                AssetDatabase.CreateAsset(settings, "Assets/Resources/LogSettings.asset");
                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();
            }
            return settings;
        }

        private void SyncLoggingDefineSymbols(bool enableLogs)
        {
            var buildTargetGroup = EditorUserBuildSettings.selectedBuildTargetGroup;
            var namedBuildTarget = NamedBuildTarget.FromBuildTargetGroup(buildTargetGroup);
            string defines = PlayerSettings.GetScriptingDefineSymbols(namedBuildTarget);
            var list = new List<string>(defines.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries));

            if (enableLogs)
            {
                list.Remove("SKC_DISABLE_LOGS");
                if (!list.Contains("SKC_ENABLE_LOGS")) list.Add("SKC_ENABLE_LOGS");
            }
            else
            {
                list.Remove("SKC_ENABLE_LOGS");
                if (!list.Contains("SKC_DISABLE_LOGS")) list.Add("SKC_DISABLE_LOGS");
            }

            string newDefines = string.Join(";", list);
            PlayerSettings.SetScriptingDefineSymbols(namedBuildTarget, newDefines);
            Debug.Log($"[SKCControlCenter] Scripting Define Symbols updated for {buildTargetGroup}: {newDefines}");
        }

        #endregion

        #region Tab 11: Pre-Flight Checklist

        private void DrawPreFlightTab()
        {
            DrawSectionHeader("🛫 Publisher Pre-Flight Compliance Checklist", "Automated compliance auditor ensuring zero-rejection submissions for Google Play & Apple App Store.");

            // 1. Package Name / Bundle Identifier
            string appId = PlayerSettings.applicationIdentifier;
            bool isDefaultId = string.IsNullOrEmpty(appId) ||
                               appId.StartsWith("com.DefaultCompany", StringComparison.OrdinalIgnoreCase) ||
                               appId.StartsWith("com.Unity", StringComparison.OrdinalIgnoreCase);

            // 2. Android Target SDK
            int targetSdk = (int)PlayerSettings.Android.targetSdkVersion;
            bool isSdkOk = targetSdk == 0 || targetSdk >= 34;

            // 3. Android Scripting Backend & Architecture
            var backend = PlayerSettings.GetScriptingBackend(NamedBuildTarget.Android);
            bool isArm64 = (PlayerSettings.Android.targetArchitectures & AndroidArchitecture.ARM64) != 0;
            bool isArchOk = backend == ScriptingImplementation.IL2CPP && isArm64;

            // 4. Android Keystore
            bool hasCustomKeystore = PlayerSettings.Android.useCustomKeystore && !string.IsNullOrEmpty(PlayerSettings.Android.keystoreName);

            // 5. Build Profile & Dev Build
            bool isProd = SKCore.IsProduction;
            bool isDevBuild = EditorUserBuildSettings.development;

            // 6. iOS ATT Description
            string attDesc = EditorPrefs.GetString("SKC_IOS_ATT_DESCRIPTION", "");
            bool isAttOk = !string.IsNullOrEmpty(attDesc);

            // 7. Ads Provider Status
#if SKC_HAS_ADS
            string adsService = SKCore.Ads != null ? SKCore.Ads.ServiceName : "None";
            bool isLiveAds = adsService != "DummyAdsService" && adsService != "None";
#else
            string adsService = "Not Installed";
            bool isLiveAds = false;
#endif

            // 8. Version Code & Bundle Version
            string version = PlayerSettings.bundleVersion;
            int bundleCode = PlayerSettings.Android.bundleVersionCode;
            bool isVersionOk = !string.IsNullOrEmpty(version) && bundleCode > 0;

            // 9. Frame Rate Target
            int targetFps = Application.targetFrameRate;
            bool isFpsOk = targetFps == 60 || targetFps == 120 || targetFps == -1;

            // 10. SDK Hub Orphan Defines
            var orphans = SDKPackageInstaller.GetOrphanDefines();
            bool noOrphans = orphans == null || orphans.Count == 0;

            // Compute Score
            int totalChecks = 10;
            int passedCount = 0;
            if (!isDefaultId) passedCount++;
            if (isSdkOk) passedCount++;
            if (isArchOk) passedCount++;
            if (hasCustomKeystore) passedCount++;
            if (isProd && !isDevBuild) passedCount++;
            if (isAttOk) passedCount++;
            if (isLiveAds) passedCount++;
            if (isVersionOk) passedCount++;
            if (isFpsOk) passedCount++;
            if (noOrphans) passedCount++;

            int blockersCount = 0;
            if (isDefaultId) blockersCount++;
            if (!isSdkOk) blockersCount++;
            if (!isArchOk) blockersCount++;
            if (!isAttOk) blockersCount++;

            // Summary Score Banner
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.BeginHorizontal();
                {
                    if (blockersCount > 0)
                    {
                        GUI.backgroundColor = new Color(0.92f, 0.25f, 0.25f);
                        EditorGUILayout.LabelField($"🔴 {blockersCount} CRITICAL BLOCKER(S) DETECTED", _headerTitleStyle);
                    }
                    else if (passedCount < totalChecks)
                    {
                        GUI.backgroundColor = new Color(0.95f, 0.72f, 0.2f);
                        EditorGUILayout.LabelField($"⚠️ {totalChecks - passedCount} WARNING(S) TO REVIEW", _headerTitleStyle);
                    }
                    else
                    {
                        GUI.backgroundColor = new Color(0.2f, 0.85f, 0.35f);
                        EditorGUILayout.LabelField($"🟢 ALL CHECKS PASSED ({passedCount}/{totalChecks}) - READY TO PUBLISH!", _headerTitleStyle);
                    }
                    GUI.backgroundColor = Color.white;

                    GUILayout.FlexibleSpace();
                    EditorGUILayout.LabelField($"Score: {passedCount}/{totalChecks} Passed", EditorStyles.boldLabel, GUILayout.Width(140));

                    if (GUILayout.Button("🔄 Re-Scan", EditorStyles.toolbarButton, GUILayout.Width(90), GUILayout.Height(24)))
                    {
                        Repaint();
                    }
                }
                EditorGUILayout.EndHorizontal();

                if (blockersCount > 0)
                {
                    EditorGUILayout.HelpBox("Critical blockers will cause immediate rejection during Google Play or Apple App Store review. Fix them using the buttons below before exporting final builds.", MessageType.Error);
                }
                else if (passedCount < totalChecks)
                {
                    EditorGUILayout.HelpBox("Project has non-critical warnings. Ensure Live Ads, Production Logging, and Keystores are verified before releasing.", MessageType.Warning);
                }
            }
            EditorGUILayout.EndVertical();

            // Checklist Items Table
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.LabelField("Pre-Flight Compliance Audit Items", _subHeaderStyle);

                // 1. Package Name
                DrawChecklistRow(
                    !isDefaultId,
                    true,
                    "Package Name / Bundle Identifier",
                    $"Current: '{appId}'" + (isDefaultId ? " (Default placeholder - will be rejected by store!)" : ""),
                    "Edit Player Settings",
                    () => { SettingsService.OpenProjectSettings("Project/Player"); }
                );

                // 2. Android Target SDK
                string sdkDesc = targetSdk == 0 ? "Automatic (Highest Installed >= 34)" : $"API Level {targetSdk}";
                DrawChecklistRow(
                    isSdkOk,
                    true,
                    "Android Target API Level (Google Play Requirement)",
                    $"Current: {sdkDesc}" + (!isSdkOk ? " (Must be API 34+ for Google Play submission!)" : ""),
                    "Set to API 34 (Android 14)",
                    () =>
                    {
                        PlayerSettings.Android.targetSdkVersion = (AndroidSdkVersions)34;
                        AssetDatabase.SaveAssets();
                    }
                );

                // 3. IL2CPP & ARM64
                string archDesc = $"Backend: {backend}, ARM64: {(isArm64 ? "Enabled" : "Disabled")}";
                DrawChecklistRow(
                    isArchOk,
                    true,
                    "Android 64-bit & IL2CPP Architecture",
                    $"Current: {archDesc}" + (!isArchOk ? " (Google Play requires 64-bit IL2CPP support!)" : ""),
                    "Enable IL2CPP + ARM64",
                    () =>
                    {
                        PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
                        PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64 | AndroidArchitecture.ARMv7;
                        AssetDatabase.SaveAssets();
                    }
                );

                // 4. iOS ATT Description
                DrawChecklistRow(
                    isAttOk,
                    true,
                    "iOS App Tracking Transparency (ATT Description)",
                    isAttOk ? $"Description: \"{attDesc}\"" : "Missing NSUserTrackingUsageDescription (Apple will reject build!)",
                    "Set Default ATT Text",
                    () =>
                    {
                        EditorPrefs.SetString("SKC_IOS_ATT_DESCRIPTION", "Your data will be used to deliver personalized ads, rewards, and an optimized gaming experience.");
                        AssetDatabase.SaveAssets();
                    }
                );

                // 5. Production Profile & Development Build
                string buildDesc = $"Profile: {SKCore.ActiveBuildProfile}, DevBuild: {isDevBuild}";
                DrawChecklistRow(
                    isProd && !isDevBuild,
                    false,
                    "Production Logging & Build Stripping",
                    $"Current: {buildDesc}" + (!isProd || isDevBuild ? " (Debug logs active - switch to Production before release!)" : ""),
                    "Switch to Production",
                    () =>
                    {
                        var logSettings = GetOrCreateLogSettings();
                        logSettings.profile = BuildLoggingProfile.Production;
                        EditorUserBuildSettings.development = false;
                        SyncLoggingDefineSymbols(false);
                        EditorUtility.SetDirty(logSettings);
                        AssetDatabase.SaveAssets();
                    }
                );

                // 6. Active Ads Mediation Adapter
                DrawChecklistRow(
                    isLiveAds,
                    false,
                    "Active Ads Mediation Service",
                    $"Active: '{adsService}'" + (!isLiveAds ? " (DummyAds active - install MAX or ironSource before live publishing!)" : ""),
                    "Open SDK Hub",
                    () => { _selectedTab = TabType.SDKAndTools; }
                );

                // 7. Android Release Keystore
                DrawChecklistRow(
                    hasCustomKeystore,
                    false,
                    "Android Release Signing & Keystore",
                    hasCustomKeystore ? $"Keystore: {PlayerSettings.Android.keystoreName}" : "Using default debug keystore (Cannot publish to Google Play with debug key)",
                    "Open Player Settings",
                    () => { SettingsService.OpenProjectSettings("Project/Player"); }
                );

                // 8. Version Code & Number
                DrawChecklistRow(
                    isVersionOk,
                    false,
                    "App Version & Android Bundle Version Code",
                    $"Version: {version}, Bundle Code: {bundleCode}",
                    "Increment Version Code",
                    () =>
                    {
                        PlayerSettings.Android.bundleVersionCode++;
                        AssetDatabase.SaveAssets();
                    }
                );

                // 9. Frame Rate Target (60 FPS)
                DrawChecklistRow(
                    isFpsOk,
                    false,
                    "Target Frame Rate (Smooth 60 FPS)",
                    $"Current targetFrameRate: {targetFps}",
                    "Set 60 FPS",
                    () =>
                    {
                        Application.targetFrameRate = 60;
                    }
                );

                // 10. SDK Hub Orphan Defines
                DrawChecklistRow(
                    noOrphans,
                    false,
                    "SDK Hub Package & Define Symbol Integrity",
                    noOrphans ? "Clean - no orphan defines detected." : $"⚠️ {orphans.Count} orphan define(s) found without package files.",
                    "Clear Orphan Defines",
                    () =>
                    {
                        SDKPackageInstaller.ClearOrphanDefines();
                    }
                );
            }
            EditorGUILayout.EndVertical();

            // Live Monetization & Compliance Controls
            EditorGUILayout.BeginVertical(_cardBoxStyle);
            {
                EditorGUILayout.LabelField("👑 Live Publisher & Monetization Dashboard", _subHeaderStyle);

#if SKC_HAS_IAP
                bool noAdsActive = SKCore.IAP != null && SKCore.IAP.IsNoAdsActive;
                EditorGUILayout.BeginHorizontal();
                {
                    EditorGUILayout.LabelField("No-Ads Entitlement:", EditorStyles.boldLabel, GUILayout.Width(160));
                    if (noAdsActive)
                    {
                        GUI.backgroundColor = new Color(0.2f, 0.85f, 0.35f);
                        GUILayout.Box("ACTIVE (Ads Suppressed)", GUILayout.Width(160), GUILayout.Height(22));
                    }
                    else
                    {
                        GUI.backgroundColor = new Color(0.45f, 0.5f, 0.6f);
                        GUILayout.Box("INACTIVE (Ads Enabled)", GUILayout.Width(160), GUILayout.Height(22));
                    }
                    GUI.backgroundColor = Color.white;

                    if (GUILayout.Button(noAdsActive ? "Deactivate" : "Activate", GUILayout.Width(90), GUILayout.Height(22)))
                    {
                        SKCore.IAP?.SetNoAds(!noAdsActive);
                    }

                    if (GUILayout.Button("Simulate Purchase", GUILayout.Width(130), GUILayout.Height(22)))
                    {
                        SKCore.IAP?.PurchaseNoAdsAsync().Forget();
                    }
                }
                EditorGUILayout.EndHorizontal();
                EditorGUILayout.Space(4);
#endif

#if SKC_HAS_PRIVACY
                string consentStr = SKCore.Privacy != null ? SKCore.Privacy.ConsentStatus.ToString() : "N/A";
                EditorGUILayout.BeginHorizontal();
                {
                    EditorGUILayout.LabelField("Privacy Consent (ATT/UMP):", EditorStyles.boldLabel, GUILayout.Width(160));
                    EditorGUILayout.LabelField(consentStr, GUILayout.Width(160));

                    if (GUILayout.Button("Simulate ATT Prompt", GUILayout.Width(150), GUILayout.Height(22)))
                    {
                        SKCore.Privacy?.RequestTrackingAuthorizationAsync(true).Forget();
                    }

                    if (GUILayout.Button("Reset Consent", GUILayout.Width(100), GUILayout.Height(22)))
                    {
                        SKCore.Privacy?.SetTestConsentStatus(TrackingConsentStatus.NotDetermined);
                    }
                }
                EditorGUILayout.EndHorizontal();
                EditorGUILayout.Space(4);
#endif

#if SKC_HAS_TELEMETRY
                float fps = SKCore.Telemetry != null ? SKCore.Telemetry.CurrentFPS : 60f;
                int stutters = SKCore.Telemetry != null ? SKCore.Telemetry.LastLevelLagSpikes : 0;
                float duration = SKCore.Telemetry != null ? SKCore.Telemetry.LastLevelDuration : 0f;

                EditorGUILayout.BeginHorizontal();
                {
                    EditorGUILayout.LabelField("Telemetry Performance:", EditorStyles.boldLabel, GUILayout.Width(160));
                    EditorGUILayout.LabelField($"FPS: {fps:F1}  |  Last: {duration:F1}s  |  Stutters: {stutters}", GUILayout.Width(270));

#if SKC_HAS_REVIEW
                    if (GUILayout.Button("Test Review Prompt", GUILayout.Width(140), GUILayout.Height(22)))
                    {
                        SKCore.Review?.ForceRequestReviewAsync().Forget();
                    }
#endif

#if SKC_HAS_NOTIFICATIONS
                    if (GUILayout.Button("Schedule Notifs", GUILayout.Width(120), GUILayout.Height(22)))
                    {
                        SKCore.Notification?.ScheduleRetentionNotifications();
                    }
#endif
                }
                EditorGUILayout.EndHorizontal();
#endif
            }
            EditorGUILayout.EndVertical();
        }

        private void DrawChecklistRow(bool isPass, bool isBlocker, string title, string description, string actionLabel, Action onAction)
        {
            EditorGUILayout.BeginHorizontal(EditorStyles.helpBox);
            {
                if (isPass)
                {
                    GUI.backgroundColor = new Color(0.2f, 0.85f, 0.35f);
                    GUILayout.Box("PASS", GUILayout.Width(50), GUILayout.Height(24));
                }
                else if (isBlocker)
                {
                    GUI.backgroundColor = new Color(0.92f, 0.25f, 0.25f);
                    GUILayout.Box("BLOCK", GUILayout.Width(50), GUILayout.Height(24));
                }
                else
                {
                    GUI.backgroundColor = new Color(0.95f, 0.72f, 0.2f);
                    GUILayout.Box("WARN", GUILayout.Width(50), GUILayout.Height(24));
                }
                GUI.backgroundColor = Color.white;

                EditorGUILayout.BeginVertical();
                {
                    EditorGUILayout.LabelField(title, EditorStyles.boldLabel);
                    EditorGUILayout.LabelField(description, EditorStyles.miniLabel);
                }
                EditorGUILayout.EndVertical();

                GUILayout.FlexibleSpace();

                if (!isPass && !string.IsNullOrEmpty(actionLabel) && onAction != null)
                {
                    GUI.backgroundColor = isBlocker ? new Color(1f, 0.6f, 0.6f) : new Color(1f, 0.9f, 0.6f);
                    if (GUILayout.Button(actionLabel, GUILayout.Width(165), GUILayout.Height(26)))
                    {
                        onAction.Invoke();
                    }
                    GUI.backgroundColor = Color.white;
                }
            }
            EditorGUILayout.EndHorizontal();
        }

        #endregion
    }
}
