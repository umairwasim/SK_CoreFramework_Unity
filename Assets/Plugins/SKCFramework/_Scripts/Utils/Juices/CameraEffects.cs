using UnityEngine;
using System.Collections;

namespace SKC.Effects.Cam
{
    public static class CameraEffects // Or add to VisualEffects
    {
        public static void ApplyShake(MonoBehaviour runner, Camera targetCamera, float intensity, float duration, float frequency = 15f)
        {
            // Start a coroutine to shake the camera
            runner.StartCoroutine(ShakeCoroutine(targetCamera, intensity, duration, frequency));
        }

        private static IEnumerator ShakeCoroutine(Camera targetCamera, float intensity, float duration, float frequency)
        {
            Transform camTransform = targetCamera.transform;
            Vector3 originalLocalPos = camTransform.localPosition;
            float elapsed = 0f;

            // Optional: Store original noise offsets if using Perlin noise for smoother shake
            // float seedX = Random.value * 100f;
            // float seedY = Random.value * 100f;

            while (elapsed < duration)
            {
                if (camTransform == null) yield break;

                // Simple random offset:
                float x = UnityEngine.Random.Range(-1.0f, 1.0f) * intensity;
                float y = UnityEngine.Random.Range(-1.0f, 1.0f) * intensity;

                // Or using Perlin noise for smoother shake (requires frequency/seed)
                // float x = (Mathf.PerlinNoise(seedX, Time.time * frequency) * 2f - 1f) * intensity;
                // float y = (Mathf.PerlinNoise(seedY, Time.time * frequency) * 2f - 1f) * intensity;

                camTransform.localPosition = originalLocalPos + new Vector3(x, y, 0f); // Assuming 2D shake

                elapsed += Time.deltaTime;
                yield return null;
            }
            if (camTransform != null)
            {
                camTransform.localPosition = originalLocalPos;
            }
        }
    }
}