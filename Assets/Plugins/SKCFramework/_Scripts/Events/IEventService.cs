/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System;
using SKC.Boots;

namespace SKC.Services
{
    /// <summary>
    /// Contract for decoupled type-safe publish/subscribe messaging across modules.
    /// </summary>
    public interface IEventService : IService
    {
        void Subscribe<T>(Action<T> listener);
        void Unsubscribe<T>(Action<T> listener);
        void Publish<T>(T eventData);
        void Publish<T>() where T : new();
        void Fire<T>(T eventData);
        void Clear<T>();
        void ClearAll();
    }
}
