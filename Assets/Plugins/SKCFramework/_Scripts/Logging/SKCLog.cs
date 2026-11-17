/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System;
using System.Diagnostics;
using System.Text;
using UnityEngine;
using SKC.Text;
using Debug = UnityEngine.Debug;

namespace SKC.Logging
{
    /// <summary>
    /// Centralized, high-performance diagnostic and logging hub for the SKC Framework.
    /// Provides channel-based filtering, rich text color tags, zero-GC StringBuilder formatting,
    /// and compile-time stripping ([Conditional]) for release builds.
    /// </summary>
    public static class SKCLog
    {
        private static LogSettingsSO _settings;

        public static LogSettingsSO Settings
        {
            get
            {
                if (_settings == null)
                {
                    _settings = Resources.Load<LogSettingsSO>("LogSettings");
                    if (_settings == null)
                    {
                        _settings = ScriptableObject.CreateInstance<LogSettingsSO>();
                        _settings.PopulateDefaultTagConfigs();
                    }
                }
                return _settings;
            }
        }

        #region Verbose Logging (Stripped in Production)

        [Conditional("UNITY_EDITOR"), Conditional("DEVELOPMENT_BUILD"), Conditional("SKC_ENABLE_LOGS")]
        public static void Verbose(LogTag tag, string message, UnityEngine.Object context = null)
        {
            if (!ShouldLog(tag, LogLevel.Verbose)) return;
            Debug.Log(FormatMessage(tag, message), context);
        }

        [Conditional("UNITY_EDITOR"), Conditional("DEVELOPMENT_BUILD"), Conditional("SKC_ENABLE_LOGS")]
        public static void Verbose(LogTag tag, StringBuilder sb, UnityEngine.Object context = null)
        {
            if (!ShouldLog(tag, LogLevel.Verbose)) return;
            Debug.Log(FormatMessage(tag, sb), context);
        }

        #endregion

        #region Info Logging (Stripped in Production)

        [Conditional("UNITY_EDITOR"), Conditional("DEVELOPMENT_BUILD"), Conditional("SKC_ENABLE_LOGS")]
        public static void Info(LogTag tag, string message, UnityEngine.Object context = null)
        {
            if (!ShouldLog(tag, LogLevel.Info)) return;
            Debug.Log(FormatMessage(tag, message), context);
        }

        [Conditional("UNITY_EDITOR"), Conditional("DEVELOPMENT_BUILD"), Conditional("SKC_ENABLE_LOGS")]
        public static void Info(LogTag tag, StringBuilder sb, UnityEngine.Object context = null)
        {
            if (!ShouldLog(tag, LogLevel.Info)) return;
            Debug.Log(FormatMessage(tag, sb), context);
        }

        #endregion

        #region Warning Logging (Stripped in Production)

        [Conditional("UNITY_EDITOR"), Conditional("DEVELOPMENT_BUILD"), Conditional("SKC_ENABLE_LOGS")]
        public static void Warning(LogTag tag, string message, UnityEngine.Object context = null)
        {
            if (!ShouldLog(tag, LogLevel.Warning)) return;
            Debug.LogWarning(FormatMessage(tag, message), context);
        }

        [Conditional("UNITY_EDITOR"), Conditional("DEVELOPMENT_BUILD"), Conditional("SKC_ENABLE_LOGS")]
        public static void Warning(LogTag tag, StringBuilder sb, UnityEngine.Object context = null)
        {
            if (!ShouldLog(tag, LogLevel.Warning)) return;
            Debug.LogWarning(FormatMessage(tag, sb), context);
        }

        #endregion

        #region Error & Exception Logging (Always Active)

        public static void Error(LogTag tag, string message, UnityEngine.Object context = null)
        {
            if (!ShouldLog(tag, LogLevel.Error)) return;
            Debug.LogError(FormatMessage(tag, message), context);
        }

        public static void Error(LogTag tag, StringBuilder sb, UnityEngine.Object context = null)
        {
            if (!ShouldLog(tag, LogLevel.Error)) return;
            Debug.LogError(FormatMessage(tag, sb), context);
        }

