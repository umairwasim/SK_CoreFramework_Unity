/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System;
using System.Collections.Generic;
using UnityEngine;

namespace SKC.Logging
{
    [CreateAssetMenu(fileName = "LogSettings", menuName = "SKC/Logging/Log Settings")]
    public class LogSettingsSO : ScriptableObject
    {
        [System.Serializable]
        public class TagConfig
        {
            public LogTag tag;
            public bool isEnabled = true;
            public string hexColor = "#FFFFFF";

            public TagConfig() { }

            public TagConfig(LogTag tag, bool isEnabled, string hexColor)
            {
                this.tag = tag;
                this.isEnabled = isEnabled;
                this.hexColor = hexColor;
            }
        }

        [Header("Master Settings")]
        [Tooltip("Master switch for the SKC logging framework. When false, all logs (except fatal errors) are suppressed.")]
        public bool enableLogging = true;

        [Tooltip("Active logging profile. In Production mode, non-error logs are automatically stripped or silenced.")]
        public BuildLoggingProfile profile = BuildLoggingProfile.Development;

        [Tooltip("Minimum severity level required for a log to be output.")]
        public LogLevel minLogLevel = LogLevel.Info;

        [Tooltip("Formats channel tags in the Unity Console with distinct rich text colors.")]
        public bool useRichTextColor = true;

        [Tooltip("Prepends a timestamp [HH:mm:ss.fff] to each log message.")]
        public bool showTimestamp = false;

        [Header("Channel Toggles & Palette")]
        public List<TagConfig> tagConfigs = new List<TagConfig>();

        private readonly Dictionary<LogTag, TagConfig> _lookup = new Dictionary<LogTag, TagConfig>();

        private void OnEnable()
        {
            InitializeLookup();
        }

        private void Reset()
        {
            PopulateDefaultTagConfigs();
        }

        public void InitializeLookup()
        {
            _lookup.Clear();
            if (tagConfigs == null || tagConfigs.Count == 0)
            {
                PopulateDefaultTagConfigs();
            }

            foreach (var cfg in tagConfigs)
            {
                if (cfg != null && !_lookup.ContainsKey(cfg.tag))
                {
                    _lookup.Add(cfg.tag, cfg);
                }
            }
        }

        public bool IsTagEnabled(LogTag tag)
        {
            if (_lookup.Count == 0) InitializeLookup();
            return _lookup.TryGetValue(tag, out var cfg) ? cfg.isEnabled : true;
        }

        public void SetTagEnabled(LogTag tag, bool enabled)
        {
            if (_lookup.Count == 0) InitializeLookup();
            if (_lookup.TryGetValue(tag, out var cfg))
            {
                cfg.isEnabled = enabled;
            }
        }

        public string GetTagColor(LogTag tag)
        {
            if (_lookup.Count == 0) InitializeLookup();
            return _lookup.TryGetValue(tag, out var cfg) ? cfg.hexColor : "#FFFFFF";
        }

        public void EnableAllTags()
        {
            foreach (var cfg in tagConfigs)
            {
                if (cfg != null) cfg.isEnabled = true;
            }
        }

        public void MuteAllTags()
        {
            foreach (var cfg in tagConfigs)
            {
                if (cfg != null) cfg.isEnabled = false;
            }
        }

        /// <summary>
        /// Populates default tag palette and ensures all 12 channels exist.
        /// </summary>
        public void PopulateDefaultTagConfigs()
        {
            tagConfigs = new List<TagConfig>
            {
                new TagConfig(LogTag.General,      true, "#B2BEC3"), // Light Gray
                new TagConfig(LogTag.Core,         true, "#00D2D3"), // Cyan
                new TagConfig(LogTag.Economy,      true, "#FFD700"), // Gold
                new TagConfig(LogTag.Levels,       true, "#54A0FF"), // Sky Blue
                new TagConfig(LogTag.DailyRewards, true, "#E056FD"), // Purple
                new TagConfig(LogTag.UI,           true, "#2ED573"), // Mint Green
                new TagConfig(LogTag.Save,         true, "#FFA502"), // Orange
                new TagConfig(LogTag.Sound,        true, "#48DBFB"), // Soft Blue
                new TagConfig(LogTag.Pool,         true, "#A29BFE"), // Lavender
                new TagConfig(LogTag.SDK,          true, "#FF6B81"), // Watermelon Red
                new TagConfig(LogTag.Analytics,    true, "#7BED9F"), // Lime Green
                new TagConfig(LogTag.Ads,          true, "#FF4757")  // Coral Red
            };

            InitializeLookup();
        }
    }
}
