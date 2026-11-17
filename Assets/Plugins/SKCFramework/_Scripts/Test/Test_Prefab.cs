/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using SKC.Core;
using SKC.Logging;
using UnityEngine;
#if SKC_HAS_POOLING
using SKC.Pooling;
#endif

namespace SKC.Test
{
#if SKC_HAS_POOLING
    public class Test_Prefab : PoolableObject
    {
        public override void OnReturnToPool()
        {
            transform.position = Vector3.zero;
        }

        public override void OnSpawn()
        {
            SKCLog.Verbose(LogTag.Pool, this.gameObject.GetInstanceID().ToString());
            transform.position = Vector3.zero + new Vector3(Random.Range(-5.0f, 5.0f), 0, 0);
        }
        
        public override void BackToPool()
        {
            base.BackToPool();
        }
    }
#else
    public class Test_Prefab : MonoBehaviour
    {
        public virtual void OnReturnToPool() { }
        public virtual void OnSpawn() { }
        public virtual void BackToPool() { }
    }
#endif
}