        public static void Exception(LogTag tag, Exception ex, UnityEngine.Object context = null)
        {
            if (Settings != null && !Settings.enableLogging) return;
            Debug.LogError(FormatMessage(tag, $"Exception: {ex.Message}\n{ex.StackTrace}"), context);
        }

        #endregion

        #region Convenience Overloads & Aliases

        [Conditional("UNITY_EDITOR"), Conditional("DEVELOPMENT_BUILD"), Conditional("SKC_ENABLE_LOGS")]
        public static void Log(string message, UnityEngine.Object context = null) => Info(LogTag.General, message, context);

        [Conditional("UNITY_EDITOR"), Conditional("DEVELOPMENT_BUILD"), Conditional("SKC_ENABLE_LOGS")]
        public static void Log(LogTag tag, string message, UnityEngine.Object context = null) => Info(tag, message, context);

        [Conditional("UNITY_EDITOR"), Conditional("DEVELOPMENT_BUILD"), Conditional("SKC_ENABLE_LOGS")]
        public static void Info(string message, UnityEngine.Object context = null) => Info(LogTag.General, message, context);

        [Conditional("UNITY_EDITOR"), Conditional("DEVELOPMENT_BUILD"), Conditional("SKC_ENABLE_LOGS")]
        public static void Warning(string message, UnityEngine.Object context = null) => Warning(LogTag.General, message, context);

        [Conditional("UNITY_EDITOR"), Conditional("DEVELOPMENT_BUILD"), Conditional("SKC_ENABLE_LOGS")]
        public static void LogWarning(string message, UnityEngine.Object context = null) => Warning(LogTag.General, message, context);

        [Conditional("UNITY_EDITOR"), Conditional("DEVELOPMENT_BUILD"), Conditional("SKC_ENABLE_LOGS")]
        public static void LogWarning(LogTag tag, string message, UnityEngine.Object context = null) => Warning(tag, message, context);

        public static void Error(string message, UnityEngine.Object context = null) => Error(LogTag.General, message, context);

        public static void LogError(string message, UnityEngine.Object context = null) => Error(LogTag.General, message, context);

        public static void LogError(LogTag tag, string message, UnityEngine.Object context = null) => Error(tag, message, context);

        #endregion

        #region Internal Filtering & Formatting

        private static bool ShouldLog(LogTag tag, LogLevel level)
        {
            var s = Settings;
            if (s == null) return true;

            if (!s.enableLogging) return false;

            // In Production profile, mute Verbose and Info logs
            if (s.profile == BuildLoggingProfile.Production && level < LogLevel.Warning)
            {
                return false;
            }

            if (level < s.minLogLevel) return false;

            return s.IsTagEnabled(tag);
        }

        private static string FormatMessage(LogTag tag, string message)
        {
            var s = Settings;
            string hex = s != null ? s.GetTagColor(tag) : "#FFFFFF";
            bool rich = s == null || s.useRichTextColor;
            bool time = s != null && s.showTimestamp;

            using (StringBuilderPool.Get(out var sb))
            {
                if (time)
                {
                    sb.Append('[').AppendTime(DateTime.Now.TimeOfDay, true).Append("] ");
                }

                if (rich)
                {
                    sb.Append("<color=").Append(hex).Append(">[").Append(tag).Append("]</color> ");
                }
                else
                {
                    sb.Append('[').Append(tag).Append("] ");
                }

                sb.Append(message);
                return sb.ToString();
            }
        }

        private static string FormatMessage(LogTag tag, StringBuilder messageSb)
        {
            var s = Settings;
            string hex = s != null ? s.GetTagColor(tag) : "#FFFFFF";
            bool rich = s == null || s.useRichTextColor;
            bool time = s != null && s.showTimestamp;

            using (StringBuilderPool.Get(out var sb))
            {
                if (time)
                {
                    sb.Append('[').AppendTime(DateTime.Now.TimeOfDay, true).Append("] ");
                }

                if (rich)
                {
                    sb.Append("<color=").Append(hex).Append(">[").Append(tag).Append("]</color> ");
                }
                else
                {
                    sb.Append('[').Append(tag).Append("] ");
                }

                sb.Append(messageSb);
                return sb.ToString();
            }
        }

        #endregion
    }
}
