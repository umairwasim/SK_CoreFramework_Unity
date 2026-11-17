/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using SKC.Boots;

namespace SKC.Save
{
    /// <summary>
    /// Contract for game data persistence, serialization, and modular segment storage.
    /// </summary>
    public interface ISaveService : IService
    {
        SaveData CurrentGameData { get; }
        void SaveCurrentGameData();
        void Save();
        void DeleteSaveGame();
        void SetModuleData<T>(string key, T data, bool autoSave = false);
        T GetModuleData<T>(string key, T defaultValue = default);
        bool HasModuleData(string key);
    }
}
