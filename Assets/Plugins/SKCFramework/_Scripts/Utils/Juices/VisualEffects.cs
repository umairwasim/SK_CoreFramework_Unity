using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using System;
using UnityEngine.AI;

namespace SKC.Effects.Visual
{
    // A static helper class for visual effects
    public static class VisualEffects
    {
        /// <summary>
        /// Applies a squash and stretch effect to the target Transform.
        /// </summary>
        /// <param name="runner">The MonoBehaviour instance that will run the coroutine.</param>
        /// <param name="target">The Transform to apply the effect to.</param>
        /// <param name="intensity">How much to squash (e.g., 0.2 for 20%). Should be positive.</param>
        /// <param name="duration">Total duration of the squash and return effect.</param>

        #region Squash Effect
        
        // Static collection to keep track of Transforms currently undergoing a squash effect.
        private static readonly HashSet<Transform> _activeSquashTargets = new HashSet<Transform>();

        public static void ApplySquashEffect(MonoBehaviour runner, Transform target, float intensity, float duration)
        {
            if (runner == null || !runner.gameObject.activeInHierarchy || target == null)
            {
                Debug.LogWarning("SquashEffect: Runner, target, or its GameObject is null or inactive.");
                return;
            }

            // Check if an effect is already running on this target
            // Lock to ensure thread-safe access to the HashSet if this could somehow be called from multiple threads
            // (though typically Unity API calls are on the main thread). For coroutines, this is usually safe.
            lock (_activeSquashTargets)
            {
                if (_activeSquashTargets.Contains(target))
                {
                    // Debug.Log($"SquashEffect is already active on {target.name}. Additional request ignored.");
                    return; // Already running, so ignore this call
                }
                // If not already running, add it to our tracking set.
                _activeSquashTargets.Add(target);
            }

            // Start the coroutine using the provided MonoBehaviour instance
            runner.StartCoroutine(SquashEffectCoroutine(target, intensity, duration));
        }

        // The actual coroutine implementing the squash effect logic
        private static IEnumerator SquashEffectCoroutine(Transform target, float intensity, float duration)
        {
            // The 'target' here is the reference that was added to _activeSquashTargets.
            try
            {
                Vector3 originalScale = target.localScale;

                float safeIntensity = Mathf.Clamp(intensity, 0.01f, 0.9f);
                Vector3 squashScale = new Vector3(
                    originalScale.x * (1 + safeIntensity * 0.5f),
                    originalScale.y * (1 - safeIntensity),
                    originalScale.z * (1 + safeIntensity * 0.5f)
                );

                float halfDuration = duration / 2.0f;

                if (halfDuration <= 0.001f)
                {
                    // Ensure target is still valid before manipulating it.
                    // If target becomes Unity-null (destroyed), originalScale might be problematic if accessed later.
                    // But here, we just set it and then the 'finally' block will handle cleanup.
                    if (target != null) // Unity's overloaded null check for destroyed objects
                    {
                        target.localScale = originalScale;
                    }
                    // The coroutine will effectively end here, and 'finally' will run.
                    // No explicit 'yield break' needed before 'finally' if this is the last operation.
                    // However, to be clear that we are done with the 'try' block's main logic:
                    yield break; // This will still execute the finally block
                }

                float elapsedTime = 0f;

                // Phase 1: Squash down
                while (elapsedTime < halfDuration)
                {
                    if (target == null) yield break; // Target was destroyed, finally will run

                    target.localScale = Vector3.Lerp(originalScale, squashScale, elapsedTime / halfDuration);
                    elapsedTime += Time.deltaTime;
                    yield return null;
                }

                if (target == null) yield break; // Target was destroyed, finally will run
                target.localScale = squashScale;

                // Phase 2: Return to original scale
                elapsedTime = 0f;
                while (elapsedTime < halfDuration)
                {
                    if (target == null) yield break; // Target was destroyed, finally will run

                    target.localScale = Vector3.Lerp(squashScale, originalScale, elapsedTime / halfDuration);
                    elapsedTime += Time.deltaTime;
                    yield return null;
                }

                if (target != null) // Ensure it's not destroyed before final set
                {
                    target.localScale = originalScale;
                }
            }
            finally
            {
                // This 'finally' block will always execute when the coroutine exits,
                // whether it completes normally, is stopped, or exits due to 'yield break'
                // (e.g., if the target was destroyed).
                // We remove the target from our tracking set here.
                // The 'target' reference here is the same one that was initially added.
                // If the Unity object 'target' referred to was destroyed, 'target == null' will be true.
                // HashSet.Remove() will correctly handle this by attempting to remove the original reference.
                // If the object was destroyed, its entry in the HashSet (which was based on the live object's GetHashCode/Equals)
                // will be removed.
                lock (_activeSquashTargets)
                {
                    _activeSquashTargets.Remove(target);
                }
            }
        }

