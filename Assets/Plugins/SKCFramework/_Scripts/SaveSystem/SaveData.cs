/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System.Collections.Generic;
using Newtonsoft.Json;

namespace SKC.Save
{
    [System.Serializable]
    public class SaveData
    {
        public string UserName { get; set; } = string.Empty;
        public int Level { get; set; } = 0;
        public int GamePlayVersion { get; set; } = 1;
        public double SoftCurrency { get; set; } = 0;
        public double HardCurrency { get; set; } = 0;
        public bool MusicOn { get; set; } = true;
        public bool SoundOn { get; set; } = true;
        public bool HapticsOn { get; set; } = true;
        public DailyRewardSaveData DailyRewardData { get; set; } = new DailyRewardSaveData();

        /// <summary>
        /// Modular JSON payloads dictionary allowing any on-demand package to persist its state
        /// without requiring monolithic changes to SaveData.
        /// </summary>
        public Dictionary<string, string> ModulePayloads { get; set; } = new Dictionary<string, string>();

        public void SetModuleData<T>(string moduleKey, T data)
        {
            if (string.IsNullOrEmpty(moduleKey)) return;
            ModulePayloads ??= new Dictionary<string, string>();
            ModulePayloads[moduleKey] = JsonConvert.SerializeObject(data);
        }

        public T GetModuleData<T>(string moduleKey, T defaultValue = default)
        {
            if (string.IsNullOrEmpty(moduleKey) || ModulePayloads == null) return defaultValue;
            if (ModulePayloads.TryGetValue(moduleKey, out string json) && !string.IsNullOrEmpty(json))
            {
                try
                {
                    return JsonConvert.DeserializeObject<T>(json);
                }
                catch
                {
                    return defaultValue;
                }
            }
            return defaultValue;
        }

        public bool HasModuleData(string moduleKey)
        {
            return ModulePayloads != null && ModulePayloads.ContainsKey(moduleKey);
        }

        public void InitializeDefaults()
        {
            
        }

        // Constructer
        public SaveData()
        {
            // Defaults
            UserName = string.Empty;
            Level = 0;
            GamePlayVersion = 1;
            SoftCurrency = 0;
            HardCurrency = 0;
            MusicOn = true;
            SoundOn = true;
            HapticsOn = true;
            DailyRewardData = new DailyRewardSaveData();
            ModulePayloads = new Dictionary<string, string>();
        }
    }

    [System.Serializable]
    public class DailyRewardSaveData
    {
        public string LastClaimDateTimeUtcString { get; set; } = string.Empty;
        public int CurrentCycleDayIndex { get; set; } = 0;
        public int ClaimedDaysInCycle { get; set; } = 0;
        public int CurrentStreak { get; set; } = 0;
        public int TotalClaimCount { get; set; } = 0;
        public double SimulatedTimeOffsetHours { get; set; } = 0; // For developer fast-forward testing
    }
}