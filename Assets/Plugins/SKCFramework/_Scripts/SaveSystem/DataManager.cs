/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/
using System;
using System.IO;
using Newtonsoft.Json;
using UnityEngine;

namespace SKC.Save
{
    public static class DataManager
    {
        public static void SaveData<T>(string key, T saveObject)
        {
            try
            {
                string json = JsonConvert.SerializeObject(saveObject, Formatting.Indented);
                File.WriteAllText(GetFullPath(key), json);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[DataManager] Error saving '{key}': {ex.Message}");
            }
        }

        public static T LoadData<T>(string key)
        {
            var fullPath = GetFullPath(key);

            if (File.Exists(fullPath))
            {
                try
                {
                    string json = File.ReadAllText(fullPath);
                    return JsonConvert.DeserializeObject<T>(json);
                }
                catch (Exception ex)
                {
                    Debug.LogError($"[DataManager] Error loading '{key}': {ex.Message}");
                }
            }

            return default;
        }

        public static bool HasKey(string key)
        {
            return File.Exists(GetFullPath(key));
        }

        public static void DeleteKey(string key)
        {
            var fullPath = GetFullPath(key);
            if (File.Exists(fullPath))
            {
                File.Delete(fullPath);
            }
        }

        private static string GetFullPath(string key)
        {
            return Path.Combine(Application.persistentDataPath, key + ".json");
        }
    }
}

/* Tip    #if UNITY_EDITOR
          Debug.Log("Unity Editor");
          #endif                          Tip End */