        #endregion

        #region Scale Punch

        // In your VisualEffects class
        public static void ApplyScalePunch(MonoBehaviour runner, Transform target, Vector3 punchScaleFactor, float duration)
        {
            runner.StartCoroutine(ScalePunchCoroutine(target, punchScaleFactor, duration));
        }

        private static IEnumerator ScalePunchCoroutine(Transform target, Vector3 punchScaleFactor, float duration)
        {
            if (target == null) yield break;
            Vector3 originalScale = target.localScale;
            Vector3 punchScale = new Vector3(originalScale.x * punchScaleFactor.x, originalScale.y * punchScaleFactor.y, originalScale.z * punchScaleFactor.z);

            float halfDuration = duration / 2f;
            if (halfDuration <= 0.001f) { target.localScale = originalScale; yield break; }

            float t = 0f;
            // Punch Out
            while (t < halfDuration)
            {
                if (target == null) yield break;
                target.localScale = Vector3.Lerp(originalScale, punchScale, t / halfDuration);
                t += Time.deltaTime;
                yield return null;
            }
            if (target == null) yield break;
            target.localScale = punchScale;

            // Return
            t = 0f;
            while (t < halfDuration)
            {
                if (target == null) yield break;
                target.localScale = Vector3.Lerp(punchScale, originalScale, t / halfDuration);
                t += Time.deltaTime;
                yield return null;
            }
            if (target != null) target.localScale = originalScale;
        }

        #endregion

        #region Blink Effect

        // In your VisualEffects or ObjectEffects class
        public static void ApplyBlinkEffect(MonoBehaviour runner, Renderer targetRenderer, float blinkInterval, float totalDuration)
        {
            if (runner == null || !runner.gameObject.activeInHierarchy || targetRenderer == null) return;
            runner.StartCoroutine(BlinkCoroutine(targetRenderer, blinkInterval, totalDuration));
        }

        // Overload for SpriteRenderer
        public static void ApplyBlinkEffect(MonoBehaviour runner, SpriteRenderer spriteRenderer, float blinkInterval, float totalDuration)
        {
            if (runner == null || !runner.gameObject.activeInHierarchy || spriteRenderer == null) return;
            runner.StartCoroutine(BlinkCoroutine(spriteRenderer, blinkInterval, totalDuration));
        }

        private static IEnumerator BlinkCoroutine(Renderer targetRenderer, float blinkInterval, float totalDuration)
        {
            float elapsed = 0f;
            bool originalVisibility = targetRenderer.enabled;

            while (elapsed < totalDuration)
            {
                if (targetRenderer == null) yield break;
                targetRenderer.enabled = !targetRenderer.enabled;
                yield return new WaitForSeconds(blinkInterval);
                elapsed += blinkInterval;
            }
            if (targetRenderer != null)
            {
                targetRenderer.enabled = originalVisibility; // Restore original state
            }
        }
        
