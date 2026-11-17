/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/
using System;
using Cysharp.Threading.Tasks;
using UnityEngine.Events;

namespace SKC.Boots
{
    public interface IService
    {
        public string ServiceName { get; }
        public bool IsInitialized { get; set; }
        public TimeSpan InitializeDuration { get; set; }

        public UniTask Initialize(UnityAction onSucced = null, UnityAction onError = null);
    }

}