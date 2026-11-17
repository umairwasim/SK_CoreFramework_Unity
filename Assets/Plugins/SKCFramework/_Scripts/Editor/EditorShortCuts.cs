/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System.IO;
using SKC.Logging;
using UnityEditor;
using UnityEngine;

public class EditorShortCuts : EditorWindow
{

    [MenuItem("SKCore/Delete Save", priority = 50)]
    public static void DeleteSaveFunction()
    {
        string[] filePaths = Directory.GetFiles(Application.persistentDataPath);
        foreach (string filePath in filePaths)
        {
            SKCLog.Info(LogTag.Save, $"Deleting save file: {filePath}");
            File.Delete(filePath);
        }
    }
}