        private static IEnumerator BlinkCoroutine(SpriteRenderer spriteRenderer, float blinkInterval, float totalDuration)
        {
            float elapsed = 0f;
            bool originalVisibility = spriteRenderer.enabled;

            while (elapsed < totalDuration)
            {
                if (spriteRenderer == null) yield break;
                spriteRenderer.enabled = !spriteRenderer.enabled;
                yield return new WaitForSeconds(blinkInterval);
                elapsed += blinkInterval;
            }
            if (spriteRenderer != null)
            {
                spriteRenderer.enabled = originalVisibility; // Restore original state
            }
        }

        #endregion

        #region Smooth Look At

        // In your VisualEffects or TransformEffects class
        public static void SmoothLookAt(MonoBehaviour runner, Transform selfTransform, Vector3 targetPosition, float duration, Vector3 worldUp = default)
        {
            if (runner == null || !runner.gameObject.activeInHierarchy || selfTransform == null) return;
            if (worldUp == default) worldUp = Vector3.up; // Default to Vector3.up if not specified

            runner.StartCoroutine(SmoothLookAtCoroutine(selfTransform, targetPosition, duration, worldUp));
        }

        private static IEnumerator SmoothLookAtCoroutine(Transform selfTransform, Vector3 targetPosition, float duration, Vector3 worldUp)
        {
            Quaternion startRotation = selfTransform.rotation;
            Vector3 directionToTarget = targetPosition - selfTransform.position;
            Quaternion targetRotation = Quaternion.LookRotation(directionToTarget, worldUp);

            float elapsed = 0f;
            while (elapsed < duration)
            {
                if (selfTransform == null) yield break; // Transform might be destroyed

                float progress = elapsed / duration;
                selfTransform.rotation = Quaternion.Slerp(startRotation, targetRotation, progress);

                elapsed += Time.deltaTime;
                yield return null;
            }
            if (selfTransform != null) selfTransform.rotation = targetRotation; // Ensure final rotation
        }

        #endregion

        #region Kinematic Jump

                // In your VisualEffects or ObjectEffects class
        public static void ApplyKinematicHop(MonoBehaviour runner, Transform target, Vector3 hopDirectionXZ, float hopHeight, float duration)
        {
            if (runner == null || !runner.gameObject.activeInHierarchy || target == null) return;
            runner.StartCoroutine(KinematicHopCoroutine(target, hopDirectionXZ, hopHeight, duration));
        }

        private static IEnumerator KinematicHopCoroutine(Transform target, Vector3 hopDirectionXZ, float hopHeight, float duration)
        {
            Vector3 originalPosition = target.localPosition;
            Vector3 peakPosition = originalPosition + (hopDirectionXZ.normalized * (hopDirectionXZ.magnitude / 2f)) + (Vector3.up * hopHeight); // Mid-point in XZ, peak in Y
            Vector3 endPosition = originalPosition + hopDirectionXZ;

            float halfDuration = duration / 2f;
            if (halfDuration <= 0.001f) { target.localPosition = endPosition; yield break; }

            // Hop Up phase
            float elapsed = 0f;
            while (elapsed < halfDuration)
            {
                if (target == null) yield break;
                float progress = elapsed / halfDuration;
                // Parabolic path for Y, linear for XZ for simplicity in this phase
                float yPos = Mathf.Lerp(originalPosition.y, peakPosition.y, Mathf.Sin(progress * Mathf.PI * 0.5f)); // Sin for arc up
                float xzProgress = progress; // Linear for XZ towards peak's XZ
                Vector3 currentPosXZ = Vector3.Lerp(new Vector3(originalPosition.x, 0, originalPosition.z), 
                                                    new Vector3(peakPosition.x, 0, peakPosition.z), xzProgress);
                target.localPosition = new Vector3(currentPosXZ.x, yPos, currentPosXZ.z);
                elapsed += Time.deltaTime;
                yield return null;
            }

            // Hop Down phase
            elapsed = 0f;
            while (elapsed < halfDuration)
            {
                if (target == null) yield break;
                float progress = elapsed / halfDuration;
                // Parabolic path for Y, linear for XZ
                float yPos = Mathf.Lerp(peakPosition.y, endPosition.y, 1f - Mathf.Cos(progress * Mathf.PI * 0.5f)); // Cos for arc down
                float xzProgress = progress; // Linear for XZ from peak's XZ to end XZ
                 Vector3 currentPosXZ = Vector3.Lerp(new Vector3(peakPosition.x, 0, peakPosition.z), 
                                                    new Vector3(endPosition.x, 0, endPosition.z), xzProgress);
                target.localPosition = new Vector3(currentPosXZ.x, yPos, currentPosXZ.z);
                elapsed += Time.deltaTime;
                yield return null;
            }

            if (target != null) target.localPosition = endPosition;
        }

