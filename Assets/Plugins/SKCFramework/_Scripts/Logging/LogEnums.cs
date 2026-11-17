/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

namespace SKC.Logging
{
    /// <summary>
    /// Categorized channels for granular logging and console filtering across SKCFramework subsystems.
    /// </summary>
    public enum LogTag
    {
        General = 0,
        Core = 1,
        Economy = 2,
        Levels = 3,
        DailyRewards = 4,
        UI = 5,
        Save = 6,
        Sound = 7,
        Pool = 8,
        SDK = 9,
        Analytics = 10,
        Ads = 11
    }

    /// <summary>
    /// Log severity levels.
    /// </summary>
    public enum LogLevel
    {
        Verbose = 0,
        Info = 1,
        Warning = 2,
        Error = 3,
        None = 4
    }

    /// <summary>
    /// Master profile controlling logging behavior across builds.
    /// </summary>
    public enum BuildLoggingProfile
    {
        /// <summary>
        /// Full logging with rich color tags, telemetry, and verbose feedback. Ideal for development and testing.
        /// </summary>
        Development = 0,

        /// <summary>
        /// Production / Store build profile. Normal info and verbose logs are stripped or suppressed for maximum performance and security.
        /// </summary>
        Production = 1
    }
}
