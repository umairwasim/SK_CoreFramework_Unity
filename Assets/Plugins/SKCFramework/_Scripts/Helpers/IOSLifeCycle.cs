/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/
using UnityEngine;

namespace SKC.Core
{
    public class IOSLifeCycle : MonoBehaviour
    {
        private void OnApplicationPause(bool pauseStatus)
        {
            switch (pauseStatus)
            {
                case false:
                    break;
                case true:
                    break;
            }
        }
        private void OnApplicationQuit()
        {
            //SKCore.SessionEnd();
        }
    }
}