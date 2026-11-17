/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/
using UnityEngine;

namespace SKC.Core
{
    public class AndroidLifeCycle : MonoBehaviour
    {
        public void OnAppStateChanged(string currentState)
        {
            switch (currentState)
            {
                case "onActivityPaused":
                    break;
                case "onActivityCreated":
                    break;
                case "onActivityStarted":
                    break;
                case "onActivityResumed":
                    break;

                case "onActivityStopped":
                    break;
                case "onActivitySaveInstanceState":
                    break;
                case "onActivityDestroyed":
                    break;
            }
        }


        private void OnApplicationQuit()
        {
            //SKCore.SessionEnd();
        }
    }
}