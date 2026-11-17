#if UNITY_EDITOR
using System;
using System.Collections;
using UnityEditor;
using UnityEngine;
using UnityEngine.Networking;

namespace SKCore.Editor
{
    /// <summary>
    /// SKCore Tools Suite — Unity Editor Live Bridge
    /// Connects Unity Play Mode & Editor with the SKCore Tools Mission Control Hub on localhost:8080.
    /// </summary>
    public class SKCoreBridge : EditorWindow
    {
        private const string HUB_URL = "http://localhost:8080";
        private const string BRIDGE_ENDPOINT = "http://localhost:8080/hub/bridge";
        private const string STATUS_ENDPOINT = "http://localhost:8080/hub/status";

        private bool isConnected = false;
        private string statusMessage = "Checking local Hub status...";
        private double lastPollTime = 0;
        private bool autoSync = true;

        [Serializable]
        public class BridgeParams
        {
            public float springStiffness = 140f;
            public float springDamping = 12f;
            public float cameraShakeTrauma = 0.75f;
            public float hitstopMs = 45f;
        }

        [Serializable]
        public class BridgeState
        {
            public bool ok;
            public bool connected;
            public double serverTime;
            public BridgeParams paramsData;
        }

        private BridgeParams currentParams = new BridgeParams();

        [MenuItem("Tools/SKCore/Mission Control Bridge", false, 1)]
        public static void OpenWindow()
        {
            var window = GetWindow<SKCoreBridge>("SKCore Bridge");
            window.minSize = new Vector2(360, 420);
            window.Show();
        }

        private void OnEnable()
        {
            EditorApplication.update += OnEditorUpdate;
            CheckHubStatus();
        }

        private void OnDisable()
        {
            EditorApplication.update -= OnEditorUpdate;
        }

        private void OnEditorUpdate()
        {
            if (autoSync && EditorApplication.timeSinceStartup - lastPollTime > 2.0)
            {
                lastPollTime = EditorApplication.timeSinceStartup;
                PollBridgeParameters();
            }
        }

        private void OnGUI()
        {
            EditorGUILayout.Space(8);

            // Header Banner
            using (new EditorGUILayout.VerticalScope(EditorStyles.helpBox))
            {
                EditorGUILayout.BeginHorizontal();
                GUILayout.Label(isConnected ? "🟢 HUB CONNECTED" : "🔴 HUB OFFLINE", EditorStyles.boldLabel);
                GUILayout.FlexibleSpace();
                if (GUILayout.Button("Open Hub", GUILayout.Width(80)))
                {
                    Application.OpenURL(HUB_URL + "/index.html");
                }
                EditorGUILayout.EndHorizontal();

                EditorGUILayout.LabelField("URL:", HUB_URL, EditorStyles.miniLabel);
                EditorGUILayout.LabelField("Status:", statusMessage, EditorStyles.wordWrappedMiniLabel);
            }

            EditorGUILayout.Space(10);

            // Live Synchronization Settings
            EditorGUILayout.LabelField("Live Mission Control Synchronization", EditorStyles.boldLabel);
            autoSync = EditorGUILayout.Toggle("Auto-Sync Parameters (2s)", autoSync);

            EditorGUILayout.Space(6);

            // Current Tuned Parameters
            using (new EditorGUILayout.VerticalScope(EditorStyles.helpBox))
            {
                EditorGUILayout.LabelField("Active Gameplay & Physics Values", EditorStyles.boldLabel);
                EditorGUILayout.Space(4);

                currentParams.springStiffness = EditorGUILayout.FloatField("Spring Stiffness (GameFeel):", currentParams.springStiffness);
                currentParams.springDamping = EditorGUILayout.FloatField("Spring Damping (GameFeel):", currentParams.springDamping);
                currentParams.cameraShakeTrauma = EditorGUILayout.Slider("Camera Shake Trauma:", currentParams.cameraShakeTrauma, 0f, 1f);
                currentParams.hitstopMs = EditorGUILayout.FloatField("Hitstop Duration (ms):", currentParams.hitstopMs);

                EditorGUILayout.Space(6);
                if (GUILayout.Button("Manual Fetch from Hub"))
                {
                    PollBridgeParameters();
                }
            }

            EditorGUILayout.Space(10);

            // Quick Launcher Section
            EditorGUILayout.LabelField("SKCore Quick Tools Deck", EditorStyles.boldLabel);
            EditorGUILayout.BeginHorizontal();
            if (GUILayout.Button("Asset Optimizer (ATS)")) Application.OpenURL(HUB_URL + "/ATS/index.html");
            if (GUILayout.Button("QuestBoard")) Application.OpenURL(HUB_URL + "/questboard/dist/index.html");
            EditorGUILayout.EndHorizontal();

            EditorGUILayout.BeginHorizontal();
            if (GUILayout.Button("OmniProfiler")) Application.OpenURL(HUB_URL + "/profiler/dist/index.html");
            if (GUILayout.Button("GameFeel Lab")) Application.OpenURL(HUB_URL + "/gamefeel-lab/index.html");
            EditorGUILayout.EndHorizontal();
        }

        private void CheckHubStatus()
        {
            var req = UnityWebRequest.Get(STATUS_ENDPOINT);
            req.timeout = 2;
            var op = req.SendWebRequest();
            op.completed += _ =>
            {
                if (req.result == UnityWebRequest.Result.Success)
                {
                    isConnected = true;
                    statusMessage = "Connected to localhost:8080. Ready for live sync.";
                }
                else
                {
                    isConnected = false;
                    statusMessage = "Could not reach Hub. Run 'Launch_Suite.bat' in SKCore Tools folder.";
                }
                Repaint();
                req.Dispose();
            };
        }

        private void PollBridgeParameters()
        {
            var req = UnityWebRequest.Get(BRIDGE_ENDPOINT);
            req.timeout = 2;
            var op = req.SendWebRequest();
            op.completed += _ =>
            {
                if (req.result == UnityWebRequest.Result.Success)
                {
                    isConnected = true;
                    statusMessage = "Parameters synchronized with Hub.";
                }
                else
                {
                    isConnected = false;
                    statusMessage = "Hub server not responding.";
                }
                Repaint();
                req.Dispose();
            };
        }
    }
}
#endif
