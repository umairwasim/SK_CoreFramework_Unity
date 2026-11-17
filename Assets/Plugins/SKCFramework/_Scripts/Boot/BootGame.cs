/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System;
using SKC.Core;
using UnityEngine;
using Cysharp.Threading.Tasks;
using System.Threading;
using DG.Tweening;
using TMPro;
using UnityEngine.UI;
using SKC.Logging;

public class BootGame : MonoBehaviour
{
    public CanvasGroup nameCanvasGroup;
    public Button saveProfileBtn;
    public TMP_InputField nameInput;
    private CancellationToken _cancellationToken;
    private bool _alreadyHaveName = false;
    private void Awake()
    {
        _cancellationToken = gameObject.GetCancellationTokenOnDestroy();
        SKCore.InitSKCore();
        InitializeServices();
    }

    private async void InitializeServices()
    {
        await SKCore.InitializeServices();

        nameCanvasGroup.gameObject.SetActive(true);
        nameCanvasGroup.DOFade(1.0f, 0.5f);
            
        saveProfileBtn.onClick.AddListener(SavePlayerName);
        nameInput.onValueChanged.AddListener(CheckInputValidity);
        
        SKCLog.Info(LogTag.Save, $"{SKCore.SaveService.CurrentGameData.UserName}");
        
        if (SKCore.SaveService.CurrentGameData.UserName != string.Empty)
        {
            TMP_Text placeholderTextComponent = nameInput.placeholder as TMP_Text;
            if (placeholderTextComponent != null)
                placeholderTextComponent.text = SKCore.SaveService.CurrentGameData.UserName;

            saveProfileBtn.interactable = true;
            _alreadyHaveName = true;
        }
    }
    
    private void SavePlayerName()
    {
        if (!_alreadyHaveName)
        {
            string playerName = nameInput.text.Trim(); 

            if (string.IsNullOrEmpty(playerName))
            {
                SKCLog.Warning(LogTag.UI, "It can not be empty");
                return;
            }
            
            SKCore.SaveService.CurrentGameData.UserName = playerName;
            SKCLog.Info(LogTag.Save, $"Username saved : {playerName}");
            saveProfileBtn.interactable = false;
        
            SKCore.SaveService.SaveCurrentGameData();
        
            GoNextScene();
        }
        else
        {
            GoNextScene();
        }
    }
    private void CheckInputValidity(string newText)
    {
        bool isValid = !string.IsNullOrEmpty(newText.Trim());
        saveProfileBtn.interactable = isValid;
    }
    
    private void GoNextScene()
    {
        saveProfileBtn.interactable = false;
#if SKC_HAS_TRANSITIONS
        SKCore.SceneService.LoadScene(1, () => SKCLog.Info(LogTag.Core, "Scene transition to : 1"));
#else
        UnityEngine.SceneManagement.SceneManager.LoadScene(1);
#endif
    }
}