        #endregion
        
        #region Color Tint

                // In your VisualEffects class
        public static void ApplyRendererColorTint(MonoBehaviour runner, Renderer targetRenderer, Color tintColor, float duration, string colorPropertyName = "_Color")
        {
            // For SpriteRenderers, use targetRenderer.material for instanced material or ((SpriteRenderer)targetRenderer).color directly
            // For MeshRenderers, targetRenderer.material creates an instance. Be mindful if you want to share materials.
            runner.StartCoroutine(RendererColorTintCoroutine(targetRenderer, tintColor, duration, colorPropertyName));
        }

        private static IEnumerator RendererColorTintCoroutine(Renderer targetRenderer, Color tintColor, float duration, string colorPropertyName)
        {
            if (targetRenderer == null || targetRenderer.material == null) yield break;

            Material mat = targetRenderer.material; // Creates an instance of the material
            Color originalColor = mat.HasProperty(colorPropertyName) ? mat.GetColor(colorPropertyName) : Color.white;
            Color finalTintColor = new Color(originalColor.r * tintColor.r, originalColor.g * tintColor.g, originalColor.b * tintColor.b, originalColor.a * tintColor.a); // Multiply to tint

            float halfDuration = duration / 2f;
             if (halfDuration <= 0.001f) { if(mat.HasProperty(colorPropertyName)) mat.SetColor(colorPropertyName, originalColor); yield break; }


            float t = 0f;
            // Tint To
            while (t < halfDuration)
            {
                if (targetRenderer == null) yield break;
                mat.SetColor(colorPropertyName, Color.Lerp(originalColor, finalTintColor, t / halfDuration));
                t += Time.deltaTime;
                yield return null;
            }
            if (targetRenderer == null) yield break;
            mat.SetColor(colorPropertyName, finalTintColor);

            // Tint Back
            t = 0f;
            while (t < halfDuration)
            {
                if (targetRenderer == null) yield break;
                mat.SetColor(colorPropertyName, Color.Lerp(finalTintColor, originalColor, t / halfDuration));
                t += Time.deltaTime;
                yield return null;
            }
            if (targetRenderer != null && mat.HasProperty(colorPropertyName)) mat.SetColor(colorPropertyName, originalColor);
            // Note: If you instanced the material, it will remain instanced. 
            // If you need to revert to a shared material, that's a more complex setup.
        }


        #endregion
        
        #region Hit Stop

        // In GameFeelEffects or VisualEffects
        public static void ApplyHitStop(MonoBehaviour runner, float freezeDuration, float timeScaleDuringFreeze = 0.05f)
        {
            runner.StartCoroutine(HitStopCoroutine(freezeDuration, timeScaleDuringFreeze));
        }

        private static IEnumerator HitStopCoroutine(float freezeDuration, float timeScaleDuringFreeze)
        {
            float originalTimeScale = Time.timeScale;
            Time.timeScale = timeScaleDuringFreeze; // Slow down time drastically

            // Wait for the duration of the freeze, but using unscaled time
            // because Time.timeScale affects WaitForSeconds.
            float startTime = Time.unscaledTime;
            while(Time.unscaledTime < startTime + freezeDuration)
            {
                yield return null;
            }

            Time.timeScale = originalTimeScale; // Reset time
        }

        #endregion

        #region UI 

