using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;
using System.IO;
using Cysharp.Threading.Tasks;
using Newtonsoft.Json;
using SKC.Boots;
using SKC.Save;
using SKC.Logging;

namespace SKC.Services
{
    public class SaveService : ISaveService, IService
    {
        public string ServiceName => "SaveManager";
        public bool IsInitialized { get; set; }
        public TimeSpan InitializeDuration { get; set; }
        
        public SaveData CurrentGameData { get; set; }
        private string saveFilePath;
        
        public async UniTask Initialize(UnityAction onSucced = null, UnityAction onError = null)
        {
            var startTime = DateTime.Now;
            DateTime endTime;
            saveFilePath = Path.Combine(Application.persistentDataPath, "gamedata.sav");
            var tcs = new UniTaskCompletionSource<bool>();

            InitializeGameData();
            
            tcs.TrySetResult(IsInitialized);
            
            await UniTask.WaitUntil(() => IsInitialized);

            IsInitialized = true;
            onSucced?.Invoke();

            SKCLog.Info(LogTag.Save, $"{ServiceName} is initialized");

            endTime = DateTime.Now;
            InitializeDuration = endTime.Subtract(startTime);
        }
        
        private void InitializeGameData()
        {
            CurrentGameData = LoadGame(); // Try Load data

            if (CurrentGameData == null) // if saved data = null
            {
                CurrentGameData = NewGameData(); // Create new save
                SKCLog.Info(LogTag.Save, "No valid save file found or save file corrupted. Starting a new game with default data.");
                
                // Save new save data
                SaveGame(CurrentGameData); 
            }
            else
            {
                SKCLog.Info(LogTag.Save, "Game data loaded successfully.");
            }

            IsInitialized = true;
        }
        
        public void SaveCurrentGameData()
        {
            SaveGame(CurrentGameData);
        }

        public void Save() => SaveCurrentGameData();

        public void SetModuleData<T>(string key, T data, bool autoSave = false)
        {
            CurrentGameData?.SetModuleData(key, data);
            if (autoSave) SaveCurrentGameData();
        }

        public T GetModuleData<T>(string key, T defaultValue = default)
        {
            return CurrentGameData != null ? CurrentGameData.GetModuleData(key, defaultValue) : defaultValue;
        }

        public bool HasModuleData(string key)
        {
            return CurrentGameData != null && CurrentGameData.HasModuleData(key);
        }

        private void SaveGame(SaveData data)
        {
            try
            {
                // Serialize data directly to JSON format
                string json = JsonConvert.SerializeObject(data, Formatting.Indented); // Human-readable indented JSON format
                // Write JSON string to file
                File.WriteAllText(saveFilePath, json);
                SKCLog.Info(LogTag.Save, $"Game saved to: {saveFilePath}");
            }
            catch (System.Exception e)
            {
                SKCLog.Error(LogTag.Save, $"Error saving game: {e.Message}");
            }
        }

        public SaveData NewGameData()
        {
            return new SaveData(); 
        }

        private SaveData LoadGame()
        {
            if (!File.Exists(saveFilePath))
            {
                SKCLog.Warning(LogTag.Save, "No save file found at " + saveFilePath);
                return null; // Return null if file does not exist
            }

            try
            {
                string json = File.ReadAllText(saveFilePath);
                return JsonConvert.DeserializeObject<SaveData>(json);
            }
            catch (System.Exception e)
            {
                SKCLog.Error(LogTag.Save, $"Error loading game: {e.Message}. Save file might be corrupted or incompatible. Creating new game data.");
                return null; 
            }
        }
        
        [ContextMenu("Delete Save")]
        public void DeleteSaveGame()
        {
            if (File.Exists(saveFilePath))
            {
                File.Delete(saveFilePath);
                CurrentGameData = NewGameData();
                SKCLog.Info(LogTag.Save, "Save game deleted. CurrentGameData reset to default.");
                SaveGame(CurrentGameData); 
            }
            else
            {
                SKCLog.Info(LogTag.Save, "No save game to delete.");
            }
        }
    }
}