        // In your UIEffects or VisualEffects class
        public static void ApplyRectTransformShake(MonoBehaviour runner, RectTransform rectTarget, float intensity, float duration)
        {
            if (runner == null || !runner.gameObject.activeInHierarchy || rectTarget == null) return;
            runner.StartCoroutine(RectTransformShakeCoroutine(rectTarget, intensity, duration));
        }

        private static IEnumerator RectTransformShakeCoroutine(RectTransform rectTarget, float intensity, float duration)
        {
            Vector2 originalAnchoredPos = rectTarget.anchoredPosition;
            float elapsed = 0f;

            while (elapsed < duration)
            {
                if (rectTarget == null) yield break;
                float x = UnityEngine.Random.Range(-1f, 1f) * intensity;
                float y = UnityEngine.Random.Range(-1f, 1f) * intensity;
                rectTarget.anchoredPosition = originalAnchoredPos + new Vector2(x, y);
                elapsed += Time.deltaTime;
                yield return null;
            }
            if (rectTarget != null)
            {
                rectTarget.anchoredPosition = originalAnchoredPos;
            }
        }        

        #endregion

        #region  Scale Pulse
        
        // In your VisualEffects or ObjectEffects class
        public static Coroutine ApplyScalePulse(
            MonoBehaviour runner,
            Transform target,
            float pulseScaleFactor, // e.g., 1.1f for 10% larger
            int pulseCount,         // How many times to pulse
            float durationPerPulse, // Duration for one complete pulse (up and down)
            Action onComplete = null
        )
        {
            if (runner == null || !runner.gameObject.activeInHierarchy || target == null || pulseCount <= 0 || durationPerPulse <= 0)
            {
                Debug.LogWarning("ApplyScalePulse: Invalid parameters.");
                onComplete?.Invoke();
                return null;
            }
            return runner.StartCoroutine(ScalePulseCoroutine(target, pulseScaleFactor, pulseCount, durationPerPulse, onComplete));
        }

        private static IEnumerator ScalePulseCoroutine(
            Transform target,
            float pulseScaleFactor,
            int pulseCount,
            float durationPerPulse,
            Action onComplete
        )
        {
            Vector3 originalScale = target.localScale;
            Vector3 targetPulseScale = originalScale * pulseScaleFactor;
            float halfPulseDuration = durationPerPulse / 2f;

            for (int i = 0; i < pulseCount; i++)
            {
                if (target == null) { onComplete?.Invoke(); yield break; } // Target might be destroyed

                // Scale Up
                float elapsed = 0f;
                while (elapsed < halfPulseDuration)
                {
                    if (target == null) { onComplete?.Invoke(); yield break; }
                    target.localScale = Vector3.Lerp(originalScale, targetPulseScale, elapsed / halfPulseDuration);
                    elapsed += Time.deltaTime;
                    yield return null;
                }
                if (target == null) { onComplete?.Invoke(); yield break; }
                target.localScale = targetPulseScale;

                // Scale Down
                elapsed = 0f;
                while (elapsed < halfPulseDuration)
                {
                    if (target == null) { onComplete?.Invoke(); yield break; }
                    target.localScale = Vector3.Lerp(targetPulseScale, originalScale, elapsed / halfPulseDuration);
                    elapsed += Time.deltaTime;
                    yield return null;
                }
                if (target == null) { onComplete?.Invoke(); yield break; }
                target.localScale = originalScale;
            }
            onComplete?.Invoke();
        }
        #endregion
    }
    
    public static class ObjectEffects // Or your preferred effects class
    {
        /// <summary>
        /// Applies a kinematic knockback effect to a target transform controlled by a NavMeshAgent.
        /// The NavMeshAgent is temporarily disabled for movement, then warped to the new position.
        /// </summary>
        /// <param name="runner">The MonoBehaviour instance to run the coroutine.</param>
        /// <param name="agent">The NavMeshAgent component of the object to knock back.</param>
        /// <param name="knockbackDirection">The normalized direction in which to push the target.</param>
        /// <param name="distance">How far the target should be pushed.</param>
        /// <param name="duration">How long the knockback movement should take.</param>
        /// <param name="easeCurve">Optional AnimationCurve for custom easing (e.g., ease-out).</param>
        /// <param name="onComplete">Optional callback when the knockback finishes.</param>
        public static Coroutine ApplyKnockback(
            MonoBehaviour runner,
            NavMeshAgent agent, // Changed from Transform to NavMeshAgent
            Vector3 knockbackDirection,
            float distance,
            float duration,
            AnimationCurve easeCurve = null,
            Action onComplete = null
        )
        {
            if (runner == null || !runner.gameObject.activeInHierarchy || agent == null || agent.transform == null)
            {
                Debug.LogWarning("ApplyKnockback (NavMeshAgent): Invalid parameters (runner, agent, or agent.transform is null or inactive).");
                onComplete?.Invoke();
                return null;
            }
            if (distance <= 0 || duration <= 0)
            {
                Debug.LogWarning("ApplyKnockback (NavMeshAgent): Distance and duration must be positive.");
                onComplete?.Invoke();
                return null;
            }

            return runner.StartCoroutine(KnockbackCoroutine(agent, knockbackDirection, distance, duration, easeCurve, onComplete));
        }

        private static IEnumerator KnockbackCoroutine(
            NavMeshAgent agent,
            Vector3 knockbackDirection,
            float distance,
            float duration,
            AnimationCurve easeCurve,
            Action onComplete
        )
        {
            Transform targetTransform = agent.transform; // Get the transform from the agent
            Vector3 startPosition = targetTransform.position;
            Vector3 normalizedDirection = knockbackDirection.normalized;
            Vector3 endPosition = startPosition + normalizedDirection * distance;

            // Store original NavMeshAgent state and disable its control
            bool originalIsStopped = agent.isStopped;
            bool originalUpdatePosition = agent.updatePosition;
            bool originalUpdateRotation = agent.updateRotation; // Good to manage this too
            Vector3 originalVelocity = agent.velocity; // Store to see if we want to resume it (though knockback usually stops it)

            if (agent.isOnNavMesh) // Only try to modify agent properties if it's on a mesh
            {
                agent.isStopped = true; // Stop current path following
                agent.updatePosition = false; // We will control the position
                agent.updateRotation = false; // We will control the rotation (knockback usually doesn't rotate, but good practice)
                // agent.velocity = Vector3.zero; // Immediately stop its current physical movement
            }


            float elapsed = 0f;
            while (elapsed < duration)
            {
                if (targetTransform == null) // Target might have been destroyed
                {
                    // If agent was manipulated and target is gone, nothing more to do with agent
                    onComplete?.Invoke();
                    yield break;
                }

                float progress = elapsed / duration;
                float easedProgress = (easeCurve != null) ? easeCurve.Evaluate(progress) : progress;

                targetTransform.position = Vector3.LerpUnclamped(startPosition, endPosition, easedProgress);

                elapsed += Time.deltaTime;
                yield return null;
            }

            if (targetTransform != null)
            {
                targetTransform.position = endPosition; // Ensure it reaches the end position precisely

                if (agent.isOnNavMesh) // Check if agent is still valid and on mesh
                {
                    // Warp the NavMeshAgent to the new position
                    // This synchronizes the agent's internal state with the transform's new position.
                    agent.Warp(targetTransform.position);

                    // Restore NavMeshAgent state
                    agent.updatePosition = originalUpdatePosition;
                    agent.updateRotation = originalUpdateRotation;
                    agent.isStopped = originalIsStopped; // Or decide new state, e.g., agent.isStopped = false to resume
                    
                    // If the agent was moving and you want it to resume its path, you might not change isStopped
                    // or you might need to set a new destination if the knockback was significant.
                    // For a simple knockback, just restoring its previous 'isStopped' state is often fine.
                    // If originalIsStopped was false, it will try to continue its previous path or find a new one.
                }
            }
            onComplete?.Invoke();
        }
    }
}
